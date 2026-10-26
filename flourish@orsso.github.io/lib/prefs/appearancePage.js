import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {GroupGap, OutlineLight, OutlineStyle} from '../motion/catalog.js';
import {
    moveGroupGap, setBooleanCommitted, setGroupGap, setIntCommitted, setStringCommitted,
} from '../motion/settings.js';
import {DockSample} from './dockSample.js';
import {N_, createBadge, createScaleRow, createSwitchRow} from './rows.js';

const SPACINGS = [
    [N_('Tight'), 4],
    [N_('Compact'), 8],
    [N_('Comfortable'), 16],
    [N_('Airy'), 24],
];
const POSITIONS = [
    [N_('Floating'), false],
    [N_('Flush'), true],
];
const OUTLINES = [
    [N_('Theme'), OutlineStyle.AUTO],
    [N_('Light'), OutlineStyle.LIGHT],
    [N_('Dark'), OutlineStyle.DARK],
    [N_('Glass'), OutlineStyle.GLASS],
];
// A click on a gap moves to the next step.
const GAP_CYCLE = [null, GroupGap.SMALL, GroupGap.NORMAL];
const BACKGROUNDS_OFF_HINT = N_('The dash and the dock keep their own tiles');
// The page column is about 600 px; the preview shrinks its icons to fit it.
const PREVIEW_WIDTH = 540;
const PREVIEW_ICON = 48;

