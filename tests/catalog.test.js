import {
    DEFAULT_PROFILE,
    Easing,
    LaunchEffect,
    PressEffect,
    PressMode,
    Profile,
    getBuiltInRecipe,
} from '../flourish@orsso.github.io/lib/motion/catalog.js';

test('subtle is the default profile', () => {
    assertEqual(DEFAULT_PROFILE, Profile.SUBTLE);
});

test('built-in recipes match the presets', () => {
    const subtle = getBuiltInRecipe(Profile.SUBTLE);
    const balanced = getBuiltInRecipe(Profile.BALANCED);
    const expressive = getBuiltInRecipe(Profile.EXPRESSIVE);

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
    const first = getBuiltInRecipe(Profile.BALANCED);
    first.hover.scale = 9;
    assertEqual(getBuiltInRecipe(Profile.BALANCED).hover.scale, 1.10);
});

test('presets declare their press effects', () => {
    assertEqual(getBuiltInRecipe(Profile.SUBTLE).press.effect, PressEffect.DIM);
    assertEqual(getBuiltInRecipe(Profile.BALANCED).press.effect, PressEffect.SQUASH);
    assertEqual(getBuiltInRecipe(Profile.EXPRESSIVE).press.effect, PressEffect.SQUASH);
});

test('presets carry the neighbor radius', () => {
    assertEqual(getBuiltInRecipe(Profile.SUBTLE).hover.neighborRadius, 1);
    assertEqual(getBuiltInRecipe(Profile.BALANCED).hover.neighborRadius, 1);
    assertEqual(getBuiltInRecipe(Profile.EXPRESSIVE).hover.neighborRadius, 2);
});
