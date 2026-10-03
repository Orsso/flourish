import {getBuiltInRecipe} from '../flourish@orsso.github.io/lib/motion/catalog.js';

// Fixed reference gestures keep geometry tests independent of preset tuning.
export function motionRecipe(preset = 'expressive') {
    const recipe = getBuiltInRecipe(preset);
    Object.assign(recipe.hover, preset === 'expressive'
        ? {scale: 1.22, lift: 5, duration: 280, easing: 'ease-out-back', reach: 2}
        : {enabled: preset !== 'subtle', scale: 1.10, lift: 0, duration: 190, reach: 1});
    Object.assign(recipe.press, {intensity: 0.85, duration: 170, effect: preset === 'subtle' ? 'dim' : 'squash'});
    return recipe;
}

// Signal fake with the shell's connectObject/disconnectObject contract.
export class FakeEmitter {
    constructor() {
        this.nextId = 1;
        this.handlers = new Map();
    }

    connect(signal, callback) {
        return this.#add(signal, callback, null);
    }

    disconnect(id) {
        this.handlers.delete(id);
    }

    connectObject(...args) {
        const owner = args.pop();
        while (args.length > 0) {
            const [signal, callback] = args.splice(0, 2);
            if (typeof args[0] === 'number')
                args.shift();
            this.#add(signal, callback, owner);
        }
    }

    disconnectObject(owner) {
        for (const [id, handler] of [...this.handlers]) {
            if (handler.owner === owner)
                this.handlers.delete(id);
        }
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

    #add(signal, callback, owner) {
        const id = this.nextId++;
        this.handlers.set(id, {signal, callback, owner});
        return id;
    }
}

export class FakeIconBin {
    constructor() {
        this.child = null;
        this.width = -1;
        this.height = -1;
    }

    set_size(width, height) {
        this.width = width;
        this.height = height;
    }
}

// Mirrors the BaseIcon parts the runtime touches.
export class FakeBaseIcon {
    constructor(bin = new FakeIconBin(), size = 48) {
        this.iconSize = size;
        this.icon = null;
        this._iconBin = bin;
        this.created = [];
        this._createIconTexture(size);
    }

    createIcon(size) {
        const icon = {size, width: -1, height: -1, destroyed: false,
            set_size(width, height) {
                this.width = width;
                this.height = height;
            },
            destroy() {
                this.destroyed = true;
            }};
        this.created.push(icon);
        return icon;
    }
}

FakeBaseIcon.prototype._createIconTexture = function (size) {
    if (this.icon)
        this.icon.destroy();
    this.iconSize = size;
    this.icon = this.createIcon(size);
    this._iconBin.child = this.icon;
};

// Bin fake: eases settle immediately, one entry per ease() call.
export class FakeBin {
    constructor() {
        this.scale_x = 1;
        this.scale_y = 1;
        this.translation_x = 0;
        this.translation_y = 0;
        this.opacity = 255;
        this.reactive = false;
        this.offscreen_redirect = 0;
        this.easeTargets = [];
        this.onEase = null;
        this.lastEase = null;
        this.parentProbes = 0;
        this.removedTransitions = 0;
        // In-flight eases by property name; tests advance `elapsed`.
        this.transitions = {};
    }

    get eases() {
        return this.easeTargets.length;
    }

    get_pivot_point() {
        return [0, 0];
    }

    set_pivot_point() {}

    set_size() {}

    get_transformed_position() {
        return [0, 0];
    }

    get_transformed_size() {
        return [0, 0];
    }

    set_scale(x, y) {
        this.scale_x = x;
        this.scale_y = y;
    }

    get_parent() {
        this.parentProbes++;
        return null;
    }

    remove_transition(name) {
        this.removedTransitions++;
        delete this.transitions[name];
    }

    get_transition(name) {
        return this.transitions[name] ?? null;
    }

    add_style_class_name() {}

    remove_style_class_name() {}

    ensure_style() {}

    queue_relayout() {}

    queue_redraw() {}

    ease(props) {
        this.lastEase = props;
        this.easeTargets.push(props.scale_x ?? this.scale_x);
        for (const key of ['scale_x', 'scale_y', 'translation_x', 'translation_y']) {
            if (props[key] === undefined)
                continue;
            this[key] = props[key];
            this.transitions[key.replace('_', '-')] = {
                duration: props.duration,
                elapsed: 0,
                get_elapsed_time() {
                    return this.elapsed;
                },
            };
        }
        this.onEase?.();
    }
}

