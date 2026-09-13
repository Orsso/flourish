// St rasterizes an icon once at icon size; render at 2x so a scaled icon stays sharp.
const TEXTURE_FACTOR = 2;

export function sharpenIconTexture(baseIcon) {
    // BaseIcon routes every size change through this method.
    baseIcon._createIconTexture = function (size) {
        // A restyle can leave BaseIcon.icon pointing at a removed texture.
        this._iconBin.child?.destroy();
        this.iconSize = size;
        this.icon = this.createIcon(size * TEXTURE_FACTOR);
        // The dash sizes itself from the icon's preferred size; keep it stock.
        this.icon.set_size(size, size);
        this._iconBin.child = this.icon;
    };
    baseIcon._createIconTexture(baseIcon.iconSize);

    return () => {
        delete baseIcon._createIconTexture;
        baseIcon.icon = baseIcon._iconBin.child;
        baseIcon._createIconTexture(baseIcon.iconSize);
    };
}
