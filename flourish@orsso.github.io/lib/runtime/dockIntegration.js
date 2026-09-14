import GLib from 'gi://GLib';
import St from 'gi://St';
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import {ExtensionState} from 'resource:///org/gnome/shell/misc/extensionUtils.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {DockState, ScreenEdge} from '../motion/catalog.js';
import {DockVisibility} from './dockVisibility.js';
import {DockOverflow} from './dockOverflow.js';
import {pointerOnSurface} from './geometry.js';
import {MotionSurface} from './motionSurface.js';

// Ubuntu Dock is Ubuntu's build of Dash to Dock.
const DASH_TO_DOCK_BUILDS = [
    'dash-to-dock@micxgx.gmail.com',
    'ubuntu-dock@ubuntu.com',
];

export class DockIntegration {
    #attachIdleId = 0;
    #generation = 0;
    #injections = null;
    #manager = null;
    #managerSignals = [];
    #onUrgentChanged;
    #overflows = new Set();
    #recipe;
    #scheduler;
    #surface = null;
    #visibilities = [];

    constructor({
        scheduler,
        onUrgentChanged = () => {},
    }) {
        this.#scheduler = scheduler;
        this.#onUrgentChanged = onUrgentChanged;
    }

    enable(recipe) {
        this.#recipe = recipe;
        this.#surface = new MotionSurface({
            recipe,
            onUrgentChanged: this.#onUrgentChanged,
            scheduler: this.#scheduler,
        });
        this.#generation++;
        Main.layoutManager.connectObject('monitors-changed', () => this.#surface.invalidateGeometry(), this);
        Main.extensionManager.connectObject('extension-state-changed',
            (_manager, extension) => {
                if (!DASH_TO_DOCK_BUILDS.includes(extension.uuid))
                    return;
                // An update notice keeps the docks; a reload destroys the manager.
                if (this.#manager && extension.state === ExtensionState.ACTIVE)
                    return;
                this.#detachManager();
                this.#scheduleAttach();
            }, this);
        this.#attach(this.#generation);
    }

    disable() {
        this.#generation++;
        Main.extensionManager.disconnectObject(this);
        Main.layoutManager.disconnectObject(this);
        this.#cancelScheduledAttach();
        this.#handBackWiggles();
        this.#detachManager();
        this.#surface.dispose();
        this.#surface = null;
    }

    setRecipe(recipe) {
        this.#recipe = recipe;
        this.#syncOverflow();
        this.#surface?.setRecipe(recipe);
    }

    onPointerMotion(x, y) {
        this.#surface?.onPointerMotion(x, y);
    }

    #syncOverflow() {
        const {hover} = this.#recipe;
        for (const overflow of this.#overflows)
            overflow.setHover(hover);
    }

    refreshStyles() {
        this.#surface?.refreshStyles();
    }

    getController(appIcon) {
        return this.#surface.getController(appIcon);
    }

    getDockContext(appIcon) {
        return this.#surface?.getContext(appIcon) ?? null;
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
        // A reloaded Dash to Dock has a new prototype.
        this.#restoreWiggle();
        this.#disposeVisibilities();
        if (!this.#manager)
            return;
        for (const id of this.#managerSignals)
            this.#manager.disconnect(id);
        this.#managerSignals = [];
        this.#manager = null;
    }

    #disposeVisibilities() {
        for (const overflow of [...this.#overflows])
            overflow.dispose();
        for (const visibility of this.#visibilities)
            visibility.dispose();
        this.#visibilities = [];
    }

    #scanDocks() {
        // Nothing public lists the docks.
        const docks = this.#manager._allDocks;
        if (!docks) {
            console.warn('[flourish] Dash to Dock exposes no dock list; dock motion is off');
            return;
        }

        this.#overrideWiggle(docks[0]?.dash?.iconAnimator);

        for (const dock of docks) {
            const box = dock.dash._box;
            if (!box) {
                console.warn('[flourish] a Dash to Dock instance has no icon box');
                continue;
            }
            // The dash's parent is the actor the slider moves.
            const slid = dock.dash.get_parent();
            if (!slid) {
                console.warn('[flourish] a Dash to Dock instance has no slid actor');
                continue;
            }
            const edge = edgeFromSide(dock.position);
            const getMonitor = () =>
                Main.layoutManager.monitors[dock.monitorIndex] ?? null;
            const visibility = new DockVisibility({
                actor: slid,
                root: dock,
                edge,
                getMonitor,
                scheduler: this.#scheduler,
            });
            const context = {
                visibility,
                pointerActor: slid,
                isAvailable: () => visibility.state === DockState.SHOWN,
                containsPointer: (x, y) => pointerOnSurface(slid, x, y),
                edge,
                getMonitor,
                dockSettings: this.#manager.settings ?? null,
            };
            const overflow = new DockOverflow({
                actor: slid,
                row: box,
                edge,
                getMonitor,
                injections: new InjectionManager(),
                onChanged: () => this.#surface.invalidateGeometry(),
                onDisposed: disposed => this.#overflows.delete(disposed),
            });
            context.getSpacing = () => overflow;
            if (!this.#surface.addBox(box, edge, context)) {
                visibility.dispose();
                continue;
            }
            this.#visibilities.push(visibility);
            visibility.subscribe(state => {
                if (state !== DockState.SHOWN)
                    this.#surface.clearPointer(box);
            });
            this.#overflows.add(overflow);
            overflow.enable();
            this.#syncOverflow();
            this.#stopWiggles(dock);
        }
        this.refreshStyles();
    }

    // The stock wiggle would play on top of the attention motion.
    #overrideWiggle(animator) {
        if (this.#injections || !animator)
            return;
        const prototype = Object.getPrototypeOf(animator);
        if (typeof prototype?.addAnimation !== 'function') {
            console.warn('[flourish] Dash to Dock exposes no icon animator; its wiggle stays on');
            return;
        }
        this.#injections = new InjectionManager();
        this.#injections.overrideMethod(prototype, 'addAnimation',
            original => function (target, name) {
                if (name === 'wiggle')
                    return undefined;
                return original.call(this, target, name);
            });
    }

    #restoreWiggle() {
        this.#injections?.clear();
        this.#injections = null;
    }

    // Dash to Dock keeps a wiggle registered for the whole urgency.
    #stopWiggles(dock) {
        const animator = dock.dash.iconAnimator;
        if (!this.#injections || !animator)
            return;
        for (const icon of urgentIcons(dock)) {
            const bin = icon.icon?._iconBin;
            if (!bin)
                continue;
            animator.removeAnimation(bin, 'wiggle');
            bin.rotation_angle_z = 0;
        }
    }

    // Its urgent handler re-adds the wiggle; the swallowed calls never reached it.
    #handBackWiggles() {
        if (!this.#injections)
            return;
        this.#restoreWiggle();
        for (const dock of this.#manager?._allDocks ?? []) {
            for (const icon of urgentIcons(dock))
                icon.notify('urgent');
        }
    }

}

// Both builds can be installed at once; only an active one has a dock.
function lookupDashToDock() {
    return DASH_TO_DOCK_BUILDS
        .map(uuid => Main.extensionManager.lookup(uuid))
        .find(extension => extension?.state === ExtensionState.ACTIVE) ?? null;
}

function urgentIcons(dock) {
    return dock.dash?._box?.get_children()
        .map(container => container.child)
        .filter(icon => icon?.urgent) ?? [];
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
