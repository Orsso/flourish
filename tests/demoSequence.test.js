import {LaunchEffect, PressMode, getBuiltInRecipe, Profile} from '../flourish@orsso.github.io/lib/motion/catalog.js';
import {
    buildDemoSequence,
    buildEffectSequence,
    DemoPhase,
    hoverIsActive,
} from '../flourish@orsso.github.io/lib/prefs/demoSequence.js';

test('all-primary preset shows a plain click before the launch click', () => {
    const sequence = buildDemoSequence(getBuiltInRecipe(Profile.EXPRESSIVE));
    assertDeepEqual(sequence, [
        DemoPhase.HOVER_IN,
        DemoPhase.HOLD,
        DemoPhase.CLICK,
        DemoPhase.PRE_LAUNCH_PAUSE,
        DemoPhase.CLICK_LAUNCH,
        DemoPhase.SETTLE,
        DemoPhase.RESET,
        DemoPhase.NEUTRAL_HOLD,
    ]);
});

test('launches-only preset skips the plain click but keeps the launch click', () => {
    const sequence = buildDemoSequence(getBuiltInRecipe(Profile.BALANCED));
    assertEqual(getBuiltInRecipe(Profile.BALANCED).press.mode, PressMode.LAUNCHES_ONLY);
    assertDeepEqual(sequence, [
        DemoPhase.HOVER_IN,
        DemoPhase.HOLD,
        DemoPhase.PRE_LAUNCH_PAUSE,
        DemoPhase.CLICK_LAUNCH,
        DemoPhase.SETTLE,
        DemoPhase.RESET,
        DemoPhase.NEUTRAL_HOLD,
    ]);
});

test('inert hover drops the hover phases entirely', () => {
    const sequence = buildDemoSequence(getBuiltInRecipe(Profile.SUBTLE));
    assertDeepEqual(sequence, [
        DemoPhase.CLICK,
        DemoPhase.PRE_LAUNCH_PAUSE,
        DemoPhase.CLICK_LAUNCH,
        DemoPhase.SETTLE,
        DemoPhase.NEUTRAL_HOLD,
    ]);
});

test('disabling launch drops the launch click', () => {
    const recipe = getBuiltInRecipe(Profile.EXPRESSIVE);
    recipe.launch.enabled = false;
    const sequence = buildDemoSequence(recipe);
    assertDeepEqual(sequence, [
        DemoPhase.HOVER_IN,
        DemoPhase.HOLD,
        DemoPhase.CLICK,
        DemoPhase.PRE_LAUNCH_PAUSE,
        DemoPhase.SETTLE,
        DemoPhase.RESET,
        DemoPhase.NEUTRAL_HOLD,
    ]);
});

test('launch-only press feedback keeps the launch click when the effect is disabled', () => {
    const recipe = getBuiltInRecipe(Profile.BALANCED);
    recipe.launch.enabled = false;

    const sequence = buildDemoSequence(recipe);

    assertEqual(sequence.includes(DemoPhase.CLICK), false);
    assertEqual(sequence.includes(DemoPhase.CLICK_LAUNCH), true);
});

test('effect sequences play a single effect and come back to rest', () => {
    const recipe = getBuiltInRecipe(Profile.BALANCED);
    assertDeepEqual(buildEffectSequence('hover', recipe), [
        DemoPhase.HOVER_IN,
        DemoPhase.HOLD,
        DemoPhase.RESET,
        DemoPhase.NEUTRAL_HOLD,
    ]);
    assertDeepEqual(buildEffectSequence('press', recipe), [
        DemoPhase.CLICK,
        DemoPhase.NEUTRAL_HOLD,
    ]);
});

test('launch effect sequence keeps an even rhythm while repeat is on', () => {
    const recipe = getBuiltInRecipe(Profile.BALANCED);
    assertEqual(recipe.launch.repeat, true);
    assertDeepEqual(buildEffectSequence('launch', recipe), [
        DemoPhase.LAUNCH,
        DemoPhase.REPEAT_PAUSE,
    ]);
    recipe.launch.repeat = false;
    assertDeepEqual(buildEffectSequence('launch', recipe), [
        DemoPhase.LAUNCH,
        DemoPhase.SETTLE,
        DemoPhase.NEUTRAL_HOLD,
    ]);
});

test('stock launch never repeats in the preview', () => {
    const recipe = getBuiltInRecipe(Profile.BALANCED);
    recipe.launch.effect = LaunchEffect.STOCK;
    assertDeepEqual(buildEffectSequence('launch', recipe), [
        DemoPhase.LAUNCH,
        DemoPhase.SETTLE,
        DemoPhase.NEUTRAL_HOLD,
    ]);
});

test('unknown effect sequences are empty', () => {
    assertDeepEqual(buildEffectSequence('nope', getBuiltInRecipe(Profile.BALANCED)), []);
});

test('hover activity requires the toggle and a visible transform', () => {
    const recipe = getBuiltInRecipe(Profile.BALANCED);
    assertEqual(hoverIsActive(recipe), true);
    recipe.hover.scale = 1;
    recipe.hover.lift = 0;
    assertEqual(hoverIsActive(recipe), false);
    recipe.hover.lift = 3;
    assertEqual(hoverIsActive(recipe), true);
    recipe.hover.enabled = false;
    assertEqual(hoverIsActive(recipe), false);
});
