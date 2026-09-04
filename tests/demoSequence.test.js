import {LaunchEffect, PressMode, getBuiltInRecipe, Preset} from '../flourish@orsso.github.io/lib/motion/catalog.js';
import {
    buildDemoSequence,
    buildPartSequence,
    DemoPhase,
    hoverIsActive,
} from '../flourish@orsso.github.io/lib/prefs/demoSequence.js';

test('all-primary preset shows a plain click before the launch click', () => {
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

test('launches-only preset skips the plain click but keeps the launch click', () => {
    const sequence = buildDemoSequence(getBuiltInRecipe(Preset.BALANCED));
    assertEqual(getBuiltInRecipe(Preset.BALANCED).press.mode, PressMode.LAUNCHES_ONLY);
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
    const sequence = buildDemoSequence(getBuiltInRecipe(Preset.SUBTLE));
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

test('launch-only press feedback keeps the launch click when the effect is disabled', () => {
    const recipe = getBuiltInRecipe(Preset.BALANCED);
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

test('unknown part sequences are empty', () => {
    assertDeepEqual(buildPartSequence('nope', getBuiltInRecipe(Preset.BALANCED)), []);
});

test('hover activity requires the toggle and a visible transform', () => {
    const recipe = getBuiltInRecipe(Preset.BALANCED);
    assertEqual(hoverIsActive(recipe), true);
    recipe.hover.scale = 1;
    recipe.hover.lift = 0;
    assertEqual(hoverIsActive(recipe), false);
    recipe.hover.lift = 3;
    assertEqual(hoverIsActive(recipe), true);
    recipe.hover.enabled = false;
    assertEqual(hoverIsActive(recipe), false);
});

test('the attention sequence plays one cycle and pauses', () => {
    assertDeepEqual(buildPartSequence('attention', getBuiltInRecipe(Preset.SUBTLE)), [
        DemoPhase.ATTENTION,
        DemoPhase.REMINDER_PAUSE,
    ]);
});
