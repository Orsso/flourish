// Ending a launch from the target's destroy handler would ease a
// half-destroyed bin; at idle the controller is inert or safe to reset.
export class DeferredLaunchEnds {
    #cancel;
    #pending = new Map();
    #schedule;

    constructor({schedule, cancel}) {
        this.#schedule = schedule;
        this.#cancel = cancel;
    }

    defer(controller) {
        let sourceId = 0;
        sourceId = this.#schedule(() => {
            const pending = this.#pending.get(sourceId);
            if (!pending)
                return false;
            this.#pending.delete(sourceId);
            pending.endLaunch();
            return false;
        });
        this.#pending.set(sourceId, controller);
    }

    flush() {
        const pending = [...this.#pending];
        this.#pending.clear();
        for (const [sourceId, controller] of pending) {
            this.#cancel(sourceId);
            controller.endLaunch();
        }
    }
}
