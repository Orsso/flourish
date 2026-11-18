import {sampleLayout} from '../flourish@orsso.github.io/lib/prefs/dockSample.js';

test('the sample scales the dock gaps with its icons', () => {
    const theme = sampleLayout({count: 3, iconSize: 24});
    assertDeepEqual(theme.icons, [8, 40, 72]);
    assertEqual(theme.width, 104);
    assertEqual(theme.height, 38);
    const wide = sampleLayout({count: 3, iconSize: 24, spacing: {gap: 0.5, across: 0.31, ends: 0.31}});
    assertDeepEqual(wide.icons, [7.5, 43.5, 79.5]);
    assertEqual(wide.width, 111);
    assertEqual(wide.height, 39);
});

test('without Layout the dash sample keeps the theme lengths of 64 px icons', () => {
    const dash = sampleLayout({count: 3, iconSize: 32, dock: false});
    assertDeepEqual(dash.icons, [9, 49, 89]);
    assertEqual(dash.width, 130);
    assertEqual(dash.height, 50);
});

test('group gaps widen their slot, and every slot names the position after it', () => {
    const {icons, slots} = sampleLayout({count: 3, iconSize: 24, gaps: {2: 'normal'}});
    assertDeepEqual(icons, [8, 40, 88]);
    assertDeepEqual(slots, [{position: 1, x1: 32, x2: 40}, {position: 2, x1: 64, x2: 88}]);
});
