import {OutlineLight, OutlineStyle} from '../flourish@orsso.github.io/lib/motion/catalog.js';
import {outlinePaint} from '../flourish@orsso.github.io/lib/motion/outline.js';

test('no outline draws nothing, at any intensity', () => {
    assertEqual(outlinePaint(OutlineStyle.NONE, 60, OutlineLight.MIN, false), null);
    assertEqual(outlinePaint(OutlineStyle.LIGHT, 0, OutlineLight.MIN, false), null);
});

test('the default intensity keeps the 1.2 light and dark edges', () => {
    assertDeepEqual(outlinePaint(OutlineStyle.LIGHT, 60, OutlineLight.MIN, false),
        {shade: 1, light: null, alpha: 0.18});
    assertDeepEqual(outlinePaint(OutlineStyle.DARK, 60, OutlineLight.MIN, false),
        {shade: 0, light: null, alpha: 0.35});
});

test('auto draws a light edge on a dark scheme and a dark edge otherwise', () => {
    assertEqual(outlinePaint(OutlineStyle.AUTO, 60, 0, true).shade, 1);
    assertEqual(outlinePaint(OutlineStyle.AUTO, 60, 0, false).shade, 0);
});

test('intensity scales every style and never exceeds full opacity', () => {
    assertClose(outlinePaint(OutlineStyle.DARK, 30, 0, false).alpha, 0.175);
    assertEqual(outlinePaint(OutlineStyle.DARK, 100, 0, false).alpha <= 1, true);
    assertEqual(outlinePaint(OutlineStyle.GLASS, 100, 0, false).glint <= 1, true);
});

test('glass maps the light position to the top edge, brighter near the light', () => {
    assertEqual(outlinePaint(OutlineStyle.GLASS, 60, OutlineLight.MIN, false).light, -1);
    assertEqual(outlinePaint(OutlineStyle.GLASS, 60, OutlineLight.MAX, false).light, 1);
    const glass = outlinePaint(OutlineStyle.GLASS, 60, 0, false);
    assertEqual(glass.light, 0);
    assertEqual(glass.near > glass.far && glass.glint > glass.counter, true);
});
