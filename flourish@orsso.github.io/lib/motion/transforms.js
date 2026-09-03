import {
    Easing,
    LaunchEffect,
    PressEffect,
    ScreenEdge,
} from './catalog.js';

const ORIENTATIONS = {
    [ScreenEdge.BOTTOM]: {
        horizontal: true,
        normalAxis: 'y',
        tangentAxis: 'x',
        pivot: [0.5, 1],
        outward: [0, -1],
    },
    [ScreenEdge.TOP]: {
        horizontal: true,
        normalAxis: 'y',
        tangentAxis: 'x',
        pivot: [0.5, 0],
        outward: [0, 1],
    },
    [ScreenEdge.LEFT]: {
        horizontal: false,
        normalAxis: 'x',
        tangentAxis: 'y',
        pivot: [0, 0.5],
        outward: [1, 0],
    },
    [ScreenEdge.RIGHT]: {
        horizontal: false,
        normalAxis: 'x',
        tangentAxis: 'y',
        pivot: [1, 0.5],
        outward: [-1, 0],
    },
};

export function getOrientation(edge) {
    const orientation = ORIENTATIONS[edge];
    return {
        horizontal: orientation.horizontal,
        normalAxis: orientation.normalAxis,
        tangentAxis: orientation.tangentAxis,
        pivot: [...orientation.pivot],
        outward: [...orientation.outward],
    };
}

export function getLaunchPivot(effect, edge) {
    return effect === LaunchEffect.PULSE
        ? [0.5, 0.5]
        : getOrientation(edge).pivot;
}

const PRESS_SQUASH_FACTOR = 0.22;
const PRESS_DIM_FACTOR = 0.30;

const PRESS_EFFECTS = {
    [PressEffect.SQUASH]: (intensity, orientation) => {
        const normalScale = 1 - PRESS_SQUASH_FACTOR * intensity;
        return pressTransform({
            scaleX: orientation.horizontal ? 1 : normalScale,
            scaleY: orientation.horizontal ? normalScale : 1,
        });
    },
    [PressEffect.DIM]: intensity =>
        pressTransform({dim: PRESS_DIM_FACTOR * intensity}),
};

export function resolvePressTransform(effect, intensity, orientation) {
    const build = PRESS_EFFECTS[effect];
    return build(clamp(intensity, 0, 1), orientation);
}

export function dimOpacity(opacity, dim) {
    return Math.round(opacity * (1 - clamp(dim, 0, 1)));
}

function pressTransform({
    scaleX = 1,
    scaleY = 1,
    translationX = 0,
    translationY = 0,
    dim = 0,
} = {}) {
    return {scaleX, scaleY, translationX, translationY, dim};
}

export function composeIconTransform({
    edge = ScreenEdge.BOTTOM,
    hoverScale = 1,
    lift = 0,
    pressIntensity = 0,
    pressEffect = PressEffect.SQUASH,
} = {}) {
    const orientation = getOrientation(edge);
    const press = resolvePressTransform(pressEffect, pressIntensity, orientation);
    return {
        scaleX: hoverScale * press.scaleX,
        scaleY: hoverScale * press.scaleY,
        translationX:
            multiplyDistance(orientation.outward[0], lift) + press.translationX,
        translationY:
            multiplyDistance(orientation.outward[1], lift) + press.translationY,
        dim: press.dim,
        pivot: orientation.pivot,
    };
}

// EASE_OUT_BACK overshoots by about 10%.
export const OVERSHOOT_RESERVE = 0.1;
const MIN_SECONDARY_BOUNCE_PX = 3;

export function fitHoverToBudget(
    hoverScale, lift, iconNormalSize, budgetPx, overshoot = 0) {
    if (!(iconNormalSize > 0) || !Number.isFinite(budgetPx))
        return {hoverScale, lift};
    const budget = Math.max(0, budgetPx) / (1 + Math.max(0, overshoot));
    const scaleGrowth = iconNormalSize * Math.max(0, hoverScale - 1);
    const safeLift = Math.max(0, lift);
    const reach = scaleGrowth + safeLift;
    if (reach <= budget || reach === 0)
        return {hoverScale, lift};
    const factor = budget / reach;
    return {
        hoverScale: 1 + (scaleGrowth * factor) / iconNormalSize,
        lift: safeLift * factor,
    };
}

// Linear falloff from full neighbor scale to identity past the radius.
export function neighborScaleAt(hover, distance) {
    if (!(distance >= 1) || distance > hover.neighborRadius)
        return 1;
    const weight = (hover.neighborRadius - distance + 1) / hover.neighborRadius;
    return 1 + (hover.neighborScale - 1) * weight;
}

