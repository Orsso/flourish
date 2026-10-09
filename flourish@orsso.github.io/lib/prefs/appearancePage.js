import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {GroupGap, IconSpacing, OutlineLight, OutlineStyle} from '../motion/catalog.js';
import {setBooleanCommitted, setGroupGap, setIntCommitted, setStringCommitted} from '../motion/settings.js';
import {DockSample} from './dockSample.js';
import {N_, createScaleRow, createSwitchRow} from './rows.js';

const SPACINGS = [
    [N_('Tight'), 4],
    [N_('Compact'), 8],
    [N_('Theme'), IconSpacing.THEME],
    [N_('Airy'), 24],
];
const OUTLINES = [
    [N_('None'), OutlineStyle.NONE],
    [N_('Theme'), OutlineStyle.AUTO],
    [N_('Light'), OutlineStyle.LIGHT],
    [N_('Dark'), OutlineStyle.DARK],
    [N_('Glass'), OutlineStyle.GLASS],
];
const LIGHTS = [
    [N_('Top left'), OutlineLight.TOP_LEFT],
    [N_('Top'), OutlineLight.TOP],
    [N_('Top right'), OutlineLight.TOP_RIGHT],
];
// A click on a gap moves to the next step.
const GAP_CYCLE = [null, GroupGap.SMALL, GroupGap.NORMAL];
// The page column is about 600 px; the preview shrinks its icons to fit it.
const PREVIEW_WIDTH = 540;
const PREVIEW_ICON = 48;

export function buildAppearancePage(page, controls, settings, state) {
    const favorites = new Gio.Settings({schema_id: 'org.gnome.shell'});
    const appearance = {segments: [], switches: [], hovered: null};
    controls.appearance = appearance;
    const apps = installedFavorites(favorites);

    const dock = new Adw.PreferencesGroup({
        title: _('Your dock'),
        description: _('Click between two favorites to add a gap, again to widen it, and once more to remove it. Gaps stay in place when apps move.'),
    });
    appearance.preview = new DockSample({
        apps,
        iconSize: previewIconSize(apps.length),
        width: PREVIEW_WIDTH,
        margin_top: 18,
        margin_bottom: 18,
        margin_start: 12,
        margin_end: 12,
        onSlotClicked: position => {
            const gap = appearance.current.gaps[position] ?? null;
            setGroupGap(settings, position, GAP_CYCLE[(GAP_CYCLE.indexOf(gap) + 1) % GAP_CYCLE.length]);
        },
    });
    const frame = new Gtk.Frame({child: appearance.preview});
    frame.add_css_class('view');
    dock.add(frame);
    page.add(dock);

    const layout = new Adw.PreferencesGroup({title: _('Layout')});
    addSegments(appearance, layout, _('Icon spacing'), SPACINGS, 'spacing', state,
        value => setIntCommitted(settings, 'icon-spacing', value));
    page.add(layout);

    const outline = new Adw.PreferencesGroup({title: _('Outline')});
    addSegments(appearance, outline, _('Style'), OUTLINES, 'style', state,
        value => setStringCommitted(settings, 'dock-outline', value));
    appearance.light = addSegments(appearance, outline, _('Light from'), LIGHTS, 'light', state,
        value => setStringCommitted(settings, 'outline-light', value));
    appearance.intensity = createScaleRow(outline, _('Intensity'), 0, 100, 5,
        value => setIntCommitted(settings, 'outline-intensity', Math.round(value)), state);
    page.add(outline);

    const backgrounds = new Adw.PreferencesGroup({title: _('Backgrounds')});
    for (const [key, setting, title, subtitle] of [
        ['hoverTile', 'show-hover-background', _('Hover background'), _('The tile under the pointed icon')],
        ['focusTile', 'show-focused-app-background', _('Focused app background'), _('Marks the app that owns the focused window')],
    ]) {
        const row = createSwitchRow(backgrounds, title, subtitle,
            enabled => setBooleanCommitted(settings, setting, enabled), state);
        previewOnHover(appearance, row, key, true);
        appearance.switches.push({row, key});
    }
    page.add(backgrounds);

    favorites.connect('changed::favorite-apps', () => {
        const changed = installedFavorites(favorites);
        appearance.preview.setApps(changed, previewIconSize(changed.length));
        syncAppearancePage(controls, settings);
    });
    Adw.StyleManager.get_default().connect('notify::dark', () => refreshPreview(appearance));
}

// The Shell skips favorites that are not installed, so positions count installed ones only.
function installedFavorites(favorites) {
    const installed = new Map(Gio.AppInfo.get_all().map(info => [info.get_id(), info]));
    return favorites.get_strv('favorite-apps').map(id => installed.get(id)).filter(info => info);
}

// One icon plus one theme gap is a third more than the icon.
function previewIconSize(count) {
    return Math.min(PREVIEW_ICON, Math.floor(PREVIEW_WIDTH / (Math.max(count, 1) * 4 / 3)));
}

// Linked toggles: hovering one shows its value on the preview before the click.
function addSegments(appearance, group, title, choices, key, state, pick) {
    const row = new Adw.ActionRow({title});
    const box = new Gtk.Box({valign: Gtk.Align.CENTER});
    box.add_css_class('linked');
    let first = null;
    for (const [label, value] of choices) {
        const button = new Gtk.ToggleButton({label: _(label), group: first});
        first ??= button;
        button.connect('toggled', () => {
            if (button.active && !state.syncing)
                pick(value);
        });
        previewOnHover(appearance, button, key, value);
        box.append(button);
        appearance.segments.push({button, key, value});
    }
    row.add_suffix(box);
    group.add(row);
    return row;
}

function previewOnHover(appearance, widget, key, value) {
    const motion = new Gtk.EventControllerMotion();
    motion.connect('enter', () => {
        appearance.hovered = {[key]: value};
        refreshPreview(appearance);
    });
    motion.connect('leave', () => {
        appearance.hovered = null;
        refreshPreview(appearance);
    });
    widget.add_controller(motion);
}

function refreshPreview(appearance) {
    if (!appearance.current)
        return;
    const shown = {...appearance.current, ...appearance.hovered};
    // The light only shows on the glass outline.
    if (appearance.hovered?.light)
        shown.style = OutlineStyle.GLASS;
    appearance.preview.update(shown);
}

export function syncAppearancePage(controls, settings) {
    const {appearance} = controls;
    appearance.current = {
        spacing: settings.get_int('icon-spacing'),
        gaps: settings.get_value('group-gaps').deep_unpack(),
        style: settings.get_string('dock-outline'),
        intensity: settings.get_int('outline-intensity'),
        light: settings.get_string('outline-light'),
        hoverTile: settings.get_boolean('show-hover-background'),
        focusTile: settings.get_boolean('show-focused-app-background'),
    };
    const {current} = appearance;
    for (const {button, key, value} of appearance.segments)
        button.active = current[key] === value;
    for (const {row, key} of appearance.switches)
        row.active = current[key];
    appearance.intensity.adjustment.value = current.intensity;
    appearance.intensity.row.sensitive = current.style !== OutlineStyle.NONE;
    appearance.light.visible = current.style === OutlineStyle.GLASS;
    refreshPreview(appearance);
}
