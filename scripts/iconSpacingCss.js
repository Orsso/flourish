// Generates flourish@orsso.github.io/icon-spacing.css: make icon-spacing-css.
import System from 'system';

import {IconSpacing} from '../flourish@orsso.github.io/lib/motion/catalog.js';

// Theme halo padding on each side; the dash, Dash to Dock and Ubuntu Dock all use 6.
const HALO = 6;

const TILES = ['.overview-tile', '.show-apps'];
// Half the small group gap: the favorites separator reads as a group boundary.
const SEPARATOR_MARGIN = 8;
// Theme padding of the dash background across the row; the halo adds to it.
const DASH_INSET = 12;
// Measured icon inset across the row, horizontal then vertical docks, normal and shrunk.
const FLOATING_INSETS = {'': [14, 16], '.shrink': [8, 9]};
const FLUSH_INSETS = {'': [16, 16], '.shrink': [9, 9]};
// Flush docks pad their tiles evenly, the theme's padding without the room for the floating margins.
const FLUSH_TILE_PADDING = {'': 10, '.shrink': 3};
const DOCK_TILES = ['.app-well-app', '.show-apps', '.overview-tile'];

function rule(selectors, body) {
    return `${selectors.join(',\n')} {\n    ${body}\n}\n`;
}

const px = value => value === 0 ? '0' : `${value}px`;

// Gap between icon images: tile margins above twice the halo, halo padding below.
export function iconSpacingCss() {
    const blocks = [];
    for (let gap = IconSpacing.MIN; gap <= IconSpacing.MAX; gap += IconSpacing.STEP) {
        const scope = `.flourish-spacing-${gap}`;
        const margin = px(Math.max(0, (gap - 2 * HALO) / 2));
        const tiles = prefix => TILES.map(tile => `${scope} ${prefix} .dash-item-container ${tile}`);
        const containers = edges => edges.map(edge => `${scope} #dashtodockContainer.${edge} #dash .dash-item-container`);
        blocks.push(rule(tiles('#dash'), `margin: 0 ${margin} !important;`));
        blocks.push(rule(['left', 'right'].flatMap(edge => tiles(`#dashtodockContainer.${edge} #dash`)),
            `margin: ${margin} 0 !important;`));
        const separators = edges => edges.map(edge => `${scope} #dashtodockContainer.${edge} #dash .dash-separator`);
        blocks.push(rule([`${scope} #dash .dash-separator`, ...separators(['bottom', 'top'])],
            `margin-left: ${SEPARATOR_MARGIN}px !important;\n    margin-right: ${SEPARATOR_MARGIN}px !important;`));
        blocks.push(rule(separators(['left', 'right']),
            `margin-top: ${SEPARATOR_MARGIN}px !important;\n    margin-bottom: ${SEPARATOR_MARGIN}px !important;`));
        // The row ends get the inset the icons have across the row.
        const bottom = gap >= 2 * HALO ? gap / 2 : Math.min(HALO, gap);
        const top = gap - bottom;
        const end = (inset, half) => px(Math.max(0, inset - half));
        const dash = DASH_INSET + (gap >= 2 * HALO ? HALO : top);
        blocks.push(rule([`${scope} #overviewGroup #dash .dash-background`],
            `padding-left: ${end(dash, gap / 2)} !important;\n    padding-right: ${end(dash, gap / 2)} !important;`));
        const dockEnds = (scope, insets) => {
            for (const [mode, [across, along]] of Object.entries(insets)) {
                const dashContainers = edges => edges.map(edge => `${scope} #dashtodockContainer.${edge}${mode} #dash #dashtodockDashContainer`);
                blocks.push(rule(dashContainers(['bottom', 'top']),
                    `padding-left: ${end(across, gap / 2)} !important;\n    padding-right: ${end(across, gap / 2)} !important;`));
                // Down a column the halo padding is uneven below twice the halo.
                blocks.push(rule(dashContainers(['left', 'right']),
                    `padding-top: ${end(along, top)} !important;\n    padding-bottom: ${end(along, bottom)} !important;`));
            }
        };
        dockEnds(scope, FLOATING_INSETS);
        // Flush: the background fills the dock, against the screen edge and maximized windows.
        const flush = `${scope}.flourish-flush`;
        blocks.push(rule(['bottom', 'top', 'left', 'right'].map(edge => `${flush} #dashtodockContainer.${edge} #dash .dash-background`),
            'margin: 0 !important;'));
        // The tiles take the container margins below twice the halo, so the screen edge stays on an icon.
        const small = gap < 2 * HALO;
        if (small)
            blocks.push(rule(['bottom', 'top', 'left', 'right'].map(edge => `${flush} #dashtodockContainer.${edge} #dash .dash-item-container`),
                'margin: 0 !important;'));
        for (const [mode, padding] of Object.entries(FLUSH_TILE_PADDING)) {
            const dockTiles = edges => edges.flatMap(edge =>
                DOCK_TILES.map(tile => `${flush} #dashtodockContainer.${edge}${mode} #dash .dash-item-container ${tile}`));
            const [before, after, side] = small ? [HALO - top, HALO - bottom, HALO - gap / 2] : [0, 0, 0];
            blocks.push(rule(dockTiles(['bottom', 'top']),
                `padding-top: ${px(padding + before)} !important;\n    padding-bottom: ${px(padding + after)} !important;`));
            blocks.push(rule(dockTiles(['left', 'right']),
                `padding-left: ${px(padding + side)} !important;\n    padding-right: ${px(padding + side)} !important;`));
        }
        dockEnds(flush, FLUSH_INSETS);
        if (gap >= 2 * HALO) {
            // The docks space their containers; the tiles take that over.
            blocks.push(rule(containers(['bottom', 'top', 'left', 'right']), 'margin: 0 !important;'));
            continue;
        }
        // The halo stays square, so its vertical padding also sets the gap along the row.
        // The bottom padding keeps the running dot where the theme puts it.
        blocks.push(rule(TILES.map(tile => `${scope} #dash .dash-item-container ${tile} .overview-icon`),
            `padding: ${px(top)} 0 ${px(bottom)} 0 !important;`));
        // The docks keep their thickness; the dash, sized from the Show Apps icon, gets thinner.
        blocks.push(rule(containers(['bottom', 'top']), `margin: ${px(HALO - top)} 0 ${px(HALO - bottom)} 0 !important;`));
        blocks.push(rule(containers(['left', 'right']), `margin: 0 ${px(HALO - gap / 2)} !important;`));
    }
    return blocks.join('\n');
}

if (System.programPath && import.meta.url.endsWith(System.programPath))
    print(iconSpacingCss());
