import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import {ExtensionState} from 'resource:///org/gnome/shell/misc/extensionUtils.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {DASH_TO_DOCK_BUILDS, DockState, ScreenEdge} from '../motion/catalog.js';
import {DockVisibility} from './dockVisibility.js';
import {DockOutline} from './dockOutline.js';
import {DockOverflow} from './dockOverflow.js';
import {pointerOnSurface} from './geometry.js';
import {MotionSurface} from './motionSurface.js';


export class DockIntegration {
    #attachIdleId = 0;
    #blurBackgrounds = new Map();
    #generation = 0;
    #injections = null;
    #manager = null;
    #managerSignals = [];
    #onUrgentChanged;
    #outline;
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
        this.#outline = new DockOutline({
            interfaceSettings: new Gio.Settings({schema_id: 'org.gnome.desktop.interface'}),
            scheduler,
        });
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
        // The icons stop reporting to Flourish before the urgent replay reaches Dash to Dock.
        this.#surface.dispose();
        this.#handBackWiggles();
        this.#detachManager();
        this.#outline.destroy();
        this.#surface = null;
    }

    setRecipe(recipe) {
        this.#recipe = recipe;
        this.#syncOverflow();
        this.#surface.setRecipe(recipe);
    }

    onPointerMotion(x, y) {
        this.#surface.onPointerMotion(x, y);
    }

    #syncOverflow() {
        const {hover} = this.#recipe;
        for (const overflow of this.#overflows)
            overflow.setHover(hover);
    }

    refreshStyles() {
        this.#surface.refreshStyles();
    }

    setOutline(name) {
        this.#outline.setOutline(name);
    }

    getController(appIcon) {
        return this.#surface.getController(appIcon);
    }

    findIcon(app) {
        return this.#surface.findIcon(app);
    }

    getDockContext(appIcon) {
        return this.#surface.getContext(appIcon);
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
        // No dock is a normal setup; extension-state-changed attaches a late one.
        const extension = lookupDashToDock();
        if (!extension)
            return;

        let module;
        try {
            module = await import(`file://${extension.path}/extension.js`);
        } catch (error) {
            console.warn(`[flourish] cannot import Dash to Dock: ${error.message}`);
            return;
        }

        // disable() or a newer attach can run during the import.
        if (generation !== this.#generation)
            return;

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
        this.#disposeDocks();
        if (!this.#manager)
            return;
        for (const id of this.#managerSignals)
            this.#manager.disconnect(id);
        this.#managerSignals = [];
        this.#manager = null;
    }

    #disposeDocks() {
        this.#outline.dispose();
        for (const background of this.#blurBackgrounds.keys())
            this.#untrackBlur(background);
        for (const overflow of [...this.#overflows])
            overflow.dispose();
        for (const visibility of this.#visibilities)
            visibility.dispose();
        this.#visibilities = [];
    }

    #scanDocks() {
        // Nothing public lists the docks.
        const docks = this.#manager._allDocks;
        this.#overrideWiggle(docks[0]?.dash.iconAnimator);

        for (const dock of docks) {
            const box = dock.dash._box;
            // The dash's parent is the actor the slider moves.
            const slid = dock.dash.get_parent();
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
                background: this.#manager.settings.extendHeight ? null : dock.dash._background,
                visibility,
                pointerActor: slid,
                isAvailable: () => visibility.state === DockState.SHOWN,
                containsPointer: (x, y) => pointerOnSurface(slid, x, y),
                getMonitor,
                dockSettings: this.#manager.settings,
                labelOffset: '-x-offset',
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
            if (context.background)
                this.#trackBlur(dock.dash);
            if (dock.dash._background)
                this.#outline.track(dock.dash._background);
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

    #trackBlur(dash) {
        const background = dash._background;
        this.#blurBackgrounds.set(background, null);
        background.connectObject('notify::allocation', () => this.#syncBlur(dash),
            'destroy', () => this.#untrackBlur(background), this);
        this.#syncBlur(dash);
    }

    #syncBlur(dash) {
        const background = dash._background;
        const blur = global.blur_my_shell?._dash_to_dock_blur;
        const info = blur && !blur.is_static
            ? blur.dashes.find(entry => entry.dash === dash) : null;
        if (!info) {
            this.#resetBlur(background);
            return;
        }
        const actor = info.background;
        const group = info.background_group;
        if (this.#blurBackgrounds.get(background)?.actor !== actor) {
            this.#resetBlur(background);
            this.#blurBackgrounds.set(background, {
                actor,
                group,
                transform: {
                    scale_x: group.scale_x,
                    scale_y: group.scale_y,
                    translation_x: group.translation_x,
                    translation_y: group.translation_y,
                },
            });
            actor.connectObject('notify::allocation', () => this.#syncBlur(dash),
                'destroy', () => this.#resetBlur(background, false), this);
        }
        if (actor.width <= 0 || actor.height <= 0)
            return;
        // Background blur samples transformed screen bounds without a new allocation.
        group.scale_x = background.width / actor.width;
        group.scale_y = background.height / actor.height;
        group.translation_x = background.x - actor.x * group.scale_x;
        group.translation_y = background.y + dash.y - actor.y * group.scale_y;
    }

    #resetBlur(background, restore = true) {
        const state = this.#blurBackgrounds.get(background);
        if (!state)
            return;
        state.actor.disconnectObject(this);
        if (restore)
            Object.assign(state.group, state.transform);
        this.#blurBackgrounds.set(background, null);
    }

    #untrackBlur(background) {
        this.#resetBlur(background);
        background.disconnectObject(this);
        this.#blurBackgrounds.delete(background);
    }

    // The stock wiggle would play on top of the attention motion.
    #overrideWiggle(animator) {
        if (this.#injections || !animator)
            return;
        this.#injections = new InjectionManager();
        this.#injections.overrideMethod(Object.getPrototypeOf(animator), 'addAnimation',
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
        if (!this.#injections)
            return;
        for (const icon of urgentIcons(dock)) {
            dock.dash.iconAnimator.removeAnimation(icon.icon._iconBin, 'wiggle');
            icon.icon._iconBin.rotation_angle_z = 0;
        }
    }

    // Its urgent handler re-adds the wiggle; the swallowed calls never reached it.
    #handBackWiggles() {
        if (!this.#injections)
            return;
        this.#restoreWiggle();
        for (const dock of this.#manager._allDocks) {
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

// Drag placeholders have no child.
function urgentIcons(dock) {
    return dock.dash._box.get_children()
        .map(container => container.child)
        .filter(icon => icon?.urgent);
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
