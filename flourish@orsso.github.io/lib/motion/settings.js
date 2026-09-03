import {DEFAULT_PROFILE, Profile, RecipePart, getBuiltInRecipe} from './catalog.js';

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
];

const DEFINITION_BY_KEY = new Map(DEFINITIONS.map(item => [item.key, item]));

export function readActiveRecipe(settings) {
    const profile = settings.get_string('motion-profile');
    if (profile !== Profile.CUSTOM)
        return getBuiltInRecipe(profile);
    return {id: Profile.CUSTOM, ...readCustomValues(settings)};
}

function readCustomValues(settings) {
    const values = {hover: {}, press: {}, launch: {}};
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
    const currentProfile = settings.get_string('motion-profile');
    if (currentProfile !== Profile.CUSTOM)
        writeCustomRecipe(settings, getBuiltInRecipe(currentProfile));
    write(settings, item, value);
    settings.set_string('motion-profile', Profile.CUSTOM);
    settings.apply();
}

export function selectProfile(settings, profile) {
    settings.set_string('motion-profile', profile);
    // delay() sticks for this GSettings object, so presets call apply() too.
    settings.apply();
}

export function setBooleanCommitted(settings, key, value) {
    settings.set_boolean(key, value);
    settings.apply();
}

export function switchToPresetFromCustom(settings, profile) {
    settings.delay();
    writeCustomRecipe(settings, getBuiltInRecipe(profile));
    settings.set_string('motion-profile', profile);
    settings.apply();
}

export function resetCustom(settings) {
    settings.delay();
    writeCustomRecipe(settings, getBuiltInRecipe(DEFAULT_PROFILE));
    settings.set_string('motion-profile', Profile.CUSTOM);
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
