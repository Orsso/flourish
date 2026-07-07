import {
    CUSTOM_DEFAULTS,
    DEFAULT_PROFILE,
    Easing,
    LaunchEffect,
    NeighborRadius,
    PressEffect,
    PressMode,
    Profile,
    getBuiltInRecipe,
    isBuiltInProfile,
} from './catalog.js';

const EASINGS = Object.values(Easing);
const EFFECTS = Object.values(LaunchEffect);
const PRESS_MODES = Object.values(PressMode);
const PRESS_EFFECTS = Object.values(PressEffect);

export function resolveRecipe(profile, customValues = CUSTOM_DEFAULTS) {
    if (isBuiltInProfile(profile))
        return getBuiltInRecipe(profile);
    if (profile !== Profile.CUSTOM)
        return getBuiltInRecipe(DEFAULT_PROFILE);

    const recipe = validateRecipe(customValues);
    recipe.id = Profile.CUSTOM;
    return recipe;
}

export function customValuesFromRecipe(recipe) {
    const custom = validateRecipe(recipe);
    delete custom.id;
    return custom;
}

export function validateRecipe(recipe = {}) {
    const fallback = getBuiltInRecipe(DEFAULT_PROFILE);
    const source = mergeRecipe(fallback, recipe);

    return {
        id: typeof source.id === 'string' ? source.id : Profile.CUSTOM,
        hover: {
            enabled: boolean(source.hover.enabled, fallback.hover.enabled),
            scale: clamp(source.hover.scale, 1, 1.30, fallback.hover.scale),
            lift: integer(source.hover.lift, 0, 12, fallback.hover.lift),
            duration: integer(source.hover.duration, 50, 500, fallback.hover.duration),
            easing: member(source.hover.easing, EASINGS, fallback.hover.easing),
            neighborScale: clamp(
                source.hover.neighborScale, 1, 1.15, fallback.hover.neighborScale),
            neighborRadius: integer(
                source.hover.neighborRadius, NeighborRadius.MIN,
                NeighborRadius.MAX, fallback.hover.neighborRadius),
        },
        press: {
            enabled: boolean(source.press.enabled, fallback.press.enabled),
            mode: member(source.press.mode, PRESS_MODES, fallback.press.mode),
            effect: member(source.press.effect, PRESS_EFFECTS, fallback.press.effect),
            intensity: clamp(source.press.intensity, 0, 1, fallback.press.intensity),
            duration: integer(source.press.duration, 50, 300, fallback.press.duration),
        },
        launch: {
            enabled: boolean(source.launch.enabled, fallback.launch.enabled),
            effect: member(source.launch.effect, EFFECTS, fallback.launch.effect),
            intensity: clamp(source.launch.intensity, 0, 1, fallback.launch.intensity),
            speed: clamp(source.launch.speed, 0.50, 2, fallback.launch.speed),
            repeat: boolean(source.launch.repeat, fallback.launch.repeat),
            softenRepeats: boolean(
                source.launch.softenRepeats, fallback.launch.softenRepeats),
            repeatPause: integer(
                source.launch.repeatPause, 0, 1000, fallback.launch.repeatPause),
            maxDuration: integer(
                source.launch.maxDuration, 500, 15000, fallback.launch.maxDuration),
            bounceDecay: clamp(
                source.launch.bounceDecay, 0, 1, fallback.launch.bounceDecay),
            pulseCount: integer(
                source.launch.pulseCount, 1, 4, fallback.launch.pulseCount),
            stretchElasticity: clamp(
                source.launch.stretchElasticity, 0, 1,
                fallback.launch.stretchElasticity),
        },
    };
}

function mergeRecipe(fallback, recipe) {
    return {
        ...fallback,
        ...recipe,
        hover: {...fallback.hover, ...recipe.hover},
        press: {...fallback.press, ...recipe.press},
        launch: {...fallback.launch, ...recipe.launch},
    };
}

function member(value, values, fallback) {
    return values.includes(value) ? value : fallback;
}

function boolean(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
}

function clamp(value, minimum, maximum, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number))
        return fallback;
    return Math.min(maximum, Math.max(minimum, number));
}

function integer(value, minimum, maximum, fallback) {
    return Math.round(clamp(value, minimum, maximum, fallback));
}