export function hoverNeedsBudget({
    recipe,
    hovered = false,
    launching = false,
    neighborDistance = Infinity,
}) {
    const {hover} = recipe;
    if (!hover.enabled || launching)
        return false;
    if (hovered)
        return hover.scale !== 1 || hover.lift !== 0;
    return neighborScaleAt(hover, neighborDistance) !== 1;
}

export function resolveIconTransform({
    edge = ScreenEdge.BOTTOM,
    recipe,
    hovered = false,
    neighborDistance = Infinity,
    pressed = false,
    launching = false,
    animationsEnabled = true,
    budgetPx = Infinity,
    iconNormalSize = 0,
}) {
    const orientation = getOrientation(edge);
    if (!animationsEnabled) {
        return {
            scaleX: 1,
            scaleY: 1,
            translationX: 0,
            translationY: 0,
            dim: 0,
            pivot: orientation.pivot,
        };
    }

    const hoverEnabled = recipe.hover.enabled && !launching;
    const hoverScale = hoverEnabled && hovered
        ? recipe.hover.scale
        : hoverEnabled
            ? neighborScaleAt(recipe.hover, neighborDistance)
            : 1;
    const lift = hoverEnabled && hovered ? recipe.hover.lift : 0;
    const pressIntensity = recipe.press.enabled && pressed
        ? recipe.press.intensity
        : 0;

    const overshoot =
        recipe.hover.easing === Easing.EASE_OUT_BACK ? OVERSHOOT_RESERVE : 0;
    const fitted = fitHoverToBudget(
        hoverScale, lift, iconNormalSize, budgetPx, overshoot);

    return composeIconTransform({
        edge,
        hoverScale: fitted.hoverScale,
        lift: fitted.lift,
        pressIntensity,
        pressEffect: recipe.press.effect,
    });
}

export function projectHoverTransform({
    edge = ScreenEdge.BOTTOM,
    recipe,
    hovered = false,
    neighborDistance = Infinity,
    progress = 1,
}) {
    const target = resolveIconTransform({
        edge,
        recipe,
        hovered,
        neighborDistance,
    });
    return {
        ...interpolateTransform({
            scaleX: 1,
            scaleY: 1,
            translationX: 0,
            translationY: 0,
        }, target, clamp(progress, 0, 1)),
        dim: 0,
        pivot: target.pivot,
    };
}

export function hoverIntroScale(visible, neutral) {
    return {
        x: neutral.width > 0 ? visible.width / neutral.width : 1,
        y: neutral.height > 0 ? visible.height / neutral.height : 1,
    };
}

export function hoverIntroLift(visible, neutral, pivot) {
    const [pivotX, pivotY] = pivot;
    return {
        x: (visible.x + pivotX * visible.width) -
            (neutral.x + pivotX * neutral.width),
        y: (visible.y + pivotY * visible.height) -
            (neutral.y + pivotY * neutral.height),
    };
}

export function buildLaunchSegments(effect, launch, edge, cycleIndex = 0) {
    const orientation = getOrientation(edge);
    const intensity = clamp(launch.intensity, 0, 1);
    const speed = clamp(launch.speed, 0.3, 1);
    const cycleScale = launch.softenRepeats === false
        ? 1
        : 0.85 ** Math.max(0, cycleIndex);

    switch (effect) {
        case LaunchEffect.PULSE:
            return pulseSegments(launch, intensity * cycleScale, speed);
        case LaunchEffect.STRETCH:
            return stretchSegments(launch, orientation, intensity * cycleScale, speed);
        case LaunchEffect.STOCK:
            return [];
        case LaunchEffect.BOUNCE:
        default:
            return bounceSegments(launch, orientation, intensity * cycleScale, speed);
    }
}

export function shouldRepeatLaunch({
    wasLaunching,
    appRunning,
    repeat,
    elapsed,
    maxDuration,
}) {
    return wasLaunching && repeat && !appRunning && elapsed < maxDuration;
}

export function shouldRetreatOnHandoff({
    targetMapped,
    overviewVisible,
    overviewVisibleTarget,
    dashContainsTarget,
}) {
    // A dock can be Main.overview.dash; membership only counts while the overview closes.
    if (!targetMapped)
        return true;
    return overviewVisible && !overviewVisibleTarget && dashContainsTarget;
}

export function launchDuration(segments) {
    return segments.reduce((total, item) => total + item.duration, 0);
}

export function sampleLaunchSegments(segments, elapsed) {
    const identity = {
        scaleX: 1,
        scaleY: 1,
        translationX: 0,
        translationY: 0,
    };
    let previous = identity;
    let remaining = Math.max(0, elapsed);

    for (const item of segments) {
        if (remaining <= item.duration) {
            const progress = item.duration === 0 ? 1 : remaining / item.duration;
            return interpolateTransform(previous, item, ease(item.easing, progress));
        }
        remaining -= item.duration;
        previous = transformFromSegment(item);
    }
    return previous;
}

