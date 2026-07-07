import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {DockPosition} from '../motion/catalog.js';
import {MotionSurface} from './motionSurface.js';
import {createWarnOnce} from './warnOnce.js';

// Ubuntu Dock is Ubuntu's build of Dash to Dock.
const DASH_TO_DOCK_BUILDS = [
    'dash-to-dock@micxgx.gmail.com',
    'ubuntu-dock@ubuntu.com',
];

export class DockIntegration {
    #attachIdleId = 0;
    #controllerFactory;
    #generation = 0;
    #manager = null;
    #managerSignals = [];
    #measureId = 0;
    #publishMeasurement;
    #scheduler;
    #stateChangedId = 0;
    #surface = null;
    #warnOnce = createWarnOnce();

    constructor({controllerFactory, publishMeasurement = () => {}, scheduler}) {
        this.#controllerFactory = controllerFactory;
        this.#publishMeasurement = publishMeasurement;
        this.#scheduler = scheduler;
    }

    get controllers() {
        return this.#surface?.controllers ?? [];
    }

    enable(recipe) {
        if (this.#surface)
            return;
        this.#surface = new MotionSurface({
            controllerFactory: this.#controllerFactory,
            recipe,
            onMeasured: measurement => this.#publishBudget(measurement),
            scheduler: this.#scheduler,
        });
        this.#generation++;
        this.#stateChangedId = Main.extensionManager.connect(
            'extension-state-changed', (_manager, extension) => {
                if (!DASH_TO_DOCK_BUILDS.includes(extension.uuid))
                    return;
                this.#detachManager();
                this.#scheduleAttach();
            });
        this.#attach(this.#generation);
    }

    disable() {
        if (!this.#surface)
            return;
        this.#generation++;
        if (this.#stateChangedId) {
            Main.extensionManager.disconnect(this.#stateChangedId);
            this.#stateChangedId = 0;
        }
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
        return this.#surface?.getController(appIcon) ?? null;
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
            this.#warnOnce('missing-extension',
                'Dash to Dock (or Ubuntu Dock) is not installed; dock motion is inactive');
            return;
        }

        let module;
        try {
            module = await import(`file://${extension.path}/extension.js`);
        } catch (error) {
            this.#warnOnce('import-failed', `cannot import Dash to Dock: ${error.message}`);
            return;
        }

        if (generation !== this.#generation || !this.#surface)
            return;
        if (!module.dockManager) {
            this.#warnOnce('missing-manager',
                'Dash to Dock does not expose its manager; dock motion is inactive');
            return;
        }

        this.#manager = module.dockManager;
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
        const docks = this.#manager?._allDocks;
        if (!Array.isArray(docks)) {
            this.#warnOnce('missing-docks',
                'Dash to Dock does not expose its dock collection; dock motion is inactive');
            return;
        }

        for (const dock of docks) {
            const box = dock?.dash?._box;
            if (!box) {
                this.#warnOnce('missing-box', 'a Dash to Dock instance has no dash box');
                continue;
            }
            this.#surface.addBox(box, positionFromSide(dock.position));
        }
        this.#scheduleBudgetMeasure();
        this.refreshStyles();
    }

    // Populate the prefs readout before the first hover.
    #scheduleBudgetMeasure() {
        this.#cancelBudgetMeasure();
        this.#measureId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this.#measureId = 0;
            for (const controller of this.controllers) {
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

    #publishBudget(measurement) {
        if (!measurement)
            return false;
        const {budgetPx, iconNormalSize} = measurement;
        if (!(budgetPx > 0) || !(iconNormalSize > 0))
            return false;
        this.#publishMeasurement(budgetPx, iconNormalSize);
        return true;
    }

}

// Both builds can be installed at once; prefer the active one.
function lookupDashToDock() {
    const builds = DASH_TO_DOCK_BUILDS
        .map(uuid => Main.extensionManager.lookup(uuid))
        .filter(extension => extension);
    return builds.find(extension => extension.stateObj) ?? builds[0] ?? null;
}

function positionFromSide(side) {
    switch (side) {
        case St.Side.TOP:
            return DockPosition.TOP;
        case St.Side.LEFT:
            return DockPosition.LEFT;
        case St.Side.RIGHT:
            return DockPosition.RIGHT;
        case St.Side.BOTTOM:
        default:
            return DockPosition.BOTTOM;
    }
}
