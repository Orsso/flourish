import {anchoredPlacement, followIcon} from '../flourish@orsso.github.io/lib/runtime/iconFollower.js';
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

test('the follower observes translation and scale without reallocation', () => {
    const {box, target, clone, scheduler} = setup();
    target.x = 712;
    target.width = 60;
    box.emit('notify::translation-x');
    box.emit('notify::scale-x');
    assertEqual(scheduler.pending.size, 1);
    scheduler.flush();
    assertDeepEqual(clone.moves, [[712, 1016]]);
    assertDeepEqual(clone.sizes, [[60, 48]]);
});

test('detached placement keeps its anchor while source size retreats', () => {
    let attached = true;
    const place = anchoredPlacement(() => attached, [0.5, 1]);
    const start = {x: 592, y: 669, width: 96, height: 96};
    assertDeepEqual(place(start), start);
    attached = false;
    assertDeepEqual(place({x: 900, y: 1200, width: 80, height: 80}),
        {x: 600, y: 685, width: 80, height: 80});
    assertDeepEqual(place({x: 608, y: 706, width: 64, height: 64}),
        {x: 608, y: 701, width: 64, height: 64});
    attached = true;
    const next = {x: 300, y: 600, width: 70, height: 70};
    assertDeepEqual(place(next), next);
});

test('detached placement handles a launch that starts hidden and a central pivot', () => {
    const place = anchoredPlacement(() => false, [0.5, 0.5]);
    place({x: 100, y: 100, width: 96, height: 96});
    assertDeepEqual(place({x: 700, y: 800, width: 64, height: 64}),
        {x: 116, y: 116, width: 64, height: 64});
});
