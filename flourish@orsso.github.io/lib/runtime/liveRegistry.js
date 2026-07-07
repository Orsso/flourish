export class LiveRegistry {
    #boxes = new Map();
    #icons = new Map();
    #disabled = false;

    get boxCount() {
        return this.#boxes.size;
    }

    get iconCount() {
        return this.#icons.size;
    }

    get icons() {
        return [...this.#icons.values()].map(record => record.controller);
    }

    getIcon(actor) {
        return this.#icons.get(actor)?.controller ?? null;
    }

    addIcon(actor, controller) {
        if (this.#disabled || this.#icons.has(actor))
            return this.#icons.get(actor)?.controller ?? null;

        const destroyId = actor.connect('destroy', () => {
            const record = this.#icons.get(actor);
            if (!record)
                return;
            this.#icons.delete(actor);
            record.controller.onTargetDestroyed();
        });
        this.#icons.set(actor, {actor, controller, destroyId});
        return controller;
    }

    removeLiveIcon(actor) {
        const record = this.#icons.get(actor);
        if (!record)
            return;
        this.#icons.delete(actor);
        actor.disconnect(record.destroyId);
        record.controller.dispose();
    }

    addBox(box, cleanup, onDestroyed = () => {}) {
        if (this.#disabled || this.#boxes.has(box))
            return false;

        const destroyId = box.connect('destroy', () => {
            this.#boxes.delete(box);
            onDestroyed();
        });
        this.#boxes.set(box, {box, cleanup, destroyId});
        return true;
    }

    removeLiveBox(box) {
        const record = this.#boxes.get(box);
        if (!record)
            return;
        this.#boxes.delete(box);
        box.disconnect(record.destroyId);
        record.cleanup();
    }

    disable() {
        if (this.#disabled)
            return;
        this.#disabled = true;

        for (const actor of [...this.#icons.keys()])
            this.removeLiveIcon(actor);
        for (const box of [...this.#boxes.keys()])
            this.removeLiveBox(box);
    }
}
