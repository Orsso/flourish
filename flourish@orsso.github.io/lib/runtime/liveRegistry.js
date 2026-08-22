export class LiveRegistry {
    #boxes = new Map();
    #icons = new Map();

    get boxCount() {
        return this.#boxes.size;
    }

    get iconCount() {
        return this.#icons.size;
    }

    get icons() {
        return [...this.#icons.values()];
    }

    getIcon(actor) {
        return this.#icons.get(actor);
    }

    addIcon(actor, controller) {
        if (this.#icons.has(actor))
            return this.#icons.get(actor);

        actor.connectObject('destroy', () => {
            this.#icons.delete(actor);
            controller.onTargetDestroyed();
        }, this);
        this.#icons.set(actor, controller);
        return controller;
    }

    removeLiveIcon(actor) {
        const controller = this.#icons.get(actor);
        if (!controller)
            return;
        this.#icons.delete(actor);
        actor.disconnectObject(this);
        controller.dispose();
    }

    addBox(box, cleanup, onDestroyed = () => {}) {
        if (this.#boxes.has(box))
            return false;

        box.connectObject('destroy', () => {
            this.#boxes.delete(box);
            onDestroyed();
        }, this);
        this.#boxes.set(box, cleanup);
        return true;
    }

    removeLiveBox(box) {
        const cleanup = this.#boxes.get(box);
        if (!cleanup)
            return;
        this.#boxes.delete(box);
        box.disconnectObject(this);
        cleanup();
    }

    disable() {
        for (const actor of [...this.#icons.keys()])
            this.removeLiveIcon(actor);
        for (const box of [...this.#boxes.keys()])
            this.removeLiveBox(box);
    }
}
