import {PressMode} from '../flourish@orsso.github.io/lib/motion/catalog.js';
import {PressInteraction} from '../flourish@orsso.github.io/lib/motion/pressInteraction.js';

const config = mode => ({enabled: true, mode});

test('button release clears the press', () => {
    const interaction = new PressInteraction();
    interaction.beginPrimary(config(PressMode.ALL_PRIMARY_CLICKS));
    assertEqual(interaction.pressed, true);
    interaction.syncButtonPressed(false);
    assertEqual(interaction.pressed, false);
});

test('the mode decides which primary clicks press', () => {
    const expected = {
        [PressMode.ALL_PRIMARY_CLICKS]: {plain: true, launching: false},
        [PressMode.LAUNCHES_ONLY]: {plain: false, launching: false},
        [PressMode.CLICKS_AND_LAUNCHES]: {plain: true, launching: true},
    };
    for (const [mode, {plain, launching}] of Object.entries(expected)) {
        const interaction = new PressInteraction();
        interaction.beginPrimary(config(mode), false);
        assertEqual(interaction.pressed, plain, `${mode} plain click`);
        interaction.reset();
        interaction.beginPrimary(config(mode), true);
        assertEqual(interaction.pressed, launching, `${mode} launching click`);
    }
});

test('a disabled part never presses', () => {
    const interaction = new PressInteraction();
    interaction.beginPrimary({enabled: false, mode: PressMode.CLICKS_AND_LAUNCHES}, true);
    assertEqual(interaction.pressed, false);
});
