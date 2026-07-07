import {PressMode} from './catalog.js';

export class PressInteraction {
    #pressed = false;
    #primaryInteraction = false;

    get pressed() {
        return this.#pressed;
    }

    beginPrimary(config) {
        this.#primaryInteraction = true;
        return this.applyStep(Boolean(config.enabled &&
            config.mode === PressMode.ALL_PRIMARY_CLICKS));
    }

    syncButtonPressed(buttonPressed, config) {
        if (buttonPressed || !config.enabled ||
            config.mode !== PressMode.ALL_PRIMARY_CLICKS)
            return false;
        return this.applyStep(false);
    }

    consumeLaunchSteps(config) {
        const fromPrimary = this.#primaryInteraction;
        this.#primaryInteraction = false;
        if (!config.enabled)
            return [];
        if (config.mode === PressMode.LAUNCHES_ONLY) {
            return [
                {pressed: true, durationFactor: 0.5},
                {pressed: false, durationFactor: 1},
            ];
        }
        return fromPrimary
            ? [{pressed: false, durationFactor: 1}]
            : [];
    }

    finishClick() {
        this.#primaryInteraction = false;
        return this.applyStep(false);
    }

    reset() {
        this.#primaryInteraction = false;
        return this.applyStep(false);
    }

    applyStep(pressed) {
        if (this.#pressed === pressed)
            return false;
        this.#pressed = pressed;
        return true;
    }
}
