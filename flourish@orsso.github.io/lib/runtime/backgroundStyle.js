import Gio from 'gi://Gio';
import St from 'gi://St';

export class BackgroundStyle {
    #enabled = false;
    #file;
    #loaded = false;
    #refreshStyles;

    constructor(extension, cssFileName, {refreshStyles = () => {}} = {}) {
        this.#file = Gio.File.new_for_path(`${extension.path}/${cssFileName}`);
        this.#refreshStyles = refreshStyles;
    }

    setEnabled(enabled) {
        if (this.#enabled === enabled)
            return;
        this.#enabled = enabled;
        if (enabled)
            this.#apply();
        else
            this.#remove();
    }

    disable() {
        this.#enabled = false;
        this.#remove();
    }

    #apply() {
        if (this.#loaded)
            return;
        this.#theme().load_stylesheet(this.#file);
        this.#loaded = true;
        this.#refreshStyles();
    }

    #remove() {
        if (!this.#loaded)
            return;
        this.#theme().unload_stylesheet(this.#file);
        this.#loaded = false;
        this.#refreshStyles();
    }

    #theme() {
        return St.ThemeContext.get_for_stage(global.stage).get_theme();
    }
}
