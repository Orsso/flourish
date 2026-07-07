import {getBuiltInRecipe} from '../flourish@orsso.github.io/lib/motion/catalog.js';
import {IconMotionController} from '../flourish@orsso.github.io/lib/runtime/iconMotionController.js';

class FakeIcon {
    constructor() {
        this.nextId = 1;
        this.handlers = new Map();
        this.hover = false;
        this.urgent = false;
        this.pressed = false;
    }

    connect(signal, callback) {
        const id = this.nextId++;
        this.handlers.set(id, {signal, callback});
        return id;
    }

    connect_after(signal, callback) {
        return this.connect(signal, callback);
    }

    disconnect(id) {
        this.handlers.delete(id);
    }

    emit(signal, ...args) {
        for (const handler of [...this.handlers.values()]) {
            if (handler.signal === signal)
                handler.callback(this, ...args);
        }
    }
}

class FakeBin {
    constructor() {
        this.scale_x = 1;
        this.scale_y = 1;
        this.translation_x = 0;
        this.translation_y = 0;
        this.opacity = 255;
        this.offscreen_redirect = 0;
        this.eases = 0;
        this.parentProbes = 0;
        this.removedTransitions = 0;
    }

    get_pivot_point() {
        return [0, 0];
    }

    set_pivot_point() {}

    set_scale(x, y) {
        this.scale_x = x;
        this.scale_y = y;
    }

    get_parent() {
        this.parentProbes++;
        return null;
    }

    remove_transition() {
        this.removedTransitions++;
    }

    ease(props) {
        this.eases++;
        this.lastEase = props;
    }
}

// A bin with a clipped grandparent, enough for #measureBudget to succeed.
class MeasurableBin extends FakeBin {
    constructor() {
        super();
        this.measures = 0;
        this._clip = {
            has_clip: true,
            get_clip: () => [0, 0, 1000, 200],
            get_transformed_position: () => [0, 800],
            get_parent: () => null,
        };
        this._parent = {
            has_clip: false,
            get_transformed_position: () => [0, 900],
            get_parent: () => this._clip,
        };
    }

    get_parent() {
        return this._parent;
    }

    get_allocation_box() {
        this.measures++;
        return {x1: 10, y1: 20, x2: 58, y2: 68};
    }
}

function makeMeasuredController(profile = 'expressive') {
    const measured = [];
    const icon = new FakeIcon();
    const bin = new MeasurableBin();
    const controller = new IconMotionController({
        icon,
        bin,
        position: 'bottom',
        recipe: getBuiltInRecipe(profile),
        onMeasured: measurement => measured.push(measurement),
    });
    return {controller, icon, bin, measured};
}

function makeController(profile = 'expressive') {
    const hoverEvents = [];
    const icon = new FakeIcon();
    const bin = new FakeBin();
    const controller = new IconMotionController({
        icon,
        bin,
        position: 'bottom',
        recipe: getBuiltInRecipe(profile),
        onHoverChanged: (_controller, hovered) => hoverEvents.push(hovered),
    });
    return {controller, icon, bin, hoverEvents};
}

function hoverIcon(icon, hovered) {
    icon.hover = hovered;
    icon.emit('notify::hover');
}

test('hover changes notify the neighbor group', () => {
    const {icon, hoverEvents} = makeController();
    hoverIcon(icon, true);
    hoverIcon(icon, false);
    assertDeepEqual(hoverEvents, [true, false]);
});

test('beginLaunch leaves the neighbor group hover in place', () => {
    const {controller, icon, hoverEvents} = makeController();
    hoverIcon(icon, true);
    controller.beginLaunch(true);
    assertDeepEqual(hoverEvents, [true]);
});

test('hover changes mid-launch still reach the neighbor group', () => {
    const {controller, icon, hoverEvents} = makeController();
    hoverIcon(icon, true);
    controller.beginLaunch(true);
    hoverIcon(icon, false);
    hoverIcon(icon, true);
    assertDeepEqual(hoverEvents, [true, false, true]);
});

test('press dim settles back even with two controllers on the same bin', () => {
    const icon = new FakeIcon();
    const bin = new FakeBin();
    const recipe = getBuiltInRecipe('subtle');
    const controllers = [
        new IconMotionController({icon, bin, position: 'bottom', recipe}),
        new IconMotionController({icon, bin, position: 'bottom', recipe}),
    ];
    for (let click = 0; click < 3; click++) {
        icon.emit('button-press-event', {get_button: () => 1});
        icon.pressed = true;
        icon.emit('notify::pressed');
        icon.pressed = false;
        icon.emit('notify::pressed');
        icon.emit('clicked');
    }
    assertEqual(bin.opacity, 255);
    assertEqual(controllers.length, 2);
});

test('a hover flip alone does not ease until applyHoverState', () => {
    const {controller, icon, bin} = makeController('expressive');
    hoverIcon(icon, true);
    assertEqual(bin.eases, 0);
    controller.applyHoverState();
    assertEqual(bin.eases, 1);
});

test('hover with an unchanged transform does not ease', () => {
    const {icon, bin} = makeController('subtle');
    hoverIcon(icon, true);
    hoverIcon(icon, false);
    hoverIcon(icon, true);
    assertEqual(bin.eases, 0);
});

test('press dim lands without easing an unchanged transform', () => {
    const {icon, bin} = makeController('subtle');
    icon.emit('button-press-event', {get_button: () => 1});
    assertEqual(bin.opacity, 228);
    assertEqual(bin.eases, 0);
});

