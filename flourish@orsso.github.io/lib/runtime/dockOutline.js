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

// Dash to Dock rewrites the inline style, so the outline is appended to it.
export class DockOutline {
    #backgrounds = new Set();
    #name = 'none';
    #interfaceSettings;
    #pending = new Map();
    #scheduler;
    #style = '';

    constructor({interfaceSettings, scheduler}) {
        this.#interfaceSettings = interfaceSettings;
        this.#scheduler = scheduler;
        interfaceSettings.connectObject('changed::color-scheme',
            () => this.setOutline(this.#name), this);
    }

    setOutline(name) {
        this.#name = name;
        this.#style = outlineFor(name, this.#interfaceSettings.get_string('color-scheme'));
        for (const background of this.#backgrounds)
            this.#apply(background);
    }

    track(background) {
        this.#backgrounds.add(background);
        // Dash to Dock clears the style to read its theme node; reapply after that.
        background.connectObject('notify::style', () => this.#schedule(background),
            'destroy', () => {
                this.#cancel(background);
                this.#backgrounds.delete(background);
            }, this);
        this.#apply(background);
    }

    dispose() {
        for (const background of this.#backgrounds) {
            this.#cancel(background);
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

    #schedule(background) {
        if (this.#pending.has(background))
            return;
        this.#pending.set(background, this.#scheduler.schedule(() => {
            this.#pending.delete(background);
            this.#apply(background);
        }));
    }

    #cancel(background) {
        const id = this.#pending.get(background);
        if (!id)
            return;
        this.#scheduler.cancel(id);
        this.#pending.delete(background);
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
