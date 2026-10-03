import {LiveRegistry} from '../flourish@orsso.github.io/lib/runtime/liveRegistry.js';
import {FakeEmitter} from './fakes.js';

// Any call after destroy() counts as touching a disposed actor.
class FakeActor extends FakeEmitter {
    constructor() {
        super();
        this.destroyed = false;
        this.postDestroyTouches = 0;
    }

    disconnectObject(owner) {
        this.touch();
        super.disconnectObject(owner);
    }

    touch() {
        if (this.destroyed) {
            this.postDestroyTouches++;
            throw new Error('disposed actor touched');
        }
    }

    destroy() {
        this.destroyed = true;
        super.destroy();
    }
}

class FakeController {
    constructor() {
        this.disposeCount = 0;
        this.destroyedCount = 0;
    }

    dispose() {
        this.disposeCount++;
    }

    onTargetDestroyed() {
        this.destroyedCount++;
    }
}

test('destroy callbacks prune controller records without actor access', () => {
    const registry = new LiveRegistry();
    const actor = new FakeActor();
    const controller = new FakeController();
    registry.addController(actor, controller);
    actor.destroy();
    assertEqual(registry.getController(actor), undefined);
    assertEqual(controller.destroyedCount, 1);
    assertEqual(controller.disposeCount, 0);
    assertEqual(actor.postDestroyTouches, 0);
});

test('explicit disable disposes only live controller records once', () => {
    const registry = new LiveRegistry();
    const actor = new FakeActor();
    const controller = new FakeController();
    registry.addController(actor, controller);
    registry.disable();
    registry.disable();
    assertEqual(controller.disposeCount, 1);
    assertEqual(registry.controllers.length, 0);
});

test('destroy callbacks prune box records without cleanup access', () => {
    const registry = new LiveRegistry();
    const box = new FakeActor();
    let cleanupCount = 0;
    registry.addBox(box, () => cleanupCount++, () => {});
    box.destroy();
    assertEqual(cleanupCount, 0);
    assertEqual(box.postDestroyTouches, 0);
});

test('disable runs box cleanup once while the box is live', () => {
    const registry = new LiveRegistry();
    const box = new FakeActor();
    let cleanupCount = 0;
    registry.addBox(box, () => cleanupCount++, () => {});
    assertEqual(registry.addBox(box, () => {}, () => {}), false);
    registry.disable();
    registry.disable();
    assertEqual(cleanupCount, 1);
    assertEqual(registry.addBox(box, () => {}, () => {}), true);
});

test('box destruction runs only the target-free ownership callback', () => {
    const registry = new LiveRegistry();
    const box = new FakeActor();
    let cleanupCount = 0;
    let destroyedCount = 0;
    registry.addBox(box, () => cleanupCount++, () => destroyedCount++);
    box.destroy();
    assertEqual(cleanupCount, 0);
    assertEqual(destroyedCount, 1);
    assertEqual(box.postDestroyTouches, 0);
});
