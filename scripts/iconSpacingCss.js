// Generates flourish@orsso.github.io/icon-spacing.css: make icon-spacing-css.
import System from 'system';

import {ICON_HALO as HALO, ICON_SPACING_GAPS, iconSpacingTile} from '../flourish@orsso.github.io/lib/motion/catalog.js';

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
    for (const [name, gap] of Object.entries(ICON_SPACING_GAPS)) {
        const scope = `#uiGroup.flourish-spacing-${name}`;
        const tile = iconSpacingTile(gap);
        const margin = px(tile.margin);
        const tiles = prefix => TILES.map(name => `${scope} ${prefix} .dash-item-container ${name}`);
        const containers = edges => edges.map(edge => `${scope} #dashtodockContainer.${edge} #dash .dash-item-container`);
        // Dash to Dock's shrunk dock outranks a rule without the dock's id.
        blocks.push(rule([...tiles('#dash'), ...['bottom', 'top'].flatMap(edge => tiles(`#dashtodockContainer.${edge} #dash`))],
            `margin: 0 ${margin};`));
        blocks.push(rule(['left', 'right'].flatMap(edge => tiles(`#dashtodockContainer.${edge} #dash`)),
            `margin: ${margin} 0;`));
        const separators = edges => edges.map(edge => `${scope} #dashtodockContainer.${edge} #dash .dash-separator`);
        blocks.push(rule([`${scope} #dash .dash-separator`, ...separators(['bottom', 'top'])],
            `margin-left: ${SEPARATOR_MARGIN}px;\n    margin-right: ${SEPARATOR_MARGIN}px;`));
        blocks.push(rule(separators(['left', 'right']), `margin: ${SEPARATOR_MARGIN}px;`));
        // The row ends get the inset the icons have across the row.
        const {top, bottom} = tile;
        const end = (inset, half) => px(Math.max(0, inset - half));
        const dash = DASH_INSET + (tile.halo ? top : HALO);
        blocks.push(rule([`${scope} #overviewGroup #dash .dash-background`],
            `padding-left: ${end(dash, gap / 2)};\n    padding-right: ${end(dash, gap / 2)};`));
        const dockEnds = (scope, insets) => {
            for (const [mode, [across, along]] of Object.entries(insets)) {
                const dashContainers = edges => edges.map(edge => `${scope} #dashtodockContainer.${edge}${mode} #dash #dashtodockDashContainer`);
                blocks.push(rule(dashContainers(['bottom', 'top']),
                    `padding-left: ${end(across, gap / 2)};\n    padding-right: ${end(across, gap / 2)};`));
                // Down a column the halo padding is uneven below twice the halo.
                blocks.push(rule(dashContainers(['left', 'right']),
                    `padding-top: ${end(along, top)};\n    padding-bottom: ${end(along, bottom)};`));
            }
        };
        dockEnds(scope, FLOATING_INSETS);
        // Flush: the background fills the dock, against the screen edge and maximized windows.
        const flush = `${scope}.flourish-flush`;
        blocks.push(rule(['bottom', 'top', 'left', 'right'].map(edge => `${flush} #dashtodockContainer.${edge} #dash .dash-background`),
            'margin: 0;'));
        // The tiles take the container margins below twice the halo, so the screen edge stays on an icon.
        if (tile.halo)
            blocks.push(rule(['bottom', 'top', 'left', 'right'].map(edge => `${flush} #dashtodockContainer.${edge} #dash .dash-item-container`),
                'margin: 0;'));
        for (const [mode, padding] of Object.entries(FLUSH_TILE_PADDING)) {
            const dockTiles = edges => edges.flatMap(edge =>
                DOCK_TILES.map(name => `${flush} #dashtodockContainer.${edge}${mode} #dash .dash-item-container ${name}`));
            const [before, after, side] = tile.halo ? [HALO - top, HALO - bottom, HALO - gap / 2] : [0, 0, 0];
            blocks.push(rule(dockTiles(['bottom', 'top']),
                `padding-top: ${px(padding + before)};\n    padding-bottom: ${px(padding + after)};`));
            blocks.push(rule(dockTiles(['left', 'right']),
                `padding-left: ${px(padding + side)};\n    padding-right: ${px(padding + side)};`));
        }
        dockEnds(flush, FLUSH_INSETS);
        if (!tile.halo) {
            // The docks space their containers; the tiles take that over.
            blocks.push(rule(containers(['bottom', 'top', 'left', 'right']), 'margin: 0;'));
            continue;
        }
        // A square halo spaces the row too; the bottom padding keeps the running dot in place.
        blocks.push(rule(TILES.map(name => `${scope} #dash .dash-item-container ${name} .overview-icon`),
            `padding: ${px(top)} 0 ${px(bottom)} 0;`));
        // The docks keep their thickness; the dash, sized from the Show Apps icon, gets thinner.
        blocks.push(rule(containers(['bottom', 'top']), `margin: ${px(HALO - top)} 0 ${px(HALO - bottom)} 0;`));
        blocks.push(rule(containers(['left', 'right']), `margin: 0 ${px(HALO - gap / 2)};`));
    }
    return ['/* Generated by scripts/iconSpacingCss.js (make icon-spacing-css). */\n', ...blocks].join('\n');
}

if (System.programPath && import.meta.url.endsWith(System.programPath))
    print(iconSpacingCss());
