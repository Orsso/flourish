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
        this.offscreen_redirect = 0;
        this.easeTargets = [];
        this.onEase = null;
    }

    get_pivot_point() {
        return [0, 0];
    }

    set_pivot_point() {}

    set_size() {}

    set_scale(x, y) {
        this.scale_x = x;
        this.scale_y = y;
    }

    get_parent() {
        return null;
    }

    remove_transition() {}

    add_style_class_name() {}

    remove_style_class_name() {}

    ensure_style() {}

    queue_relayout() {}

    queue_redraw() {}

    ease(props) {
        this.easeTargets.push(props.scale_x ?? this.scale_x);
        for (const key of ['scale_x', 'scale_y', 'translation_x', 'translation_y']) {
            if (props[key] !== undefined)
                this[key] = props[key];
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
