import {NeighborRadius} from '../motion/catalog.js';
import {IconMotionController} from './iconMotionController.js';
import {LiveRegistry} from './liveRegistry.js';

export class MotionSurface {
    #contexts = new Map();
    #onMeasured;
    #onUrgentChanged;
    #recipe;
    #registry = new LiveRegistry();
    #scheduler;

    constructor({recipe, onMeasured = () => {}, onUrgentChanged = () => {}, scheduler}) {
        this.#recipe = recipe;
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
        for (const controller of this.controllers)
            controller.setRecipe(recipe);
    }

    refreshStyles() {
        for (const controller of this.controllers)
            controller.refreshStyle();
    }

    addBox(box, edge, context = null) {
        const group = new NeighborGroup(this.#scheduler);
        const added = this.#registry.addBox(box, () => {
            box.disconnectObject(this);
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
    #dirty = new Set();
    #entries = [];
    #flushId = 0;
    #hovered = null;
    #scheduler;

    constructor(scheduler) {
        this.#scheduler = scheduler;
    }

    add(controller, container, orderedContainers) {
        this.#entries.push({controller, container});
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

    dispose() {
        this.#cancelFlush();
        this.#hovered = null;
        this.#entries = [];
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
        this.#syncNeighbors();
        const dirty = this.#dirty;
        this.#dirty = new Set();
        for (const {controller} of this.#entries) {
            if (dirty.has(controller))
                controller.applyHoverState();
        }
    }

    #syncNeighbors() {
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
}

function boxChildren(container) {
    return container.get_parent().get_children();
}
