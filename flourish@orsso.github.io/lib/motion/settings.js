import {DEFAULT_PROFILE, Profile, getBuiltInRecipe} from './catalog.js';

const DEFINITIONS = [
    definition('custom-hover-enabled', 'boolean', 'hover', 'enabled'),
    definition('custom-hover-scale', 'double', 'hover', 'scale'),
    definition('custom-hover-lift', 'int', 'hover', 'lift'),
    definition('custom-hover-duration', 'int', 'hover', 'duration'),
    definition('custom-hover-easing', 'string', 'hover', 'easing'),
    definition('custom-neighbor-scale', 'double', 'hover', 'neighborScale'),
    definition('custom-neighbor-radius', 'int', 'hover', 'neighborRadius'),
    definition('custom-press-enabled', 'boolean', 'press', 'enabled'),
    definition('custom-press-mode', 'string', 'press', 'mode'),
    definition('custom-press-effect', 'string', 'press', 'effect'),
    definition('custom-press-intensity', 'double', 'press', 'intensity'),
    definition('custom-press-duration', 'int', 'press', 'duration'),
    definition('custom-launch-enabled', 'boolean', 'launch', 'enabled'),
    definition('custom-launch-effect', 'string', 'launch', 'effect'),
    definition('custom-launch-intensity', 'double', 'launch', 'intensity'),
    definition('custom-launch-speed', 'double', 'launch', 'speed'),
    definition('custom-launch-repeat', 'boolean', 'launch', 'repeat'),
    definition(
        'custom-launch-soften-repeats', 'boolean', 'launch', 'softenRepeats'),
    definition('custom-launch-repeat-pause', 'int', 'launch', 'repeatPause'),
    definition('custom-launch-max-duration', 'int', 'launch', 'maxDuration'),
    definition('custom-bounce-decay', 'double', 'launch', 'bounceDecay'),
    definition('custom-pulse-count', 'int', 'launch', 'pulseCount'),
    definition('custom-stretch-elasticity', 'double', 'launch', 'stretchElasticity'),
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
        values[item.group][item.property] = read(settings, item);
    return values;
}

export function writeCustomRecipe(settings, recipe) {
    for (const item of DEFINITIONS)
        write(settings, item, recipe[item.group][item.property]);
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

function definition(key, type, group, property) {
    return {key, type, group, property};
}

function read(settings, item) {
    return settings[`get_${item.type}`](item.key);
}

function write(settings, item, value) {
    settings[`set_${item.type}`](item.key, value);
}
