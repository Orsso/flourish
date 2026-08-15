import {sharpenIconTexture} from '../flourish@orsso.github.io/lib/runtime/iconTexture.js';
import {FakeBaseIcon} from './fakes.js';

test('sharpening renders the texture at twice the icon size', () => {
    const baseIcon = new FakeBaseIcon();

    sharpenIconTexture(baseIcon);

    assertEqual(baseIcon.icon.size, 96);
    assertEqual(baseIcon.iconSize, 48);
    assertEqual(baseIcon._iconBin.child, baseIcon.icon);
    assertDeepEqual([baseIcon.icon.width, baseIcon.icon.height], [48, 48]);
    assertEqual(baseIcon.created[0].destroyed, true);
});

test('size changes through the base icon stay sharp', () => {
    const baseIcon = new FakeBaseIcon();
    sharpenIconTexture(baseIcon);

    baseIcon._createIconTexture(64);

    assertEqual(baseIcon.icon.size, 128);
    assertEqual(baseIcon.iconSize, 64);
    assertDeepEqual([baseIcon.icon.width, baseIcon.icon.height], [64, 64]);
});

test('restoring returns the stock texture and layout', () => {
    const baseIcon = new FakeBaseIcon();
    const restore = sharpenIconTexture(baseIcon);
    const sharp = baseIcon.icon;

    restore();

    assertEqual(sharp.destroyed, true);
    assertEqual(baseIcon.icon.size, 48);
    assertEqual(Object.hasOwn(baseIcon, '_createIconTexture'), false);
    assertDeepEqual([baseIcon.icon.width, baseIcon.icon.height], [-1, -1]);
});
