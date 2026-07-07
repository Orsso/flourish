import {Easing} from '../flourish@orsso.github.io/lib/motion/catalog.js';
import {interpolateTransform} from '../flourish@orsso.github.io/lib/motion/transforms.js';
import {resolveAnimationMode} from '../flourish@orsso.github.io/lib/runtime/easing.js';

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
    assertEqual(resolveAnimationMode('unknown', modes), modes.EASE_OUT_CUBIC);
});

test('shared transform interpolation covers scale and translation', () => {
    const from = {scaleX: 1, scaleY: 1, translationX: 0, translationY: 0};
    const to = {scaleX: 2, scaleY: 0.5, translationX: 8, translationY: -4};
    assertDeepEqual(interpolateTransform(from, to, 0.5), {
        scaleX: 1.5,
        scaleY: 0.75,
        translationX: 4,
        translationY: -2,
    });
});
