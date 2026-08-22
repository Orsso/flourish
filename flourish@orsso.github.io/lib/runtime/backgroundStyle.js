import Gio from 'gi://Gio';
import St from 'gi://St';

export class BackgroundStyle {
    #file;
    #loaded = false;

    constructor(extension, cssFileName) {
        this.#file = Gio.File.new_for_path(`${extension.path}/${cssFileName}`);
    }

    setEnabled(enabled) {
        if (this.#loaded === enabled)
            return;
        if (enabled)
            this.#theme().load_stylesheet(this.#file);
        else
            this.#theme().unload_stylesheet(this.#file);
        this.#loaded = enabled;
    }

    disable() {
        this.setEnabled(false);
    }

    #theme() {
        return St.ThemeContext.get_for_stage(global.stage).get_theme();
    }
}
