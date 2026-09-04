import {DockState} from '../motion/catalog.js';
import {dockVisibilityState} from '../motion/transforms.js';
import {actorGeometry} from './geometry.js';

// Watches the actor Dash to Dock slides and reports its state.
export class DockVisibility {
    #actor;
    #edge;
    #flushId = 0;
    #getMonitor;
    #listeners = new Set();
    #rect = null;
    #scheduler;
    #shownRect = null;
    #state = null;
    #watched = [];

    constructor({actor, root, edge, getMonitor, scheduler}) {
        this.#actor = actor;
        this.#edge = edge;
        this.#getMonitor = getMonitor;
        this.#scheduler = scheduler;
        // The slider moves a bottom or right dock through its own size and the
        // dock's translation, so the slid actor's allocation never changes there.
        let node = actor;
        while (node) {
            node.connectObject(
                'notify::allocation', () => this.#scheduleSync(),
                'notify::translation-x', () => this.#scheduleSync(),
                'notify::translation-y', () => this.#scheduleSync(),
                this);
            this.#watched.push(node);
            if (node === root)
                break;
            node = node.get_parent();
        }
        actor.connectObject('destroy', () => this.dispose(), this);
        this.#sync();
    }

    get state() {
        return this.#state;
    }

    // As of the last frame sync.
    get rect() {
        return this.#rect;
    }

    // Fresh, for a caller that may run before the sync of the same frame.
    measure() {
        return this.#actor ? actorGeometry(this.#actor) : this.#rect;
    }

    // Where the slid actor was the last time the dock was fully shown.
    get shownRect() {
        return this.#shownRect;
    }

    subscribe(listener) {
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    }

    dispose() {
        this.#cancelSync();
        this.#listeners.clear();
        for (const node of this.#watched)
            node.disconnectObject(this);
        this.#watched = [];
        this.#actor = null;
        this.#rect = null;
        this.#state = null;
    }

    // The slider reallocates on every step, so measure once per frame.
    #scheduleSync() {
        if (this.#flushId)
            return;
        this.#flushId = this.#scheduler.schedule(() => {
            this.#flushId = 0;
            this.#sync();
        });
    }

    #cancelSync() {
        if (!this.#flushId)
            return;
        this.#scheduler.cancel(this.#flushId);
        this.#flushId = 0;
    }

    #sync() {
        if (!this.#actor)
            return;
        const monitor = this.#getMonitor();
        if (!monitor)
            return;
        this.#rect = actorGeometry(this.#actor);
        const state = dockVisibilityState(this.#rect, monitor, this.#edge);
        if (state === DockState.SHOWN)
            this.#shownRect = this.#rect;
        if (state === this.#state)
            return;
        this.#state = state;
        for (const listener of [...this.#listeners])
            listener(state);
    }
}
