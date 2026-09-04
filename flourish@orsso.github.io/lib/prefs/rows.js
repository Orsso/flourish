import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {setBooleanCommitted} from '../motion/settings.js';

// xgettext reads N_; the lookup happens where the string is used.
const N_ = s => s;

export function createSwitchRow(group, title, subtitle = null, help = null) {
    // A SwitchRow packs its switch first, so a help button can only follow it.
    if (help) {
        const toggle = new Gtk.Switch({valign: Gtk.Align.CENTER});
        const row = new Adw.ActionRow({title, subtitle, activatable_widget: toggle});
        row.add_suffix(createHelpButton(help));
        row.add_suffix(toggle);
        row.toggle = toggle;
        group.add(row);
        return row;
    }
    const row = new Adw.SwitchRow({title, subtitle});
    group.add(row);
    return row;
}

export function connectSwitch(row, callback, state) {
    const toggle = row.toggle ?? row;
    toggle.connect('notify::active', () => {
        if (!state.syncing)
            callback(toggle.active);
    });
}

const BACKGROUND_ROWS = {
    hover: ['show-hover-background', N_('Show hover background'),
        N_('Keep the tile shown under the pointed icon (off hides it)')],
    focusedApp: ['show-focused-app-background', N_('Show focused app background'),
        N_('Mark the app that owns the focused window')],
};

// The same switch lives on both pages.
export function createBackgroundRow(group, kind, settings, state) {
    const [key, title, subtitle] = BACKGROUND_ROWS[kind];
    const row = createSwitchRow(group, _(title), _(subtitle));
    connectSwitch(row, enabled => setBooleanCommitted(settings, key, enabled), state);
    return row;
}

export function createSpinRow(
    group,
    title,
    lower,
    upper,
    step,
    callback,
    state,
    subtitle = null,
) {
    const row = new Adw.SpinRow({
        title,
        subtitle,
        digits: 0,
        adjustment: new Gtk.Adjustment({
            lower,
            upper,
            step_increment: step,
            page_increment: step * 10,
        }),
    });
    row.connect('notify::value', () => {
        if (!state.syncing)
            callback(row.value);
    });
    group.add(row);
    return row;
}

export function createScaleRow(group, title, lower, upper, step, callback, state) {
    const adjustment = new Gtk.Adjustment({
        lower,
        upper,
        step_increment: step,
        page_increment: step * 10,
    });
    const scale = new Gtk.Scale({
        orientation: Gtk.Orientation.HORIZONTAL,
        adjustment,
        draw_value: false,
        width_request: 190,
        valign: Gtk.Align.CENTER,
    });
    const row = new Adw.ActionRow({title, activatable_widget: scale});
    row.add_suffix(scale);
    adjustment.connect('value-changed', () => {
        if (!state.syncing)
            callback(adjustment.value);
    });
    group.add(row);
    return {row, adjustment, scale};
}

export function createComboRow(group, title, entries, callback, state) {
    const model = new Gtk.StringList();
    for (const [label] of entries)
        model.append(label);
    const values = entries.map(([, value]) => value);
    const row = new Adw.ComboRow({title, model});
    row.connect('notify::selected', () => {
        if (!state.syncing)
            callback(values[row.selected]);
    });
    group.add(row);
    return {row, values};
}

export function setComboValue(control, value) {
    const index = control.values.indexOf(value);
    const row = control.row;
    row.selected = Math.max(0, index);
}

export function createHelpButton(text) {
    const label = new Gtk.Label({
        label: text,
        wrap: true,
        max_width_chars: 34,
        xalign: 0,
        margin_top: 10,
        margin_bottom: 10,
        margin_start: 10,
        margin_end: 10,
    });
    const popover = new Gtk.Popover();
    popover.set_child(label);
    const button = new Gtk.MenuButton({
        icon_name: 'help-about-symbolic',
        valign: Gtk.Align.CENTER,
        tooltip_text: _('About this setting'),
        popover,
    });
    button.add_css_class('flat');
    return button;
}
