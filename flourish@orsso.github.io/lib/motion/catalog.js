export const Profile = Object.freeze({
    SUBTLE: 'subtle',
    BALANCED: 'balanced',
    EXPRESSIVE: 'expressive',
    CUSTOM: 'custom',
});

export const LaunchEffect = Object.freeze({
    PULSE: 'pulse',
    BOUNCE: 'bounce',
    STRETCH: 'stretch',
    STOCK: 'stock',
});

export const PressMode = Object.freeze({
    LAUNCHES_ONLY: 'launches-only',
    ALL_PRIMARY_CLICKS: 'all-primary-clicks',
});

export const PressEffect = Object.freeze({
    SQUASH: 'squash',
    DIM: 'dim',
});

export const Easing = Object.freeze({
    LINEAR: 'linear',
    EASE_OUT_QUAD: 'ease-out-quad',
    EASE_OUT_CUBIC: 'ease-out-cubic',
    EASE_OUT_BACK: 'ease-out-back',
});

// Internal segment easing, kept out of Easing so the user-facing choices
// stay the four selectable modes.
export const EASE_IN_QUAD = 'ease-in-quad';

export const DockPosition = Object.freeze({
    BOTTOM: 'bottom',
    TOP: 'top',
    LEFT: 'left',
    RIGHT: 'right',
});

// The gschema range mirrors these bounds; keep them in sync.
export const NeighborRadius = Object.freeze({MIN: 1, MAX: 3});

export const DEFAULT_PROFILE = Profile.SUBTLE;

const COMMON_LAUNCH = Object.freeze({
    enabled: true,
    repeat: true,
    softenRepeats: true,
    repeatPause: 0,
    bounceDecay: 0,
    pulseCount: 2,
    stretchElasticity: 0.70,
});

const BUILTIN_RECIPES = deepFreeze({
    // Hover stays off in Subtle; the values are ready if the user turns it on.
    [Profile.SUBTLE]: {
        id: Profile.SUBTLE,
        hover: {
            enabled: false,
            scale: 1.10,
            lift: 0,
            duration: 190,
            easing: Easing.EASE_OUT_CUBIC,
            neighborScale: 1,
            neighborRadius: 1,
        },
        press: {
            enabled: true,
            mode: PressMode.ALL_PRIMARY_CLICKS,
            effect: PressEffect.DIM,
            intensity: 0.35,
            duration: 130,
        },
        launch: {
            ...COMMON_LAUNCH,
            effect: LaunchEffect.BOUNCE,
            intensity: 0.35,
            speed: 0.55,
            repeatPause: 400,
            maxDuration: 8000,
        },
    },
    [Profile.BALANCED]: {
        id: Profile.BALANCED,
        hover: {
            enabled: true,
            scale: 1.10,
            lift: 0,
            duration: 190,
            easing: Easing.EASE_OUT_CUBIC,
            neighborScale: 1,
            neighborRadius: 1,
        },
        press: {
            enabled: true,
            mode: PressMode.LAUNCHES_ONLY,
            effect: PressEffect.SQUASH,
            intensity: 0.35,
            duration: 130,
        },
        launch: {
            ...COMMON_LAUNCH,
            effect: LaunchEffect.PULSE,
            intensity: 0.35,
            speed: 0.65,
            maxDuration: 8000,
        },
    },
    [Profile.EXPRESSIVE]: {
        id: Profile.EXPRESSIVE,
        hover: {
            enabled: true,
            scale: 1.22,
            lift: 5,
            duration: 280,
            easing: Easing.EASE_OUT_BACK,
            neighborScale: 1.08,
            neighborRadius: 2,
        },
        press: {
            enabled: true,
            mode: PressMode.ALL_PRIMARY_CLICKS,
            effect: PressEffect.SQUASH,
            intensity: 0.85,
            duration: 170,
        },
        launch: {
            ...COMMON_LAUNCH,
            effect: LaunchEffect.STRETCH,
            intensity: 0.85,
            speed: 0.60,
            maxDuration: 10000,
        },
    },
});

export const CUSTOM_DEFAULTS = deepFreeze(clone(BUILTIN_RECIPES[DEFAULT_PROFILE]));

export function isBuiltInProfile(profile) {
    return Object.hasOwn(BUILTIN_RECIPES, profile);
}

export function getBuiltInRecipe(profile) {
    const selected = isBuiltInProfile(profile) ? profile : DEFAULT_PROFILE;
    return clone(BUILTIN_RECIPES[selected]);
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
    for (const child of Object.values(value)) {
        if (child && typeof child === 'object')
            deepFreeze(child);
    }
    return Object.freeze(value);
}
