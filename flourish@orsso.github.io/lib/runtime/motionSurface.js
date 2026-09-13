import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {Easing, ScreenEdge, sampleRamp} from '../motion/catalog.js';
import {fitHoverLevel, waveFalloff, waveGeometry} from '../motion/continuum.js';
import {OVERSHOOT_RESERVE} from '../motion/transforms.js';
import {IconMotionController} from './iconMotionController.js';
import {LiveRegistry} from './liveRegistry.js';

const IDLE_RAMP = {start: 0, from: 0, to: 0, duration: 0, easing: Easing.LINEAR};

export class MotionSurface {
    #animationsEnabled;
    #clock;
    #contexts = new Map();
    #groups = new Set();
    #getPointer;
    #onUrgentChanged;
    #recipe;
    #registry = new LiveRegistry();
    #scheduler;

    constructor({
        recipe,
        clock = () => GLib.get_monotonic_time() / 1000,
        getPointer = () => global.get_pointer(),
        animationsEnabled = () => St.Settings.get().enable_animations,
        onUrgentChanged = () => {},
        scheduler,
    }) {
        this.#recipe = recipe;
        this.#clock = clock;
        this.#getPointer = getPointer;
        this.#animationsEnabled = animationsEnabled;
        this.#onUrgentChanged = onUrgentChanged;
        this.#scheduler = scheduler;
    }

    get controllers() {
        return this.#registry.controllers;
    }

    getController(appIcon) {
        return this.#registry.getController(appIcon);
    }

    getContext(appIcon) {
        const controller = this.getController(appIcon);
        return controller ? this.#contexts.get(controller) ?? null : null;
    }

