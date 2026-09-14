const OUTLINES = {
    light: 'border: 1px solid rgba(255, 255, 255, 0.18);',
    dark: 'border: 1px solid rgba(0, 0, 0, 0.35);',
};
const MARK = '/* flourish outline */';

function outlineFor(name, scheme) {
    if (name !== 'auto')
        return OUTLINES[name] ?? '';
    return scheme === 'prefer-dark' ? OUTLINES.light : OUTLINES.dark;
}

// Dash to Dock rewrites the background's inline style on every theme update
// and ties its border alpha to the dock opacity. Inline beats every
// stylesheet, so the outline rides behind that style and comes last.
export class DockOutline {
    #backgrounds = new Set();
    #name = 'none';
    #interfaceSettings;
    #style = '';

    // interfaceSettings: org.gnome.desktop.interface, read for the color scheme.
    constructor({interfaceSettings}) {
        this.#interfaceSettings = interfaceSettings;
        interfaceSettings.connectObject('changed::color-scheme',
            () => this.setOutline(this.#name), this);
    }

    get style() {
        return this.#style;
    }

    setOutline(name) {
        this.#name = name;
        this.#style = outlineFor(name, this.#interfaceSettings.get_string('color-scheme'));
        for (const background of this.#backgrounds)
            this.#apply(background);
    }

    track(background) {
        this.#backgrounds.add(background);
        background.connectObject('notify::style', () => this.#apply(background),
            'destroy', () => this.#backgrounds.delete(background), this);
        this.#apply(background);
    }

    dispose() {
        for (const background of this.#backgrounds) {
            background.disconnectObject(this);
            this.#write(background, base(background.style));
        }
        this.#backgrounds.clear();
    }

    destroy() {
        this.dispose();
        this.#interfaceSettings.disconnectObject(this);
        this.#interfaceSettings = null;
    }

    #apply(background) {
        const dock = base(background.style);
        this.#write(background, this.#style ? `${dock}${MARK}${this.#style}` : dock);
    }

    #write(background, style) {
        if ((background.style ?? '') !== style)
            background.style = style || null;
    }
}

function base(style) {
    const index = style?.indexOf(MARK) ?? -1;
    return index < 0 ? style ?? '' : style.slice(0, index);
}
