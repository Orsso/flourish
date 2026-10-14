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

test('the favorites separator gets the room of a small group gap', () => {
    const css = iconSpacingCss();
    assertEqual(css.includes('.flourish-spacing-4 #dashtodockContainer.left #dash .dash-separator'), true);
    assertEqual(css.includes('margin-left: 8px !important;\n    margin-right: 8px !important;'), true);
});

test('the row ends get the inset the icons have across the row', () => {
    const css = iconSpacingCss();
    assertEqual(css.includes(`.flourish-spacing-4 #dashtodockContainer.bottom.shrink #dash #dashtodockDashContainer,
.flourish-spacing-4 #dashtodockContainer.top.shrink #dash #dashtodockDashContainer {
    padding-left: 6px !important;`), true);
    assertEqual(css.includes(`.flourish-spacing-4 #dashtodockContainer.right.shrink #dash #dashtodockDashContainer {
    padding-top: 9px !important;
    padding-bottom: 5px !important;`), true);
});

test('a flush dock fills its background and pads its tiles evenly', () => {
    const css = iconSpacingCss();
    assertEqual(css.includes(`.flourish-spacing-4.flourish-flush #dashtodockContainer.right #dash .dash-background {
    margin: 0 !important;`), true);
    assertEqual(css.includes(`.flourish-spacing-4.flourish-flush #dashtodockContainer.top.shrink #dash .dash-item-container .overview-tile {
    padding-top: 3px !important;
    padding-bottom: 3px !important;`), true);
    assertEqual(css.includes(`.flourish-spacing-4.flourish-flush #dashtodockContainer.top.shrink #dash #dashtodockDashContainer {
    padding-left: 7px !important;`), true);
});
