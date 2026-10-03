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
    CLICKS_ONLY: 'clicks-only',
    LAUNCHES_ONLY: 'launches-only',
    CLICKS_AND_LAUNCHES: 'all-primary-clicks', // 1.1 nick, kept for saved settings
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

// modes is Clutter.AnimationMode, or Adw.Easing in the prefs process.
export function resolveAnimationMode(easing, modes) {
    return modes[ANIMATION_MODE_NAMES[easing]];
}

// The same curves sampled by hand; the wave envelope has no Clutter transition.
export function easingProgress(easing, t) {
    const u = t < 0 ? 0 : t > 1 ? 1 : t;
    switch (easing) {
        case Easing.EASE_IN_QUAD:
            return u * u;
        case Easing.EASE_OUT_QUAD:
            return 1 - (1 - u) * (1 - u);
        case Easing.EASE_OUT_CUBIC:
            return 1 - (1 - u) * (1 - u) * (1 - u);
        case Easing.EASE_OUT_BACK: {
            const c1 = 1.70158;
            const c3 = c1 + 1;
            const v = u - 1;
            return 1 + c3 * v * v * v + c1 * v * v;
        }
        default:
            return u;
    }
}

// A value eased over time by hand; a back-eased fall never dips below its target.
export function sampleRamp({start, from, to, duration, easing}, now) {
    if (duration <= 0 || from === to)
        return to;
    const t = (now - start) / duration;
    if (t >= 1)
        return to;
    const value = from + (to - from) * easingProgress(easing, t);
    return to < from ? Math.max(to, value) : value;
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
export const Reach = {MIN: 1, MAX: 3};
export const AttentionCycles = {MIN: 1, MAX: 10};
export const AttentionCyclePause = {MIN: 0, MAX: 1000};
export const AttentionInterval = {MIN: 2, MAX: 60};
export const AttentionReminders = {MIN: 1, MAX: 30};

export const DEFAULT_PRESET = Preset.SUBTLE;

// Ubuntu Dock is Ubuntu's build of Dash to Dock.
export const DASH_TO_DOCK_BUILDS = ['dash-to-dock@micxgx.gmail.com', 'ubuntu-dock@ubuntu.com'];

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
            enabled: true,
            scale: 1.04,
            lift: 0,
            duration: 160,
            easing: Easing.EASE_OUT_CUBIC,
            reach: 1,
            dynamicSpacing: false,
        },
        press: {
            enabled: true,
            mode: PressMode.CLICKS_ONLY,
            effect: PressEffect.DIM,
            intensity: 0.35,
            duration: 100,
        },
        launch: {
            ...COMMON_LAUNCH,
            effect: LaunchEffect.PULSE,
            intensity: 0.50,
            speed: 0.65,
            repeat: false,
            repeatPause: 400,
            maxDuration: 8000,
        },
        attention: {
            ...COMMON_ATTENTION,
            effect: AttentionEffect.PULSE,
            intensity: 0.25,
            speed: 0.60,
            cycles: 1,
            cyclePause: 120,
            interval: 10,
            reminders: 3,
            peekWhenHidden: false,
        },
    },
    [Preset.BALANCED]: {
        id: Preset.BALANCED,
        hover: {
            enabled: true,
            scale: 1.12,
            lift: 3,
            duration: 180,
            easing: Easing.EASE_OUT_CUBIC,
            reach: 2,
            dynamicSpacing: false,
        },
        press: {
            enabled: true,
            mode: PressMode.CLICKS_ONLY,
            effect: PressEffect.SQUASH,
            intensity: 0.25,
            duration: 120,
        },
        launch: {
            ...COMMON_LAUNCH,
            effect: LaunchEffect.STRETCH,
            intensity: 0.70,
            speed: 0.60,
            repeatPause: 400,
            maxDuration: 8000,
        },
        attention: {
            ...COMMON_ATTENTION,
            effect: AttentionEffect.PULSE,
            intensity: 0.40,
            speed: 0.70,
            cycles: 2,
            cyclePause: 120,
            interval: 8,
            reminders: 5,
        },
    },
    [Preset.EXPRESSIVE]: {
        id: Preset.EXPRESSIVE,
        hover: {
            enabled: true,
            scale: 1.50,
            lift: 10,
            duration: 280,
            easing: Easing.EASE_OUT_CUBIC,
            reach: 3,
            dynamicSpacing: true,
        },
        press: {
            enabled: true,
            mode: PressMode.CLICKS_AND_LAUNCHES,
            effect: PressEffect.DIM,
            intensity: 1.0,
            duration: 80,
        },
        launch: {
            ...COMMON_LAUNCH,
            effect: LaunchEffect.BOUNCE,
            intensity: 0.60,
            speed: 0.65,
            repeatPause: 300,
            maxDuration: 8000,
        },
        attention: {
            ...COMMON_ATTENTION,
            effect: AttentionEffect.BOUNCE,
            intensity: 0.55,
            speed: 0.60,
            cycles: 2,
            cyclePause: 120,
            interval: 6,
            reminders: 5,
        },
    },
};

export function getBuiltInRecipe(preset) {
    return JSON.parse(JSON.stringify(BUILTIN_RECIPES[preset]));
}
