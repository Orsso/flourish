import GLib from 'gi://GLib';

import {iconSpacingCss} from '../scripts/iconSpacingCss.js';

const CSS_PATH = GLib.build_filenamev([
    GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]),
    '..', 'flourish@orsso.github.io', 'icon-spacing.css',
]);

test('the packaged spacing stylesheet matches its generator', () => {
    const [, contents] = GLib.file_get_contents(CSS_PATH);
    assertEqual(new TextDecoder().decode(contents), `${iconSpacingCss()}\n`);
});

test('below twice the halo the gap moves into the halo padding', () => {
    const css = iconSpacingCss();
    assertEqual(css.includes('.flourish-spacing-8 #dash .dash-item-container .overview-tile .overview-icon,'), true);
    assertEqual(css.includes('padding: 2px 0 6px 0 !important;'), true);
    assertEqual(css.includes('.flourish-spacing-12 #dash .dash-item-container .overview-tile .overview-icon'), false);
});
