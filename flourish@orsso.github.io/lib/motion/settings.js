import GLib from 'gi://GLib';

import {DEFAULT_PRESET, Preset, RecipePart, getBuiltInRecipe} from './catalog.js';

const DEFINITIONS = [
    ['custom-hover-enabled', 'boolean', RecipePart.HOVER, 'enabled'],
    ['custom-hover-dynamic-spacing', 'boolean', RecipePart.HOVER, 'dynamicSpacing'],
    ['custom-hover-scale', 'double', RecipePart.HOVER, 'scale'],
    ['custom-hover-lift', 'int', RecipePart.HOVER, 'lift'],
    ['custom-hover-duration', 'int', RecipePart.HOVER, 'duration'],
    ['custom-hover-easing', 'string', RecipePart.HOVER, 'easing'],
    ['custom-neighbor-radius', 'int', RecipePart.HOVER, 'reach'],
    ['custom-press-enabled', 'boolean', RecipePart.PRESS, 'enabled'],
    ['custom-press-mode', 'string', RecipePart.PRESS, 'mode'],
    ['custom-press-effect', 'string', RecipePart.PRESS, 'effect'],
    ['custom-press-intensity', 'double', RecipePart.PRESS, 'intensity'],
    ['custom-press-duration', 'int', RecipePart.PRESS, 'duration'],
    ['custom-launch-enabled', 'boolean', RecipePart.LAUNCH, 'enabled'],
    ['custom-launch-effect', 'string', RecipePart.LAUNCH, 'effect'],
    ['custom-launch-intensity', 'double', RecipePart.LAUNCH, 'intensity'],
    ['custom-launch-speed', 'double', RecipePart.LAUNCH, 'speed'],
    ['custom-launch-repeat', 'boolean', RecipePart.LAUNCH, 'repeat'],
    ['custom-launch-soften-repeats', 'boolean', RecipePart.LAUNCH, 'softenRepeats'],
    ['custom-launch-repeat-pause', 'int', RecipePart.LAUNCH, 'repeatPause'],
    ['custom-launch-max-duration', 'int', RecipePart.LAUNCH, 'maxDuration'],
    ['custom-bounce-decay', 'double', RecipePart.LAUNCH, 'bounceDecay'],
    ['custom-pulse-count', 'int', RecipePart.LAUNCH, 'pulseCount'],
    ['custom-stretch-elasticity', 'double', RecipePart.LAUNCH, 'stretchElasticity'],
    ['custom-attention-enabled', 'boolean', RecipePart.ATTENTION, 'enabled'],
    ['custom-attention-effect', 'string', RecipePart.ATTENTION, 'effect'],
    ['custom-attention-intensity', 'double', RecipePart.ATTENTION, 'intensity'],
    ['custom-attention-speed', 'double', RecipePart.ATTENTION, 'speed'],
    ['custom-attention-cycles', 'int', RecipePart.ATTENTION, 'cycles'],
    ['custom-attention-cycle-pause', 'int', RecipePart.ATTENTION, 'cyclePause'],
    ['custom-attention-interval', 'int', RecipePart.ATTENTION, 'interval'],
    ['custom-attention-reminders', 'int', RecipePart.ATTENTION, 'reminders'],
    ['custom-attention-peek', 'boolean', RecipePart.ATTENTION, 'peekWhenHidden'],
].map(([key, type, part, property]) => ({key, type, part, property}));

const DEFINITION_BY_KEY = new Map(DEFINITIONS.map(item => [item.key, item]));

// The stored profile key predates the preset wording.
export function readActiveRecipe(settings) {
    const preset = settings.get_string('motion-profile');
    if (preset !== Preset.CUSTOM)
        return getBuiltInRecipe(preset);
    const recipe = {id: Preset.CUSTOM, hover: {}, press: {}, launch: {}, attention: {}};
    for (const {key, type, part, property} of DEFINITIONS)
        recipe[part][property] = settings[`get_${type}`](key);
    return recipe;
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

export function setIntCommitted(settings, key, value) {
    settings.set_int(key, value);
    settings.apply();
}

export function setStringCommitted(settings, key, value) {
    settings.set_string(key, value);
    settings.apply();
}

// Gaps stay at their position while apps move; null means no gap.
export function groupGaps(favoriteIds, stored) {
    return new Map(favoriteIds.slice(1).map((id, index) => [id, stored[index + 1] ?? null]));
}

export function setGroupGap(settings, position, gap) {
    const gaps = settings.get_value('group-gaps').deep_unpack();
    if (gap)
        gaps[position] = gap;
    else
        delete gaps[position];
    settings.set_value('group-gaps', new GLib.Variant('a{us}', gaps));
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

function write(settings, item, value) {
    settings[`set_${item.type}`](item.key, value);
}
