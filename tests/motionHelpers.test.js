import {Easing, resolveAnimationMode} from '../flourish@orsso.github.io/lib/motion/catalog.js';
import {interpolateTransform} from '../flourish@orsso.github.io/lib/motion/transforms.js';
import {runSegments} from '../flourish@orsso.github.io/lib/runtime/iconClone.js';

const modes = {
    LINEAR: 1,
    EASE_IN_QUAD: 2,
    EASE_OUT_QUAD: 3,
    EASE_OUT_CUBIC: 4,
    EASE_OUT_BACK: 5,
};

test('runtime easing names resolve against the supplied animation modes', () => {
    assertEqual(resolveAnimationMode(Easing.LINEAR, modes), modes.LINEAR);
    assertEqual(resolveAnimationMode('ease-in-quad', modes), modes.EASE_IN_QUAD);
    assertEqual(resolveAnimationMode(Easing.EASE_OUT_BACK, modes), modes.EASE_OUT_BACK);
});

test('shared segments animate dim and stop chaining after cancellation', () => {
    const calls = [];
    const dimCalls = [];
    const frame = {get_effect: () => ({}), remove_transition() {}, remove_effect() {},
        ease_property(property, value, animation) { dimCalls.push({property, value, ...animation}); }};
    const clone = {get_parent: () => frame, ease(params) { calls.push(params); }};
    let completed = false;
    let cancelled = false;
    const segment = {scaleX: 1, scaleY: 1, translationX: 0, translationY: 0,
        dim: 0.3, duration: 200, easing: Easing.EASE_OUT_CUBIC};
    runSegments(clone, [segment, {...segment, dim: 0}], {
        isCancelled: () => cancelled,
        onComplete: () => { completed = true; },
    });
    assertEqual(calls.length, 1);
    assertEqual(dimCalls[0].value, 0.3);
    assertEqual(calls[0].opacity, undefined);
    assertEqual(calls[0].duration, 200);
    calls[0].onComplete();
    assertEqual(calls.length, 2);
    assertEqual(dimCalls[1].value, 0);
    cancelled = true;
    calls[1].onComplete();
    assertEqual(completed, false);
});

test('shared transform interpolation covers scale and translation', () => {
    const from = {scaleX: 1, scaleY: 1, translationX: 0, translationY: 0};
    const to = {scaleX: 2, scaleY: 0.5, translationX: 8, translationY: -4};
    assertDeepEqual(interpolateTransform(from, to, 0.5), {
        scaleX: 1.5,
        scaleY: 0.75,
        translationX: 4,
        translationY: -2,
        rotation: 0,
        dim: 0,
    });
});
