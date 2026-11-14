import {sharpenIconTexture} from '../flourish@orsso.github.io/lib/runtime/iconMotionController.js';
import {FakeBaseIcon} from './fakes.js';

test('sharpening renders the texture at twice the icon size', () => {
    const baseIcon = new FakeBaseIcon();

    sharpenIconTexture(baseIcon);

    assertEqual(baseIcon.icon.size, 96);
    assertEqual(baseIcon.iconSize, 48);
    assertEqual(baseIcon._iconBin.child, baseIcon.icon);
    assertEqual(baseIcon.icon.style, 'width: 48px; height: 48px;');
    assertEqual(baseIcon.created[0].destroyed, true);
});

// St scales a style length by the monitor scale; a fixed actor size stays in stage pixels.
test('the icon keeps its logical size at any scale', () => {
    const baseIcon = new FakeBaseIcon();

    sharpenIconTexture(baseIcon);

    assertDeepEqual([baseIcon.icon.width, baseIcon.icon.height], [-1, -1]);
});

test('size changes through the base icon stay sharp', () => {
    const baseIcon = new FakeBaseIcon();
    sharpenIconTexture(baseIcon);

    baseIcon._createIconTexture(64);

    assertEqual(baseIcon.icon.size, 128);
    assertEqual(baseIcon.iconSize, 64);
    assertEqual(baseIcon.icon.style, 'width: 64px; height: 64px;');
});

test('restoring returns the stock texture and layout', () => {
    const baseIcon = new FakeBaseIcon();
    const restore = sharpenIconTexture(baseIcon);
    const sharp = baseIcon.icon;

    restore();

    assertEqual(sharp.destroyed, true);
    assertEqual(baseIcon.icon.size, 48);
    assertEqual(Object.hasOwn(baseIcon, '_createIconTexture'), false);
    assertEqual(baseIcon.icon.style, null);
});

test('texture refresh does not revisit an icon removed from its bin', () => {
    const baseIcon = new FakeBaseIcon();
    const restore = sharpenIconTexture(baseIcon);
    baseIcon.icon.destroy = () => { throw new Error('disposed texture'); };
    baseIcon._iconBin.child = null;
    baseIcon._createIconTexture(64);
    assertEqual(baseIcon.icon.size, 128);
    baseIcon.icon.destroy = () => { throw new Error('disposed texture'); };
    baseIcon._iconBin.child = null;
    restore();
    assertEqual(baseIcon.icon.size, 64);
});