export class FakeIcon extends FakeEmitter {
    constructor(bin = new FakeBin()) {
        super();
        this.hover = false;
        this.urgent = false;
        this.pressed = false;
        this.icon = new FakeBaseIcon(bin);
        this.styleCalls = [];
        this.effects = [];
    }

    get_effect(name) {
        return this.effects.find(effect => effect.name === name) ?? null;
    }

    add_effect(effect) {
        this.effects.push(effect);
    }

    remove_effect(effect) {
        this.effects.splice(this.effects.indexOf(effect), 1);
    }

    setHover(hovered) {
        this.hover = hovered;
        this.emit('notify::hover');
    }

    add_style_class_name(name) {
        this.styleCalls.push(['add', name]);
    }

    remove_style_class_name(name) {
        this.styleCalls.push(['remove', name]);
    }

    ensure_style() {
        this.styleCalls.push(['ensure']);
    }

    queue_relayout() {
        this.styleCalls.push(['relayout']);
    }

    queue_redraw() {
        this.styleCalls.push(['redraw']);
    }
}

export class FakeContainer extends FakeEmitter {
    constructor(child = new FakeIcon()) {
        super();
        this.child = child;
        this.parent = null;
    }

    get_parent() {
        return this.parent;
    }
}

export class FakeBox extends FakeEmitter {
    constructor(iconCount = 0) {
        super();
        this.children = [];
        for (let index = 0; index < iconCount; index++)
            this.append(new FakeContainer());
    }

    append(container) {
        container.parent = this;
        this.children.push(container);
    }

    get_children() {
        return this.children;
    }

    add_child(container) {
        this.append(container);
        this.emit('child-added', container);
    }

    get icons() {
        return this.children.map(container => container.child);
    }
}

// A bin with a clipped grandparent, enough for measure() to succeed: the
// clip is 1000x200 at (0, 800), the parent at (parentX, parentY), the icon
// 48 px at (10, 20) in its parent.
export class MeasurableBin extends FakeBin {
    constructor({parentX = 0, parentY = 900} = {}) {
        super();
        this.measures = 0;
        this._clip = {
            width: 1000, height: 200,
            get_transformed_size: () => [1000, 200],
            has_clip: true,
            get_clip: () => [0, 0, 1000, 200],
            get_transformed_position: () => [0, 800],
            get_parent: () => null,
        };
        this._parent = {
            width: 48, height: 48,
            get_transformed_size: () => [48, 48],
            has_clip: false,
            get_transformed_position: () => [parentX, parentY],
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

// A dash row: 50px pitch, 42px icons, allocation boxes parent-relative
// like the real containers. `makeBin` builds each icon's bin.
export class FakeRowContainer extends FakeEmitter {
    constructor(index, horizontal, bin) {
        super();
        this.translation_x = 0;
        this.translation_y = 0;
        this.child = new FakeIcon(bin);
        this.index = index;
        this.horizontal = horizontal;
        this.parent = null;
        this.reads = 0;
    }

    get_parent() {
        return this.parent;
    }

    get_allocation_box() {
        this.reads++;
        return this.horizontal
            ? {x1: this.index * 50, y1: 4, x2: (this.index + 1) * 50, y2: 46}
            : {x1: 4, y1: this.index * 50, x2: 46, y2: (this.index + 1) * 50};
    }
}

export class FakeRow extends FakeEmitter {
    constructor(count, {
        horizontal = true,
        position = [0, 0],
        makeBin = () => new MeasurableBin(),
    } = {}) {
        super();
        this.position = position;
        this.mapped = true;
        this.children = [];
        for (let index = 0; index < count; index++)
            this.append(new FakeRowContainer(index, horizontal, makeBin()));
    }

    append(container) {
        container.parent = this;
        this.children.push(container);
    }

    get_children() {
        return this.children;
    }

    add_child(container) {
        this.append(container);
        this.emit('child-added', container);
    }

    get icons() {
        return this.children.map(container => container.child);
    }

    get_transformed_position() {
        return this.position;
    }

    transform_stage_point(x, y) {
        return [true, x - this.position[0], y - this.position[1]];
    }
}

// What an integration hands MotionSurface.addBox, with neutral defaults.
export function surfaceContext(box, overrides = {}) {
    return {
        pointerActor: box,
        getSpacing: () => ({sideRoom: Infinity, actors: []}),
        isAvailable: () => true,
        containsPointer: () => true,
        background: null,
        getMonitor: () => null,
        ...overrides,
    };
}

export function makeScheduler() {
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
