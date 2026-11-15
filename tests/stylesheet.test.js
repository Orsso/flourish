import St from 'gi://St';

import {Stylesheet} from '../flourish@orsso.github.io/lib/runtime/stylesheet.js';

test('a stylesheet loads and unloads once without listing the theme sheets', () => {
    const calls = [];
    const theme = {
        load_stylesheet: file => calls.push(['load', file]),
        unload_stylesheet: file => calls.push(['unload', file]),
        // St logs a critical for each null entry another extension left in the list (#14).
        get_custom_stylesheets: () => {
            throw new Error('listed the theme sheets');
        },
    };
    const original = St.ThemeContext.get_for_stage;
    const hadGlobal = 'global' in globalThis;
    St.ThemeContext.get_for_stage = () => ({get_theme: () => theme});
    if (!hadGlobal)
        globalThis.global = {stage: null};
    try {
        const file = {name: 'dock-hover-background-hidden.css'};
        const sheet = new Stylesheet(file);
        assertEqual(sheet.setEnabled(true), true);
        assertEqual(sheet.setEnabled(true), false);
        sheet.disable();
        sheet.disable();
        assertEqual(sheet.setEnabled(false), false);
        assertDeepEqual(calls, [['load', file], ['unload', file]]);
    } finally {
        St.ThemeContext.get_for_stage = original;
        if (!hadGlobal)
            delete globalThis.global;
    }
});
