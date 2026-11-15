import St from 'gi://St';

export class Stylesheet {
    #file;
    // Kept here, not read back from St: listing its sheets logs a critical for each null entry (#14).
    #loadedFile = null;

    constructor(file) {
        this.#file = file;
    }

    // True when a stylesheet was loaded or unloaded.
    setEnabled(enabled) {
        if (enabled === (this.#loadedFile !== null))
            return false;
        const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
        if (enabled) {
            theme.load_stylesheet(this.#file);
            this.#loadedFile = this.#file;
        } else {
            theme.unload_stylesheet(this.#loadedFile);
            this.#loadedFile = null;
        }
        return true;
    }

    disable() {
        this.setEnabled(false);
    }
}
