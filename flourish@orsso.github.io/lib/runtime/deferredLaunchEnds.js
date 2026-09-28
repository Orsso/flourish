// endOverlay in the target's destroy handler would ease a dying bin, so wait for idle.
export class DeferredLaunchEnds {
    #cancel;
    #pending = new Map();
    #schedule;

    constructor({schedule, cancel}) {
        this.#schedule = schedule;
        this.#cancel = cancel;
    }

    defer(controller) {
        const sourceId = this.#schedule(() => {
            this.#pending.delete(sourceId);
            controller.endOverlay();
            return false;
        });
        this.#pending.set(sourceId, controller);
    }

    flush() {
        const pending = [...this.#pending];
        this.#pending.clear();
        for (const [sourceId, controller] of pending) {
            this.#cancel(sourceId);
            controller.endOverlay();
        }
    }
}
