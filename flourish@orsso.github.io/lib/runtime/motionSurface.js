import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {Easing, sampleRamp} from '../motion/catalog.js';
import {OVERSHOOT_RESERVE, fitHoverLevel, hoverActive, waveFalloff, waveGeometry} from '../motion/continuum.js';
import {getOrientation} from '../motion/transforms.js';
import {IconMotionController} from './iconMotionController.js';
import {IconDecorations} from './iconDecorations.js';
import {BackgroundExpansion} from './geometry.js';
import {LiveRegistry} from './liveRegistry.js';

const IDLE_RAMP = {start: 0, from: 0, to: 0, duration: 0, easing: Easing.LINEAR};

export class MotionSurface {
    #animationsEnabled;
    #clock;
    #contexts = new Map();
    #rows = new Set();
    #getPointer;
    #onUrgentChanged;
    #recipe;
    #registry = new LiveRegistry();
    #scheduler;

    constructor({
        recipe,
        clock = () => GLib.get_monotonic_time() / 1000,
        getPointer = () => global.get_pointer().slice(0, 2),
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

    findIcon(app) {
        return this.controllers.find(controller => controller.icon.app === app)?.icon ?? null;
    }

    getContext(appIcon) {
        const controller = this.getController(appIcon);
        return controller ? this.#contexts.get(controller) ?? null : null;
    }

    setRecipe(recipe) {
        this.#recipe = recipe;
        for (const row of this.#rows)
            row.setRecipe(recipe);
        for (const controller of this.controllers)
            controller.setRecipe(recipe);
    }

    refreshStyles() {
        for (const controller of this.controllers)
            controller.refreshStyle();
    }

    invalidateGeometry() {
        for (const row of this.#rows)
            row.invalidateGeometry();
    }

    onPointerMotion(x, y) {
        for (const row of this.#rows)
            row.onPointerMotion(x, y);
    }

    clearPointer(box = null) {
        for (const row of this.#rows)
            if (!box || row.box === box)
                row.clearPointer();
    }

    addBox(box, edge, context) {
        const row = new WaveRow({
            scheduler: this.#scheduler,
            box,
            edge,
            recipe: this.#recipe,
            clock: this.#clock,
            getPointer: this.#getPointer,
            animationsEnabled: this.#animationsEnabled,
            context,
        });
        this.#rows.add(row);
        const release = () => {
            this.#rows.delete(row);
            row.dispose();
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
            this.#registerContainer(container, edge, row, context);
        box.connectObject('child-added', (_box, container) => {
            this.#registerContainer(container, edge, row, context);
        }, this);
        return true;
    }

    dispose() {
        this.#registry.disable();
        this.#contexts.clear();
    }

    #registerContainer(container, edge, row, context) {
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
            onAnimate: () => row.touch(controller),
            decorations: container.label
                ? {container, getMonitor: context.getMonitor, labelOffset: context.labelOffset} : null,
            onHoverChanged: changed => row.refreshPointer(changed),
            onDestroyed: destroyed => {
                this.#contexts.delete(destroyed);
                row.remove(destroyed);
            },
            onUrgentChanged: (changed, urgent) => this.#onUrgentChanged(changed, urgent),
        });
        row.add(controller, container, boxChildren(container));
        this.#contexts.set(controller, context);
        this.#registry.addController(icon, controller);
        // An icon can be urgent before Flourish finds it.
        if (controller.urgent)
            this.#onUrgentChanged(controller, true);
    }
}

class WaveRow {
    #background = null;
    #context;
    #extraDecorations = new Map();
    #animationsEnabled;
    #box;
    #clock;
    #dirty = new Set();
    #edge;
    #entries = [];
    // Wave amplitude, 0 at rest to 1 in full, eased over the hover duration.
    #envRamp = IDLE_RAMP;
    #flushId = 0;
    #getPointer;
    #horizontal;
    #peak = null;
    #pointer = null;
    #pointerActor;
    #recipe;
    #scheduler;
    #translations = new Map();

    constructor({scheduler, box, edge, recipe, clock, getPointer, animationsEnabled, context}) {
        const {pointerActor, background} = context;
        this.#scheduler = scheduler;
        this.#box = box;
        this.#pointerActor = pointerActor;
        this.#edge = edge;
        this.#horizontal = getOrientation(edge).horizontal;
        this.#recipe = recipe;
        this.#clock = clock;
        this.#getPointer = getPointer;
        this.#animationsEnabled = animationsEnabled;
        this.#context = context;
        if (background)
            this.#background = new BackgroundExpansion(background, edge, context.getMonitor);
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
        if (hoverActive(this.#recipe.hover)) {
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
        if (!hoverActive(this.#recipe.hover))
            this.#releaseWave();
        else {
            this.#pointer = this.#getPointer() ?? this.#pointer;
            if (!this.#animationsEnabled())
                this.#restoreSpacing();
        }
        this.#scheduleFlush();
    }

    invalidateGeometry() {
        this.#peak = null;
        this.#scheduleFlush();
    }

    // Record only; the row runs at most once per frame, in #flush.
    onPointerMotion(x, y) {
        if (!hoverActive(this.#recipe.hover))
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
        this.#restoreSpacing();
        this.#background?.detach();
        this.#background = null;
        for (const [actor, decorations] of this.#extraDecorations) {
            actor.disconnectObject(decorations);
            decorations.dispose();
        }
        this.#extraDecorations.clear();
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
        if (hoverActive(this.#recipe.hover))
            this.#syncWave();
        const dirty = this.#dirty;
        this.#dirty = new Set();
        const now = this.#clock();
        for (const {controller} of this.#entries) {
            if (dirty.has(controller) && controller.applyHoverState(now))
                this.touch(controller);
            controller.updateDecorations();
        }
        for (const decorations of this.#extraDecorations.values())
            decorations.update();
    }

    // One measure per sweep: the row shares one clip and one icon size.
    #wavePeak() {
        if (this.#peak !== null)
            return this.#peak;
        const {hover} = this.#recipe;
        const fit = this.#entries[0].controller.measure(this.#context.getMonitor());
        const overshoot = hover.easing === Easing.EASE_OUT_BACK ? OVERSHOOT_RESERVE : 0;
        this.#peak = fit
            ? fitHoverLevel(hover, fit.iconSize, fit.outwardRoom, overshoot)
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
        if (this.#pointer === null || !this.#box.mapped || !this.#context.isAvailable())
            return null;
        // Native hover notification can precede the pointer coordinate update.
        this.#pointer = this.#getPointer() ?? this.#pointer;
        const count = this.#entries.length;
        if (count === 0)
            return null;
        const horizontal = this.#horizontal;
        const [valid, localX, localY] = this.#box.transform_stage_point(...this.#pointer);
        if (!valid)
            return null;
        const pointer = horizontal ? localX : localY;
        const cross = horizontal ? localY : localX;
        // The row has no allocation box; the first icon gives its band.
        const band = this.#entries[0].container.get_allocation_box();
        const crossStart = horizontal ? band.y1 : band.x1;
        const crossEnd = horizontal ? band.y2 : band.x2;
        if ((cross < crossStart || cross > crossEnd) &&
            !this.#entries.some(({controller}) => controller.containsCrossPoint(...this.#pointer)))
            return null;
        // Another monitor's dock can share the band, so check the reach first.
        let first = horizontal ? (band.x1 + band.x2) / 2 : (band.y1 + band.y2) / 2;
        let last = count > 1 ? this.#center(this.#entries[count - 1]) : first;
        // Spacing follows physical order even when the row is RTL.
        if (first > last) {
            this.#entries.reverse();
            [first, last] = [last, first];
        }
        const pitch = count > 1
            ? (last - first) / (count - 1)
            : horizontal ? band.x2 - band.x1 : band.y2 - band.y1;
        // The wave dies one reach past the row.
        const reachPx = this.#recipe.hover.reach * pitch;
        if (!(pitch > 0) || pointer < first - reachPx || pointer > last + reachPx)
            return null;
        if (!this.#context.containsPointer(...this.#pointer))
            return null;
        return {pointer, centers: this.#entries.map(entry => this.#center(entry)), pitch};
    }

    // Allocation boxes are parent-relative, like the pointer.
    #center(entry) {
        const box = entry.container.get_allocation_box();
        return this.#horizontal ? (box.x1 + box.x2) / 2 : (box.y1 + box.y2) / 2;
    }

    #syncWave() {
        const shape = this.#waveShape();
        let env;
        if (shape) {
            const {hover} = this.#recipe;
            const limit = this.#wavePeak();
            const levels = shape.centers.map(center => waveFalloff(
                Math.abs(center - shape.pointer) / shape.pitch, hover.reach) * limit);
            if (this.#envRamp.to !== 1)
                this.#startEnv(this.#sampleEnv(), 1);
            env = this.#sampleEnv();
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
        this.#restoreSpacing();
        this.#pointer = null;
        this.#envRamp = IDLE_RAMP;
        this.#peak = null;
        for (const entry of this.#entries) {
            entry.level = 0;
            this.#setWave(entry, 0);
        }
    }

    #applyWave(levels) {
        const spacing = this.#context.getSpacing();
        const sizes = this.#entries.map(entry => entry.controller.icon.icon.iconSize);
        const geometry = waveGeometry({
            levels, sizes, hover: this.#recipe.hover,
            sideRoom: spacing.sideRoom,
        });
        for (const [index, entry] of this.#entries.entries())
            this.#setWave(entry, geometry.levels[index]);
        if (!this.#recipe.hover.dynamicSpacing || !this.#animationsEnabled()) {
            this.#restoreSpacing();
            return;
        }
        const {offsets, growth, first} = geometry;
        this.#background?.setGrowth(-2 * first);
        const property = this.#horizontal ? 'translation_x' : 'translation_y';
        const actors = spacing.actors;
        let centers = null;
        const iconOffsets = new Map(this.#entries.map((entry, index) => [entry.container, offsets[index]]));
        for (const actor of actors) {
            if (!iconOffsets.has(actor) && actor.label && actor.icon?._iconBin &&
                !this.#extraDecorations.has(actor)) {
                const decorations = new IconDecorations({
                    ...this.#context, container: actor, icon: actor,
                    bin: actor.icon._iconBin, edge: this.#edge,
                    onChanged: () => this.#scheduleFlush(),
                });
                this.#extraDecorations.set(actor, decorations);
                actor.connectObject('destroy', () => {
                    decorations.dispose();
                    this.#extraDecorations.delete(actor);
                }, decorations);
            }
        }
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
                const [, x, y] = this.#box.transform_stage_point(...actor.get_transformed_position());
                const position = (this.#horizontal ? x : y) - actor[property] + original;
                offset = first;
                centers ??= this.#entries.map(entry => this.#center(entry));
                for (let i = 0; i < centers.length && centers[i] < position; i++)
                    offset += growth[i];
            }
            if (actor[property] !== original + offset)
                actor[property] = original + offset;
        }
    }

    #restoreSpacing() {
        this.#background?.setGrowth(0);
        const property = this.#horizontal ? 'translation_x' : 'translation_y';
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
