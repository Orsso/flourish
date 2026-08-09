import {
    DEFAULT_PROFILE,
    Profile,
    getBuiltInRecipe,
    isBuiltInProfile,
} from './catalog.js';
import {
    customValuesFromRecipe,
    resolveRecipe,
} from './resolver.js';

const DEFINITIONS = Object.freeze([
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
]);

const DEFINITION_BY_KEY = new Map(DEFINITIONS.map(item => [item.key, item]));

export function readActiveRecipe(settings) {
    const profile = settings.get_string('motion-profile');
    return resolveRecipe(profile, readCustomValues(settings));
}

function readCustomValues(settings) {
    const values = {hover: {}, press: {}, launch: {}};
    for (const item of DEFINITIONS)
        values[item.group][item.property] = read(settings, item);
    return values;
}

export function writeCustomRecipe(settings, recipe, batch = true) {
    const values = customValuesFromRecipe(recipe);
    if (batch)
        settings.delay();
    for (const item of DEFINITIONS)
        write(settings, item, values[item.group][item.property]);
    if (batch)
        settings.apply();
}

export function editCustomSetting(settings, key, value) {
    const item = DEFINITION_BY_KEY.get(key);
    if (!item)
        throw new Error(`Unknown custom setting: ${key}`);

    settings.delay();
    const currentProfile = settings.get_string('motion-profile');
    if (currentProfile !== Profile.CUSTOM)
        writeCustomRecipe(settings, getBuiltInRecipe(currentProfile), false);
    write(settings, item, value);
    settings.set_string('motion-profile', Profile.CUSTOM);
    settings.apply();
}

function resolveProfileId(profile) {
    return isBuiltInProfile(profile) || profile === Profile.CUSTOM
        ? profile
        : DEFAULT_PROFILE;
}

export function selectProfile(settings, profile) {
    settings.set_string('motion-profile', resolveProfileId(profile));
    // delay() sticks for this GSettings object, so presets call apply() too.
    settings.apply();
}

export function setBooleanCommitted(settings, key, value) {
    settings.set_boolean(key, value);
    settings.apply();
}

export function switchToPresetFromCustom(settings, profile) {
    settings.delay();
    writeCustomRecipe(settings, getBuiltInRecipe(profile), false);
    settings.set_string('motion-profile', resolveProfileId(profile));
    settings.apply();
}

export function resetCustom(settings) {
    settings.delay();
    writeCustomRecipe(settings, getBuiltInRecipe(DEFAULT_PROFILE), false);
    settings.set_string('motion-profile', Profile.CUSTOM);
    settings.apply();
}

function definition(key, type, group, property) {
    return Object.freeze({key, type, group, property});
}

function read(settings, item) {
    return settings[`get_${item.type}`](item.key);
}

function write(settings, item, value) {
    settings[`set_${item.type}`](item.key, value);
}
