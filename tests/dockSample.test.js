import {sampleLayout} from '../flourish@orsso.github.io/lib/prefs/dockSample.js';

test('the sample scales the dock gaps with its icons', () => {
    const theme = sampleLayout({count: 3, iconSize: 24});
    assertDeepEqual(theme.icons, [5, 37, 69]);
    assertEqual(theme.width, 98);
    const wide = sampleLayout({count: 3, iconSize: 24, spacing: {gap: 0.5, across: 0.31, ends: 0.31}});
    assertDeepEqual(wide.icons, [7.5, 43.5, 79.5]);
    assertEqual(wide.width, 111);
    assertEqual(wide.height, 39);
});

test('group gaps widen their slot, and every slot names the position after it', () => {
    const {icons, slots} = sampleLayout({count: 3, iconSize: 24, gaps: {2: 'normal'}});
    assertDeepEqual(icons, [5, 37, 85]);
    assertDeepEqual(slots, [{position: 1, x1: 29, x2: 37}, {position: 2, x1: 61, x2: 85}]);
});
