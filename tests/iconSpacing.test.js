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
    assertEqual(css.includes('.flourish-spacing-compact #dash .dash-item-container .overview-tile .overview-icon,'), true);
    assertEqual(css.includes('padding: 2px 0 6px 0;'), true);
    assertEqual(css.includes('.flourish-spacing-comfortable #dash .dash-item-container .overview-tile .overview-icon'), false);
});

test('the favorites separator gets the room of a small group gap', () => {
    const css = iconSpacingCss();
    assertEqual(css.includes('.flourish-spacing-tight #dashtodockContainer.left #dash .dash-separator'), true);
    assertEqual(css.includes('margin-left: 8px;\n    margin-right: 8px;'), true);
});

test('the row ends get the inset the icons have across the row', () => {
    const css = iconSpacingCss();
    assertEqual(css.includes(`.flourish-spacing-tight #dashtodockContainer.bottom.shrink #dash #dashtodockDashContainer,
#uiGroup.flourish-spacing-tight #dashtodockContainer.top.shrink #dash #dashtodockDashContainer {
    padding-left: 6px;`), true);
    assertEqual(css.includes(`.flourish-spacing-tight #dashtodockContainer.right.shrink #dash #dashtodockDashContainer {
    padding-top: 9px;
    padding-bottom: 5px;`), true);
});

test('a flush dock fills its background and pads its tiles evenly', () => {
    const css = iconSpacingCss();
    assertEqual(css.includes(`.flourish-spacing-tight.flourish-flush #dashtodockContainer.right #dash .dash-background {
    margin: 0;`), true);
    assertEqual(css.includes(`.flourish-spacing-comfortable.flourish-flush #dashtodockContainer.top.shrink #dash .dash-item-container .overview-tile {
    padding-top: 3px;
    padding-bottom: 3px;`), true);
    assertEqual(css.includes(`.flourish-spacing-tight.flourish-flush #dashtodockContainer.top.shrink #dash #dashtodockDashContainer {
    padding-left: 7px;`), true);
});

test('a flush dock keeps the screen edge on its tiles below twice the halo', () => {
    const css = iconSpacingCss();
    assertEqual(css.includes(`.flourish-spacing-tight.flourish-flush #dashtodockContainer.right #dash .dash-item-container {
    margin: 0;`), true);
    assertEqual(css.includes(`.flourish-spacing-tight.flourish-flush #dashtodockContainer.top.shrink #dash .dash-item-container .overview-tile {
    padding-top: 9px;
    padding-bottom: 5px;`), true);
    assertEqual(css.includes(`.flourish-spacing-tight.flourish-flush #dashtodockContainer.right #dash .dash-item-container .overview-tile {
    padding-left: 14px;
    padding-right: 14px;`), true);
});
