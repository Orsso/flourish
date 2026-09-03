export class LiveRegistry {
    #boxes = new Map();
    #controllers = new Map();

    get boxCount() {
        return this.#boxes.size;
    }

    get controllerCount() {
        return this.#controllers.size;
    }

    get controllers() {
        return [...this.#controllers.values()];
    }

    getController(actor) {
        return this.#controllers.get(actor);
    }

    addController(actor, controller) {
        if (this.#controllers.has(actor))
            return this.#controllers.get(actor);

        actor.connectObject('destroy', () => {
            this.#controllers.delete(actor);
            controller.onTargetDestroyed();
        }, this);
        this.#controllers.set(actor, controller);
        return controller;
    }

    removeLiveController(actor) {
        const controller = this.#controllers.get(actor);
        if (!controller)
            return;
        this.#controllers.delete(actor);
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
        for (const actor of [...this.#controllers.keys()])
            this.removeLiveController(actor);
        for (const box of [...this.#boxes.keys()])
            this.removeLiveBox(box);
    }
}
