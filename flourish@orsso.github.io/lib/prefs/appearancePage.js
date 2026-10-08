import Adw from 'gi://Adw';
import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {IconSpacing, OutlineLight, OutlineStyle} from '../motion/catalog.js';
import {setIntCommitted, setStringCommitted} from '../motion/settings.js';
import {
    N_,
    createBackgroundRows,
    createComboRow,
    createScaleRow,
    createSpinRow,
    createSwitchRow,
    setComboValue,
} from './rows.js';

const OUTLINES = [
    [N_('None'), OutlineStyle.NONE],
    [N_('Follow theme'), OutlineStyle.AUTO],
    [N_('Light'), OutlineStyle.LIGHT],
    [N_('Dark'), OutlineStyle.DARK],
    [N_('Glass'), OutlineStyle.GLASS],
];
const LIGHTS = [
    [N_('Top left'), OutlineLight.TOP_LEFT],
    [N_('Top'), OutlineLight.TOP],
    [N_('Top right'), OutlineLight.TOP_RIGHT],
];
// The usual theme gap, so turning the switch on changes nothing at first.
const SUGGESTED_GAP = 16;

export function buildAppearancePage(page, controls, settings, state) {
    const icons = new Adw.PreferencesGroup({title: _('Icons')});
    controls.adjustSpacing = createSwitchRow(icons, _('Adjust icon spacing'),
        _('Otherwise the theme or the dock decides'),
        enabled => setIntCommitted(settings, 'icon-spacing',
            enabled ? controls.iconSpacing.value : IconSpacing.THEME), state);
    controls.iconSpacing = createSpinRow(icons, _('Gap between icons'),
        IconSpacing.MIN, IconSpacing.MAX, IconSpacing.STEP,
        value => setIntCommitted(settings, 'icon-spacing', value), state, _('In pixels'));
    // The stylesheet has rules for even gaps only.
    controls.iconSpacing.snap_to_ticks = true;
    page.add(icons);

    const outline = new Adw.PreferencesGroup({title: _('Outline')});
    controls.outline = createComboRow(outline, _('Style'),
        OUTLINES.map(([label, value]) => [_(label), value]),
        value => setStringCommitted(settings, 'dock-outline', value), state);
    controls.outlineIntensity = createScaleRow(outline, _('Intensity'), 0, 100, 5,
        value => setIntCommitted(settings, 'outline-intensity', Math.round(value)), state);
    controls.outlineLight = createComboRow(outline, _('Light from'),
        LIGHTS.map(([label, value]) => [_(label), value]),
        value => setStringCommitted(settings, 'outline-light', value), state);
    page.add(outline);

    const backgrounds = new Adw.PreferencesGroup({title: _('Backgrounds')});
    createBackgroundRows(backgrounds, settings, controls, state);
    page.add(backgrounds);
}

export function syncAppearancePage(controls, settings) {
    const spacing = settings.get_int('icon-spacing');
    const adjusted = spacing !== IconSpacing.THEME;
    controls.adjustSpacing.active = adjusted;
    controls.iconSpacing.sensitive = adjusted;
    controls.iconSpacing.value = adjusted ? spacing : SUGGESTED_GAP;
    const style = settings.get_string('dock-outline');
    setComboValue(controls.outline, style);
    controls.outlineIntensity.adjustment.value = settings.get_int('outline-intensity');
    controls.outlineIntensity.row.sensitive = style !== OutlineStyle.NONE;
    setComboValue(controls.outlineLight, settings.get_string('outline-light'));
    controls.outlineLight.row.visible = style === OutlineStyle.GLASS;
}
