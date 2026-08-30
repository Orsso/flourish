import Gio from 'gi://Gio';
import St from 'gi://St';

export class BackgroundStyle {
    #file;
    #loaded = false;

    constructor(extension, cssFileName) {
        this.#file = Gio.File.new_for_path(`${extension.path}/${cssFileName}`);
    }

    // True when a stylesheet was loaded or unloaded.
    setEnabled(enabled) {
        if (this.#loaded === enabled)
            return false;
        if (enabled)
            this.#theme().load_stylesheet(this.#file);
        else
            this.#theme().unload_stylesheet(this.#file);
        this.#loaded = enabled;
        return true;
    }

    disable() {
        this.setEnabled(false);
    }

    #theme() {
        return St.ThemeContext.get_for_stage(global.stage).get_theme();
    }
}
