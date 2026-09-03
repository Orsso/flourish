import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {Profile, getBuiltInRecipe} from './lib/motion/catalog.js';
import {
    editCustomSetting,
    readActiveRecipe,
    selectProfile,
    switchToPresetFromCustom,
} from './lib/motion/settings.js';
import {buildAdvancedPage, syncAdvancedPage} from './lib/prefs/advancedPage.js';
import {MotionPreview} from './lib/prefs/motionPreview.js';
import {
    connectSwitch,
    createBackgroundRow,
    createSwitchRow,
} from './lib/prefs/rows.js';

const N_ = s => s;
const PRESET_DETAILS = [
    [Profile.SUBTLE, N_('Subtle')],
    [Profile.BALANCED, N_('Lively')],
    [Profile.EXPRESSIVE, N_('Expressive')],
];

export default class FlourishPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const state = {syncing: false};
        const controls = {};

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

        const profileGroup = new Adw.PreferencesGroup({
            title: _('Presets'),
            description: _('Hover to preview. Click to apply.'),
        });
        const customBadge = new Gtk.Label({label: _('Custom')});
        customBadge.add_css_class('accent');
        customBadge.add_css_class('caption-heading');
        customBadge.visible = false;
        profileGroup.set_header_suffix(customBadge);
        controls.customBadge = customBadge;

        const profileRow = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            homogeneous: true,
            margin_top: 6,
            margin_bottom: 6,
        });
        profileGroup.add(profileRow);
        essentials.add(profileGroup);

        controls.profiles = new Map();
        for (const [profile, title] of PRESET_DETAILS) {
            const recipe = getBuiltInRecipe(profile);
            const {button, preview} = createProfileCard(_(title), recipe);
            button.connect('clicked', () => onProfileClicked({
                window,
                profile,
                state,
                settings,
                controls,
            }));
            const hover = new Gtk.EventControllerMotion();
            hover.connect('enter', () => preview.playLoop());
            hover.connect('leave', () => preview.stopLoop());
            button.add_controller(hover);
            profileRow.append(button);
            controls.profiles.set(profile, {button, preview});
        }

        const featureGroup = new Adw.PreferencesGroup({title: _('Motion')});
        controls.hoverEnabled = createSwitchRow(
            featureGroup, _('Hover magnification'),
            _('Scale and lift the pointed icon'));
        controls.pressEnabled = createSwitchRow(
            featureGroup, _('Press feedback'), _('Squash or dim the pressed icon'));
        controls.launchEnabled = createSwitchRow(
            featureGroup, _('Launch animation'),
            _('Animate cold starts and new windows'));
        controls.hoverBackground = createBackgroundRow(
            featureGroup, 'hover', settings, state);
        controls.focusedAppBackground = createBackgroundRow(
            featureGroup, 'focusedApp', settings, state);
        essentials.add(featureGroup);

        connectSwitch(controls.hoverEnabled, enabled =>
            editCustomSetting(settings, 'custom-hover-enabled', enabled), state);
        connectSwitch(controls.pressEnabled, enabled =>
            editCustomSetting(settings, 'custom-press-enabled', enabled), state);
        connectSwitch(controls.launchEnabled, enabled =>
            editCustomSetting(settings, 'custom-launch-enabled', enabled), state);

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

        controls.dockPresent = dashToDockEnabled();

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
    const profile = settings.get_string('motion-profile');
    const recipe = readActiveRecipe(settings);

    for (const [id, card] of controls.profiles) {
        card.preview.setSelected(id === profile);
        card.button.active = id === profile;
    }
    controls.customBadge.visible = profile === Profile.CUSTOM;

    controls.hoverEnabled.active = recipe.hover.enabled;
    controls.pressEnabled.active = recipe.press.enabled;
    controls.launchEnabled.active = recipe.launch.enabled;
    controls.hoverBackground.active =
        settings.get_boolean('show-hover-background');
    controls.focusedAppBackground.active =
        settings.get_boolean('show-focused-app-background');

    syncAdvancedPage(settings, controls, recipe);
    state.syncing = false;
}

function createProfileCard(title, recipe) {
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

function onProfileClicked({window, profile, state, settings, controls}) {
    if (state.syncing)
        return;
    const current = settings.get_string('motion-profile');
    if (current !== Profile.CUSTOM) {
        if (profile === current) {
            syncControls(settings, controls, state);
            return;
        }
        selectProfile(settings, profile);
        return;
    }
    const title = _(PRESET_DETAILS.find(([id]) => id === profile)[1]);
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
            switchToPresetFromCustom(settings, profile);
        else
            syncControls(settings, controls, state);
    });
    dialog.present(window);
}

function dashToDockEnabled() {
    const shellSettings = new Gio.Settings({schema_id: 'org.gnome.shell'});
    const enabled = shellSettings.get_strv('enabled-extensions');
    return enabled.includes('dash-to-dock@micxgx.gmail.com') ||
        enabled.includes('ubuntu-dock@ubuntu.com');
}
