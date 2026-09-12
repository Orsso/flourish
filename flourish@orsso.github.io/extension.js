import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {HoverMode} from './lib/motion/catalog.js';
import {readActiveRecipe} from './lib/motion/settings.js';
import {AttentionEngine} from './lib/runtime/attentionEngine.js';
import {DashIntegration} from './lib/runtime/dashIntegration.js';
import {DockIntegration} from './lib/runtime/dockIntegration.js';
import {LaunchEngine} from './lib/runtime/launchEngine.js';
import {BackgroundStyle} from './lib/runtime/backgroundStyle.js';

export default class FlourishExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._recipe = readActiveRecipe(this._settings);
        const continuous = this._settings.get_string('hover-mode') === HoverMode.WAVE;

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
            settings: this._settings,
            continuous,
            onUrgentChanged: (controller, urgent) =>
                this._attentionEngine?.onUrgentChanged(controller, urgent),
        });
        this._dashIntegration = new DashIntegration({
            scheduler: this._frameScheduler,
            continuous,
        });

        this._hoverStyle = new BackgroundStyle({
            extension: this, cssFileName: 'dock-hover-background-hidden.css'});
        this._focusedAppStyle = new BackgroundStyle({
            extension: this, cssFileName: 'dock-focused-app-background-hidden.css'});
        this._dashHoverStyle = new BackgroundStyle({
            extension: this, cssFileName: 'dash-hover-background-hidden.css'});
        this._dashFocusedStyle = new BackgroundStyle({
            extension: this, cssFileName: 'dash-focused-app-background.css'});
        this._syncStyles();

        this._attentionEngine = new AttentionEngine({
            getDockContext: icon => this._dockIntegration.getDockContext(icon),
            scheduler: this._frameScheduler,
        });
        this._attentionEngine.enable();

        this._dockIntegration.enable(this._recipe);
        this._dashIntegration.enable(this._recipe);
        this._syncPointerHook(continuous);

        this._launchEngine = new LaunchEngine({
            getController: icon =>
                this._dockIntegration.getController(icon) ??
                this._dashIntegration.getController(icon),
            getDockContext: icon => this._dockIntegration.getDockContext(icon),
            scheduler: this._frameScheduler,
            beforeLaunch: icon => this._attentionEngine.interrupt(icon),
        });
        this._launchEngine.enable();

        this._syncIdleId = 0;
        this._settings.connectObject('changed', (_settings, key) => {
            if (key === 'measured-hover-budget' || key === 'measured-icon-size')
                return;
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
        this._hoverStyle.disable();
        this._hoverStyle = null;
        this._focusedAppStyle.disable();
        this._focusedAppStyle = null;
        this._dashHoverStyle.disable();
        this._dashHoverStyle = null;
        this._dashFocusedStyle.disable();
        this._dashFocusedStyle = null;
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
        const continuous = this._settings.get_string('hover-mode') === HoverMode.WAVE;
        this._dockIntegration.setContinuous(continuous);
        this._dashIntegration.setContinuous(continuous);
        this._syncPointerHook(continuous);
        this._dockIntegration.setRecipe(this._recipe);
        this._dashIntegration.setRecipe(this._recipe);
        if (this._syncStyles())
            this._refreshStyles();
    }

    // Nothing reactive covers the gaps of the dash; the stage sees every motion.
    _syncPointerHook(continuous) {
        global.stage.disconnectObject(this);
        if (!continuous)
            return;
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
        // No short-circuit: every sheet must sync.
        return [
            this._hoverStyle.setEnabled(hideHover),
            this._dashHoverStyle.setEnabled(hideHover),
            this._focusedAppStyle.setEnabled(!showFocused),
            this._dashFocusedStyle.setEnabled(showFocused),
        ].includes(true);
    }

    _refreshStyles() {
        this._dockIntegration.refreshStyles();
        this._dashIntegration.refreshStyles();
    }
}
