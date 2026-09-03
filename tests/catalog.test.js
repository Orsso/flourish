import {
    DEFAULT_PRESET,
    Easing,
    LaunchEffect,
    PressEffect,
    PressMode,
    Preset,
    getBuiltInRecipe,
} from '../flourish@orsso.github.io/lib/motion/catalog.js';

test('subtle is the default preset', () => {
    assertEqual(DEFAULT_PRESET, Preset.SUBTLE);
});

test('built-in recipes match the presets', () => {
    const subtle = getBuiltInRecipe(Preset.SUBTLE);
    const balanced = getBuiltInRecipe(Preset.BALANCED);
    const expressive = getBuiltInRecipe(Preset.EXPRESSIVE);

    assertEqual(subtle.hover.enabled, false);
    assertEqual(subtle.press.mode, PressMode.ALL_PRIMARY_CLICKS);
    assertEqual(subtle.press.effect, PressEffect.DIM);
    assertEqual(subtle.launch.effect, LaunchEffect.BOUNCE);
    assertEqual(subtle.launch.speed, 0.55);
    assertEqual(subtle.launch.repeatPause, 400);
    assertEqual(subtle.launch.softenRepeats, true);
    assertEqual(balanced.hover.enabled, true);
    assertEqual(balanced.hover.scale, 1.10);
    assertEqual(balanced.press.mode, PressMode.LAUNCHES_ONLY);
    assertEqual(balanced.launch.effect, LaunchEffect.PULSE);
    assertEqual(balanced.launch.repeatPause, 0);
    assertEqual(expressive.hover.easing, Easing.EASE_OUT_BACK);
    assertEqual(expressive.launch.effect, LaunchEffect.STRETCH);
    assertEqual(expressive.launch.repeatPause, 0);
});

test('built-in recipes are copied', () => {
    const first = getBuiltInRecipe(Preset.BALANCED);
    first.hover.scale = 9;
    assertEqual(getBuiltInRecipe(Preset.BALANCED).hover.scale, 1.10);
});

test('presets declare their press effects', () => {
    assertEqual(getBuiltInRecipe(Preset.SUBTLE).press.effect, PressEffect.DIM);
    assertEqual(getBuiltInRecipe(Preset.BALANCED).press.effect, PressEffect.SQUASH);
    assertEqual(getBuiltInRecipe(Preset.EXPRESSIVE).press.effect, PressEffect.SQUASH);
});

test('presets carry the neighbor radius', () => {
    assertEqual(getBuiltInRecipe(Preset.SUBTLE).hover.neighborRadius, 1);
    assertEqual(getBuiltInRecipe(Preset.BALANCED).hover.neighborRadius, 1);
    assertEqual(getBuiltInRecipe(Preset.EXPRESSIVE).hover.neighborRadius, 2);
});
