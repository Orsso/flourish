import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {readActiveRecipe} from './lib/motion/settings.js';
import {DashIntegration} from './lib/runtime/dashIntegration.js';
import {DockIntegration} from './lib/runtime/dockIntegration.js';
import {IconMotionController} from './lib/runtime/iconMotionController.js';
import {LaunchEngine} from './lib/runtime/launchEngine.js';
import {BackgroundStyle} from './lib/runtime/backgroundStyle.js';

export default class FlourishExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._recipe = readActiveRecipe(this._settings);

        // Hover work coalesces into one flush right before the next paint.
        const laters = global.compositor.get_laters();
        this._frameScheduler = {
            schedule: callback => laters.add(Meta.LaterType.BEFORE_REDRAW, () => {
                callback();
                return false;
            }),
            cancel: id => laters.remove(id),
        };

        this._dockIntegration = new DockIntegration({
            controllerFactory: options => new IconMotionController(options),
            publishMeasurement: (budget, iconSize) =>
                this._publishMeasurement(budget, iconSize),
            scheduler: this._frameScheduler,
        });
        this._dashIntegration = new DashIntegration({
            controllerFactory: options => new IconMotionController(options),
            scheduler: this._frameScheduler,
        });

        const refreshDockStyles = () => {
            this._dockIntegration.refreshStyles();
            this._dashIntegration.refreshStyles();
        };
        this._hoverStyle = new BackgroundStyle(
            this, 'hover-background-hidden.css', {refreshStyles: refreshDockStyles});
        this._hoverStyle.setEnabled(
            !this._settings.get_boolean('show-hover-background'));
        this._focusedAppStyle =
            new BackgroundStyle(
                this, 'focused-app-background-hidden.css',
                {refreshStyles: refreshDockStyles});
        this._focusedAppStyle.setEnabled(
            !this._settings.get_boolean('show-focused-app-background'));
        this._dashHoverStyle = new BackgroundStyle(
            this, 'dash-hover-background-hidden.css',
            {refreshStyles: refreshDockStyles});
        this._dashHoverStyle.setEnabled(
            !this._settings.get_boolean('show-hover-background'));

        this._dockIntegration.enable(this._recipe);
        this._dashIntegration.enable(this._recipe);

        this._launchEngine = new LaunchEngine({
            getController: icon =>
                this._dockIntegration.getController(icon) ??
                this._dashIntegration.getController(icon),
        });
        this._launchEngine.enable();

        this._syncIdleId = 0;
        this._settingsChangedId = this._settings.connect('changed', (_settings, key) => {
            // These keys are written from dock measurements.
            if (key === 'measured-hover-budget' || key === 'measured-icon-size')
                return;
            // A preset switch writes the whole recipe in one burst; sync once.
            if (this._syncIdleId)
                return;
            this._syncIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                this._syncIdleId = 0;
                this._syncSettings();
                return GLib.SOURCE_REMOVE;
            });
        });
        this._systemAnimationId = St.Settings.get().connect(
            'notify::enable-animations', () => {
                this._dockIntegration.setRecipe(this._recipe);
                this._dashIntegration.setRecipe(this._recipe);
            });
    }

    disable() {
        if (this._syncIdleId) {
            GLib.source_remove(this._syncIdleId);
            this._syncIdleId = 0;
        }
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }
        if (this._systemAnimationId) {
            St.Settings.get().disconnect(this._systemAnimationId);
            this._systemAnimationId = 0;
        }

        this._launchEngine?.disable();
        this._launchEngine = null;
        // Unload styles while controllers can still refresh dock widgets.
        this._hoverStyle?.disable();
        this._hoverStyle = null;
        this._focusedAppStyle?.disable();
        this._focusedAppStyle = null;
        this._dashHoverStyle?.disable();
        this._dashHoverStyle = null;
        this._dashIntegration?.disable();
        this._dashIntegration = null;
        this._dockIntegration?.disable();
        this._dockIntegration = null;
        this._frameScheduler = null;
        this._recipe = null;
        this._settings = null;
    }

    _syncSettings() {
        this._recipe = readActiveRecipe(this._settings);
        this._dockIntegration.setRecipe(this._recipe);
        this._dashIntegration.setRecipe(this._recipe);
        this._hoverStyle.setEnabled(
            !this._settings.get_boolean('show-hover-background'));
        this._dashHoverStyle.setEnabled(
            !this._settings.get_boolean('show-hover-background'));
        this._focusedAppStyle.setEnabled(
            !this._settings.get_boolean('show-focused-app-background'));
    }

    _publishMeasurement(budget, iconSize) {
        if (!this._settings)
            return;
        this._writeDouble('measured-hover-budget', budget > 0 ? budget : 0);
        this._writeDouble('measured-icon-size', iconSize > 0 ? iconSize : 0);
    }

    _writeDouble(key, value) {
        const rounded = Math.round(value * 100) / 100;
        if (this._settings.get_double(key) !== rounded)
            this._settings.set_double(key, rounded);
    }
}