    setRecipe(recipe) {
        this.#recipe = recipe;
        for (const group of this.#groups)
            group.setRecipe(recipe);
        for (const controller of this.controllers)
            controller.setRecipe(recipe);
    }

    refreshStyles() {
        for (const controller of this.controllers)
            controller.refreshStyle();
    }

    invalidateGeometry() {
        for (const group of this.#groups)
            group.invalidateGeometry();
    }

    onPointerMotion(x, y) {
        for (const group of this.#groups)
            group.onPointerMotion(x, y);
    }

    clearPointer(box = null) {
        for (const group of this.#groups)
            if (!box || group.box === box)
                group.clearPointer();
    }

    addBox(box, edge, context = null) {
        const group = new NeighborGroup({
            scheduler: this.#scheduler,
            box,
            pointerActor: context?.pointerActor ?? box,
            edge,
            recipe: this.#recipe,
            clock: this.#clock,
            getPointer: this.#getPointer,
            animationsEnabled: this.#animationsEnabled,
            getSpacing: context?.getSpacing ?? (() => null),
            isAvailable: context?.isAvailable ?? (() => true),
            containsPointer: context?.containsPointer ?? (() => true),
        });
        this.#groups.add(group);
        const release = () => {
            this.#groups.delete(group);
            group.dispose();
        };
        const added = this.#registry.addBox(box, () => {
            box.disconnectObject(this);
            release();
        }, release);
        if (!added) {
            release();
            return false;
        }
        for (const container of box.get_children())
            this.#registerContainer(container, edge, group, context);
        box.connectObject('child-added', (_box, container) => {
            this.#registerContainer(container, edge, group, context);
        }, this);
        return true;
    }

    dispose() {
        this.#registry.disable();
        this.#contexts.clear();
    }

    #registerContainer(container, edge, group, context) {
        // Separators and drag placeholders are not app icons.
        const icon = container.child ?? container;
        const bin = icon.icon?._iconBin;
        if (!bin || this.#registry.getController(icon))
            return;

        const controller = new IconMotionController({
            icon,
            bin,
            edge,
            recipe: this.#recipe,
            clock: this.#clock,
            onAnimate: () => group.touch(controller),
            onHoverChanged: changed => group.refreshPointer(changed),
            onDestroyed: destroyed => {
                this.#contexts.delete(destroyed);
                group.remove(destroyed);
            },
            onUrgentChanged: (changed, urgent) => this.#onUrgentChanged(changed, urgent),
        });
        group.add(controller, container, boxChildren(container));
        if (context)
            this.#contexts.set(controller, context);
        this.#registry.addController(icon, controller);
        // An icon can be urgent before Flourish finds it.
        if (controller.urgent)
            this.#onUrgentChanged(controller, true);
    }
}

class NeighborGroup {
    #animationsEnabled;
    #box;
    #clock;
    #containsPointer;
    #dirty = new Set();
    #edge;
    #entries = [];
    // Wave amplitude, 0 at rest to 1 in full, eased over the hover duration.
    #envRamp = IDLE_RAMP;
    #flushId = 0;
    #getPointer;
    #isAvailable;
    #getSpacing;
    #peak = null;
    #pointer = null;
    #pointerActor;
    #recipe;
    #scheduler;
    #spreadShape = null;
    #translations = new Map();

    constructor({scheduler, box, pointerActor, edge, recipe, clock, getPointer, animationsEnabled, getSpacing, isAvailable, containsPointer}) {
        this.#scheduler = scheduler;
        this.#box = box;
        this.#pointerActor = pointerActor;
        this.#edge = edge;
        this.#recipe = recipe;
        this.#clock = clock;
        this.#getPointer = getPointer;
        this.#animationsEnabled = animationsEnabled;
        this.#getSpacing = getSpacing;
        this.#isAvailable = isAvailable;
        this.#containsPointer = containsPointer;
        box.connectObject('notify::mapped', () => {
            if (!box.mapped)
                this.clearPointer();
        }, this);
        // Client entry can leave the surface without changing any icon's hover.
        pointerActor.connectObject('leave-event', (_actor, event) => {
            this.onPointerMotion(...event.get_coords());
            return Clutter.EVENT_PROPAGATE;
        }, this);
    }

    get box() {
        return this.#box;
    }

    add(controller, container, orderedContainers) {
        this.#entries.push({controller, container, level: 0});
        this.#entries.sort((first, second) =>
            orderedContainers.indexOf(first.container) -
            orderedContainers.indexOf(second.container));
        this.#scheduleFlush();
    }

    remove(controller) {
        const index = this.#entries.findIndex(entry => entry.controller === controller);
        if (index === -1)
            return;
        this.#entries.splice(index, 1);
        this.#scheduleFlush();
    }

    refreshPointer(controller) {
        // Client motion bypasses stage events but still changes native hover.
        if (this.#waveOn()) {
            const pointer = this.#getPointer();
            if (pointer)
                this.#pointer = pointer;
        }
        this.touch(controller);
    }

    touch(controller) {
        this.#dirty.add(controller);
        this.#scheduleFlush();
    }

    setRecipe(recipe) {
        this.#recipe = recipe;
        this.#peak = null;
        if (!this.#waveOn())
            this.#releaseWave();
        else {
            this.#pointer = this.#getPointer() ?? this.#pointer;
            if (!this.#animationsEnabled())
                this.#restoreSpread();
        }
        this.#scheduleFlush();
    }

    invalidateGeometry() {
        this.#peak = null;
        this.#scheduleFlush();
    }

    // Record only; the row runs at most once per frame, in #flush.
    onPointerMotion(x, y) {
        if (!this.#waveOn())
            return;
        this.#pointer = [x, y];
        this.#scheduleFlush();
    }

    clearPointer() {
        for (const {controller} of this.#entries)
            controller.clearHover();
        this.#pointer = null;
        this.#scheduleFlush();
    }

    dispose() {
        this.#pointerActor.disconnectObject(this);
        this.#box.disconnectObject(this);
        this.#restoreSpread();
        this.#cancelFlush();
        this.#entries = [];
        this.#pointer = null;
    }

    #scheduleFlush() {
        if (this.#flushId)
            return;
        this.#flushId = this.#scheduler.schedule(() => this.#flush());
    }

    #cancelFlush() {
        if (!this.#flushId)
            return;
        this.#scheduler.cancel(this.#flushId);
        this.#flushId = 0;
    }

    // Swap before applying: an apply can schedule the next flush.
    #flush() {
        this.#flushId = 0;
        if (this.#waveOn())
            this.#syncWave();
        const dirty = this.#dirty;
        this.#dirty = new Set();
        const now = this.#clock();
        for (const {controller} of this.#entries) {
            if (dirty.has(controller) && controller.applyHoverState(now))
                this.touch(controller);
        }
    }

    #waveOn() {
        const {hover} = this.#recipe;
        return hover.enabled && (hover.scale > 1 || hover.lift > 0);
    }

    // One measure per sweep: the row shares one clip and one icon size.
    #wavePeak() {
        if (this.#peak !== null)
            return this.#peak;
        const {hover} = this.#recipe;
        const room = this.#entries[0].controller.measure();
        const overshoot = hover.easing === Easing.EASE_OUT_BACK ? OVERSHOOT_RESERVE : 0;
        this.#peak = room
            ? fitHoverLevel(hover, room.iconNormalSize, room.budgetPx, overshoot)
            : 1;
        return this.#peak;
    }

    #startEnv(from, to) {
        const {hover} = this.#recipe;
        this.#envRamp = {
            start: this.#clock(),
            from,
            to,
            duration: this.#animationsEnabled() ? hover.duration : 0,
            easing: hover.easing,
        };
        if (this.#sampleEnv() !== to)
            this.#scheduleFlush();
    }

    #sampleEnv() {
        return sampleRamp(this.#envRamp, this.#clock());
    }

    // Row geometry under the pointer, or null.
    #waveShape() {
        // The overview dash keeps its allocation while hidden.
        if (this.#pointer === null || !this.#box.mapped || !this.#isAvailable())
            return null;
        // Native hover notification can precede the pointer coordinate update.
        this.#pointer = this.#getPointer() ?? this.#pointer;
        const count = this.#entries.length;
        if (count === 0)
            return null;
        const horizontal =
            this.#edge === ScreenEdge.BOTTOM || this.#edge === ScreenEdge.TOP;
        const [boxX, boxY] = this.#box.get_transformed_position();
        const pointer = horizontal
            ? this.#pointer[0] - boxX
            : this.#pointer[1] - boxY;
        const cross = horizontal
            ? this.#pointer[1] - boxY
            : this.#pointer[0] - boxX;
        // Allocation boxes are parent-relative, like the pointer above.
        const center = index => {
            const box = this.#entries[index].container.get_allocation_box();
            return horizontal ? (box.x1 + box.x2) / 2 : (box.y1 + box.y2) / 2;
        };
        // The row has no allocation box; the first icon gives its band.
        const band = this.#entries[0].container.get_allocation_box();
        const crossStart = horizontal ? band.y1 : band.x1;
        const crossEnd = horizontal ? band.y2 : band.x2;
        if ((cross < crossStart || cross > crossEnd) &&
            !this.#entries.some(({controller}) => controller.containsCrossPoint(...this.#pointer)))
            return null;
        // Another monitor's dock can share the band, so check the reach first.
        let first = horizontal ? (band.x1 + band.x2) / 2 : (band.y1 + band.y2) / 2;
        let last = count > 1 ? center(count - 1) : first;
        // Spacing follows physical order even when the row is RTL.
        if (first > last) {
            this.#entries.reverse();
            [first, last] = [last, first];
        }
        const pitch = count > 1
            ? (last - first) / (count - 1)
            : horizontal ? band.x2 - band.x1 : band.y2 - band.y1;
        // The wave dies one radius past the row.
        const reach = this.#recipe.hover.neighborRadius * pitch;
        if (!(pitch > 0) || pointer < first - reach || pointer > last + reach)
            return null;
        if (!this.#containsPointer(...this.#pointer))
            return null;
        const centers = new Array(count);
        for (let index = 0; index < count; index++)
            centers[index] = center(index);
        return {pointer, centers, pitch};
    }

    #syncWave() {
        const shape = this.#waveShape();
        let env;
        if (shape) {
            const {hover} = this.#recipe;
            const limit = this.#wavePeak();
            const levels = shape.centers.map(center => waveFalloff(
                Math.abs(center - shape.pointer) / shape.pitch, hover.neighborRadius) * limit);
            if (this.#envRamp.to !== 1)
                this.#startEnv(this.#sampleEnv(), 1);
            env = this.#sampleEnv();
            this.#spreadShape = shape;
            for (let index = 0; index < this.#entries.length; index++)
                this.#entries[index].level = levels[index];
            this.#applyWave(levels.map(level => level * env));
        } else {
            if (this.#envRamp.to !== 0)
                this.#startEnv(this.#sampleEnv(), 0);
            env = this.#sampleEnv();
            if (env > 0) {
                this.#applyWave(this.#entries.map(entry => entry.level * env));
            } else {
                this.#releaseWave();
            }
        }
        // Stop only after applying the endpoint, not after the clock passes it.
        if (env !== this.#envRamp.to)
            this.#scheduleFlush();
    }

    #setWave(entry, level) {
        if (entry.controller.setHoverLevel(level))
            this.#dirty.add(entry.controller);
    }

    #releaseWave() {
        this.#restoreSpread();
        this.#spreadShape = null;
        this.#pointer = null;
        this.#envRamp = IDLE_RAMP;
        this.#peak = null;
        for (const entry of this.#entries) {
            entry.level = 0;
            this.#setWave(entry, 0);
        }
    }

    #applyWave(levels) {
        const spacing = this.#getSpacing();
        const {centers} = this.#spreadShape;
        if (centers.length !== this.#entries.length) {
            this.#releaseWave();
            return;
        }
        const sizes = this.#entries.map(entry => entry.controller.icon.icon.iconSize);
        const geometry = waveGeometry({
            levels, sizes, hover: this.#recipe.hover,
            room: spacing?.room ?? Infinity,
        });
        for (const [index, entry] of this.#entries.entries())
            this.#setWave(entry, geometry.levels[index]);
        if (!spacing || !this.#recipe.hover.dynamicSpacing || !this.#animationsEnabled()) {
            this.#restoreSpread();
            return;
        }
        const {offsets, growth, first} = geometry;
        const horizontal = this.#edge === ScreenEdge.BOTTOM || this.#edge === ScreenEdge.TOP;
        const property = horizontal ? 'translation_x' : 'translation_y';
        const axis = horizontal ? 0 : 1;
        const origin = this.#box.get_transformed_position()[axis];
        const actors = spacing.actors;
        const iconOffsets = new Map(this.#entries.map((entry, index) => [entry.container, offsets[index]]));
        for (const [actor, original] of this.#translations) {
            if (!actors.includes(actor)) {
                actor[property] = original;
                actor.disconnectObject(this);
                this.#translations.delete(actor);
            }
        }
        for (const actor of actors) {
            if (!this.#translations.has(actor)) {
                this.#translations.set(actor, actor[property]);
                actor.connectObject('destroy', () => this.#translations.delete(actor), this);
            }
            const original = this.#translations.get(actor);
            let offset = iconOffsets.get(actor);
            if (offset === undefined) {
                const position = actor.get_transformed_position()[axis] - actor[property] + original - origin;
                offset = first;
                for (let i = 0; i < centers.length && centers[i] < position; i++)
                    offset += growth[i];
            }
            if (actor[property] !== original + offset)
                actor[property] = original + offset;
        }
    }

    #restoreSpread() {
        const property = this.#edge === ScreenEdge.BOTTOM || this.#edge === ScreenEdge.TOP
            ? 'translation_x' : 'translation_y';
        for (const [actor, original] of this.#translations) {
            actor[property] = original;
            actor.disconnectObject(this);
        }
        this.#translations.clear();
    }
}

function boxChildren(container) {
    return container.get_parent().get_children();
}
