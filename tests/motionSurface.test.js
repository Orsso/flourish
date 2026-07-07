import {MotionSurface} from '../flourish@orsso.github.io/lib/runtime/motionSurface.js';

class FakeActor {
    constructor() {
        this.nextId = 1;
        this.handlers = new Map();
        this.parent = null;
        this.children = [];
    }

    connect(signal, callback) {
        const id = this.nextId++;
        this.handlers.set(id, {signal, callback});
        return id;
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

    destroy() {
        this.emit('destroy');
        this.handlers.clear();
    }

    get_parent() {
        return this.parent;
    }

    get_children() {
        return this.children;
    }

    add_child(child) {
        child.parent = this;
        this.children.push(child);
        this.emit('child-added', child);
    }
}

class FakeController {
    constructor(options) {
        this.options = options;
        this.recipes = [];
        this.neighbor = Infinity;
        this.affects = true;
        this.applies = 0;
        this.refreshCount = 0;
        this.disposeCount = 0;
    }

    setRecipe(recipe) {
        this.recipes.push(recipe);
    }

    setNeighborDistance(distance) {
        const changed = this.neighbor !== distance;
        this.neighbor = distance;
        return changed && this.affects;
    }

    applyHoverState() {
        this.applies++;
    }

    refreshStyle() {
        this.refreshCount++;
    }

    dispose() {
        this.disposeCount++;
        this.options.onDestroyed(this);
    }

