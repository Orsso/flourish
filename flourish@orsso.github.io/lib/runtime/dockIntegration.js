import GLib from 'gi://GLib';
import St from 'gi://St';
import {ExtensionState} from 'resource:///org/gnome/shell/misc/extensionUtils.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {ScreenEdge} from '../motion/catalog.js';
import {MotionSurface} from './motionSurface.js';

// Ubuntu Dock is Ubuntu's build of Dash to Dock.
const DASH_TO_DOCK_BUILDS = [
    'dash-to-dock@micxgx.gmail.com',
    'ubuntu-dock@ubuntu.com',
];

export class DockIntegration {
    #attachIdleId = 0;
    #generation = 0;
    #manager = null;
    #managerSignals = [];
    #measureId = 0;
    #scheduler;
    #settings;
    #surface = null;

    constructor({scheduler, settings}) {
        this.#scheduler = scheduler;
        this.#settings = settings;
    }

    enable(recipe) {
        this.#surface = new MotionSurface({
            recipe,
            onMeasured: measurement => this.#publishBudget(measurement),
            scheduler: this.#scheduler,
        });
        this.#generation++;
        Main.extensionManager.connectObject('extension-state-changed',
            (_manager, extension) => {
                if (!DASH_TO_DOCK_BUILDS.includes(extension.uuid))
                    return;
                this.#detachManager();
                this.#scheduleAttach();
            }, this);
        this.#attach(this.#generation);
    }

    disable() {
        this.#generation++;
        Main.extensionManager.disconnectObject(this);
        this.#cancelScheduledAttach();
        this.#detachManager();
        this.#cancelBudgetMeasure();
        this.#surface.dispose();
        this.#surface = null;
    }

    setRecipe(recipe) {
        this.#surface?.setRecipe(recipe);
    }

    refreshStyles() {
        this.#surface?.refreshStyles();
    }

    getController(appIcon) {
        return this.#surface.getController(appIcon);
    }

    // Ubuntu Dock recreates its manager from the same signal; read it after.
    #scheduleAttach() {
        this.#cancelScheduledAttach();
        const generation = ++this.#generation;
        this.#attachIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this.#attachIdleId = 0;
            this.#attach(generation);
            return GLib.SOURCE_REMOVE;
        });
    }

    #cancelScheduledAttach() {
        if (this.#attachIdleId) {
            GLib.source_remove(this.#attachIdleId);
            this.#attachIdleId = 0;
        }
    }

    async #attach(generation) {
        const extension = lookupDashToDock();
        if (!extension) {
            console.warn('[flourish] no active Dash to Dock or Ubuntu Dock; dock motion is off');
            return;
        }

        let module;
        try {
            module = await import(`file://${extension.path}/extension.js`);
        } catch (error) {
            console.warn(`[flourish] cannot import Dash to Dock: ${error.message}`);
            return;
        }

        if (generation !== this.#generation || !this.#surface)
            return;
        if (!module.dockManager) {
            console.warn('[flourish] Dash to Dock exposes no dock manager; dock motion is off');
            return;
        }

        this.#manager = module.dockManager;
        // DockManager uses Signals.addSignalMethods: no connectObject there.
        this.#managerSignals = [
            this.#manager.connect('docks-ready', () => this.#scanDocks()),
            this.#manager.connect('destroy', () => this.#detachManager()),
        ];
        this.#scanDocks();
    }

    #detachManager() {
        if (!this.#manager)
            return;
        for (const id of this.#managerSignals)
            this.#manager.disconnect(id);
        this.#managerSignals = [];
        this.#manager = null;
    }

    #scanDocks() {
        // Nothing public lists the docks.
        const docks = this.#manager._allDocks;
        if (!docks) {
            console.warn('[flourish] Dash to Dock exposes no dock list; dock motion is off');
            return;
        }

        for (const dock of docks) {
            const box = dock.dash._box;
            if (!box) {
                console.warn('[flourish] a Dash to Dock instance has no icon box');
                continue;
            }
            this.#surface.addBox(box, edgeFromSide(dock.position));
        }
        this.#scheduleBudgetMeasure();
        this.refreshStyles();
    }

    // Populate the prefs readout before the first hover.
    #scheduleBudgetMeasure() {
        this.#cancelBudgetMeasure();
        this.#measureId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this.#measureId = 0;
            for (const controller of this.#surface.controllers) {
                if (this.#publishBudget(controller.measure()))
                    break;
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    #cancelBudgetMeasure() {
        if (this.#measureId) {
            GLib.source_remove(this.#measureId);
            this.#measureId = 0;
        }
    }

    // Read by the preferences window for the hover room readout.
    #publishBudget(measurement) {
        if (!measurement)
            return false;
        const {budgetPx, iconNormalSize} = measurement;
        if (!(budgetPx > 0) || !(iconNormalSize > 0))
            return false;
        this.#writeDouble('measured-hover-budget', budgetPx);
        this.#writeDouble('measured-icon-size', iconNormalSize);
        return true;
    }

    #writeDouble(key, value) {
        const rounded = Math.round(value * 100) / 100;
        if (this.#settings.get_double(key) !== rounded)
            this.#settings.set_double(key, rounded);
    }

}

// Both builds can be installed at once; only an active one has a dock.
function lookupDashToDock() {
    return DASH_TO_DOCK_BUILDS
        .map(uuid => Main.extensionManager.lookup(uuid))
        .find(extension => extension?.state === ExtensionState.ACTIVE) ?? null;
}

function edgeFromSide(side) {
    switch (side) {
        case St.Side.TOP:
            return ScreenEdge.TOP;
        case St.Side.LEFT:
            return ScreenEdge.LEFT;
        case St.Side.RIGHT:
            return ScreenEdge.RIGHT;
        case St.Side.BOTTOM:
        default:
            return ScreenEdge.BOTTOM;
    }
}