function pulseSegments(launch, intensity, speed) {
    const count = Math.round(clamp(launch.pulseCount, 1, 4));
    const scale = 1 + 0.14 * intensity;
    const segments = [];
    for (let index = 0; index < count; index++) {
        segments.push(segment({
            duration: duration(170, speed),
            easing: Easing.EASE_OUT_CUBIC,
            scaleX: scale,
            scaleY: scale,
        }));
        segments.push(segment({
            duration: duration(210, speed),
            easing: Easing.EASE_OUT_QUAD,
        }));
    }
    return segments;
}

function bounceSegments(launch, orientation, intensity, speed) {
    const height = (12 + 36 * intensity);
    const decay = clamp(launch.bounceDecay, 0, 1);
    const segments = [];
    for (let index = 0; index < 3; index++) {
        const distance = height * decay ** index;
        if (index > 0 && distance < MIN_SECONDARY_BOUNCE_PX)
            break;
        segments.push(segment({
            duration: duration(150 - index * 20, speed),
            easing: Easing.EASE_OUT_QUAD,
            translationX: orientation.outward[0] * distance,
            translationY: orientation.outward[1] * distance,
        }));
        segments.push(segment({
            duration: duration(210 - index * 25, speed),
            easing: Easing.EASE_IN_QUAD,
        }));
    }
    return segments;
}

function stretchSegments(launch, orientation, intensity, speed) {
    const elasticity = clamp(launch.stretchElasticity, 0, 1);
    const tangentScale = 1 + 0.18 * intensity;
    const compressedScale = 1 - 0.25 * intensity;
    const extendedScale = 1 + (0.18 + 0.18 * elasticity) * intensity;
    const distance = (10 + 34 * intensity);

    return [
        orientedSegment(orientation, {
            duration: duration(100, speed),
            easing: Easing.EASE_OUT_QUAD,
            tangentScale,
            normalScale: compressedScale,
        }),
        orientedSegment(orientation, {
            duration: duration(220, speed),
            easing: Easing.EASE_OUT_BACK,
            tangentScale: 1 - 0.08 * intensity,
            normalScale: extendedScale,
            distance,
        }),
        orientedSegment(orientation, {
            duration: duration(210, speed),
            easing: Easing.EASE_OUT_BACK,
            tangentScale: 1 + 0.10 * intensity,
            normalScale: 1 - 0.08 * intensity,
        }),
        segment({
            duration: duration(190, speed),
            easing: Easing.EASE_OUT_CUBIC,
        }),
    ];
}

function orientedSegment(orientation, {
    duration: segmentDuration,
    easing,
    tangentScale,
    normalScale,
    distance = 0,
}) {
    return segment({
        duration: segmentDuration,
        easing,
        scaleX: orientation.horizontal ? tangentScale : normalScale,
        scaleY: orientation.horizontal ? normalScale : tangentScale,
        translationX: orientation.outward[0] * distance,
        translationY: orientation.outward[1] * distance,
    });
}

function segment({
    duration: segmentDuration,
    easing,
    scaleX = 1,
    scaleY = 1,
    translationX = 0,
    translationY = 0,
}) {
    return {
        duration: segmentDuration,
        easing,
        scaleX,
        scaleY,
        translationX,
        translationY,
    };
}

function duration(base, speed) {
    return Math.max(1, Math.round(base / speed));
}

function transformFromSegment(item) {
    return {
        scaleX: item.scaleX,
        scaleY: item.scaleY,
        translationX: item.translationX,
        translationY: item.translationY,
    };
}

export function interpolateTransform(from, to, progress) {
    return {
        scaleX: interpolate(from.scaleX, to.scaleX, progress),
        scaleY: interpolate(from.scaleY, to.scaleY, progress),
        translationX: interpolate(from.translationX, to.translationX, progress),
        translationY: interpolate(from.translationY, to.translationY, progress),
    };
}

function interpolate(from, to, progress) {
    return from + (to - from) * progress;
}

function ease(mode, progress) {
    const value = clamp(progress, 0, 1);
    switch (mode) {
        case Easing.LINEAR:
            return value;
        case Easing.EASE_OUT_QUAD:
            return 1 - (1 - value) ** 2;
        case Easing.EASE_IN_QUAD:
            return value ** 2;
        case Easing.EASE_OUT_BACK: {
            const overshoot = 1.70158;
            return 1 + (overshoot + 1) * (value - 1) ** 3 +
                overshoot * (value - 1) ** 2;
        }
        case Easing.EASE_OUT_CUBIC:
        default:
            return 1 - (1 - value) ** 3;
    }
}

function multiplyDistance(direction, distance) {
    return direction === 0 || distance === 0 ? 0 : direction * distance;
}

function clamp(value, minimum, maximum) {
    const number = Number(value);
    if (!Number.isFinite(number))
        return minimum;
    return Math.min(maximum, Math.max(minimum, number));
}
