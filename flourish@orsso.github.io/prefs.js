import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {ExtensionState} from 'resource:///org/gnome/Shell/Extensions/js/misc/extensionUtils.js';

import {DASH_TO_DOCK_BUILDS, Preset, RecipePart, getBuiltInRecipe} from './lib/motion/catalog.js';
import {
    editCustomSetting,
    readActiveRecipe,
    resetAll,
    selectPreset,
    switchToPresetFromCustom,
} from './lib/motion/settings.js';
import {buildAnimationPages, syncAnimationPages} from './lib/prefs/animationPages.js';
import {buildAppearancePage, syncAppearancePage} from './lib/prefs/appearancePage.js';
import {MotionPreview} from './lib/prefs/motionPreview.js';
import {N_, createBadge, createSwitchRow} from './lib/prefs/rows.js';

// Switched off, each part is left to the Shell, the dock or the theme.
const APPEARANCE_SWITCHES = [
    ['spacing-enabled', N_('Icon Spacing'), N_('Set the gap between icons')],
    ['groups-enabled', N_('Groups'), N_('Gaps between groups of favorites')],
    ['outline-enabled', N_('Outline'), N_('An edge around the dock background')],
    ['backgrounds-enabled', N_('Backgrounds'), N_('Hide or add the hover and focused app tiles')],
];

const PRESET_DETAILS = [
    [Preset.SUBTLE, N_('Subtle')],
    [Preset.BALANCED, N_('Lively')],
    [Preset.EXPRESSIVE, N_('Expressive')],
];

export default class FlourishPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        // Narrower, libadwaita moves the tabs to a bottom bar; taller fits Style.
        window.set_default_size(960, 760);
        // The Extensions app turns search off; rows on every tab are searchable.
        window.search_enabled = true;
        const settings = this.getSettings();
        // Recipe batches go through a delayed copy, so every other write applies at once.
        const batch = this.getSettings();
        batch.delay();
        const state = {syncing: false};
        const controls = {dockPresent: dashToDockEnabled()};

        const page = (title, icon_name) => {
            const added = new Adw.PreferencesPage({title, icon_name});
            window.add(added);
            return added;
        };
        const essentials = page(_('General'), 'go-home-symbolic');
        const animations = {
            [RecipePart.HOVER]: page(_('Hover'), 'input-mouse-symbolic'),
            [RecipePart.PRESS]: page(_('Press'), 'input-touchpad-symbolic'),
            [RecipePart.LAUNCH]: page(_('Launch'), 'media-playback-start-symbolic'),
        };
        if (controls.dockPresent)
            animations[RecipePart.ATTENTION] = page(_('Attention'), 'preferences-system-notifications-symbolic');
        const appearance = page(_('Style'), 'preferences-desktop-appearance-symbolic');

        const bannerGroup = new Adw.PreferencesGroup();
        controls.idleBanner = new Adw.Banner({
            title: _('Flourish changes nothing yet. Pick a preset or turn on a feature below.'),
        });
        bannerGroup.add(controls.idleBanner);
        essentials.add(bannerGroup);

        const presetGroup = new Adw.PreferencesGroup({
            title: _('Presets'),
            description: _('Hover to preview. Click to apply.'),
        });
        const customBadge = createBadge(_('Custom'));
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
                batch,
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
        const editor = key => value => editCustomSetting(batch, key, value);
        controls.hoverEnabled = createSwitchRow(
            featureGroup, _('Hover Motion'),
            _('Magnification and elevation around the pointer'),
            editor('custom-hover-enabled'), state);
        controls.pressEnabled = createSwitchRow(
            featureGroup, _('Press Feedback'), _('Squash or dim the pressed icon'),
            editor('custom-press-enabled'), state);
        controls.launchEnabled = createSwitchRow(
            featureGroup, _('Launch Animation'),
            _('Animate cold starts and new windows'),
            editor('custom-launch-enabled'), state);
        if (controls.dockPresent) {
            controls.attentionEnabled = createSwitchRow(
                featureGroup, _('Attention'),
                _('Animate icons that ask for attention'),
                editor('custom-attention-enabled'), state);
        }
        essentials.add(featureGroup);

        const appearanceGroup = new Adw.PreferencesGroup({title: _('Style')});
        appearanceGroup.set_header_suffix(createBadge(_('Beta')));
        // Outside the presets: a change keeps the current one.
        controls.appearanceSwitches = APPEARANCE_SWITCHES.map(([key, title, subtitle]) => [
            createSwitchRow(appearanceGroup, _(title), _(subtitle), value => settings.set_boolean(key, value), state),
            key,
        ]);
        essentials.add(appearanceGroup);

        const resetGroup = new Adw.PreferencesGroup();
        const resetRow = new Adw.ActionRow({
            title: _('Reset All Settings'),
            subtitle: _('Flourish goes back to changing nothing'),
        });
        const resetButton = new Gtk.Button({label: _('Reset'), valign: Gtk.Align.CENTER});
        resetButton.add_css_class('destructive-action');
        resetButton.connect('clicked', () => confirm(window, {
            heading: _('Reset All Settings?'),
            body: _('Every Flourish setting goes back to its default. Your group gaps are kept for when you turn Groups back on. Flourish will change nothing until you pick a preset or turn on a feature.'),
            label: _('Reset'),
            onConfirm: () => resetAll(batch),
        }));
        resetRow.add_suffix(resetButton);
        resetGroup.add(resetRow);
        essentials.add(resetGroup);

        const disposeAppearance = buildAppearancePage(appearance, controls, settings, state);
        buildAnimationPages(animations, controls, batch, state);

        const sync = () => syncControls(settings, controls, state);
        const changedId = settings.connect('changed', sync);
        sync();
        window.connect('close-request', () => {
            settings.disconnect(changedId);
            disposeAppearance();
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
    controls.hoverEnabled.active = recipe.hover.enabled;
    controls.pressEnabled.active = recipe.press.enabled;
    controls.launchEnabled.active = recipe.launch.enabled;
    if (controls.attentionEnabled)
        controls.attentionEnabled.active = recipe.attention.enabled;
    for (const [row, key] of controls.appearanceSwitches)
        row.active = settings.get_boolean(key);
    const idle = Object.values(RecipePart).every(part => !recipe[part].enabled) &&
        controls.appearanceSwitches.every(([row]) => !row.active);
    controls.idleBanner.revealed = idle;
    controls.customBadge.visible = preset === Preset.CUSTOM && !idle;
    syncAppearancePage(controls, settings);

    syncAnimationPages(controls, recipe);
    state.syncing = false;
}

function confirm(window, {heading, body, label, onConfirm, onCancel = () => {}}) {
    const dialog = new Adw.AlertDialog({heading, body});
    dialog.add_response('cancel', _('Cancel'));
    dialog.add_response('confirm', label);
    dialog.set_response_appearance('confirm', Adw.ResponseAppearance.DESTRUCTIVE);
    dialog.set_default_response('cancel');
    dialog.set_close_response('cancel');
    dialog.connect('response', (_dialog, response) => (response === 'confirm' ? onConfirm : onCancel)());
    dialog.present(window);
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

function onPresetClicked({window, preset, title, state, settings, batch, controls}) {
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
    confirm(window, {
        heading: _('Switch to %s?').replace('%s', title),
        body: _('Your Custom recipe will be abandoned and replaced by the %s preset values.').replace('%s', title),
        label: _('Switch'),
        onConfirm: () => switchToPresetFromCustom(batch, preset),
        onCancel: () => syncControls(settings, controls, state),
    });
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
