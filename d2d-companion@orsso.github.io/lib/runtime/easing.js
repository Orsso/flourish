import {EASE_IN_QUAD, Easing} from '../motion/catalog.js';

const MODE_NAMES = Object.freeze({
    [Easing.LINEAR]: 'LINEAR',
    [EASE_IN_QUAD]: 'EASE_IN_QUAD',
    [Easing.EASE_OUT_QUAD]: 'EASE_OUT_QUAD',
    [Easing.EASE_OUT_CUBIC]: 'EASE_OUT_CUBIC',
    [Easing.EASE_OUT_BACK]: 'EASE_OUT_BACK',
});

export function resolveAnimationMode(easing, modes) {
    const name = MODE_NAMES[easing] ?? 'EASE_OUT_CUBIC';
    return modes[name];
}
