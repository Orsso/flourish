import {
    AttentionEffect,
    AttentionPlay,
    DockState,
    Easing,
    LaunchEffect,
    PressEffect,
    PressMode,
    ScreenEdge,
    easingProgress,
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
    return ORIENTATIONS[edge];
}

export function getLaunchPivot(effect, edge) {
    return effect === LaunchEffect.PULSE
        ? [0.5, 0.5]
        : getOrientation(edge).pivot;
}

const PRESS_SQUASH_FACTOR = 0.22;
const PRESS_DIM_FACTOR = 0.60;

const PRESS_EFFECTS = {
    [PressEffect.SQUASH]: (intensity, {horizontal}) => {
        const normalScale = 1 - PRESS_SQUASH_FACTOR * intensity;
        return {
            scaleX: horizontal ? 1 : normalScale,
            scaleY: horizontal ? normalScale : 1,
            dim: 0,
        };
    },
    [PressEffect.DIM]: intensity =>
        ({scaleX: 1, scaleY: 1, dim: PRESS_DIM_FACTOR * intensity}),
};

export function resolvePressTransform(effect, intensity, orientation) {
    const build = PRESS_EFFECTS[effect];
    // An ease-out-back press ramp overshoots past full intensity.
    return build(Math.min(1, intensity), orientation);
}

// Whether a primary click presses the icon; launching is known at button press.
export function pressStarts({enabled, mode}, launching) {
    return enabled && mode !== PressMode.LAUNCHES_ONLY &&
        (mode === PressMode.CLICKS_AND_LAUNCHES || !launching);
}

export function buildLaunchPressSegments(press, edge, pressLevel = 0) {
    if (!press.enabled)
        return [];
    const easing = Easing.EASE_OUT_CUBIC;
    const release = segment({duration: press.duration, easing});
    if (press.mode !== PressMode.LAUNCHES_ONLY)
        return pressLevel > 0 ? [release] : [];
    const transform = resolvePressTransform(
        press.effect, press.intensity, getOrientation(edge));
    return [
        segment({...transform, duration: Math.round(press.duration / 2), easing}),
        release,
    ];
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
        translationX: orientation.outward[0] * lift,
        translationY: orientation.outward[1] * lift,
        dim: press.dim,
        pivot: orientation.pivot,
    };
}

const MIN_SECONDARY_BOUNCE_PX = 3;

