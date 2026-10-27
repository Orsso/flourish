import {sampleLayout} from '../flourish@orsso.github.io/lib/prefs/dockSample.js';

test('the sample scales the dock gaps with its icons', () => {
    const theme = sampleLayout({count: 3, iconSize: 24});
    assertDeepEqual(theme.icons, [5, 37, 69]);
    assertEqual(theme.width, 98);
    const airy = sampleLayout({count: 3, iconSize: 24, spacing: 'airy'});
    assertDeepEqual(airy.icons, [5, 41, 77]);
});

test('group gaps widen their slot, and every slot names the position after it', () => {
    const {icons, slots} = sampleLayout({count: 3, iconSize: 24, gaps: {2: 'normal'}});
    assertDeepEqual(icons, [5, 37, 85]);
    assertDeepEqual(slots, [{position: 1, x1: 29, x2: 37}, {position: 2, x1: 61, x2: 85}]);
});
