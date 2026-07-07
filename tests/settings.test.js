import {Profile, getBuiltInRecipe} from '../flourish@orsso.github.io/lib/motion/catalog.js';
import {
    editCustomSetting,
    readActiveRecipe,
    resetCustom,
    selectProfile,
    switchToPresetFromCustom,
    writeCustomRecipe,
} from '../flourish@orsso.github.io/lib/motion/settings.js';
import {SettingsEditor} from '../flourish@orsso.github.io/lib/prefs/settingsEditor.js';

class FakeSettings {
    constructor(profile = Profile.BALANCED) {
        this.values = {'motion-profile': profile};
        this.applyCount = 0;
        this.delayCount = 0;
        writeCustomRecipe(this, getBuiltInRecipe(Profile.BALANCED), false);
    }

    delay() {
        this.delayCount++;
    }

    apply() {
        this.applyCount++;
    }

    get_boolean(key) {
        return this.values[key];
    }

    get_double(key) {
        return this.values[key];
    }

    get_int(key) {
        return this.values[key];
    }

    get_string(key) {
        return this.values[key];
    }

    set_boolean(key, value) {
        this.values[key] = value;
    }

    set_double(key, value) {
        this.values[key] = value;
    }

    set_int(key, value) {
        this.values[key] = value;
    }

    set_string(key, value) {
        this.values[key] = value;
    }
}

// Small Gio.Settings fake with delay/apply behavior.
class DelayAwareSettings {
    constructor(profile = Profile.BALANCED) {
        this.committed = {'motion-profile': profile};
        this.pending = {};
        this.delayed = false;
        writeCustomRecipe(this, getBuiltInRecipe(Profile.BALANCED), false);
    }

    delay() {
        this.delayed = true;
    }

    apply() {
        Object.assign(this.committed, this.pending);
        this.pending = {};
    }

    _get(key) {
        return key in this.pending ? this.pending[key] : this.committed[key];
    }

    _set(key, value) {
        if (this.delayed)
            this.pending[key] = value;
        else
            this.committed[key] = value;
    }

    get_boolean(key) {
        return this._get(key);
    }

    get_double(key) {
        return this._get(key);
    }

    get_int(key) {
        return this._get(key);
    }

    get_string(key) {
        return this._get(key);
    }

    set_boolean(key, value) {
        this._set(key, value);
    }

    set_double(key, value) {
        this._set(key, value);
    }

    set_int(key, value) {
        this._set(key, value);
    }

    set_string(key, value) {
        this._set(key, value);
    }
}

test('selecting a preset writes through after a custom edit', () => {
    const settings = new DelayAwareSettings(Profile.BALANCED);
    editCustomSetting(settings, 'custom-hover-scale', 1.18);
    assertEqual(settings.committed['motion-profile'], Profile.CUSTOM);
    selectProfile(settings, Profile.SUBTLE);
    assertEqual(settings.committed['motion-profile'], Profile.SUBTLE);
});

test('switching from custom to a preset writes recipe and profile', () => {
    const settings = new DelayAwareSettings(Profile.BALANCED);
    editCustomSetting(settings, 'custom-hover-scale', 1.18);
    switchToPresetFromCustom(settings, Profile.SUBTLE);
    assertEqual(settings.committed['motion-profile'], Profile.SUBTLE);
    assertEqual(settings.committed['custom-hover-scale'], 1.10);
    assertEqual(settings.committed['custom-launch-repeat-pause'], 400);
});

test('background visibility writes through after a custom edit', () => {
    const settings = new DelayAwareSettings(Profile.BALANCED);
    const editor = new SettingsEditor(settings);

    editor.edit('custom-hover-scale', 1.18);
    editor.setBackgroundVisible('hover', true);
    editor.setBackgroundVisible('focusedApp', true);

    assertEqual(settings.committed['show-hover-background'], true);
    assertEqual(settings.committed['show-focused-app-background'], true);
});

test('editing a preset copies it to custom before applying the edit', () => {
    const settings = new FakeSettings(Profile.SUBTLE);
    editCustomSetting(settings, 'custom-hover-scale', 1.18);
    assertEqual(settings.values['motion-profile'], Profile.CUSTOM);
    assertEqual(settings.values['custom-hover-scale'], 1.18);
    assertEqual(settings.values['custom-launch-effect'], 'bounce');
    assertEqual(settings.values['custom-launch-repeat-pause'], 400);
    assertEqual(settings.applyCount, 1);
});

