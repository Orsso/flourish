import {getBuiltInRecipe} from '../flourish@orsso.github.io/lib/motion/catalog.js';
import {IconMotionController} from '../flourish@orsso.github.io/lib/runtime/iconMotionController.js';
import {MotionSurface} from '../flourish@orsso.github.io/lib/runtime/motionSurface.js';

class SweepBin {
    constructor() {
        this.scale_x = 1;
        this.scale_y = 1;
        this.translation_x = 0;
        this.translation_y = 0;
        this.opacity = 255;
        this.offscreen_redirect = 0;
        this.easeTargets = [];
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
        return null;
    }

    remove_transition() {}

    // Settle immediately: each frame's animations are treated as completing.
    ease(props) {
        this.easeTargets.push(props.scale_x ?? this.scale_x);
        for (const key of ['scale_x', 'scale_y', 'translation_x', 'translation_y']) {
            if (props[key] !== undefined)
                this[key] = props[key];
        }
    }
}

class SweepActor {
    constructor() {
        this.nextId = 1;
        this.handlers = new Map();
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

class SweepIcon extends SweepActor {
    constructor() {
        super();
        this.hover = false;
        this.urgent = false;
        this.pressed = false;
        this.icon = {_iconBin: new SweepBin()};
    }
}

class SweepContainer extends SweepActor {
    constructor(box) {
        super();
        this.child = new SweepIcon();
        this.box = box;
    }

    get_parent() {
        return this.box;
    }
}

class SweepBox extends SweepActor {
    constructor(iconCount) {
        super();
        this.children = Array.from(
            {length: iconCount}, () => new SweepContainer(this));
    }

    get_children() {
        return this.children;
    }
}

function makeScheduler() {
    return {
        nextId: 1,
        pending: new Map(),
        schedule(callback) {
            const id = this.nextId++;
            this.pending.set(id, callback);
            return id;
        },
        cancel(id) {
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

function makeSweep(iconCount, profile) {
    const scheduler = makeScheduler();
    const box = new SweepBox(iconCount);
    const surface = new MotionSurface({
        controllerFactory: options => new IconMotionController(options),
        recipe: getBuiltInRecipe(profile),
        scheduler,
    });
    surface.addBox(box, 'bottom');
    scheduler.flush();
    const icons = box.get_children().map(container => container.child);
    const bins = icons.map(icon => icon.icon._iconBin);
    return {scheduler, icons, bins};
}

function setHover(icon, hovered) {
    icon.hover = hovered;
    icon.emit('notify::hover');
}

function clearTargets(bins) {
    for (const bin of bins)
        bin.easeTargets.length = 0;
}

function countEases(bins) {
    return bins.reduce((total, bin) => total + bin.easeTargets.length, 0);
}

test('a coalesced crossing eases straight to the final state', () => {
    const {scheduler, icons, bins} = makeSweep(6, 'expressive');
    setHover(icons[0], true);
    scheduler.flush();
    clearTargets(bins);

    setHover(icons[0], false);
    setHover(icons[1], true);
    scheduler.flush();

    for (const bin of bins) {
        if (bin.easeTargets.length > 1)
            throw new Error(`two waves reached one bin: ${bin.easeTargets}`);
        // The intermediate "nobody hovered" state must never be eased.
        if (bin.easeTargets.some(target => Math.abs(target - 1) < 1e-6))
            throw new Error(`identity eased mid-crossing: ${bin.easeTargets}`);
    }
    assertEqual(countEases(bins), 4);
});

test('an expressive sweep stays under the per-crossing ease bound', () => {
    const {scheduler, icons, bins} = makeSweep(6, 'expressive');
    setHover(icons[0], true);
    scheduler.flush();
    for (let index = 1; index < icons.length; index++) {
        setHover(icons[index - 1], false);
        setHover(icons[index], true);
        scheduler.flush();
    }
    // Entry wave plus five crossings; the uncoalesced double wave blows this.
    assertEqual(countEases(bins) <= 30, true);
});

test('leaving the dock returns every icon to rest', () => {
    const {scheduler, icons, bins} = makeSweep(4, 'expressive');
    setHover(icons[0], true);
    scheduler.flush();
    setHover(icons[0], false);
    setHover(icons[1], true);
    scheduler.flush();

    setHover(icons[1], false);
    scheduler.flush();
    for (const bin of bins) {
        assertClose(bin.scale_x, 1);
        assertClose(bin.scale_y, 1);
        assertClose(bin.translation_x, 0);
        assertClose(bin.translation_y, 0);
    }
});