    onTargetDestroyed() {
        this.options.onDestroyed(this);
    }
}

function makeIcon() {
    const icon = new FakeActor();
    icon.icon = {_iconBin: {}};
    return icon;
}

function makeContainer(icon) {
    const container = new FakeActor();
    container.child = icon;
    return container;
}

function makeBox(iconCount) {
    const box = new FakeActor();
    const icons = [];
    for (let index = 0; index < iconCount; index++) {
        const icon = makeIcon();
        const container = makeContainer(icon);
        container.parent = box;
        box.children.push(container);
        icons.push(icon);
    }
    return {box, icons};
}

function makeScheduler() {
    return {
        nextId: 1,
        pending: new Map(),
        cancelled: [],
        schedule(callback) {
            const id = this.nextId++;
            this.pending.set(id, callback);
            return id;
        },
        cancel(id) {
            this.cancelled.push(id);
            this.pending.delete(id);
        },
        flush() {
            const callbacks = [...this.pending.values()];
            this.pending.clear();
            for (const callback of callbacks)
                callback();
        },
    };
}

function makeSurface({onMeasured, controllerFactory} = {}) {
    const controllers = [];
    const scheduler = makeScheduler();
    const surface = new MotionSurface({
        controllerFactory: options => {
            const controller = controllerFactory
                ? controllerFactory(options)
                : new FakeController(options);
            controllers.push(controller);
            return controller;
        },
        recipe: 'recipe-1',
        onMeasured,
        scheduler,
    });
    return {surface, controllers, scheduler};
}

test('addBox registers a controller per icon container', () => {
    const {surface, controllers} = makeSurface();
    const {box} = makeBox(3);
    assertEqual(surface.addBox(box, 'bottom'), true);
    assertEqual(controllers.length, 3);
    assertEqual(controllers[0].options.position, 'bottom');
    assertEqual(controllers[0].options.recipe, 'recipe-1');
});

test('containers without an icon bin are skipped', () => {
    const {surface, controllers} = makeSurface();
    const {box} = makeBox(1);
    const separator = new FakeActor();
    separator.parent = box;
    box.children.push(separator);
    surface.addBox(box, 'bottom');
    assertEqual(controllers.length, 1);
});

test('child-added registers late containers', () => {
    const {surface, controllers} = makeSurface();
    const {box} = makeBox(1);
    surface.addBox(box, 'bottom');
    box.add_child(makeContainer(makeIcon()));
    assertEqual(controllers.length, 2);
});

test('addBox refuses the same box twice', () => {
    const {surface, controllers} = makeSurface();
    const {box} = makeBox(2);
    assertEqual(surface.addBox(box, 'bottom'), true);
    assertEqual(surface.addBox(box, 'bottom'), false);
    assertEqual(controllers.length, 2);
});

test('getController maps the icon actor to its controller', () => {
    const {surface, controllers} = makeSurface();
    const {box, icons} = makeBox(2);
    surface.addBox(box, 'bottom');
    assertEqual(surface.getController(icons[1]), controllers[1]);
    assertEqual(surface.getController(new FakeActor()), null);
});

test('setRecipe reaches every controller', () => {
    const {surface, controllers} = makeSurface();
    const {box} = makeBox(2);
    surface.addBox(box, 'bottom');
    surface.setRecipe('recipe-2');
    assertDeepEqual(controllers.map(c => c.recipes), [['recipe-2'], ['recipe-2']]);
});

test('refreshStyles touches every controller', () => {
    const {surface, controllers} = makeSurface();
    const {box} = makeBox(2);
    surface.addBox(box, 'bottom');
    surface.refreshStyles();
    assertDeepEqual(controllers.map(c => c.refreshCount), [1, 1]);
});

test('hovering an icon sends each controller its distance', () => {
    const {surface, controllers, scheduler} = makeSurface();
    const {box} = makeBox(4);
    surface.addBox(box, 'bottom');
    controllers[1].options.onHoverChanged(controllers[1], true);
    scheduler.flush();
    assertDeepEqual(controllers.map(c => c.neighbor), [1, 0, 1, 2]);
});

test('unhover pushes every distance to infinity', () => {
    const {surface, controllers, scheduler} = makeSurface();
    const {box} = makeBox(3);
    surface.addBox(box, 'bottom');
    controllers[1].options.onHoverChanged(controllers[1], true);
    scheduler.flush();
    controllers[1].options.onHoverChanged(controllers[1], false);
    scheduler.flush();
    assertEqual(controllers.every(c => c.neighbor === Infinity), true);
});

test('distances beyond the maximum radius collapse to infinity', () => {
    const {surface, controllers, scheduler} = makeSurface();
    const {box} = makeBox(6);
    surface.addBox(box, 'bottom');
    controllers[0].options.onHoverChanged(controllers[0], true);
    scheduler.flush();
    assertEqual(controllers[3].neighbor, 3);
    assertEqual(controllers[4].neighbor, Infinity);
    assertEqual(controllers[5].neighbor, Infinity);
});

test('removing a non-hovered icon resyncs the distances', () => {
    const {surface, controllers, scheduler} = makeSurface();
    const {box, icons} = makeBox(4);
    surface.addBox(box, 'bottom');
    controllers[2].options.onHoverChanged(controllers[2], true);
    scheduler.flush();
    icons[1].destroy();
    scheduler.flush();
    assertEqual(controllers[0].neighbor, 1);
});

test('a destroyed icon leaves the neighbor group', () => {
    const {surface, controllers, scheduler} = makeSurface();
    const {box, icons} = makeBox(3);
    surface.addBox(box, 'bottom');
    icons[1].destroy();
    controllers[0].options.onHoverChanged(controllers[0], true);
    scheduler.flush();
    assertEqual(controllers[2].neighbor, 1);
});

test('dispose disposes controllers and stops watching the box', () => {
    const {surface, controllers} = makeSurface();
    const {box} = makeBox(2);
    surface.addBox(box, 'bottom');
    surface.dispose();
    assertDeepEqual(controllers.map(c => c.disposeCount), [1, 1]);
    box.add_child(makeContainer(makeIcon()));
    assertEqual(controllers.length, 2);
    assertEqual(box.handlers.size, 0);
});

test('hover updates wait for the scheduled frame flush', () => {
    const {surface, controllers, scheduler} = makeSurface();
    const {box} = makeBox(4);
    surface.addBox(box, 'bottom');
    scheduler.flush();
    controllers[1].options.onHoverChanged(controllers[1], true);
    assertDeepEqual(controllers.map(c => c.neighbor),
        [Infinity, Infinity, Infinity, Infinity]);
    scheduler.flush();
    assertDeepEqual(controllers.map(c => c.neighbor), [1, 0, 1, 2]);
});

test('the flush applies the flipped controller and affected neighbors only', () => {
    const {surface, controllers, scheduler} = makeSurface();
    const {box} = makeBox(5);
    surface.addBox(box, 'bottom');
    scheduler.flush();

    // Distance changes cannot affect this recipe: only the flip applies.
    for (const controller of controllers)
        controller.affects = false;
    controllers[1].options.onHoverChanged(controllers[1], true);
    scheduler.flush();
    assertDeepEqual(controllers.map(c => c.applies), [0, 1, 0, 0, 0]);

    // Distance changes matter again: shifted neighbors apply too.
    for (const controller of controllers)
        controller.affects = true;
    controllers[1].options.onHoverChanged(controllers[1], false);
    controllers[2].options.onHoverChanged(controllers[2], true);
    scheduler.flush();
    assertDeepEqual(controllers.map(c => c.applies), [1, 2, 1, 1, 1]);
});

test('a flip made during a flush is applied by the next flush', () => {
    const {surface, controllers, scheduler} = makeSurface();
    const {box} = makeBox(3);
    surface.addBox(box, 'bottom');
    scheduler.flush();
    for (const controller of controllers)
        controller.affects = false;

    // The first apply reacts by unhovering, like a pointer exit mid-flush.
    let reacted = false;
    controllers[0].applyHoverState = function () {
        this.applies++;
        if (!reacted) {
            reacted = true;
            this.options.onHoverChanged(this, false);
        }
    };
    controllers[0].options.onHoverChanged(controllers[0], true);
    scheduler.flush();
    assertEqual(scheduler.pending.size, 1);
    scheduler.flush();
    assertEqual(controllers[0].applies, 2);
});

test('a burst of hover flips coalesces into one flush', () => {
    const {surface, controllers, scheduler} = makeSurface();
    const {box} = makeBox(4);
    surface.addBox(box, 'bottom');
    scheduler.flush();
    controllers[0].options.onHoverChanged(controllers[0], true);
    controllers[0].options.onHoverChanged(controllers[0], false);
    controllers[1].options.onHoverChanged(controllers[1], true);
    assertEqual(scheduler.pending.size, 1);
    scheduler.flush();
    assertDeepEqual(controllers.map(c => c.neighbor), [1, 0, 1, 2]);
    assertDeepEqual(controllers.map(c => c.applies), [1, 1, 1, 1]);
});

test('dispose cancels the pending flush', () => {
    const {surface, controllers, scheduler} = makeSurface();
    const {box} = makeBox(2);
    surface.addBox(box, 'bottom');
    scheduler.flush();
    controllers[0].options.onHoverChanged(controllers[0], true);
    surface.dispose();
    assertEqual(scheduler.pending.size, 0);
    assertEqual(scheduler.cancelled.length, 1);
});

test('box destruction cancels the pending flush', () => {
    const {surface, controllers, scheduler} = makeSurface();
    const {box} = makeBox(2);
    surface.addBox(box, 'bottom');
    scheduler.flush();
    controllers[0].options.onHoverChanged(controllers[0], true);
    box.destroy();
    assertEqual(scheduler.pending.size, 0);
});

test('a removed controller is not applied by the pending flush', () => {
    const {surface, controllers, scheduler} = makeSurface();
    const {box, icons} = makeBox(3);
    surface.addBox(box, 'bottom');
    scheduler.flush();
    controllers[1].options.onHoverChanged(controllers[1], true);
    icons[1].destroy();
    scheduler.flush();
    assertEqual(controllers[1].applies, 0);
});

test('a controller born hovered resolves at the next flush', () => {
    // The real controller reports a pre-existing hover during construction.
    let bornHovered = null;
    const {surface, controllers, scheduler} = makeSurface({
        controllerFactory: options => {
            const controller = new FakeController(options);
            if (!bornHovered) {
                bornHovered = controller;
                options.onHoverChanged(controller, true);
            }
            return controller;
        },
    });
    const {box} = makeBox(3);
    surface.addBox(box, 'bottom');
    scheduler.flush();
    assertDeepEqual(controllers.map(c => c.neighbor), [0, 1, 2]);
    assertEqual(controllers[0].applies, 1);
});

test('onMeasured flows through the controller options', () => {
    const measured = [];
    const {surface, controllers} = makeSurface(
        {onMeasured: measurement => measured.push(measurement)});
    const {box} = makeBox(1);
    surface.addBox(box, 'bottom');
    controllers[0].options.onMeasured('measurement');
    assertDeepEqual(measured, ['measurement']);
});
