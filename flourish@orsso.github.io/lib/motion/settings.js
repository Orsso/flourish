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

// The gap before each favorite after the first, keyed by app id; null means no gap.
export function groupGaps(favoriteIds, stored) {
    return new Map(favoriteIds.slice(1).map(id => [id, stored[id] ?? null]));
}

// A group keeps its edge when its first app leaves: the next app that stays starts it.
// Dash to Dock moves an app as a removal then an insertion, so only removals count.
export function passGaps(before, after, stored) {
    const passed = {...stored};
    let changed = false;
    for (const [index, id] of before.entries()) {
        if (!stored[id] || after.includes(id))
            continue;
        delete passed[id];
        changed = true;
        const next = before.slice(index + 1).find(other => after.includes(other));
        // The first favorite never shows a gap.
        if (next && after.indexOf(next) > 0 && !passed[next])
            passed[next] = stored[id];
    }
    return changed ? passed : stored;
}

export function setGroupGap(settings, id, gap) {
    const gaps = settings.get_value('group-starts').deep_unpack();
    if (gap)
        gaps[id] = gap;
    else
        delete gaps[id];
    settings.set_value('group-starts', new GLib.Variant('a{ss}', gaps));
    settings.apply();
}

// One write, so a dragged gap never shows twice.
export function moveGroupGap(settings, from, to) {
    const gaps = settings.get_value('group-starts').deep_unpack();
    gaps[to] = gaps[from];
    delete gaps[from];
    settings.set_value('group-starts', new GLib.Variant('a{ss}', gaps));
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
        if (key !== 'group-starts')
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
