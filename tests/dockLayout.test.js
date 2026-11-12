import {GroupGap, ScreenEdge} from '../flourish@orsso.github.io/lib/motion/catalog.js';
import {
    DASH_ICON_SIZE,
    REDUCED_HALO,
    Surface,
    containerStyle,
    css,
    dockLayout,
    smallHalo,
    visibleSpacing,
} from '../flourish@orsso.github.io/lib/motion/dockLayout.js';

const DEFAULT = {gap: 0.33, across: 0.31, ends: 0.31};
// Apple's dock with the Flourish icon pack.
const OURS = {gap: 0.093, across: 0.186, ends: 0.186};
const THEME = {top: 6, bottom: 6};
const FLOATING = {inner: 0, outer: 4};

test('the default geometry at 48 on a floating bottom dock', () => {
    const layout = dockLayout({size: 48, spacing: DEFAULT, edge: ScreenEdge.BOTTOM, surface: Surface.DOCK,
        halo: THEME, backgroundMargins: FLOATING});
    assertDeepEqual(layout.tile, {margin: {top: 0, right: 2, bottom: 0, left: 2}, padding: {top: 9, right: 0, bottom: 13, left: 0}});
    assertDeepEqual(layout.ends, {padding: {top: 0, right: 7, bottom: 0, left: 7}});
    assertDeepEqual(layout.visible, {gap: 16, across: 15, ends: 15});
});

test('our configuration at 48 is 4.5, 8.9 and 8.9 within half a pixel', () => {
    assertEqual(smallHalo(48, OURS.gap), true);
    const layout = dockLayout({size: 48, spacing: OURS, edge: ScreenEdge.BOTTOM, surface: Surface.DOCK,
        halo: REDUCED_HALO, backgroundMargins: FLOATING});
    assertDeepEqual(layout.visible, {gap: 4, across: 9, ends: 9});
    assertDeepEqual(layout.tile.padding, {top: 9, right: 0, bottom: 9, left: 0});
    assertDeepEqual(layout.ends.padding, {top: 0, right: 7, bottom: 0, left: 7});
});

test('the visible lengths follow the icon size', () => {
    const at = size => visibleSpacing({size, spacing: DEFAULT});
    assertDeepEqual(at(16), {gap: 5, across: 5, ends: 5});
    assertDeepEqual(at(48), {gap: 16, across: 15, ends: 15});
    assertDeepEqual(at(64), {gap: 21, across: 20, ends: 20});
    assertDeepEqual(at(128), {gap: 42, across: 40, ends: 40});
});

test('each setting moves only its own visible length', () => {
    const at = spacing => visibleSpacing({size: 48, spacing: {...DEFAULT, ...spacing}});
    assertDeepEqual(at({gap: 0.5}), {gap: 24, across: 15, ends: 15});
    assertDeepEqual(at({across: 0.4}), {gap: 16, across: 19, ends: 15});
    assertDeepEqual(at({ends: 0.4}), {gap: 16, across: 15, ends: 19});
});

test('the halo shrinks below twice its padding and floors the gap', () => {
    assertEqual(smallHalo(100, 0.12), false);
    assertEqual(smallHalo(100, 0.11), true);
    assertEqual(visibleSpacing({size: 48, spacing: {...DEFAULT, gap: 0}}).gap, 4);
});

test('a wider theme halo keeps the gap', () => {
    const layout = dockLayout({size: 48, spacing: DEFAULT, edge: ScreenEdge.BOTTOM, surface: Surface.DOCK,
        halo: {top: 8, bottom: 8}, backgroundMargins: FLOATING});
    assertEqual(layout.visible.gap, 16);
    assertDeepEqual(layout.tile.margin, {top: 0, right: 0, bottom: 0, left: 0});
});

