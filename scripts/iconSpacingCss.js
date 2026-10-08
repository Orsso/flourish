// Generates flourish@orsso.github.io/icon-spacing.css: make icon-spacing-css.
import System from 'system';

import {IconSpacing} from '../flourish@orsso.github.io/lib/motion/catalog.js';

// Theme halo padding on each side; the dash, Dash to Dock and Ubuntu Dock all use 6.
const HALO = 6;

const TILES = ['.overview-tile', '.show-apps'];

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
        if (gap >= 2 * HALO) {
            // The docks space their containers; the tiles take that over.
            blocks.push(rule(containers(['bottom', 'top', 'left', 'right']), 'margin: 0 !important;'));
            continue;
        }
        // The halo stays square, so its vertical padding also sets the gap along the row.
        // The bottom padding keeps the running dot where the theme puts it.
        const bottom = Math.min(HALO, gap);
        const top = gap - bottom;
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
