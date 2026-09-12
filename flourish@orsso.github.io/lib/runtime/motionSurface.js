import GLib from 'gi://GLib';
import St from 'gi://St';

import {Easing, NeighborRadius, ScreenEdge, sampleRamp} from '../motion/catalog.js';
import {waveScales} from '../motion/continuum.js';
import {OVERSHOOT_RESERVE, fitHoverToBudget} from '../motion/transforms.js';
import {IconMotionController} from './iconMotionController.js';
import {LiveRegistry} from './liveRegistry.js';

const IDLE_RAMP = {start: 0, from: 0, to: 0, duration: 0, easing: Easing.LINEAR};

export class MotionSurface {
    #animationsEnabled;
    #clock;
    #contexts = new Map();
    #continuous;
    #groups = new Set();
    #onMeasured;
    #onUrgentChanged;
    #recipe;
    #registry = new LiveRegistry();
    #scheduler;

    constructor({
        recipe,
        continuous = false,
        clock = () => GLib.get_monotonic_time() / 1000,
        animationsEnabled = () => St.Settings.get().enable_animations,
        onMeasured = () => {},
        onUrgentChanged = () => {},
        scheduler,
    }) {
        this.#recipe = recipe;
        this.#continuous = continuous;
        this.#clock = clock;
        this.#animationsEnabled = animationsEnabled;
        this.#onMeasured = onMeasured;
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

    // The hover-mode key flips mid session.
    setContinuous(on) {
        if (on === this.#continuous)
            return;
        this.#continuous = on;
        for (const group of this.#groups)
            group.setContinuous(on);
    }

    refreshStyles() {
        for (const controller of this.controllers)
            controller.refreshStyle();
    }

    onPointerMotion(x, y) {
        for (const group of this.#groups)
            group.onPointerMotion(x, y);
    }

    addBox(box, edge, context = null) {
        const group = new NeighborGroup({
            scheduler: this.#scheduler,
            box,
            edge,
            recipe: this.#recipe,
            continuous: this.#continuous,
            clock: this.#clock,
            animationsEnabled: this.#animationsEnabled,
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
        if (!added)
            return false;
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
            onHoverChanged: (changed, hovered) => group.setHovered(changed, hovered),
            onDestroyed: destroyed => {
                this.#contexts.delete(destroyed);
                group.remove(destroyed);
            },
            onMeasured: measurement => this.#onMeasured(measurement),
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
    #continuous;
    #dirty = new Set();
    #edge;
    #entries = [];
    // Wave amplitude, 0 at rest to 1 in full, eased over the hover duration.
    #envRamp = IDLE_RAMP;
    #flushId = 0;
    #hovered = null;
    #peak = null;
    #pointer = null;
    #recipe;
    #scheduler;

    constructor({scheduler, box, edge, recipe, continuous, clock, animationsEnabled}) {
        this.#scheduler = scheduler;
        this.#box = box;
        this.#edge = edge;
        this.#recipe = recipe;
        this.#continuous = continuous;
        this.#clock = clock;
        this.#animationsEnabled = animationsEnabled;
    }

    add(controller, container, orderedContainers) {
        this.#entries.push({controller, container, waveScale: null});
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
        if (this.#hovered === controller)
            this.#hovered = null;
        this.#scheduleFlush();
    }

    setHovered(controller, hovered) {
        this.#hovered = hovered ? controller : this.#hovered === controller ? null : this.#hovered;
        this.touch(controller);
    }

    touch(controller) {
        this.#dirty.add(controller);
        this.#scheduleFlush();
    }

    setRecipe(recipe) {
        this.#recipe = recipe;
        this.#peak = null;
    }

    setContinuous(on) {
        this.#continuous = on;
        if (on)
            return;
        this.#releaseWave();
        this.#scheduleFlush();
    }

    // Record only; the row runs at most once per frame, in #flush.
    onPointerMotion(x, y) {
        if (!this.#waveOn())
            return;
        this.#pointer = [x, y];
        this.#scheduleFlush();
    }

    dispose() {
        this.#cancelFlush();
        this.#hovered = null;
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
        else
            this.#syncClassic();
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
        return this.#continuous && hover.enabled && hover.scale > 1;
    }

    // One measure per sweep: the row shares one clip and one icon size.
    #wavePeak() {
        if (this.#peak !== null)
            return this.#peak;
        const {hover} = this.#recipe;
        const room = this.#entries[0].controller.measure();
        const overshoot = hover.easing === Easing.EASE_OUT_BACK ? OVERSHOOT_RESERVE : 0;
        this.#peak = room
            ? fitHoverToBudget(hover.scale, hover.lift,
                room.iconNormalSize, room.budgetPx, overshoot).hoverScale
            : hover.scale;
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

    #syncClassic() {
        const hoveredIndex = this.#entries.findIndex(
            entry => entry.controller === this.#hovered);
        for (let index = 0; index < this.#entries.length; index++) {
            const distance = hoveredIndex === -1
                ? Infinity
                : Math.abs(index - hoveredIndex);
            // Past the max radius the transform is identity: report no change.
            if (this.#entries[index].controller.setNeighborDistance(
                distance > NeighborRadius.MAX ? Infinity : distance))
                this.#dirty.add(this.#entries[index].controller);
        }
    }

    // Row geometry under the pointer, or null.
    #waveShape() {
        // The overview dash keeps its allocation while hidden.
        if (this.#pointer === null || !this.#box.mapped)
            return null;
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
        if (cross < crossStart || cross > crossEnd)
            return null;
        // Another monitor's dock can share the band, so check the reach first.
        const first = horizontal ? (band.x1 + band.x2) / 2 : (band.y1 + band.y2) / 2;
        const last = count > 1 ? center(count - 1) : first;
        const pitch = count > 1
            ? (last - first) / (count - 1)
            : horizontal ? band.x2 - band.x1 : band.y2 - band.y1;
        // The wave dies one radius past the row.
        const reach = this.#recipe.hover.neighborRadius * pitch;
        if (!(pitch > 0) || pointer < first - reach || pointer > last + reach)
            return null;
        const centers = new Array(count);
        for (let index = 0; index < count; index++)
            centers[index] = center(index);
        return {pointer, centers, pitch};
    }

    #syncWave() {
        const shape = this.#waveShape();
        if (shape) {
            const {hover} = this.#recipe;
            const scales = waveScales(
                shape.pointer, shape.centers, hover.neighborRadius,
                shape.pitch, this.#wavePeak());
            if (this.#envRamp.to !== 1)
                this.#startEnv(this.#sampleEnv(), 1);
            const env = this.#sampleEnv();
            for (let index = 0; index < this.#entries.length; index++) {
                const entry = this.#entries[index];
                entry.waveScale = scales[index];
                this.#setWave(entry, 1 + (scales[index] - 1) * env, scales[index]);
            }
        } else {
            if (this.#envRamp.to !== 0)
                this.#startEnv(this.#sampleEnv(), 0);
            const env = this.#sampleEnv();
            if (env > 0) {
                // Fade the last shape, never the faded values.
                for (const entry of this.#entries) {
                    if (entry.waveScale !== null)
                        this.#setWave(entry, 1 + (entry.waveScale - 1) * env);
                }
            } else {
                this.#releaseWave();
            }
            this.#syncClassic();
        }
        // A running ramp needs further frames; a settled wave is idle.
        if (this.#sampleEnv() !== this.#envRamp.to)
            this.#scheduleFlush();
    }

    // An explicit 1 keeps the wave in charge; null hands the icon back to the hover path.
    #setWave(entry, scale, target = scale) {
        if (entry.controller.setContinuousScale(scale, target))
            this.#dirty.add(entry.controller);
    }

    #releaseWave() {
        this.#pointer = null;
        this.#envRamp = IDLE_RAMP;
        this.#peak = null;
        for (const entry of this.#entries) {
            entry.waveScale = null;
            this.#setWave(entry, null);
        }
    }
}

function boxChildren(container) {
    return container.get_parent().get_children();
}