test('the four edges place before, after, inner and outer', () => {
    const at = edge => dockLayout({size: 48, spacing: OURS, edge, surface: Surface.DOCK,
        halo: REDUCED_HALO, backgroundMargins: FLOATING});
    assertDeepEqual(at(ScreenEdge.TOP).tile.padding, {top: 13, right: 0, bottom: 5, left: 0});
    assertDeepEqual(at(ScreenEdge.LEFT).tile.padding, {top: 0, right: 7, bottom: 0, left: 11});
    assertDeepEqual(at(ScreenEdge.LEFT).ends.padding, {top: 9, right: 0, bottom: 5, left: 0});
    assertDeepEqual(at(ScreenEdge.RIGHT).tile.padding, {top: 0, right: 11, bottom: 0, left: 7});
});

test('a flush dock has no background margin to make up for', () => {
    const layout = dockLayout({size: 48, spacing: DEFAULT, edge: ScreenEdge.BOTTOM, surface: Surface.DOCK,
        halo: THEME, backgroundMargins: {inner: 0, outer: 0}});
    assertEqual(layout.tile.padding.bottom, 9);
});

test('Show Apps makes up for the room the theme leaves before it', () => {
    const at = first => dockLayout({size: 48, spacing: DEFAULT, edge: ScreenEdge.BOTTOM, surface: Surface.DOCK,
        halo: THEME, backgroundMargins: FLOATING, showApps: {first, offset: 2}}).showApps.margin;
    assertDeepEqual(at(false), {top: 0, right: 2, bottom: 0, left: 0});
    assertDeepEqual(at(true), {top: 0, right: 0, bottom: 0, left: 2});
});

test('the dash pads its background', () => {
    const layout = dockLayout({size: DASH_ICON_SIZE, spacing: DEFAULT, edge: ScreenEdge.BOTTOM, surface: Surface.DASH,
        halo: THEME});
    assertDeepEqual(layout.tile, {margin: {top: 0, right: 5, bottom: 0, left: 4}, padding: {top: 0}});
    assertDeepEqual(layout.ends, {padding: {top: 14, right: 9, bottom: 14, left: 10}});
});

test('the dash centers an icon whose halo keeps only its bottom', () => {
    const layout = dockLayout({size: DASH_ICON_SIZE, spacing: OURS, edge: ScreenEdge.BOTTOM, surface: Surface.DASH,
        halo: REDUCED_HALO});
    assertDeepEqual(layout.tile, {margin: {top: 0, right: 1, bottom: 0, left: 1}, padding: {top: 4}});
    assertDeepEqual(layout.ends, {padding: {top: 12, right: 9, bottom: 8, left: 9}});
});

test('separators and group gaps run along the row', () => {
    const at = edge => dockLayout({size: 48, spacing: DEFAULT, edge, surface: Surface.DOCK, halo: THEME}).separator;
    assertDeepEqual(at(ScreenEdge.BOTTOM), {margin: {right: 8, left: 8}});
    assertDeepEqual(at(ScreenEdge.LEFT), {margin: {top: 8, bottom: 8}});
    assertDeepEqual(containerStyle(ScreenEdge.BOTTOM, GroupGap.NORMAL, true), {margin: {right: 0, left: 32}});
    assertDeepEqual(containerStyle(ScreenEdge.LEFT, GroupGap.SMALL, true), {margin: {top: 16, bottom: 0}});
    assertDeepEqual(containerStyle(ScreenEdge.BOTTOM, undefined, true), {margin: {right: 0, left: 0}});
    assertDeepEqual(containerStyle(ScreenEdge.BOTTOM, GroupGap.SMALL, false), {margin: {left: 16}});
    assertEqual(containerStyle(ScreenEdge.BOTTOM, undefined, false), null);
});

test('css writes the sides it is given', () => {
    assertEqual(css({margin: {right: 2, left: 2}, padding: {top: 9}}), 'margin-right: 2px; margin-left: 2px; padding-top: 9px;');
    assertEqual(css(null), null);
});
