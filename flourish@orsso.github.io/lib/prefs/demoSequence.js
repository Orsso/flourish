import {LaunchEffect, PressMode, RecipePart} from '../motion/catalog.js';
import {hoverActive} from '../motion/continuum.js';

export const DemoPhase = {
    HOVER_IN: 'hover-in',
    HOLD: 'hold',
    CLICK: 'click',
    PRE_LAUNCH_PAUSE: 'pre-launch-pause',
    CLICK_LAUNCH: 'click-launch',
    LAUNCH: 'launch',
    REPEAT_PAUSE: 'repeat-pause',
    SETTLE: 'settle',
    RESET: 'reset',
    NEUTRAL_HOLD: 'neutral-hold',
    ATTENTION: 'attention',
    REMINDER_PAUSE: 'reminder-pause',
};

// Phases that only wait.
export const PHASE_WAIT_MS = {
    [DemoPhase.HOLD]: 650,
    [DemoPhase.PRE_LAUNCH_PAUSE]: 520,
    [DemoPhase.SETTLE]: 850,
    [DemoPhase.NEUTRAL_HOLD]: 520,
    [DemoPhase.REMINDER_PAUSE]: 900,
};

// One part at a time; a repeating launch paces the loop on its own pause.
export function buildPartSequence(part, recipe) {
    switch (part) {
        case RecipePart.HOVER:
            return [DemoPhase.HOVER_IN, DemoPhase.HOLD,
                DemoPhase.RESET, DemoPhase.NEUTRAL_HOLD];
        case RecipePart.PRESS:
            return [DemoPhase.CLICK, DemoPhase.NEUTRAL_HOLD];
        case RecipePart.LAUNCH:
            if (recipe.launch.repeat &&
                recipe.launch.effect !== LaunchEffect.STOCK)
                return [DemoPhase.LAUNCH, DemoPhase.REPEAT_PAUSE];
            return [DemoPhase.LAUNCH, DemoPhase.SETTLE,
                DemoPhase.NEUTRAL_HOLD];
        case RecipePart.ATTENTION:
            return [DemoPhase.ATTENTION, DemoPhase.REMINDER_PAUSE];
    }
}

export function buildDemoSequence(recipe) {
    const hover = hoverActive(recipe.hover);
    const phases = hover ? [DemoPhase.HOVER_IN, DemoPhase.HOLD] : [];
    if (recipe.press.enabled && recipe.press.mode !== PressMode.LAUNCHES_ONLY)
        phases.push(DemoPhase.CLICK);
    phases.push(DemoPhase.PRE_LAUNCH_PAUSE);
    const showsLaunchFeedback = recipe.launch.enabled ||
        recipe.press.enabled && recipe.press.mode === PressMode.LAUNCHES_ONLY;
    if (showsLaunchFeedback)
        phases.push(DemoPhase.CLICK_LAUNCH);
    phases.push(DemoPhase.SETTLE);
    if (hover)
        phases.push(DemoPhase.RESET);
    phases.push(DemoPhase.NEUTRAL_HOLD);
    return phases;
}
