export const Preset = {
    SUBTLE: 'subtle',
    BALANCED: 'balanced', // Lively in the preferences window
    EXPRESSIVE: 'expressive',
    CUSTOM: 'custom',
};

export const LaunchEffect = {
    PULSE: 'pulse',
    BOUNCE: 'bounce',
    STRETCH: 'stretch',
    STOCK: 'stock',
};

export const AttentionEffect = {
    PULSE: 'pulse',
    BOUNCE: 'bounce',
    STRETCH: 'stretch',
    WIGGLE: 'wiggle',
};

export const PressMode = {
    LAUNCHES_ONLY: 'launches-only',
    ALL_PRIMARY_CLICKS: 'all-primary-clicks',
};

export const PressEffect = {
    SQUASH: 'squash',
    DIM: 'dim',
};

export const Easing = {
    LINEAR: 'linear',
    EASE_OUT_QUAD: 'ease-out-quad',
    EASE_OUT_CUBIC: 'ease-out-cubic',
    EASE_OUT_BACK: 'ease-out-back',
    // Launch segments only; the hover easing row lists the four above.
    EASE_IN_QUAD: 'ease-in-quad',
};

const ANIMATION_MODE_NAMES = {
    [Easing.LINEAR]: 'LINEAR',
    [Easing.EASE_IN_QUAD]: 'EASE_IN_QUAD',
    [Easing.EASE_OUT_QUAD]: 'EASE_OUT_QUAD',
    [Easing.EASE_OUT_CUBIC]: 'EASE_OUT_CUBIC',
    [Easing.EASE_OUT_BACK]: 'EASE_OUT_BACK',
};

// modes is Clutter.AnimationMode; the prefs process has no Clutter.
export function resolveAnimationMode(easing, modes) {
    return modes[ANIMATION_MODE_NAMES[easing]];
}

export const ScreenEdge = {
    BOTTOM: 'bottom',
    TOP: 'top',
    LEFT: 'left',
    RIGHT: 'right',
};

export const DockState = {
    SHOWN: 'shown',
    HIDDEN: 'hidden',
    MOVING: 'moving',
};

export const AttentionPlay = {
    STOP: 'stop',
    WAIT: 'wait',       // try again at the next reminder
    SETTLE: 'settle',   // wait for the dock to stop moving
    IN_PLACE: 'in-place',
    PEEK: 'peek',
};

// The four parts of a recipe; the values index a recipe object.
export const RecipePart = {
    HOVER: 'hover',
    PRESS: 'press',
    LAUNCH: 'launch',
    ATTENTION: 'attention',
};

// The gschema ranges mirror these bounds; keep them in sync.
export const NeighborRadius = {MIN: 1, MAX: 3};
export const AttentionCycles = {MIN: 1, MAX: 10};
export const AttentionCyclePause = {MIN: 0, MAX: 1000};
export const AttentionInterval = {MIN: 2, MAX: 60};
export const AttentionReminders = {MIN: 1, MAX: 30};

export const DEFAULT_PRESET = Preset.SUBTLE;

const COMMON_LAUNCH = {
    enabled: true,
    repeat: true,
    softenRepeats: true,
    repeatPause: 0,
    bounceDecay: 0,
    pulseCount: 2,
    stretchElasticity: 0.70,
};

const COMMON_ATTENTION = {
    enabled: true,
    peekWhenHidden: true,
};

const BUILTIN_RECIPES = {
    [Preset.SUBTLE]: {
        id: Preset.SUBTLE,
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
        attention: {
            ...COMMON_ATTENTION,
            effect: AttentionEffect.WIGGLE,
            intensity: 0.5,
            speed: 0.60,
            cycles: 3,
            cyclePause: 120,
            interval: 5,
            reminders: 5,
        },
    },
    [Preset.BALANCED]: {
        id: Preset.BALANCED,
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
        attention: {
            ...COMMON_ATTENTION,
            effect: AttentionEffect.PULSE,
            intensity: 0.5,
            speed: 0.70,
            cycles: 3,
            cyclePause: 120,
            interval: 5,
            reminders: 10,
        },
    },
    [Preset.EXPRESSIVE]: {
        id: Preset.EXPRESSIVE,
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
        attention: {
            ...COMMON_ATTENTION,
            effect: AttentionEffect.BOUNCE,
            intensity: 0.45,
            speed: 0.60,
            cycles: 3,
            cyclePause: 120,
            interval: 3,
            reminders: 15,
        },
    },
};

export function getBuiltInRecipe(preset) {
    return JSON.parse(JSON.stringify(BUILTIN_RECIPES[preset]));
}
