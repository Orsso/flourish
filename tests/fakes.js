// Signal fake with the shell's connectObject/disconnectObject contract.
export class FakeEmitter {
    constructor() {
        this.nextId = 1;
        this.handlers = new Map();
    }

    connect(signal, callback) {
        return this.#add(signal, callback, null);
    }

    connect_after(signal, callback) {
        return this.connect(signal, callback);
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
