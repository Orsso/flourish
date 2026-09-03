import Clutter from 'gi://Clutter';

import {resolveAnimationMode} from '../motion/catalog.js';
import {getOrientation} from '../motion/transforms.js';

export const OPAQUE = 255;
const RETREAT_DURATION = 180;
const RETREAT_SHRINK = 0.85;

// A clone on the stage that moves in place of an icon.
export function createIconClone(source, geometry, parent, {
    pivot = [0.5, 0.5],
    scale = {x: 1, y: 1},
    translation = {x: 0, y: 0},
    opacity = OPAQUE,
} = {}) {
    const clone = new Clutter.Clone({
        source,
        reactive: false,
        ...geometry,
        opacity,
    });
    clone.set_pivot_point(...pivot);
    clone.set_scale(scale.x, scale.y);
    clone.translation_x = translation.x;
    clone.translation_y = translation.y;
    parent.add_child(clone);
    return clone;
}

// blend mixes a fading magnification into every segment.
export function runSegments(clone, segments, {
    blend = () => ({magnify: 1, liftX: 0, liftY: 0}),
    isCancelled = () => false,
    onComplete = () => {},
}, index = 0) {
    if (isCancelled())
        return;
    if (index >= segments.length) {
        onComplete();
        return;
    }

    const segment = segments[index];
    const {magnify, liftX, liftY} = blend();
    clone.ease({
        scale_x: magnify * segment.scaleX,
        scale_y: magnify * segment.scaleY,
        translation_x: segment.translationX + liftX,
        translation_y: segment.translationY + liftY,
        duration: segment.duration,
        mode: resolveAnimationMode(segment.easing, Clutter.AnimationMode),
        onComplete: () => runSegments(
            clone, segments, {blend, isCancelled, onComplete}, index + 1),
    });
}

export function retreatClone(clone, edge, {
    momentum = false,
    duration = RETREAT_DURATION,
    onComplete = () => {},
} = {}) {
    const {outward} = getOrientation(edge);
    const [width, height] = clone.get_transformed_size();
    clone.ease({
        translation_x: clone.translation_x - outward[0] * width,
        translation_y: clone.translation_y - outward[1] * height,
        scale_x: clone.scale_x * RETREAT_SHRINK,
        scale_y: clone.scale_y * RETREAT_SHRINK,
        opacity: 0,
        duration,
        mode: momentum
            ? Clutter.AnimationMode.EASE_OUT_QUAD
            : Clutter.AnimationMode.EASE_IN_QUAD,
        onComplete,
    });
}
