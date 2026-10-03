import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {ExtensionState} from 'resource:///org/gnome/Shell/Extensions/js/misc/extensionUtils.js';

import {DASH_TO_DOCK_BUILDS, Preset, getBuiltInRecipe} from './lib/motion/catalog.js';
import {
    editCustomSetting,
    readActiveRecipe,
    selectPreset,
    setStringCommitted,
    switchToPresetFromCustom,
} from './lib/motion/settings.js';
import {buildAdvancedPage, syncAdvancedPage} from './lib/prefs/advancedPage.js';
import {MotionPreview} from './lib/prefs/motionPreview.js';
import {
    N_,
    createBackgroundRows,
    createComboRow,
    createSwitchRow,
    setComboValue,
} from './lib/prefs/rows.js';

const OUTLINES = [
    [N_('None'), 'none'],
    [N_('Follow theme'), 'auto'],
    [N_('Light'), 'light'],
    [N_('Dark'), 'dark'],
];
const PRESET_DETAILS = [
    [Preset.SUBTLE, N_('Subtle')],
    [Preset.BALANCED, N_('Lively')],
    [Preset.EXPRESSIVE, N_('Expressive')],
];

export default class FlourishPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const state = {syncing: false};
        const controls = {dockPresent: dashToDockEnabled(), backgroundRows: []};

        const essentials = new Adw.PreferencesPage({
            name: 'essentials',
            title: _('Basics'),
            icon_name: 'applications-graphics-symbolic',
        });
        const advanced = new Adw.PreferencesPage({
            name: 'advanced',
            title: _('More'),
            icon_name: 'preferences-system-symbolic',
        });
        window.add(essentials);
        window.add(advanced);

        const presetGroup = new Adw.PreferencesGroup({
            title: _('Presets'),
            description: _('Hover to preview. Click to apply.'),
        });
        const customBadge = new Gtk.Label({label: _('Custom')});
        customBadge.add_css_class('accent');
        customBadge.add_css_class('caption-heading');
        customBadge.visible = false;
        presetGroup.set_header_suffix(customBadge);
        controls.customBadge = customBadge;

        const presetRow = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            homogeneous: true,
            margin_top: 6,
            margin_bottom: 6,
        });
        presetGroup.add(presetRow);
        essentials.add(presetGroup);

        controls.presets = new Map();
        for (const [preset, title] of PRESET_DETAILS) {
            const recipe = getBuiltInRecipe(preset);
            const {button, preview} = createPresetCard(_(title), recipe);
            button.connect('clicked', () => onPresetClicked({
                window,
                preset,
                title: _(title),
                state,
                settings,
                controls,
            }));
            const hover = new Gtk.EventControllerMotion();
            hover.connect('enter', () => preview.playLoop());
            hover.connect('leave', () => preview.stopLoop());
            button.add_controller(hover);
            presetRow.append(button);
            controls.presets.set(preset, {button, preview});
        }

        const featureGroup = new Adw.PreferencesGroup({title: _('Motion')});
        const editor = key => value => editCustomSetting(settings, key, value);
        controls.hoverEnabled = createSwitchRow(
            featureGroup, _('Hover motion'),
            _('Magnification and elevation around the pointer'),
            editor('custom-hover-enabled'), state);
        controls.pressEnabled = createSwitchRow(
            featureGroup, _('Press feedback'), _('Squash or dim the pressed icon'),
            editor('custom-press-enabled'), state);
        controls.launchEnabled = createSwitchRow(
            featureGroup, _('Launch animation'),
            _('Animate cold starts and new windows'),
            editor('custom-launch-enabled'), state);
        if (controls.dockPresent) {
            controls.attentionEnabled = createSwitchRow(
                featureGroup, _('Attention'),
                _('Animate icons that ask for attention'),
                editor('custom-attention-enabled'), state);
        }
        essentials.add(featureGroup);

        const styleGroup = new Adw.PreferencesGroup({title: _('Style')});
        if (controls.dockPresent) {
            controls.outline = createComboRow(
                styleGroup, _('Dock outline'),
                OUTLINES.map(([label, value]) => [_(label), value]),
                value => setStringCommitted(settings, 'dock-outline', value), state);
        }
        createBackgroundRows(styleGroup, settings, controls, state);
        essentials.add(styleGroup);

        const navigationGroup = new Adw.PreferencesGroup();
        const advancedRow = new Adw.ActionRow({
            title: _('More Settings'),
            subtitle: _('Timing, effects, and repeats'),
            activatable: true,
        });
        advancedRow.add_suffix(new Gtk.Image({icon_name: 'go-next-symbolic'}));
        advancedRow.connect('activated', () => {
            window.visible_page_name = 'advanced';
        });
        navigationGroup.add(advancedRow);
        essentials.add(navigationGroup);

        buildAdvancedPage(advanced, controls, settings, state);

        const sync = () => syncControls(settings, controls, state);
        const changedId = settings.connect('changed', sync);
        sync();
        window.connect('close-request', () => {
            settings.disconnect(changedId);
            return false;
        });
    }
}