export function resolveIconTransform({
    edge = ScreenEdge.BOTTOM,
    recipe,
    hoverLevel = 0,
    pressLevel = 0,
    overlaid = false,
    animationsEnabled = true,
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

    const hoverEnabled = recipe.hover.enabled && !overlaid;
    const level = hoverEnabled ? hoverLevel : 0;
    const pressIntensity = recipe.press.enabled
        ? recipe.press.intensity * pressLevel
        : 0;

    return composeIconTransform({
        edge,
        hoverScale: 1 + (recipe.hover.scale - 1) * level,
        lift: recipe.hover.lift * level,
        pressIntensity,
        pressEffect: recipe.press.effect,
    });
}

export function rectScale(rect, base) {
    return {
        x: base.width > 0 ? rect.width / base.width : 1,
        y: base.height > 0 ? rect.height / base.height : 1,
    };
}

export function pivotOffset(rect, base, pivot) {
    const [pivotX, pivotY] = pivot;
    return {
        x: (rect.x + pivotX * rect.width) -
            (base.x + pivotX * base.width),
        y: (rect.y + pivotY * rect.height) -
            (base.y + pivotY * base.height),
    };
}

export function buildLaunchSegments(effect, launch, edge, cycleIndex = 0) {
    const orientation = getOrientation(edge);
    const {intensity, speed} = launch;
    const cycleScale = launch.softenRepeats ? 0.85 ** cycleIndex : 1;

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

// Same amplitude as the Dash to Dock wiggle at intensity 0.5.
const WIGGLE_BASE_DEGREES = 6;
const WIGGLE_RANGE_DEGREES = 18;

export function wiggleSegments(intensity, speed) {
    const amplitude = WIGGLE_BASE_DEGREES + WIGGLE_RANGE_DEGREES * intensity;
    const swing = (rotation, base) => segment({
        duration: duration(base, speed),
        easing: Easing.EASE_OUT_QUAD,
        rotation,
    });
    return [
        swing(amplitude, 100),
        swing(-amplitude, 200),
        swing(amplitude, 200),
        swing(-amplitude, 200),
        swing(0, 100),
    ];
}

// The attention effects keep a fixed shape. Repetition comes from cycles.
const ATTENTION_SHAPE = {pulseCount: 1, bounceDecay: 0, stretchElasticity: 0.70};

// A full-speed cycle lasts ATTENTION_CYCLE_MS; the table holds each effect's natural length.
export const ATTENTION_CYCLE_MS = 360;
const ATTENTION_BASE_CYCLE_MS = {
    [AttentionEffect.PULSE]: 380,
    [AttentionEffect.BOUNCE]: 360,
    [AttentionEffect.STRETCH]: 720,
    [AttentionEffect.WIGGLE]: 800,
};

export const ATTENTION_SLIDE_DURATION = 280;

export function attentionPeriod({segments, cycles, cyclePause, interval}) {
    return cycles * launchDuration(segments) +
        (cycles - 1) * cyclePause +
        2 * ATTENTION_SLIDE_DURATION +
        interval * 1000;
}

export function buildAttentionSegments(recipe, edge) {
    const {attention} = recipe;
    const orientation = getOrientation(edge);
    const {effect, intensity} = attention;
    const speed = attention.speed * ATTENTION_BASE_CYCLE_MS[effect] / ATTENTION_CYCLE_MS;

    switch (effect) {
        case AttentionEffect.PULSE:
            return pulseSegments(ATTENTION_SHAPE, intensity, speed);
        case AttentionEffect.STRETCH:
            return stretchSegments(ATTENTION_SHAPE, orientation, intensity, speed);
        case AttentionEffect.WIGGLE:
            return wiggleSegments(intensity, speed);
        case AttentionEffect.BOUNCE:
        default:
            return bounceSegments(ATTENTION_SHAPE, orientation, intensity, speed);
    }
}

export function getAttentionPivot(effect, edge) {
    return effect === AttentionEffect.PULSE || effect === AttentionEffect.WIGGLE
        ? [0.5, 0.5]
        : getOrientation(edge).pivot;
}

export function shouldPlayAttention({
    enabled,
    urgent,
    focused,
    dnd,
    animationsEnabled,
    iconAtRest,
    dockState,
    shownRectKnown,
    peekWhenHidden,
    fullscreen,
    peekInFullscreen,
    reminder,
    reminders,
}) {
    if (!enabled || !urgent || focused || reminder >= reminders)
        return AttentionPlay.STOP;
    if (dnd || !animationsEnabled)
        return AttentionPlay.WAIT;
    if (dockState !== DockState.SHOWN && dockState !== DockState.HIDDEN)
        return AttentionPlay.SETTLE;
    if (dockState === DockState.SHOWN)
        return iconAtRest ? AttentionPlay.IN_PLACE : AttentionPlay.WAIT;
    if (!iconAtRest)
        return AttentionPlay.WAIT;
    if (!peekWhenHidden || !shownRectKnown)
        return AttentionPlay.WAIT;
    if (fullscreen && !peekInFullscreen)
        return AttentionPlay.WAIT;
    return AttentionPlay.PEEK;
}

// Sessions of one app share the anchor, so their reminders stay in step.
export function nextReminderDelay({now, anchor, period}) {
    const elapsed = Math.max(0, now - anchor);
    const remainder = elapsed % period;
    return remainder === 0 ? period : period - remainder;
}

export function shouldRepeatLaunch({
    wasLaunching,
    startupNotify = null,
    appRunning,
    repeat,
    elapsed,
    maxDuration,
}) {
    return wasLaunching && startupNotify !== 'false' && repeat && !appRunning && elapsed < maxDuration;
}

export function shouldRetreatOnHandoff({
    targetMapped,
    dockShown = true,
    overviewVisible,
    overviewVisibleTarget,
    dashContainsTarget,
}) {
    // A dock can be Main.overview.dash; membership only counts while the overview closes.
    if (!targetMapped || !dockShown)
        return true;
    return overviewVisible && !overviewVisibleTarget && dashContainsTarget;
}

// Half a pixel absorbs the rounding of transformed positions.
const EDGE_TOLERANCE = 0.5;

export function dockVisibilityState(rect, monitor, edge) {
    switch (edge) {
        case ScreenEdge.TOP: {
            if (rect.y + rect.height <= monitor.y + EDGE_TOLERANCE)
                return DockState.HIDDEN;
            return rect.y >= monitor.y - EDGE_TOLERANCE
                ? DockState.SHOWN : DockState.MOVING;
        }
        case ScreenEdge.LEFT: {
            if (rect.x + rect.width <= monitor.x + EDGE_TOLERANCE)
                return DockState.HIDDEN;
            return rect.x >= monitor.x - EDGE_TOLERANCE
                ? DockState.SHOWN : DockState.MOVING;
        }
        case ScreenEdge.RIGHT: {
            const right = monitor.x + monitor.width;
            if (rect.x >= right - EDGE_TOLERANCE)
                return DockState.HIDDEN;
            return rect.x + rect.width <= right + EDGE_TOLERANCE
                ? DockState.SHOWN : DockState.MOVING;
        }
        case ScreenEdge.BOTTOM:
        default: {
            const bottom = monitor.y + monitor.height;
            if (rect.y >= bottom - EDGE_TOLERANCE)
                return DockState.HIDDEN;
            return rect.y + rect.height <= bottom + EDGE_TOLERANCE
                ? DockState.SHOWN : DockState.MOVING;
        }
    }
}

// Hiding moves the dock along the edge normal only; the other axis stays live.
export function projectIconRect(shownRect, slidRect, iconRect, edge) {
    const {normalAxis} = getOrientation(edge);
    return {
        ...iconRect,
        [normalAxis]: shownRect[normalAxis] +
            (iconRect[normalAxis] - slidRect[normalAxis]),
    };
}

// A launch clone stays where the icon sits with the dock out.
export function launchIconRect(iconRect, {shownRect, slidRect, edge}) {
    if (!shownRect || !slidRect)
        return iconRect;
    return projectIconRect(shownRect, slidRect, iconRect, edge);
}

export function launchDuration(segments) {
    return segments.reduce((total, item) => total + item.duration, 0);
}

export function sampleLaunchSegments(segments, elapsed, initial = null) {
    const identity = {
        scaleX: 1,
        scaleY: 1,
        translationX: 0,
        translationY: 0,
        rotation: 0,
        dim: 0,
    };
    let previous = initial ?? identity;
    let remaining = Math.max(0, elapsed);

    for (const item of segments) {
        if (remaining <= item.duration) {
            const progress = item.duration === 0 ? 1 : remaining / item.duration;
            return interpolateTransform(previous, item, easingProgress(item.easing, progress));
        }
        remaining -= item.duration;
        previous = transformFromSegment(item);
    }
    return previous;
}

function pulseSegments(part, intensity, speed) {
    const count = part.pulseCount;
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

function bounceSegments(part, orientation, intensity, speed) {
    const height = (12 + 36 * intensity);
    const decay = part.bounceDecay;
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

function stretchSegments(part, orientation, intensity, speed) {
    const elasticity = part.stretchElasticity;
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
    rotation = 0,
    dim = 0,
}) {
    return {
        duration: segmentDuration,
        easing,
        scaleX,
        scaleY,
        translationX,
        translationY,
        rotation,
        dim,
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
        rotation: item.rotation,
        dim: item.dim,
    };
}

export function interpolateTransform(from, to, progress) {
    return {
        scaleX: interpolate(from.scaleX, to.scaleX, progress),
        scaleY: interpolate(from.scaleY, to.scaleY, progress),
        translationX: interpolate(from.translationX, to.translationX, progress),
        translationY: interpolate(from.translationY, to.translationY, progress),
        rotation: interpolate(from.rotation ?? 0, to.rotation ?? 0, progress),
        dim: interpolate(from.dim ?? 0, to.dim ?? 0, progress),
    };
}

function interpolate(from, to, progress) {
    return from + (to - from) * progress;
}
