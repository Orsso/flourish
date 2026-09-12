import GLib from 'gi://GLib';
import St from 'gi://St';

import {NeighborRadius, ScreenEdge, easingProgress} from '../motion/catalog.js';
import {medianPitch, waveScales} from '../motion/continuum.js';
import {IconMotionController} from './iconMotionController.js';
import {makeCounters} from './debugCounters.js';
import {LiveRegistry} from './liveRegistry.js';

export class MotionSurface {
    #contexts = new Map();
    #continuous = false;
    #groups = new Set();
    #onMeasured;
    #onUrgentChanged;
    #recipe;
    #registry = new LiveRegistry();
    #scheduler;
    #counters = makeCounters();
    #clock;
    #animationsEnabled;

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

    get recipe() {
        return this.#recipe;
    }

    get continuous() {
        return this.#continuous;
    }

    get clock() {
        return this.#clock;
    }

    get animationsEnabled() {
        return this.#animationsEnabled;
    }

    // The preferences key can flip the mode mid session; the integrations
    // own the stage listener, this releases or readies the rows.
    setContinuous(on) {
        if (this.#continuous === on)
            return;
        this.#continuous = on;
        for (const group of this.#groups)
            group.setContinuous(on);
    }

    get counters() {
        return this.#counters;
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
        for (const controller of this.controllers)
            controller.setRecipe(recipe);
    }

    refreshStyles() {
        for (const controller of this.controllers)
            controller.refreshStyle();
    }

    // Spike: a pointer position in stage space; the wave runs at the next
    // flush, at most once per frame.
    onPointerMotion(x, y) {
        const start = GLib.get_monotonic_time();
        this.#counters.events++;
        for (const group of this.#groups)
            group.onPointerMotion(x, y);
        const us = GLib.get_monotonic_time() - start;
        this.#counters.eventUs += us;
        if (us > this.#counters.eventMaxUs)
            this.#counters.eventMaxUs = us;
    }

    addBox(box, edge, context = null) {
        const group = new NeighborGroup(this.#scheduler, box, edge, this);
        this.#groups.add(group);
        const added = this.#registry.addBox(box, () => {
            box.disconnectObject(this);
            this.#groups.delete(group);
            group.dispose();
        }, () => group.dispose());
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
            onHoverChanged: (changed, hovered) => group.setHovered(changed, hovered),
            onDestroyed: destroyed => {
                this.#contexts.delete(destroyed);
                group.remove(destroyed);
            },
            onMeasured: measurement => this.#onMeasured(measurement),
            onUrgentChanged: (changed, urgent) => this.#onUrgentChanged(changed, urgent),
            counters: this.#counters,
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
    #box;
    #dirty = new Set();
    #edge;
    #entries = [];
    #flushId = 0;
    #hovered = null;
    #counters;
    #pointer = null;
    #scheduler;
    #surface;
    #clock;
    #animationsEnabled;
    // Amplitude envelope of the wave, 0 idle to 1 full, eased over the
    // hover duration on entry and exit.
    #env = 0;
    #transition = {start: 0, from: 0, target: 0, duration: 0, easing: 'linear'};

    constructor(scheduler, box, edge, surface) {
        this.#scheduler = scheduler;
        this.#box = box;
        this.#edge = edge;
        this.#surface = surface;
        this.#counters = surface.counters;
        this.#clock = surface.clock;
        this.#animationsEnabled = surface.animationsEnabled;
    }

    get recipe() {
        return this.#surface.recipe;
    }

    add(controller, container, orderedContainers) {
        this.#entries.push({controller, container, lastWave: null, waveScale: null});
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
        this.#dirty.add(controller);
        this.#scheduleFlush();
    }

    // The preferences key can flip the mode mid session.
    setContinuous(on) {
        if (on)
            return;
        this.#cancelFlush();
        this.#pointer = null;
        this.#transition = {start: 0, from: 0, target: 0, duration: 0, easing: 'linear'};
        this.#env = 0;
        for (const entry of this.#entries) {
            entry.waveScale = null;
            entry.lastWave = null;
            if (entry.controller.setContinuousScale(null))
                this.#dirty.add(entry.controller);
        }
        this.#scheduleFlush();
    }

    // Record only; the cost is paid at most once per frame in #flush.
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
        this.#counters.flushes++;
        const start = GLib.get_monotonic_time();
        if (this.#waveOn())
            this.#syncWave();
        else
            this.#syncClassic();
        const dirty = this.#dirty;
        this.#dirty = new Set();
        for (const {controller} of this.#entries) {
            if (!dirty.has(controller))
                continue;
            this.#counters.touches++;
            controller.applyHoverState();
        }
        const us = GLib.get_monotonic_time() - start;
        this.#counters.flushUs += us;
        if (us > this.#counters.flushMaxUs)
            this.#counters.flushMaxUs = us;
        this.#counters.flushSamples.push(us);
        if (this.#counters.flushSamples.length > 128)
            this.#counters.flushSamples.shift();
    }

    #waveOn() {
        const {hover} = this.recipe;
        return this.#surface.continuous && hover.enabled && hover.scale > 1;
    }

    #startTransition(from, target) {
        this.#transition = {
            start: this.#clock(),
            from,
            target,
            duration: this.#animationsEnabled()
                ? Math.max(1, this.recipe.hover.duration)
                : 0,
            easing: this.recipe.hover.easing,
        };
        this.#env = this.#sampleEnv();
        if (this.#env !== this.#transition.target)
            this.#scheduleFlush();
    }

    #sampleEnv() {
        const transition = this.#transition;
        if (transition.duration <= 0 || transition.from === transition.target)
            return transition.target;
        const t = (this.#clock() - transition.start) / transition.duration;
        if (t >= 1)
            return transition.target;
        const value = transition.from +
            (transition.target - transition.from) *
            easingProgress(transition.easing, t);
        // A back-eased decay would sink below the natural size; the entry
        // overshoot stays, the exit one does not.
        if (transition.target < transition.from)
            return Math.max(transition.target, value);
        return value;
    }

    // Classic hover and fixed neighbors; the wave release path lands here too.
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

    // The row's geometry when the current pointer waves; null otherwise.
    #waveShape() {
        if (this.#pointer === null)
            return null;
        // Login rebuilds the dash under a scheduled flush.
        if (this.#box.get_stage() === null)
            return null;
        const {hover} = this.recipe;
        const horizontal =
            this.#edge === ScreenEdge.BOTTOM || this.#edge === ScreenEdge.TOP;
        this.#counters.boxGeom++;
        const [boxX, boxY] = this.#box.get_transformed_position();
        const pointer = horizontal
            ? this.#pointer[0] - boxX
            : this.#pointer[1] - boxY;
        const cross = horizontal
            ? this.#pointer[1] - boxY
            : this.#pointer[0] - boxX;
        // The dash box itself does not report a usable allocation box, so the
        // row's cross band comes from the first container.
        const first = this.#entries[0];
        // Dead containers mean the row was rebuilt under us.
        if (!first || first.container.get_stage() === null)
            return null;
        this.#counters.boxGeom++;
        const band = first.container.get_allocation_box();
        const crossStart = horizontal ? band.y1 : band.x1;
        const crossEnd = horizontal ? band.y2 : band.x2;
        // Cheap pre-gate: a pointer off the row's cross band never waves, so
        // paying the per-icon geometry reads for it first was pure waste.
        if (cross < crossStart || cross > crossEnd)
            return null;
        // Allocation boxes are parent-relative; their centers are row-local.
        const centers = new Array(this.#entries.length);
        for (let index = 0; index < this.#entries.length; index++) {
            this.#counters.contGeom++;
            const box = this.#entries[index].container.get_allocation_box();
            centers[index] = horizontal
                ? (box.x1 + box.x2) / 2
                : (box.y1 + box.y2) / 2;
        }
        const pitch = medianPitch(centers);
        // The wave dies one radius past the row.
        if (!(pitch > 0) ||
            pointer < centers[0] - hover.neighborRadius * pitch ||
            pointer >
                centers[this.#entries.length - 1] + hover.neighborRadius * pitch)
            return null;
        return {pointer, centers, pitch};
    }

    #syncWave() {
        const shape = this.#waveShape();
        if (shape) {
            const {hover} = this.recipe;
            const scales = waveScales(
                shape.pointer, shape.centers, hover.neighborRadius,
                shape.pitch, hover.scale);
            if (this.#transition.target !== 1) {
                // Entering over an icon: it already shows the classic peak,
                // so the wave starts full instead of popping it to 1 first.
                const hoveredIndex = this.#entries.findIndex(
                    entry => entry.controller === this.#hovered);
                const seed = hoveredIndex !== -1 && scales[hoveredIndex] > 1;
                this.#startTransition(seed ? 1 : this.#env, 1);
            } else {
                this.#env = this.#sampleEnv();
            }
            for (let index = 0; index < scales.length; index++) {
                const entry = this.#entries[index];
                entry.waveScale = scales[index];
                // An explicit 1 keeps the wave in ownership; null would
                // restore the classic scale and pop.
                const target = 1 + (scales[index] - 1) * this.#env;
                if (entry.lastWave === target && this.#env === 1)
                    continue;
                entry.lastWave = target;
                if (entry.controller.setContinuousScale(target))
                    this.#dirty.add(entry.controller);
            }
        } else {
            if (this.#transition.target !== 0)
                this.#startTransition(this.#env, 0);
            else
                this.#env = this.#sampleEnv();
            if (this.#env > 0) {
                // Decay the last wave shape; never re-multiply faded values.
                for (const entry of this.#entries) {
                    if (entry.waveScale === null)
                        continue;
                    const target = 1 + (entry.waveScale - 1) * this.#env;
                    if (entry.lastWave === target)
                        continue;
                    entry.lastWave = target;
                    if (entry.controller.setContinuousScale(target))
                        this.#dirty.add(entry.controller);
                }
            } else {
                for (const entry of this.#entries) {
                    if (entry.waveScale === null)
                        continue;
                    entry.waveScale = null;
                    entry.lastWave = null;
                    if (entry.controller.setContinuousScale(null))
                        this.#dirty.add(entry.controller);
                }
            }
            this.#syncClassic();
        }
        // A running transition needs further frames; a settled wave is idle.
        if (this.#env !== this.#transition.target)
            this.#scheduleFlush();
    }
}

function boxChildren(container) {
    return container.get_parent().get_children();
}
