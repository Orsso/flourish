import {PressMode} from '../flourish@orsso.github.io/lib/motion/catalog.js';
import {PressInteraction} from '../flourish@orsso.github.io/lib/motion/pressInteraction.js';

const allPrimary = {
    enabled: true,
    mode: PressMode.ALL_PRIMARY_CLICKS,
};
const launchesOnly = {
    enabled: true,
    mode: PressMode.LAUNCHES_ONLY,
};

test('canonical button release clears press without leaving hover', () => {
    const interaction = new PressInteraction();

    interaction.beginPrimary(allPrimary);
    assertEqual(interaction.pressed, true);

    interaction.syncButtonPressed(false, allPrimary);
    assertEqual(interaction.pressed, false);
});

test('all-primary launch waits for the released shape', () => {
    const interaction = new PressInteraction();

    interaction.beginPrimary(allPrimary);
    interaction.syncButtonPressed(false, allPrimary);

    assertDeepEqual(interaction.consumeLaunchSteps(allPrimary), [
        {pressed: false, durationFactor: 1},
    ]);
});

test('launch-only feedback releases before handing off', () => {
    const interaction = new PressInteraction();

    assertDeepEqual(interaction.consumeLaunchSteps(launchesOnly), [
        {pressed: true, durationFactor: 0.5},
        {pressed: false, durationFactor: 1},
    ]);
});

test('every launch preparation sequence ends released', () => {
    for (const config of [allPrimary, launchesOnly]) {
        const interaction = new PressInteraction();
        interaction.beginPrimary(config);
        interaction.syncButtonPressed(false, config);
        const steps = interaction.consumeLaunchSteps(config);
        assertEqual(steps.at(-1).pressed, false);
    }
});
