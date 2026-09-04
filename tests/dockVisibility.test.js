import {DockState} from '../flourish@orsso.github.io/lib/motion/catalog.js';
import {DockVisibility} from '../flourish@orsso.github.io/lib/runtime/dockVisibility.js';
import {FakeEmitter, makeScheduler} from './fakes.js';

class FakeSlidActor extends FakeEmitter {
    constructor(y) {
        super();
        this.parent = null;
        this.x = 600;
        this.y = y;
        this.width = 720;
        this.height = 80;
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

    moveTo(y) {
        this.y = y;
        this.emit('notify::allocation');
    }
}

// Stands for the containers between the slid actor and the dock.
class FakeAncestor extends FakeEmitter {
    constructor(parent = null) {
        super();
        this.parent = parent;
    }

    get_parent() {
        return this.parent;
    }
}

const MONITOR = {x: 0, y: 0, width: 1920, height: 1080};

function makeVisibility(y) {
    const actor = new FakeSlidActor(y);
    const scheduler = makeScheduler();
    const visibility = new DockVisibility({
        actor,
        root: actor,
        edge: 'bottom',
        getMonitor: () => MONITOR,
        scheduler,
    });
    return {actor, scheduler, visibility};
}

test('the observer reads its state on creation', () => {
    const {visibility} = makeVisibility(1000);
    assertEqual(visibility.state, DockState.SHOWN);
    assertDeepEqual(visibility.shownRect, {x: 600, y: 1000, width: 720, height: 80});
});

test('allocation changes are coalesced through the scheduler', () => {
    const {actor, scheduler, visibility} = makeVisibility(1000);
    const seen = [];
    visibility.subscribe(state => seen.push(state));
    actor.moveTo(1040);
    actor.moveTo(1080);
    assertEqual(visibility.state, DockState.SHOWN);
    assertEqual(scheduler.pending.size, 1);
    scheduler.flush();
    assertDeepEqual(seen, [DockState.HIDDEN]);
    assertEqual(visibility.state, DockState.HIDDEN);
});

test('measure reads the actor ahead of the frame sync', () => {
    const {actor, scheduler, visibility} = makeVisibility(1000);
    actor.moveTo(1040);
    assertEqual(visibility.rect.y, 1000);
    assertEqual(visibility.measure().y, 1040);
    scheduler.flush();
    assertEqual(visibility.rect.y, 1040);
});

test('the shown rect survives a hide and refreshes on the next show', () => {
    const {actor, scheduler, visibility} = makeVisibility(1000);
    actor.moveTo(1080);
    scheduler.flush();
    assertDeepEqual(visibility.shownRect, {x: 600, y: 1000, width: 720, height: 80});
    assertDeepEqual(visibility.rect, {x: 600, y: 1080, width: 720, height: 80});
    actor.height = 96;
    actor.moveTo(984);
    scheduler.flush();
    assertDeepEqual(visibility.shownRect, {x: 600, y: 984, width: 720, height: 96});
});

test('a dock born hidden has no shown rect yet', () => {
    const {visibility} = makeVisibility(1080);
    assertEqual(visibility.state, DockState.HIDDEN);
    assertEqual(visibility.shownRect, null);
});

test('unsubscribe and dispose stop the notifications', () => {
    const {actor, scheduler, visibility} = makeVisibility(1000);
    const seen = [];
    const unsubscribe = visibility.subscribe(state => seen.push(state));
    unsubscribe();
    actor.moveTo(1080);
    scheduler.flush();
    assertDeepEqual(seen, []);
    visibility.dispose();
    actor.moveTo(1000);
    assertEqual(scheduler.pending.size, 0);
    assertEqual(actor.handlers.size, 0);
});

test('a pending sync is dropped on dispose', () => {
    const {actor, scheduler, visibility} = makeVisibility(1000);
    actor.moveTo(1080);
    assertEqual(scheduler.pending.size, 1);
    visibility.dispose();
    assertEqual(scheduler.pending.size, 0);
    assertEqual(scheduler.cancelled.length, 1);
    scheduler.flush();
    assertEqual(visibility.state, null);
});

test('a missing monitor leaves the state untouched', () => {
    const actor = new FakeSlidActor(1000);
    const scheduler = makeScheduler();
    const visibility = new DockVisibility({
        actor,
        root: actor,
        edge: 'bottom',
        getMonitor: () => null,
        scheduler,
    });
    assertEqual(visibility.state, null);
    assertEqual(visibility.rect, null);
    assertEqual(visibility.shownRect, null);
    const seen = [];
    visibility.subscribe(state => seen.push(state));
    actor.moveTo(1080);
    scheduler.flush();
    assertDeepEqual(seen, []);
    assertEqual(visibility.state, null);
});

test('destroying the actor disposes the observer', () => {
    const {actor, scheduler} = makeVisibility(1000);
    actor.destroy();
    assertEqual(actor.handlers.size, 0);
    assertEqual(scheduler.pending.size, 0);
});

function makeChain(y) {
    const dock = new FakeAncestor();
    const middle = new FakeAncestor(dock);
    const actor = new FakeSlidActor(y);
    actor.parent = middle;
    const scheduler = makeScheduler();
    const visibility = new DockVisibility({
        actor,
        root: dock,
        edge: 'bottom',
        getMonitor: () => MONITOR,
        scheduler,
    });
    return {actor, dock, middle, scheduler, visibility};
}

test('the dock translating moves a slid actor that never reallocates', () => {
    const {actor, dock, scheduler, visibility} = makeChain(1000);
    const seen = [];
    visibility.subscribe(state => seen.push(state));
    actor.y = 1080;
    dock.emit('notify::translation-y');
    scheduler.flush();
    assertEqual(visibility.state, DockState.HIDDEN);
    assertDeepEqual(seen, [DockState.HIDDEN]);
});

test('dispose releases every actor in the chain', () => {
    const {actor, dock, middle, visibility} = makeChain(1000);
    visibility.dispose();
    assertEqual(actor.handlers.size, 0);
    assertEqual(middle.handlers.size, 0);
    assertEqual(dock.handlers.size, 0);
    assertEqual(visibility.state, null);
});
