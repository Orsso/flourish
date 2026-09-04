import {LaunchEffect, PressMode, RecipePart} from '../motion/catalog.js';

export const HOVER_HOLD_MS = 650;
export const PRE_LAUNCH_PAUSE_MS = 520;
export const SETTLE_MS = 850;
export const NEUTRAL_HOLD_MS = 520;
export const REMINDER_PAUSE_MS = 900;

export const SWEEP_MS = 1500;
export const SWEEP_SETTLE_MS = 480;

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

export function hoverIsActive(recipe) {
    return recipe.hover.enabled &&
        (recipe.hover.scale > 1 || recipe.hover.lift > 0);
}

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
        default:
            return [];
    }
}

export function buildDemoSequence(recipe) {
    const hover = hoverIsActive(recipe);
    const phases = hover ? [DemoPhase.HOVER_IN, DemoPhase.HOLD] : [];
    if (recipe.press.enabled && recipe.press.mode === PressMode.ALL_PRIMARY_CLICKS)
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
