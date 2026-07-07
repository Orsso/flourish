import {
    editCustomSetting,
    readActiveRecipe,
    resetCustom,
    selectProfile,
    setBooleanCommitted,
    switchToPresetFromCustom,
} from '../motion/settings.js';

const FEATURE_KEYS = Object.freeze({
    hover: 'custom-hover-enabled',
    press: 'custom-press-enabled',
    launch: 'custom-launch-enabled',
});

const BACKGROUND_KEYS = Object.freeze({
    hover: 'show-hover-background',
    focusedApp: 'show-focused-app-background',
});

export class SettingsEditor {
    #settings;

    constructor(settings) {
        this.#settings = settings;
    }

    get profile() {
        return this.#settings.get_string('motion-profile');
    }

    get recipe() {
        return readActiveRecipe(this.#settings);
    }

    selectProfile(profile) {
        selectProfile(this.#settings, profile);
    }

    switchFromCustomToPreset(profile) {
        switchToPresetFromCustom(this.#settings, profile);
    }

    edit(key, value) {
        editCustomSetting(this.#settings, key, value);
    }

    setFeatureEnabled(feature, enabled) {
        const key = FEATURE_KEYS[feature];
        if (!key)
            throw new Error(`Unknown motion feature: ${feature}`);
        this.edit(key, enabled);
    }

    setBackgroundVisible(background, visible) {
        const key = BACKGROUND_KEYS[background];
        if (!key)
            throw new Error(`Unknown dock background: ${background}`);
        setBooleanCommitted(this.#settings, key, visible);
    }

    resetCustom() {
        resetCustom(this.#settings);
    }
}
