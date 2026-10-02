import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {readActiveRecipe} from './lib/motion/settings.js';
import {AttentionEngine} from './lib/runtime/attentionEngine.js';
import {DashIntegration} from './lib/runtime/dashIntegration.js';
import {DockIntegration} from './lib/runtime/dockIntegration.js';
import {LaunchEngine} from './lib/runtime/launchEngine.js';
import {BackgroundStyle} from './lib/runtime/backgroundStyle.js';

// In the order of the flags in _syncStyles.
const STYLESHEETS = [
    'dock-hover-background-hidden.css',
    'dash-hover-background-hidden.css',
    'dock-focused-app-background-hidden.css',
    'dash-focused-app-background.css',
];

export default class FlourishExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._recipe = readActiveRecipe(this._settings);

        const laters = global.compositor.get_laters();
        this._frameScheduler = {
            schedule: callback => laters.add(Meta.LaterType.BEFORE_REDRAW, () => {
                callback();
                return false;
            }),
            cancel: id => laters.remove(id),
        };

        this._dockIntegration = new DockIntegration({
            scheduler: this._frameScheduler,
            // Ubuntu Dock rebuilds its icons while disable() unloads the stylesheets.
            onUrgentChanged: (controller, urgent) =>
                this._attentionEngine?.onUrgentChanged(controller, urgent),
        });
        this._dashIntegration = new DashIntegration({
            scheduler: this._frameScheduler,
        });

        this._styles = STYLESHEETS.map(cssFileName =>
            new BackgroundStyle({extension: this, cssFileName}));
        this._syncStyles();

        this._attentionEngine = new AttentionEngine({
            getDockContext: icon => this._dockIntegration.getDockContext(icon),
            scheduler: this._frameScheduler,
        });
        this._attentionEngine.enable();

        this._dockIntegration.enable(this._recipe);
        this._dashIntegration.enable(this._recipe);
        this._connectPointer();

        this._launchEngine = new LaunchEngine({
            getController: icon =>
                this._dockIntegration.getController(icon) ??
                this._dashIntegration.getController(icon),
            getDockContext: icon => this._dockIntegration.getDockContext(icon),
            findIcon: app =>
                this._dockIntegration.findIcon(app) ??
                this._dashIntegration.findIcon(app),
            scheduler: this._frameScheduler,
            beforeLaunch: icon => this._attentionEngine.interrupt(icon),
        });
        this._launchEngine.enable();

        this._syncIdleId = 0;
        this._settings.connectObject('changed', () => {
            // A preset switch writes many keys at once.
            if (this._syncIdleId)
                return;
            this._syncIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                this._syncIdleId = 0;
                this._syncSettings();
                return GLib.SOURCE_REMOVE;
            });
        }, this);
        // Same recipe, new transform: it depends on the animations setting.
        St.Settings.get().connectObject('notify::enable-animations', () => {
            this._dockIntegration.setRecipe(this._recipe);
            this._dashIntegration.setRecipe(this._recipe);
        }, this);
    }

    disable() {
        if (this._syncIdleId) {
            GLib.source_remove(this._syncIdleId);
            this._syncIdleId = 0;
        }
        this._settings.disconnectObject(this);
        St.Settings.get().disconnectObject(this);

        this._launchEngine.disable();
        this._launchEngine = null;
        global.stage.disconnectObject(this);
        this._attentionEngine.disable();
        this._attentionEngine = null;
        for (const style of this._styles)
            style.disable();
        this._styles = null;
        // Dock widgets restyle through the controllers, so before those go.
        this._refreshStyles();
        this._dashIntegration.disable();
        this._dashIntegration = null;
        this._dockIntegration.disable();
        this._dockIntegration = null;
        this._frameScheduler = null;
        this._recipe = null;
        this._settings = null;
    }

    _syncSettings() {
        this._recipe = readActiveRecipe(this._settings);
        this._dockIntegration.setRecipe(this._recipe);
        this._dashIntegration.setRecipe(this._recipe);
        if (this._syncStyles())
            this._refreshStyles();
    }

    // The stage covers gaps; native hover signals also refresh the pointer.
    _connectPointer() {
        global.stage.connectObject('motion-event', (_stage, event) => {
            const [x, y] = event.get_coords();
            this._dockIntegration.onPointerMotion(x, y);
            this._dashIntegration.onPointerMotion(x, y);
            return Clutter.EVENT_PROPAGATE;
        }, this);
    }

    _syncStyles() {
        const hideHover = !this._settings.get_boolean('show-hover-background');
        const showFocused = this._settings.get_boolean('show-focused-app-background');
        this._dockIntegration.setOutline(this._settings.get_string('dock-outline'));
        // No short-circuit: every sheet must sync.
        return [hideHover, hideHover, !showFocused, showFocused]
            .map((enabled, index) => this._styles[index].setEnabled(enabled))
            .includes(true);
    }

    _refreshStyles() {
        this._dockIntegration.refreshStyles();
        this._dashIntegration.refreshStyles();
    }
}
