import {LaunchEffect, PressMode, getBuiltInRecipe, Preset} from '../flourish@orsso.github.io/lib/motion/catalog.js';
import {
    buildDemoSequence,
    buildPartSequence,
    DemoPhase,
} from '../flourish@orsso.github.io/lib/prefs/demoSequence.js';

test('click feedback shows a plain click before the launch click', () => {
    const sequence = buildDemoSequence(getBuiltInRecipe(Preset.EXPRESSIVE));
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

test('launches-only skips the plain click but keeps the launch click', () => {
    const recipe = getBuiltInRecipe(Preset.BALANCED);
    recipe.press.mode = PressMode.LAUNCHES_ONLY;
    const sequence = buildDemoSequence(recipe);
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
    const recipe = getBuiltInRecipe(Preset.SUBTLE);
    recipe.hover.enabled = false;
    const sequence = buildDemoSequence(recipe);
    assertDeepEqual(sequence, [
        DemoPhase.CLICK,
        DemoPhase.PRE_LAUNCH_PAUSE,
        DemoPhase.CLICK_LAUNCH,
        DemoPhase.SETTLE,
        DemoPhase.NEUTRAL_HOLD,
    ]);
});

test('disabling launch drops the launch click', () => {
    const recipe = getBuiltInRecipe(Preset.EXPRESSIVE);
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

test('launches-only keeps the launch click when the effect is disabled', () => {
    const recipe = getBuiltInRecipe(Preset.BALANCED);
    recipe.press.mode = PressMode.LAUNCHES_ONLY;
    recipe.launch.enabled = false;

    const sequence = buildDemoSequence(recipe);

    assertEqual(sequence.includes(DemoPhase.CLICK), false);
    assertEqual(sequence.includes(DemoPhase.CLICK_LAUNCH), true);
});

test('a part sequence plays that part alone and comes back to rest', () => {
    const recipe = getBuiltInRecipe(Preset.BALANCED);
    assertDeepEqual(buildPartSequence('hover', recipe), [
        DemoPhase.HOVER_IN,
        DemoPhase.HOLD,
        DemoPhase.RESET,
        DemoPhase.NEUTRAL_HOLD,
    ]);
    assertDeepEqual(buildPartSequence('press', recipe), [
        DemoPhase.CLICK,
        DemoPhase.NEUTRAL_HOLD,
    ]);
});

test('the launch sequence keeps an even rhythm while repeat is on', () => {
    const recipe = getBuiltInRecipe(Preset.BALANCED);
    assertEqual(recipe.launch.repeat, true);
    assertDeepEqual(buildPartSequence('launch', recipe), [
        DemoPhase.LAUNCH,
        DemoPhase.REPEAT_PAUSE,
    ]);
    recipe.launch.repeat = false;
    assertDeepEqual(buildPartSequence('launch', recipe), [
        DemoPhase.LAUNCH,
        DemoPhase.SETTLE,
        DemoPhase.NEUTRAL_HOLD,
    ]);
});

test('stock launch never repeats in the preview', () => {
    const recipe = getBuiltInRecipe(Preset.BALANCED);
    recipe.launch.effect = LaunchEffect.STOCK;
    assertDeepEqual(buildPartSequence('launch', recipe), [
        DemoPhase.LAUNCH,
        DemoPhase.SETTLE,
        DemoPhase.NEUTRAL_HOLD,
    ]);
});

test('the attention sequence plays one cycle and pauses', () => {
    assertDeepEqual(buildPartSequence('attention', getBuiltInRecipe(Preset.SUBTLE)), [
        DemoPhase.ATTENTION,
        DemoPhase.REMINDER_PAUSE,
    ]);
});
