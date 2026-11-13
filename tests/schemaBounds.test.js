import GLib from 'gi://GLib';

import {
    AttentionCyclePause,
    AttentionCycles,
    AttentionInterval,
    AttentionReminders,
    IconSpacing,
    OutlineLight,
    Reach,
    Preset,
    SpacingFraction,
    getBuiltInRecipe,
} from '../flourish@orsso.github.io/lib/motion/catalog.js';

const SCHEMA_PATH = GLib.build_filenamev([
    GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]),
    '..',
    'flourish@orsso.github.io',
    'schemas',
    'org.gnome.shell.extensions.flourish.gschema.xml',
]);

const KEY_PATTERN = new RegExp(
    '<key name="([a-z-]+)" type="[id]">\\s*<default>([^<]+)</default>' +
    '\\s*<range min="([^"]+)" max="([^"]+)"/>', 'g');

function readRanges() {
    const [, contents] = GLib.file_get_contents(SCHEMA_PATH);
    const text = new TextDecoder().decode(contents);
    const ranges = new Map();
    for (const match of text.matchAll(KEY_PATTERN))
        ranges.set(match[1], {min: Number(match[3]), max: Number(match[4])});
    return ranges;
}

const RANGES = readRanges();

function rangeOf(key) {
    const found = RANGES.get(key);
    if (!found)
        throw new Error(`No range read for ${key}`);
    return found;
}

const BOUNDED_KEYS = [
    ['custom-neighbor-radius', Reach],
    ['custom-attention-cycles', AttentionCycles],
    ['custom-attention-cycle-pause', AttentionCyclePause],
    ['custom-attention-interval', AttentionInterval],
    ['custom-attention-reminders', AttentionReminders],
];

test('icon spacing offers the catalog sizes', () => {
    const [, contents] = GLib.file_get_contents(SCHEMA_PATH);
    const values = new TextDecoder().decode(contents)
        .match(/<enum id="org\.gnome\.shell\.extensions\.flourish\.icon-spacing">([^]*?)<\/enum>/)[1];
    assertDeepEqual([...values.matchAll(/nick="([a-z]+)"/g)].map(match => match[1]), Object.values(IconSpacing));
});

test('the outline light spans the catalog positions', () => {
    assertDeepEqual(rangeOf('outline-light'), {min: OutlineLight.MIN, max: OutlineLight.MAX});
});

test('the spacing shares span the catalog bounds', () => {
    for (const key of ['spacing-gap', 'spacing-across', 'spacing-ends'])
        assertDeepEqual(rangeOf(key), {min: SpacingFraction.MIN, max: SpacingFraction.MAX});
});

test('custom magnification spans 100 to 200 percent', () => {
    assertDeepEqual(rangeOf('custom-hover-scale'), {min: 1, max: 2});
});

test('the gschema ranges mirror the catalog bounds', () => {
    for (const [key, bounds] of BOUNDED_KEYS) {
        const range = rangeOf(key);
        assertEqual(range.min, bounds.MIN);
        assertEqual(range.max, bounds.MAX);
    }
});

test('every preset stays inside the attention ranges', () => {
    const fields = [
        ['custom-attention-cycles', 'cycles'],
        ['custom-attention-cycle-pause', 'cyclePause'],
        ['custom-attention-interval', 'interval'],
        ['custom-attention-reminders', 'reminders'],
    ];
    for (const preset of [Preset.SUBTLE, Preset.BALANCED, Preset.EXPRESSIVE]) {
        const {attention} = getBuiltInRecipe(preset);
        for (const [key, property] of fields) {
            const range = rangeOf(key);
            const value = attention[property];
            assertEqual(value >= range.min && value <= range.max, true);
        }
    }
});
