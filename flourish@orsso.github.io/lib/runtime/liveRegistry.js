export class LiveRegistry {
    #boxes = new Map();
    #controllers = new Map();

    get controllers() {
        return [...this.#controllers.values()];
    }

    getController(actor) {
        return this.#controllers.get(actor);
    }

    addController(actor, controller) {
        actor.connectObject('destroy', () => {
            this.#controllers.delete(actor);
            controller.onTargetDestroyed();
        }, this);
        this.#controllers.set(actor, controller);
    }

    #removeController(actor) {
        const controller = this.#controllers.get(actor);
        if (!controller)
            return;
        this.#controllers.delete(actor);
        actor.disconnectObject(this);
        controller.dispose();
    }

    addBox(box, cleanup, onDestroyed) {
        if (this.#boxes.has(box))
            return false;

        box.connectObject('destroy', () => {
            this.#boxes.delete(box);
            onDestroyed();
        }, this);
        this.#boxes.set(box, cleanup);
        return true;
    }

    #removeBox(box) {
        const cleanup = this.#boxes.get(box);
        if (!cleanup)
            return;
        this.#boxes.delete(box);
        box.disconnectObject(this);
        cleanup();
    }

    disable() {
        for (const actor of [...this.#controllers.keys()])
            this.#removeController(actor);
        for (const box of [...this.#boxes.keys()])
            this.#removeBox(box);
    }
}
