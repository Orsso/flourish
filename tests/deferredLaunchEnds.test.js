import {DeferredLaunchEnds} from '../flourish@orsso.github.io/lib/runtime/deferredLaunchEnds.js';

class FakeScheduler {
    nextId = 1;
    callbacks = new Map();
    cancelled = [];

    schedule(callback) {
        const id = this.nextId++;
        this.callbacks.set(id, callback);
        return id;
    }

    cancel(id) {
        this.cancelled.push(id);
        this.callbacks.delete(id);
    }

    run(id) {
        const callback = this.callbacks.get(id);
        this.callbacks.delete(id);
        callback();
    }
}

function controller() {
    return {
        endCount: 0,
        endLaunch() {
            this.endCount++;
        },
    };
}

test('a completed deferred launch ends its controller once', () => {
    const scheduler = new FakeScheduler();
    const pending = new DeferredLaunchEnds({
        schedule: callback => scheduler.schedule(callback),
        cancel: id => scheduler.cancel(id),
    });
    const target = controller();

    pending.defer(target);
    scheduler.run(1);
    pending.flush();

    assertEqual(target.endCount, 1);
    assertDeepEqual(scheduler.cancelled, []);
});

test('flush cancels pending sources and ends controllers once', () => {
    const scheduler = new FakeScheduler();
    const pending = new DeferredLaunchEnds({
        schedule: callback => scheduler.schedule(callback),
        cancel: id => scheduler.cancel(id),
    });
    const target = controller();

    pending.defer(target);
    pending.flush();
    pending.flush();

    assertEqual(target.endCount, 1);
    assertDeepEqual(scheduler.cancelled, [1]);
});
