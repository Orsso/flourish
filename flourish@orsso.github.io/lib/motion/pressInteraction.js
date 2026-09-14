import {PressMode} from './catalog.js';

export class PressInteraction {
    #pressed = false;

    get pressed() {
        return this.#pressed;
    }

    beginPrimary(config, launching = false) {
        const {enabled, mode} = config;
        return this.applyStep(enabled && mode !== PressMode.LAUNCHES_ONLY &&
            (mode === PressMode.CLICKS_AND_LAUNCHES || !launching));
    }

    syncButtonPressed(buttonPressed) {
        return buttonPressed ? false : this.reset();
    }

    reset() {
        return this.applyStep(false);
    }

    applyStep(pressed) {
        if (this.#pressed === pressed)
            return false;
        this.#pressed = pressed;
        return true;
    }
}
