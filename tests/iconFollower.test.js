import {followIcon} from '../flourish@orsso.github.io/lib/runtime/iconFollower.js';
import {FakeEmitter, makeScheduler} from './fakes.js';

class FakeActor extends FakeEmitter {
    constructor(parent = null) {
        super();
        this.parent = parent;
        this.x = 700;
        this.y = 1016;
        this.width = 48;
        this.height = 48;
    }

    get_parent() {
        return this.parent;
    }

    get_transformed_position() {
        return [this.x, this.y];
    }

    get_transformed_size() {
        return [this.width, this.height];
    }
}

class FakeClone {
    constructor() {
        this.moves = [];
        this.sizes = [];
    }

    set_position(x, y) {
        this.moves.push([x, y]);
    }

    set_size(width, height) {
        this.sizes.push([width, height]);
    }
}

function setup(place) {
    const root = new FakeActor();
    const box = new FakeActor(root);
    const target = new FakeActor(box);
    const clone = new FakeClone();
    const scheduler = makeScheduler();
    const dispose = followIcon({target, clone, scheduler, place});
    return {root, box, target, clone, scheduler, dispose};
}

test('the clone moves to the icon once per frame after any ancestor reallocates', () => {
    const {root, box, target, clone, scheduler} = setup();
    target.x = 652;
    box.emit('notify::allocation');
    root.emit('notify::allocation');
    assertEqual(scheduler.pending.size, 1);
    assertEqual(clone.moves.length, 0);
    scheduler.flush();
    assertDeepEqual(clone.moves, [[652, 1016]]);
    assertDeepEqual(clone.sizes, [[48, 48]]);
});

test('the placement maps the icon before the clone moves', () => {
    const {target, clone, scheduler} = setup(rect => ({...rect, y: rect.y - 80}));
    target.emit('notify::allocation');
    scheduler.flush();
    assertDeepEqual(clone.moves, [[700, 936]]);
});

test('disposing drops the pending frame and the watchers', () => {
    const {box, clone, scheduler, dispose} = setup();
    box.emit('notify::allocation');
    dispose();
    assertEqual(scheduler.pending.size, 0);
    assertEqual(scheduler.cancelled.length, 1);
    box.emit('notify::allocation');
    scheduler.flush();
    assertEqual(clone.moves.length, 0);
});

test('a destroyed icon stops the follower', () => {
    const {root, target, clone, scheduler} = setup();
    target.emit('destroy');
    root.emit('notify::allocation');
    scheduler.flush();
    assertEqual(clone.moves.length, 0);
});
