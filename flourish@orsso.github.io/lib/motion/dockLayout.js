import {GROUP_GAP_PIXELS, ICON_HALO, ScreenEdge} from './catalog.js';
import {getOrientation} from './transforms.js';

export const Surface = {DASH: 'dash', DOCK: 'dock'};

// The dash shrinks its icons from GNOME's largest size when the row is full.
export const DASH_ICON_SIZE = 64;
// Half the small group gap: the favorites separator reads as a group boundary.
export const SEPARATOR_MARGIN = 8;
// The small-halo rule of stylesheet.css.
export const REDUCED_HALO = {top: 0, bottom: 4};
const THEME_HALO = {top: ICON_HALO, bottom: ICON_HALO};

const SIDES = ['top', 'right', 'bottom', 'left'];
// Before and after run along the row; outer faces the screen edge.
const EDGE_SIDES = {
    [ScreenEdge.BOTTOM]: {before: 'left', after: 'right', inner: 'top', outer: 'bottom'},
    [ScreenEdge.TOP]: {before: 'left', after: 'right', inner: 'bottom', outer: 'top'},
    [ScreenEdge.LEFT]: {before: 'top', after: 'bottom', inner: 'right', outer: 'left'},
    [ScreenEdge.RIGHT]: {before: 'top', after: 'bottom', inner: 'left', outer: 'right'},
};

export function edgeSides(edge) {
    return EDGE_SIDES[edge];
}

function pixels(share, size) {
    return Math.max(0, Math.round(share * size));
}

export function smallHalo(size, gap) {
    return pixels(gap, size) < 2 * ICON_HALO;
}

// Logical lengths on their screen sides, in CSS order.
function place(edge, lengths) {
    const sides = EDGE_SIDES[edge];
    const placed = Object.fromEntries(Object.entries(lengths).map(([logical, value]) => [sides[logical], value]));
    return Object.fromEntries(SIDES.filter(side => side in placed).map(side => [side, placed[side]]));
}

// The halo is a square centered on the icon width, so a horizontal row shares its padding between both sides.
function haloExtents(edge, halo) {
    const half = (halo.top + halo.bottom) / 2;
    if (!getOrientation(edge).horizontal)
        return {before: halo.top, after: halo.bottom, inner: half, outer: half};
    const [inner, outer] = edge === ScreenEdge.TOP ? [halo.bottom, halo.top] : [halo.top, halo.bottom];
    return {before: half, after: half, inner, outer};
}

function measure({size, spacing, edge, halo}) {
    const extents = haloExtents(edge, halo);
    const room = Math.max(0, Math.round(pixels(spacing.gap, size) - extents.before - extents.after));
    const before = Math.floor(room / 2);
    const tile = {before, after: room - before};
    const across = pixels(spacing.across, size);
    const ends = pixels(spacing.ends, size);
    return {
        extents, tile, across, ends,
        visible: {
            gap: room + extents.before + extents.after,
            across: Math.max(across, extents.inner, extents.outer),
            ends: Math.max(ends, tile.before + extents.before),
        },
    };
}

// What the user sees in logical pixels: gaps between icons, and from the icons to the background edges.
export function visibleSpacing({size, spacing, halo = smallHalo(size, spacing.gap) ? REDUCED_HALO : THEME_HALO}) {
    return measure({size, spacing, edge: ScreenEdge.BOTTOM, halo}).visible;
}

export function dockLayout({
    size, spacing, edge, surface, halo,
    backgroundMargins = {inner: 0, outer: 0},
}) {
    const {extents, tile, across, ends, visible} = measure({size, spacing, edge, halo});
    const inset = (side, margin = 0) => Math.max(0, Math.round(across - extents[side] + margin));
    const endsAlong = {
        before: Math.max(0, Math.round(ends - tile.before - extents.before)),
        after: Math.max(0, Math.round(ends - tile.after - extents.after)),
    };
    const margin = along => place(edge, {...along, inner: 0, outer: 0});
    let padding, endsAcross;
    if (surface === Surface.DOCK) {
        // Dash to Dock's background fills the dock but for its margins, so the tiles set the thickness.
        padding = place(edge, {
            before: 0, after: 0,
            inner: inset('inner', backgroundMargins.inner),
            outer: inset('outer', backgroundMargins.outer),
        });
        endsAcross = {inner: 0, outer: 0};
    } else {
        // The dash centers the halo in its background; this moves the icon back to the center.
        padding = place(edge, {inner: Math.max(0, Math.round(extents.outer - extents.inner))});
        endsAcross = {inner: inset('inner'), outer: inset('outer')};
    }
    return {
        visible,
        tile: {margin: margin(tile), padding},
        container: {margin: place(edge, {before: 0, after: 0})},
        separator: {margin: place(edge, {before: SEPARATOR_MARGIN, after: SEPARATOR_MARGIN})},
        ends: {padding: place(edge, {...endsAlong, ...endsAcross})},
    };
}

// Layout off leaves the theme's margins but the group gap.
export function containerStyle(edge, groupGap, spacingOn) {
    const gap = GROUP_GAP_PIXELS[groupGap] ?? 0;
    if (spacingOn)
        return {margin: place(edge, {before: gap, after: 0})};
    return gap ? {margin: place(edge, {before: gap})} : null;
}

export function css(style) {
    if (!style)
        return null;
    return ['margin', 'padding']
        .filter(property => style[property])
        .flatMap(property => Object.entries(style[property]).map(([side, value]) => `${property}-${side}: ${value}px;`))
        .join(' ');
}