test('setRecipe reapplies even when the transform is unchanged', () => {
    const {controller, bin} = makeController('subtle');
    controller.setRecipe(getBuiltInRecipe('subtle'));
    assertEqual(bin.eases, 1);
});

test('beginLaunch snaps instantly even when the transform is unchanged', () => {
    const {controller, icon, bin} = makeController('subtle');
    hoverIcon(icon, true);
    controller.beginLaunch(true);
    assertEqual(bin.removedTransitions, 4);
});

test('neighbor updates without a neighbor effect skip the transform work', () => {
    const {controller, bin} = makeController('balanced');
    controller.setNeighborDistance(1);
    controller.setNeighborDistance(Infinity);
    assertEqual(bin.parentProbes, 0);
    assertEqual(bin.eases, 0);
});

test('setNeighborDistance reports a change without applying it', () => {
    const {controller, bin} = makeController('expressive');
    assertEqual(controller.setNeighborDistance(1), true);
    assertEqual(bin.eases, 0);
    assertEqual(controller.setNeighborDistance(1), false);
});

test('distance changes with an unchanged visible scale stay quiet', () => {
    // Distance three is already identity for Expressive's radius of two.
    const {controller} = makeController('expressive');
    assertEqual(controller.setNeighborDistance(3), false);
    assertEqual(controller.setNeighborDistance(2), true);
    assertEqual(controller.setNeighborDistance(3), true);
    assertEqual(controller.setNeighborDistance(3), false);
    assertEqual(controller.setNeighborDistance(Infinity), false);
});

test('distance changes cannot affect a hovered or launching icon', () => {
    const {controller, icon} = makeController('expressive');
    hoverIcon(icon, true);
    assertEqual(controller.setNeighborDistance(1), false);
    hoverIcon(icon, false);
    controller.beginLaunch(true);
    assertEqual(controller.setNeighborDistance(2), false);
    controller.endLaunch();
    assertEqual(controller.setNeighborDistance(3), true);
});

test('applyHoverState is inert during a launch', () => {
    const {controller, icon, bin} = makeController('expressive');
    hoverIcon(icon, true);
    controller.beginLaunch(true);
    const probes = bin.parentProbes;
    const eases = bin.eases;
    hoverIcon(icon, false);
    controller.applyHoverState();
    assertEqual(bin.parentProbes, probes);
    assertEqual(bin.eases, eases);
});

test('the hover budget is published once by the next apply', () => {
    const {controller, icon, bin, measured} = makeMeasuredController();
    hoverIcon(icon, true);
    assertEqual(measured.length, 0);
    assertEqual(bin.measures, 0);
    controller.applyHoverState();
    assertEqual(measured.length, 1);
    assertEqual(bin.measures, 1);
    assertEqual(measured[0].budgetPx, 120);
    controller.applyHoverState();
    assertEqual(measured.length, 1);
});

test('a hover that leaves before the apply publishes nothing', () => {
    const {controller, icon, measured} = makeMeasuredController();
    hoverIcon(icon, true);
    hoverIcon(icon, false);
    controller.applyHoverState();
    assertEqual(measured.length, 0);
});

test('a press stays immediate while a hover flush is pending', () => {
    const {icon, bin} = makeController('subtle');
    hoverIcon(icon, true);
    icon.emit('button-press-event', {get_button: () => 1});
    assertEqual(bin.opacity, 228);
});

test('beginLaunch snaps immediately while a hover flush is pending', () => {
    const {controller, icon, bin} = makeController('expressive');
    hoverIcon(icon, true);
    const result = controller.beginLaunch(true);
    assertEqual(result.active, true);
    assertEqual(bin.removedTransitions, 4);
});

test('setRecipe with a pending hover flush lands on the final state', () => {
    const {controller, icon, bin} = makeController('expressive');
    hoverIcon(icon, true);
    controller.setRecipe(getBuiltInRecipe('expressive'));
    assertEqual(bin.eases, 1);
    assertClose(bin.lastEase.scale_x, 1.22);
    // The late flush recomputes the same target and keeps the transition.
    controller.applyHoverState();
    assertEqual(bin.eases, 1);
});

test('applies toward identity skip the geometry measure', () => {
    const {controller, icon, bin} = makeMeasuredController('expressive');
    hoverIcon(icon, true);
    controller.applyHoverState();
    const measures = bin.measures;
    hoverIcon(icon, false);
    controller.applyHoverState();
    assertEqual(bin.measures, measures);
});

test('a press without hover reach skips the geometry measure', () => {
    const {icon, bin} = makeMeasuredController('subtle');
    icon.emit('button-press-event', {get_button: () => 1});
    assertEqual(bin.measures, 0);
    assertEqual(bin.opacity, 228);
});

test('a subtle hover still measures once to publish the budget', () => {
    const {controller, icon, bin, measured} = makeMeasuredController('subtle');
    hoverIcon(icon, true);
    controller.applyHoverState();
    assertEqual(measured.length, 1);
    assertEqual(bin.measures, 1);
});

test('endLaunch does not replay the hover notification', () => {
    const {controller, icon, hoverEvents} = makeController();
    hoverIcon(icon, true);
    controller.beginLaunch(true);
    controller.endLaunch();
    assertDeepEqual(hoverEvents, [true]);
});
