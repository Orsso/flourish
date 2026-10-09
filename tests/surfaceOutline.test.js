import {OutlineLight, OutlineStyle} from '../flourish@orsso.github.io/lib/motion/catalog.js';
import {outlinePaint} from '../flourish@orsso.github.io/lib/motion/outline.js';

test('no outline draws nothing, at any intensity', () => {
    assertEqual(outlinePaint(OutlineStyle.NONE, 60, OutlineLight.TOP_LEFT, false), null);
    assertEqual(outlinePaint(OutlineStyle.LIGHT, 0, OutlineLight.TOP_LEFT, false), null);
});

test('the default intensity keeps the 1.2 light and dark edges', () => {
    assertDeepEqual(outlinePaint(OutlineStyle.LIGHT, 60, OutlineLight.TOP_LEFT, false),
        {shade: 1, top: 0.18, bottom: 0.18, glints: []});
    assertDeepEqual(outlinePaint(OutlineStyle.DARK, 60, OutlineLight.TOP_LEFT, false),
        {shade: 0, top: 0.35, bottom: 0.35, glints: []});
});

test('auto draws a light edge on a dark scheme and a dark edge otherwise', () => {
    assertEqual(outlinePaint(OutlineStyle.AUTO, 60, OutlineLight.TOP, true).shade, 1);
    assertEqual(outlinePaint(OutlineStyle.AUTO, 60, OutlineLight.TOP, false).shade, 0);
});

test('intensity scales every style and never exceeds full opacity', () => {
    assertClose(outlinePaint(OutlineStyle.DARK, 30, OutlineLight.TOP, false).top, 0.175);
    assertEqual(outlinePaint(OutlineStyle.DARK, 100, OutlineLight.TOP, false).top <= 1, true);
    const glass = outlinePaint(OutlineStyle.GLASS, 100, OutlineLight.TOP_LEFT, false);
    assertEqual(glass.glints.every(([, alpha]) => alpha <= 1), true);
});

test('glass lights the corner facing the light and less the opposite one', () => {
    const left = outlinePaint(OutlineStyle.GLASS, 60, OutlineLight.TOP_LEFT, false);
    assertDeepEqual(left.glints.map(([corner]) => corner), ['top-left', 'bottom-right']);
    assertEqual(left.glints[0][1] > left.glints[1][1], true);
    assertEqual(left.top > left.bottom, true);
    const right = outlinePaint(OutlineStyle.GLASS, 60, OutlineLight.TOP_RIGHT, false);
    assertDeepEqual(right.glints.map(([corner]) => corner), ['top-right', 'bottom-left']);
    const top = outlinePaint(OutlineStyle.GLASS, 60, OutlineLight.TOP, false);
    assertEqual(top.glints[0][1], top.glints[1][1]);
});
