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