function syncControls(settings, controls, state) {
    state.syncing = true;
    const preset = settings.get_string('motion-profile');
    const recipe = readActiveRecipe(settings);

    for (const [id, card] of controls.presets) {
        card.preview.setSelected(id === preset);
        card.button.active = id === preset;
    }
    controls.customBadge.visible = preset === Preset.CUSTOM;

    controls.hoverEnabled.active = recipe.hover.enabled;
    controls.pressEnabled.active = recipe.press.enabled;
    controls.launchEnabled.active = recipe.launch.enabled;
    if (controls.attentionEnabled)
        controls.attentionEnabled.active = recipe.attention.enabled;
    for (const [row, key] of controls.backgroundRows)
        row.active = settings.get_boolean(key);
    if (controls.outline)
        setComboValue(controls.outline, settings.get_string('dock-outline'));

    syncAdvancedPage(controls, recipe);
    state.syncing = false;
}

function createPresetCard(title, recipe) {
    const button = new Gtk.ToggleButton({hexpand: true});
    button.add_css_class('card');
    const content = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 4,
        margin_top: 6,
        margin_bottom: 6,
        margin_start: 6,
        margin_end: 6,
    });
    const preview = new MotionPreview({recipe});
    const titleLabel = new Gtk.Label({label: title});
    titleLabel.add_css_class('caption-heading');
    content.append(preview);
    content.append(titleLabel);
    button.set_child(content);
    return {button, preview};
}

function onPresetClicked({window, preset, title, state, settings, controls}) {
    if (state.syncing)
        return;
    const current = settings.get_string('motion-profile');
    if (current !== Preset.CUSTOM) {
        if (preset === current) {
            syncControls(settings, controls, state);
            return;
        }
        selectPreset(settings, preset);
        return;
    }
    const dialog = new Adw.AlertDialog({
        heading: _('Switch to %s?').replace('%s', title),
        body: _('Your Custom recipe will be abandoned and replaced by the %s preset values.').replace('%s', title),
    });
    dialog.add_response('cancel', _('Cancel'));
    dialog.add_response('switch', _('Switch'));
    dialog.set_response_appearance('switch', Adw.ResponseAppearance.DESTRUCTIVE);
    dialog.set_default_response('cancel');
    dialog.set_close_response('cancel');
    dialog.connect('response', (_dialog, response) => {
        if (response === 'switch')
            switchToPresetFromCustom(settings, preset);
        else
            syncControls(settings, controls, state);
    });
    dialog.present(window);
}

// Ubuntu enables its dock through the session mode, not enabled-extensions.
function dashToDockEnabled() {
    return DASH_TO_DOCK_BUILDS.some(uuid => {
        try {
            const [info] = Gio.DBus.session.call_sync('org.gnome.Shell', '/org/gnome/Shell',
                'org.gnome.Shell.Extensions', 'GetExtensionInfo', new GLib.Variant('(s)', [uuid]),
                null, Gio.DBusCallFlags.NONE, -1, null).recursiveUnpack();
            return info.state === ExtensionState.ACTIVE;
        } catch {
            // No Shell on the bus, as when the preferences run outside a session.
            return false;
        }
    });
}