test('selecting a preset preserves saved custom values', () => {
    const settings = new FakeSettings(Profile.CUSTOM);
    settings.values['custom-hover-scale'] = 1.27;
    selectProfile(settings, Profile.SUBTLE);
    assertEqual(settings.values['motion-profile'], Profile.SUBTLE);
    assertEqual(settings.values['custom-hover-scale'], 1.27);
});

test('reset custom copies the default preset values', () => {
    const settings = new FakeSettings(Profile.EXPRESSIVE);
    settings.values['custom-hover-scale'] = 1.29;
    resetCustom(settings);
    assertEqual(settings.values['motion-profile'], Profile.CUSTOM);
    assertEqual(settings.values['custom-hover-scale'], 1.10);
    assertEqual(settings.values['custom-launch-effect'], 'bounce');
    assertEqual(settings.values['custom-launch-repeat-pause'], 400);
    assertEqual(settings.applyCount, 1);
});

test('active recipe reads presets without touching custom', () => {
    const settings = new FakeSettings(Profile.EXPRESSIVE);
    settings.values['custom-hover-scale'] = 1.01;
    const recipe = readActiveRecipe(settings);
    assertEqual(recipe.id, Profile.EXPRESSIVE);
    assertEqual(recipe.hover.scale, 1.22);
});

test('feature toggles create custom from the active preset', () => {
    const settings = new FakeSettings(Profile.BALANCED);
    editCustomSetting(settings, 'custom-launch-enabled', false);
    assertEqual(settings.values['motion-profile'], Profile.CUSTOM);
    assertEqual(settings.values['custom-launch-enabled'], false);
    assertEqual(settings.values['custom-hover-scale'], 1.10);
});

test('press effect round-trips through custom settings', () => {
    const settings = new FakeSettings(Profile.BALANCED);
    editCustomSetting(settings, 'custom-press-effect', 'dim');
    assertEqual(settings.values['motion-profile'], Profile.CUSTOM);
    assertEqual(settings.values['custom-press-effect'], 'dim');
    assertEqual(readActiveRecipe(settings).press.effect, 'dim');
});

test('repeat softening round-trips through custom settings', () => {
    const settings = new FakeSettings(Profile.BALANCED);
    editCustomSetting(settings, 'custom-launch-soften-repeats', false);
    assertEqual(settings.values['motion-profile'], Profile.CUSTOM);
    assertEqual(settings.values['custom-launch-soften-repeats'], false);
    assertEqual(readActiveRecipe(settings).launch.softenRepeats, false);
});

test('settings editor changes profiles and features', () => {
    const settings = new FakeSettings(Profile.EXPRESSIVE);
    const editor = new SettingsEditor(settings);
    editor.selectProfile(Profile.SUBTLE);
    assertEqual(editor.profile, Profile.SUBTLE);
    editor.setFeatureEnabled('hover', false);
    assertEqual(editor.profile, Profile.CUSTOM);
    assertEqual(settings.values['custom-hover-enabled'], false);
    assertEqual(editor.recipe.launch.effect, 'bounce');
});

test('switching from custom to a preset overwrites custom values', () => {
    const settings = new FakeSettings(Profile.CUSTOM);
    settings.values['custom-hover-scale'] = 1.29;
    switchToPresetFromCustom(settings, Profile.SUBTLE);
    assertEqual(settings.values['motion-profile'], Profile.SUBTLE);
    assertEqual(settings.values['custom-hover-scale'], 1.10);
    assertEqual(settings.values['custom-launch-effect'], 'bounce');
    assertEqual(settings.applyCount, 1);
});

test('settings editor uses the custom-to-preset path', () => {
    const settings = new FakeSettings(Profile.CUSTOM);
    settings.values['custom-hover-scale'] = 1.29;
    const editor = new SettingsEditor(settings);
    editor.switchFromCustomToPreset(Profile.EXPRESSIVE);
    assertEqual(editor.profile, Profile.EXPRESSIVE);
    assertEqual(settings.values['custom-hover-scale'], 1.22);
});

test('neighbor radius round-trips through custom settings', () => {
    const settings = new FakeSettings(Profile.BALANCED);
    editCustomSetting(settings, 'custom-neighbor-radius', 2);
    assertEqual(settings.values['motion-profile'], Profile.CUSTOM);
    assertEqual(settings.values['custom-neighbor-radius'], 2);
    assertEqual(readActiveRecipe(settings).hover.neighborRadius, 2);
});

test('settings editor reset restores the default custom values', () => {
    const settings = new FakeSettings(Profile.CUSTOM);
    const editor = new SettingsEditor(settings);
    editor.edit('custom-hover-scale', 1.29);
    editor.resetCustom();
    assertEqual(editor.profile, Profile.CUSTOM);
    assertEqual(editor.recipe.hover.scale, 1.10);
});
