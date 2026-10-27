import St from 'gi://St';

export class Stylesheet {
    #file;

    constructor(file) {
        this.#file = file;
    }

    // True when a stylesheet was loaded or unloaded.
    setEnabled(enabled) {
        const theme = this.#theme();
        if (this.#isLoaded(theme) === enabled)
            return false;
        if (enabled)
            theme.load_stylesheet(this.#file);
        else
            theme.unload_stylesheet(this.#file);
        return true;
    }

    disable() {
        this.setEnabled(false);
    }

    #isLoaded(theme) {
        return theme.get_custom_stylesheets().some(file => file.equal(this.#file));
    }

    #theme() {
        return St.ThemeContext.get_for_stage(global.stage).get_theme();
    }
}
