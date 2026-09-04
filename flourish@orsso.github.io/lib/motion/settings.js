import {DEFAULT_PRESET, Preset, RecipePart, getBuiltInRecipe} from './catalog.js';

const DEFINITIONS = [
    definition('custom-hover-enabled', 'boolean', RecipePart.HOVER, 'enabled'),
    definition('custom-hover-scale', 'double', RecipePart.HOVER, 'scale'),
    definition('custom-hover-lift', 'int', RecipePart.HOVER, 'lift'),
    definition('custom-hover-duration', 'int', RecipePart.HOVER, 'duration'),
    definition('custom-hover-easing', 'string', RecipePart.HOVER, 'easing'),
    definition('custom-neighbor-scale', 'double', RecipePart.HOVER, 'neighborScale'),
    definition('custom-neighbor-radius', 'int', RecipePart.HOVER, 'neighborRadius'),
    definition('custom-press-enabled', 'boolean', RecipePart.PRESS, 'enabled'),
    definition('custom-press-mode', 'string', RecipePart.PRESS, 'mode'),
    definition('custom-press-effect', 'string', RecipePart.PRESS, 'effect'),
    definition('custom-press-intensity', 'double', RecipePart.PRESS, 'intensity'),
    definition('custom-press-duration', 'int', RecipePart.PRESS, 'duration'),
    definition('custom-launch-enabled', 'boolean', RecipePart.LAUNCH, 'enabled'),
    definition('custom-launch-effect', 'string', RecipePart.LAUNCH, 'effect'),
    definition('custom-launch-intensity', 'double', RecipePart.LAUNCH, 'intensity'),
    definition('custom-launch-speed', 'double', RecipePart.LAUNCH, 'speed'),
    definition('custom-launch-repeat', 'boolean', RecipePart.LAUNCH, 'repeat'),
    definition(
        'custom-launch-soften-repeats', 'boolean', RecipePart.LAUNCH, 'softenRepeats'),
    definition('custom-launch-repeat-pause', 'int', RecipePart.LAUNCH, 'repeatPause'),
    definition('custom-launch-max-duration', 'int', RecipePart.LAUNCH, 'maxDuration'),
    definition('custom-bounce-decay', 'double', RecipePart.LAUNCH, 'bounceDecay'),
    definition('custom-pulse-count', 'int', RecipePart.LAUNCH, 'pulseCount'),
    definition('custom-stretch-elasticity', 'double', RecipePart.LAUNCH, 'stretchElasticity'),
    definition('custom-attention-enabled', 'boolean', RecipePart.ATTENTION, 'enabled'),
    definition('custom-attention-effect', 'string', RecipePart.ATTENTION, 'effect'),
    definition('custom-attention-intensity', 'double', RecipePart.ATTENTION, 'intensity'),
    definition('custom-attention-speed', 'double', RecipePart.ATTENTION, 'speed'),
    definition('custom-attention-cycles', 'int', RecipePart.ATTENTION, 'cycles'),
    definition('custom-attention-cycle-pause', 'int', RecipePart.ATTENTION, 'cyclePause'),
    definition('custom-attention-interval', 'int', RecipePart.ATTENTION, 'interval'),
    definition('custom-attention-reminders', 'int', RecipePart.ATTENTION, 'reminders'),
    definition('custom-attention-peek', 'boolean', RecipePart.ATTENTION, 'peekWhenHidden'),
];

const DEFINITION_BY_KEY = new Map(DEFINITIONS.map(item => [item.key, item]));

// The motion-profile key predates the preset wording; renaming it would
// reset every user's choice.
export function readActiveRecipe(settings) {
    const preset = settings.get_string('motion-profile');
    if (preset !== Preset.CUSTOM)
        return getBuiltInRecipe(preset);
    return {id: Preset.CUSTOM, ...readCustomValues(settings)};
}

function readCustomValues(settings) {
    const values = {hover: {}, press: {}, launch: {}, attention: {}};
    for (const item of DEFINITIONS)
        values[item.part][item.property] = read(settings, item);
    return values;
}

export function writeCustomRecipe(settings, recipe) {
    for (const item of DEFINITIONS)
        write(settings, item, recipe[item.part][item.property]);
}

export function editCustomSetting(settings, key, value) {
    const item = DEFINITION_BY_KEY.get(key);
    settings.delay();
    const currentPreset = settings.get_string('motion-profile');
    if (currentPreset !== Preset.CUSTOM)
        writeCustomRecipe(settings, getBuiltInRecipe(currentPreset));
    write(settings, item, value);
    settings.set_string('motion-profile', Preset.CUSTOM);
    settings.apply();
}

export function selectPreset(settings, preset) {
    settings.set_string('motion-profile', preset);
    // delay() sticks for this GSettings object, so presets call apply() too.
    settings.apply();
}

export function setBooleanCommitted(settings, key, value) {
    settings.set_boolean(key, value);
    settings.apply();
}

export function switchToPresetFromCustom(settings, preset) {
    settings.delay();
    writeCustomRecipe(settings, getBuiltInRecipe(preset));
    settings.set_string('motion-profile', preset);
    settings.apply();
}

export function resetCustom(settings) {
    settings.delay();
    writeCustomRecipe(settings, getBuiltInRecipe(DEFAULT_PRESET));
    settings.set_string('motion-profile', Preset.CUSTOM);
    settings.apply();
}

function definition(key, type, part, property) {
    return {key, type, part, property};
}

function read(settings, item) {
    return settings[`get_${item.type}`](item.key);
}

function write(settings, item, value) {
    settings[`set_${item.type}`](item.key, value);
}
