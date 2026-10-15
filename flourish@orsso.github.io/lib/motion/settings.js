import GLib from 'gi://GLib';

import {OutlineStyle, PRESET_APPEARANCE, Preset, RecipePart, getBuiltInRecipe} from './catalog.js';

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

// Appearance keys a preset sets, so editing one leaves the preset like a motion key.
const APPEARANCE_DEFINITIONS = [
    ['spacing-enabled', 'boolean'],
    ['icon-spacing', 'int'],
    ['groups-enabled', 'boolean'],
    ['backgrounds-enabled', 'boolean'],
    ['show-hover-background', 'boolean'],
    ['show-focused-app-background', 'boolean'],
    ['outline-enabled', 'boolean'],
    ['dock-outline', 'string'],
    ['outline-intensity', 'int'],
    ['outline-light', 'int'],
].map(([key, type]) => ({key, type}));

const DEFINITION_BY_KEY = new Map([...DEFINITIONS, ...APPEARANCE_DEFINITIONS]
    .map(item => [item.key, item]));

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
    writePresetAppearance(settings, preset);
    // delay() sticks for this GSettings object, so presets call apply() too.
    settings.apply();
}

function writePresetAppearance(settings, preset) {
    for (const [key, value] of Object.entries(PRESET_APPEARANCE[preset]))
        write(settings, DEFINITION_BY_KEY.get(key), value);
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

// Gaps act like dock items when one app moves, is pinned or unpinned: a gap stays
// before its right neighbor, or after its left one when that neighbor moved. An app
// dropped right at a gap stays on the side it came from. Other changes keep positions.
export function followMoves(before, after, gaps) {
    const removed = before.filter(id => !after.includes(id));
    const added = after.filter(id => !before.includes(id));
    const without = (list, id) => list.filter(other => other !== id);
    const same = (first, second) => first.length === second.length &&
        first.every((id, index) => id === second[index]);
    let moved = null;
    if (removed.length === 1 && added.length === 0 && same(without(before, removed[0]), after))
        moved = removed[0];
    else if (removed.length === 0 && added.length === 1 && same(before, without(after, added[0])))
        moved = added[0];
    else if (removed.length === 0 && added.length === 0)
        moved = before.find(id => same(without(before, id), without(after, id)) && !same(before, after));
    if (!moved)
        return gaps;
    const followed = {};
    for (const [key, gap] of Object.entries(gaps)) {
        const position = Number(key);
        // Position 0 is never shown; moving it would reveal it.
        if (position < 1)
            continue;
        const right = before[position];
        let anchor = right === moved
            ? after.indexOf(before[position - 1]) + 1
            : after.indexOf(right);
        if (right !== moved && after[anchor - 1] === moved && before.indexOf(moved) > position)
            anchor--;
        if (anchor >= 1 && anchor < after.length && !(anchor in followed))
            followed[anchor] = gap;
    }
    return followed;
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
    writePresetAppearance(settings, preset);
    settings.apply();
}

// Every key back to its default, so Flourish changes nothing; the gaps wait for Groups.
export function resetAll(settings) {
    settings.delay();
    for (const key of settings.settings_schema.list_keys()) {
        if (key !== 'group-gaps')
            settings.reset(key);
    }
    settings.apply();
}

// 1.2 stored the outline and the backgrounds without a switch; keep what was set.
export function migrateAppearance(settings) {
    if (settings.get_user_value('outline-enabled') === null && settings.get_user_value('dock-outline') !== null) {
        if (settings.get_string('dock-outline') === OutlineStyle.NONE)
            settings.reset('dock-outline');
        else
            settings.set_boolean('outline-enabled', true);
    }
    if (settings.get_user_value('backgrounds-enabled') === null &&
        ['show-hover-background', 'show-focused-app-background']
            .some(key => settings.get_user_value(key) !== null))
        settings.set_boolean('backgrounds-enabled', true);
}

function write(settings, item, value) {
    settings[`set_${item.type}`](item.key, value);
}
