import {Preset, getBuiltInRecipe} from '../flourish@orsso.github.io/lib/motion/catalog.js';
import {
    editCustomSetting,
    readActiveRecipe,
    resetCustom,
    selectPreset,
    setBooleanCommitted,
    switchToPresetFromCustom,
    writeCustomRecipe,
} from '../flourish@orsso.github.io/lib/motion/settings.js';

class ImmediateSettings {
    constructor(preset = Preset.BALANCED) {
        this.values = {'motion-profile': preset};
        this.applyCount = 0;
        this.delayCount = 0;
        writeCustomRecipe(this, getBuiltInRecipe(Preset.BALANCED));
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
class DelayedSettings {
    constructor(preset = Preset.BALANCED) {
        this.committed = {'motion-profile': preset};
        this.pending = {};
        this.delayed = false;
        writeCustomRecipe(this, getBuiltInRecipe(Preset.BALANCED));
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
    const settings = new DelayedSettings(Preset.BALANCED);
    editCustomSetting(settings, 'custom-hover-scale', 1.18);
    assertEqual(settings.committed['motion-profile'], Preset.CUSTOM);
    selectPreset(settings, Preset.SUBTLE);
    assertEqual(settings.committed['motion-profile'], Preset.SUBTLE);
});

test('switching from custom to a preset writes recipe and preset', () => {
    const settings = new DelayedSettings(Preset.BALANCED);
    editCustomSetting(settings, 'custom-hover-scale', 1.18);
    switchToPresetFromCustom(settings, Preset.SUBTLE);
    assertEqual(settings.committed['motion-profile'], Preset.SUBTLE);
    assertEqual(settings.committed['custom-hover-scale'], 1.10);
    assertEqual(settings.committed['custom-launch-repeat-pause'], 400);
});

test('background visibility writes through after a custom edit', () => {
    const settings = new DelayedSettings(Preset.BALANCED);

    editCustomSetting(settings, 'custom-hover-scale', 1.18);
    setBooleanCommitted(settings, 'show-hover-background', true);
    setBooleanCommitted(settings, 'show-focused-app-background', true);

    assertEqual(settings.committed['show-hover-background'], true);
    assertEqual(settings.committed['show-focused-app-background'], true);
});

test('editing a preset copies it to custom before applying the edit', () => {
    const settings = new ImmediateSettings(Preset.SUBTLE);
    editCustomSetting(settings, 'custom-hover-scale', 1.18);
    assertEqual(settings.values['motion-profile'], Preset.CUSTOM);
    assertEqual(settings.values['custom-hover-scale'], 1.18);
    assertEqual(settings.values['custom-launch-effect'], 'bounce');
    assertEqual(settings.values['custom-launch-repeat-pause'], 400);
    assertEqual(settings.applyCount, 1);
});

test('selecting a preset preserves saved custom values', () => {
    const settings = new ImmediateSettings(Preset.CUSTOM);
    settings.values['custom-hover-scale'] = 1.27;
    selectPreset(settings, Preset.SUBTLE);
    assertEqual(settings.values['motion-profile'], Preset.SUBTLE);
    assertEqual(settings.values['custom-hover-scale'], 1.27);
});

test('reset custom copies the default preset values', () => {
    const settings = new ImmediateSettings(Preset.EXPRESSIVE);
    settings.values['custom-hover-scale'] = 1.29;
    resetCustom(settings);
    assertEqual(settings.values['motion-profile'], Preset.CUSTOM);
    assertEqual(settings.values['custom-hover-scale'], 1.10);
    assertEqual(settings.values['custom-launch-effect'], 'bounce');
    assertEqual(settings.values['custom-launch-repeat-pause'], 400);
    assertEqual(settings.applyCount, 1);
});

test('active recipe reads presets without touching custom', () => {
    const settings = new ImmediateSettings(Preset.EXPRESSIVE);
    settings.values['custom-hover-scale'] = 1.01;
    const recipe = readActiveRecipe(settings);
    assertEqual(recipe.id, Preset.EXPRESSIVE);
    assertEqual(recipe.hover.scale, 1.22);
});

test('feature toggles create custom from the active preset', () => {
    const settings = new ImmediateSettings(Preset.BALANCED);
    editCustomSetting(settings, 'custom-launch-enabled', false);
    assertEqual(settings.values['motion-profile'], Preset.CUSTOM);
    assertEqual(settings.values['custom-launch-enabled'], false);
    assertEqual(settings.values['custom-hover-scale'], 1.10);
});

test('press effect round-trips through custom settings', () => {
    const settings = new ImmediateSettings(Preset.BALANCED);
    editCustomSetting(settings, 'custom-press-effect', 'dim');
    assertEqual(settings.values['motion-profile'], Preset.CUSTOM);
    assertEqual(settings.values['custom-press-effect'], 'dim');
    assertEqual(readActiveRecipe(settings).press.effect, 'dim');
});

test('repeat softening round-trips through custom settings', () => {
    const settings = new ImmediateSettings(Preset.BALANCED);
    editCustomSetting(settings, 'custom-launch-soften-repeats', false);
    assertEqual(settings.values['motion-profile'], Preset.CUSTOM);
    assertEqual(settings.values['custom-launch-soften-repeats'], false);
    assertEqual(readActiveRecipe(settings).launch.softenRepeats, false);
});

test('the custom preset reads the stored values', () => {
    const settings = new ImmediateSettings(Preset.CUSTOM);
    settings.values['custom-hover-scale'] = 1.27;
    settings.values['custom-launch-effect'] = 'stock';
    const recipe = readActiveRecipe(settings);
    assertEqual(recipe.id, Preset.CUSTOM);
    assertEqual(recipe.hover.scale, 1.27);
    assertEqual(recipe.launch.effect, 'stock');
});

test('switching from custom to a preset overwrites custom values', () => {
    const settings = new ImmediateSettings(Preset.CUSTOM);
    settings.values['custom-hover-scale'] = 1.29;
    switchToPresetFromCustom(settings, Preset.SUBTLE);
    assertEqual(settings.values['motion-profile'], Preset.SUBTLE);
    assertEqual(settings.values['custom-hover-scale'], 1.10);
    assertEqual(settings.values['custom-launch-effect'], 'bounce');
    assertEqual(settings.applyCount, 1);
});

test('neighbor radius round-trips through custom settings', () => {
    const settings = new ImmediateSettings(Preset.BALANCED);
    editCustomSetting(settings, 'custom-neighbor-radius', 2);
    assertEqual(settings.values['motion-profile'], Preset.CUSTOM);
    assertEqual(settings.values['custom-neighbor-radius'], 2);
    assertEqual(readActiveRecipe(settings).hover.neighborRadius, 2);
});

test('reset restores the default custom values after an edit', () => {
    const settings = new ImmediateSettings(Preset.CUSTOM);
    editCustomSetting(settings, 'custom-hover-scale', 1.29);
    resetCustom(settings);
    assertEqual(settings.values['motion-profile'], Preset.CUSTOM);
    assertEqual(readActiveRecipe(settings).hover.scale, 1.10);
});

test('attention settings round-trip through custom', () => {
    const settings = new ImmediateSettings(Preset.BALANCED);
    editCustomSetting(settings, 'custom-attention-effect', 'wiggle');
    assertEqual(settings.values['motion-profile'], Preset.CUSTOM);
    assertEqual(settings.values['custom-attention-effect'], 'wiggle');
    assertEqual(settings.values['custom-attention-interval'], 5);
    assertEqual(settings.values['custom-attention-peek'], true);
    const recipe = readActiveRecipe(settings);
    assertEqual(recipe.attention.effect, 'wiggle');
    assertEqual(recipe.attention.speed, 0.70);
    assertEqual(recipe.attention.cycles, 3);
    assertEqual(recipe.attention.cyclePause, 120);
    assertEqual(recipe.attention.interval, 5);
    assertEqual(recipe.attention.reminders, 10);
    assertEqual(recipe.attention.peekWhenHidden, true);
});

test('switching to a preset writes the attention part too', () => {
    const settings = new ImmediateSettings(Preset.CUSTOM);
    settings.values['custom-attention-interval'] = 30;
    settings.values['custom-attention-cycles'] = 9;
    settings.values['custom-attention-cycle-pause'] = 500;
    switchToPresetFromCustom(settings, Preset.SUBTLE);
    assertEqual(settings.values['custom-attention-interval'], 5);
    assertEqual(settings.values['custom-attention-cycles'], 3);
    assertEqual(settings.values['custom-attention-cycle-pause'], 120);
    assertEqual(settings.values['custom-attention-effect'], 'wiggle');
});

test('every attention key round-trips through custom', () => {
    const pairs = [
        ['custom-attention-cycles', 'cycles', 7],
        ['custom-attention-cycle-pause', 'cyclePause', 300],
        ['custom-attention-interval', 'interval', 33],
        ['custom-attention-reminders', 'reminders', 4],
        ['custom-attention-speed', 'speed', 0.45],
        ['custom-attention-intensity', 'intensity', 0.9],
        ['custom-attention-effect', 'effect', 'stretch'],
        ['custom-attention-peek', 'peekWhenHidden', false],
        ['custom-attention-enabled', 'enabled', false],
    ];
    const settings = new ImmediateSettings(Preset.BALANCED);
    for (const [key, property, value] of pairs) {
        editCustomSetting(settings, key, value);
        assertEqual(settings.values[key], value);
        assertEqual(readActiveRecipe(settings).attention[property], value);
    }
});