export function buildAppearancePage(page, controls, settings, state) {
    const favorites = new Gio.Settings({schema_id: 'org.gnome.shell'});
    const appearance = {segments: [], switches: [], hovered: null};
    controls.appearance = appearance;
    const apps = installedFavorites(favorites);
    appearance.apps = apps;

    const dock = new Adw.PreferencesGroup({title: _('Your dock')});
    dock.set_header_suffix(createBadge(_('Beta')));
    appearance.dock = dock;
    appearance.preview = new DockSample({
        apps,
        iconSize: previewIconSize(apps.length),
        width: PREVIEW_WIDTH,
        margin_top: 18,
        margin_bottom: 18,
        margin_start: 12,
        margin_end: 12,
        onSlotClicked: position => {
            const id = appearance.apps[position].get_id();
            const gap = appearance.current.gaps[id] ?? null;
            setGroupGap(settings, id, GAP_CYCLE[(GAP_CYCLE.indexOf(gap) + 1) % GAP_CYCLE.length]);
        },
        onGapDragged: (from, to) =>
            moveGroupGap(settings, appearance.apps[from].get_id(), appearance.apps[to].get_id()),
    });
    const frame = new Gtk.Frame({child: appearance.preview});
    frame.add_css_class('view');
    dock.add(frame);
    page.add(dock);

    // Each section carries the switch it has in General; off, its rows stay visible but greyed.
    appearance.sections = [];
    const section = (title, key, setting) => {
        const group = new Adw.PreferencesGroup({title});
        const toggle = new Gtk.Switch({valign: Gtk.Align.CENTER});
        toggle.update_property([Gtk.AccessibleProperty.LABEL], [title]);
        toggle.connect('notify::active', () => {
            if (!state.syncing)
                setBooleanCommitted(settings, setting, toggle.active);
        });
        group.set_header_suffix(toggle);
        const rows = [];
        appearance.sections.push({key, toggle, rows});
        page.add(group);
        return {group, rows};
    };
    const layout = section(_('Icon spacing'), 'spacingEnabled', 'spacing-enabled');
    const spacing = addSegments(appearance, layout.group, _('Gap between icons'), SPACINGS, 'spacing', state,
        value => setIntCommitted(settings, 'icon-spacing', value));
    const position = addSegments(appearance, layout.group, _('Dock position'), POSITIONS, 'flush', state,
        value => setBooleanCommitted(settings, 'dock-flush', value));
    position.subtitle = _('Dash to Dock and Ubuntu Dock');
    layout.rows.push(spacing, position);

    const outline = section(_('Outline'), 'outlineEnabled', 'outline-enabled');
    const style = addSegments(appearance, outline.group, _('Color'), OUTLINES, 'style', state,
        value => setStringCommitted(settings, 'dock-outline', value));
    appearance.light = createScaleRow(outline.group, _('Light position'), OutlineLight.MIN, OutlineLight.MAX,
        OutlineLight.STEP, value => setIntCommitted(settings, 'outline-light', Math.round(value)), state);
    appearance.light.scale.add_mark(0, Gtk.PositionType.BOTTOM, null);
    appearance.intensity = createScaleRow(outline.group, _('Intensity'), 0, 100, 5,
        value => setIntCommitted(settings, 'outline-intensity', Math.round(value)), state);
    outline.rows.push(style, appearance.light.row, appearance.intensity.row);

    const backgrounds = section(_('Backgrounds'), 'backgroundsEnabled', 'backgrounds-enabled').group;
    // Off, one line replaces the switches so the list is not left empty.
    appearance.backgroundsOff = new Adw.ActionRow({title: _(BACKGROUNDS_OFF_HINT)});
    backgrounds.add(appearance.backgroundsOff);
    for (const [key, setting, title, subtitle] of [
        ['hoverTile', 'show-hover-background', _('Hover background'), _('The tile under the pointed icon')],
        ['focusTile', 'show-focused-app-background', _('Focused app background'), _('Marks the app that owns the focused window')],
    ]) {
        const row = createSwitchRow(backgrounds, title, subtitle,
            enabled => setBooleanCommitted(settings, setting, enabled), state);
        previewOnHover(appearance, row, key, true);
        appearance.switches.push({row, key});
    }

    favorites.connect('changed::favorite-apps', () => {
        const changed = installedFavorites(favorites);
        appearance.apps = changed;
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

// The sample places gaps by position, before the favorite at that position.
function gapPositions(apps, gaps) {
    return Object.fromEntries(apps.map((app, position) => [position, gaps[app.get_id()]])
        .filter(([position, gap]) => position > 0 && gap));
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
    const {current} = appearance;
    // The preview shows what the dock shows: a switched off part is native.
    const shown = {
        ...current,
        spacing: current.spacingEnabled ? current.spacing : -1,
        gaps: current.groupsEnabled ? gapPositions(appearance.apps, current.gaps) : {},
        style: current.outlineEnabled ? current.style : OutlineStyle.NONE,
        // Nothing is hovered at rest; hovering the Hover background row shows the tile.
        hoverTile: false,
        focusTile: current.backgroundsEnabled && current.focusTile,
        ...appearance.hovered,
    };
    appearance.preview.update(shown);
}

export function syncAppearancePage(controls, settings) {
    const {appearance} = controls;
    appearance.current = {
        spacingEnabled: settings.get_boolean('spacing-enabled'),
        groupsEnabled: settings.get_boolean('groups-enabled'),
        outlineEnabled: settings.get_boolean('outline-enabled'),
        backgroundsEnabled: settings.get_boolean('backgrounds-enabled'),
        spacing: settings.get_int('icon-spacing'),
        flush: settings.get_boolean('dock-flush'),
        gaps: settings.get_value('group-starts').deep_unpack(),
        style: settings.get_string('dock-outline'),
        intensity: settings.get_int('outline-intensity'),
        light: settings.get_int('outline-light'),
        hoverTile: settings.get_boolean('show-hover-background'),
        focusTile: settings.get_boolean('show-focused-app-background'),
    };
    const {current} = appearance;
    for (const {button, key, value} of appearance.segments)
        button.active = current[key] === value;
    for (const {row, key} of appearance.switches)
        row.active = current[key];
    for (const {key, toggle, rows} of appearance.sections) {
        toggle.active = current[key];
        for (const row of rows)
            row.sensitive = current[key];
    }
    // Greyed switches would read as choices Flourish applies; the docks keep their own tiles.
    for (const {row} of appearance.switches)
        row.visible = current.backgroundsEnabled;
    appearance.backgroundsOff.visible = !current.backgroundsEnabled;
    appearance.dock.description = current.groupsEnabled
        ? _('Click between two favorites to add a gap, again to widen it, and once more to remove it. Drag a gap to move it. In the dock, right-click a favorite to start or merge a group.')
        : _('Turn on Groups in General to add gaps between favorites.');
    appearance.preview.can_target = current.groupsEnabled;
    appearance.intensity.adjustment.value = current.intensity;
    appearance.light.adjustment.value = current.light;
    appearance.light.row.visible = current.style === OutlineStyle.GLASS;
    refreshPreview(appearance);
}
