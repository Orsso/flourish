import {
    DEFAULT_PRESET,
    Easing,
    LaunchEffect,
    PressEffect,
    PressMode,
    Preset,
    easingProgress,
    getBuiltInRecipe,
} from '../flourish@orsso.github.io/lib/motion/catalog.js';

test('subtle is the default preset', () => {
    assertEqual(DEFAULT_PRESET, Preset.SUBTLE);
});

test('built-in recipes match the presets', () => {
    const subtle = getBuiltInRecipe(Preset.SUBTLE);
    const balanced = getBuiltInRecipe(Preset.BALANCED);
    const expressive = getBuiltInRecipe(Preset.EXPRESSIVE);

    assertEqual(subtle.hover.enabled, true);
    assertEqual(subtle.press.mode, PressMode.CLICKS_ONLY);
    assertEqual(subtle.press.effect, PressEffect.DIM);
    assertEqual(subtle.launch.effect, LaunchEffect.PULSE);
    assertEqual(subtle.launch.speed, 0.65);
    assertEqual(subtle.launch.repeatPause, 400);
    assertEqual(subtle.launch.softenRepeats, true);
    assertEqual(balanced.hover.enabled, true);
    assertEqual(balanced.hover.scale, 1.12);
    assertEqual(balanced.press.mode, PressMode.CLICKS_ONLY);
    assertEqual(balanced.launch.effect, LaunchEffect.STRETCH);
    assertEqual(balanced.launch.repeatPause, 400);
    assertEqual(expressive.hover.easing, Easing.EASE_OUT_CUBIC);
    assertEqual(expressive.launch.effect, LaunchEffect.BOUNCE);
    assertEqual(expressive.launch.repeatPause, 300);
});

test('built-in recipes are copied', () => {
    const first = getBuiltInRecipe(Preset.BALANCED);
    first.hover.scale = 9;
    assertEqual(getBuiltInRecipe(Preset.BALANCED).hover.scale, 1.12);
});

test('presets declare their press effects', () => {
    assertEqual(getBuiltInRecipe(Preset.SUBTLE).press.effect, PressEffect.DIM);
    assertEqual(getBuiltInRecipe(Preset.BALANCED).press.effect, PressEffect.SQUASH);
    assertEqual(getBuiltInRecipe(Preset.EXPRESSIVE).press.effect, PressEffect.DIM);
    assertEqual(getBuiltInRecipe(Preset.EXPRESSIVE).press.mode, PressMode.CLICKS_AND_LAUNCHES);
});

test('presets carry the neighbor radius', () => {
    assertEqual(getBuiltInRecipe(Preset.SUBTLE).hover.neighborRadius, 1);
    assertEqual(getBuiltInRecipe(Preset.BALANCED).hover.neighborRadius, 2);
    assertEqual(getBuiltInRecipe(Preset.EXPRESSIVE).hover.neighborRadius, 3);
});

test('only Expressive spreads its wave by default', () => {
    assertEqual(getBuiltInRecipe(Preset.SUBTLE).hover.dynamicSpacing, false);
    assertEqual(getBuiltInRecipe(Preset.BALANCED).hover.dynamicSpacing, false);
    assertEqual(getBuiltInRecipe(Preset.EXPRESSIVE).hover.dynamicSpacing, true);
});

test('presets form a measured progression across hover, launch and attention', () => {
    const recipes = ['subtle', 'balanced', 'expressive'].map(getBuiltInRecipe);
    assertDeepEqual(recipes.map(r => [r.hover.scale, r.hover.lift, r.hover.duration]),
        [[1.04, 0, 160], [1.12, 3, 180], [1.50, 10, 280]]);
    assertDeepEqual(recipes.map(r => [r.launch.intensity, r.launch.repeat, r.launch.maxDuration]),
        [[0.50, false, 8000], [0.70, true, 8000], [0.60, true, 8000]]);
    assertDeepEqual(recipes.map(r => [r.attention.effect, r.attention.intensity,
        r.attention.cycles, r.attention.interval, r.attention.reminders, r.attention.peekWhenHidden]),
    [['pulse', 0.25, 1, 10, 3, false], ['pulse', 0.40, 2, 8, 5, true],
        ['bounce', 0.55, 2, 6, 5, true]]);
});

test('easingProgress samples the recipe curves', () => {
    assertEqual(easingProgress(Easing.LINEAR, 0.5), 0.5);
    assertEqual(easingProgress(Easing.EASE_OUT_QUAD, 0.5), 0.75);
    assertEqual(easingProgress(Easing.EASE_OUT_CUBIC, 0.5), 0.875);
    for (const easing of [Easing.LINEAR, Easing.EASE_OUT_QUAD,
        Easing.EASE_OUT_CUBIC, Easing.EASE_OUT_BACK]) {
        assertClose(easingProgress(easing, 0), 0);
        assertEqual(easingProgress(easing, 1), 1);
        assertEqual(easingProgress(easing, 2), 1);
        assertClose(easingProgress(easing, -1), 0);
    }
    // Back overshoots past 1 before settling, like Clutter's curve.
    assertEqual(easingProgress(Easing.EASE_OUT_BACK, 0.6) > 1, true);
});
