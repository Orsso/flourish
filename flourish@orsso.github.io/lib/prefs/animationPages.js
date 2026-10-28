import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';
import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    AttentionCyclePause,
    AttentionCycles,
    AttentionEffect,
    AttentionInterval,
    AttentionReminders,
    Easing,
    LaunchEffect,
    Reach,
    PressEffect,
    PressMode,
    RecipePart,
} from '../motion/catalog.js';
import {editCustomSetting, readActiveRecipe} from '../motion/settings.js';
import {MotionPreview} from './motionPreview.js';
import {
    createComboRow,
    createScaleRow,
    createSpinRow,
    createSwitchRow,
    setComboValue,
} from './rows.js';

// One page per recipe part; the Attention page exists only with a dock.
export function buildAnimationPages(pages, controls, settings, state) {
    controls.partPreviews = {};

    const hover = createPartGroup(pages, controls, settings, _('Hover'), RecipePart.HOVER);
    hover.group.description = _('Motion adapts to the available space.');
    controls.hoverScale = createScaleRow(
        hover.group, _('Magnification'), 100, 200, 1,
        value => editCustomSetting(settings, 'custom-hover-scale', value / 100), state);
    controls.hoverScale.scale.draw_value = true;
    controls.hoverScale.scale.set_format_value_func((_scale, value) => `${Math.round(value)}%`);
    controls.hoverLift = createSpinRow(
        hover.group, _('Elevation'), 0, 16, 1,
        value => editCustomSetting(settings, 'custom-hover-lift', Math.round(value)), state,
        _('px'));
    controls.hoverDuration = createSpinRow(
        hover.group, _('Transition Duration'), 80, 800, 10,
        value => editCustomSetting(settings, 'custom-hover-duration', Math.round(value)), state,
        _('ms'));
    controls.hoverEasing = createComboRow(
        hover.group, _('Transition Curve'),
        [
            [_('Linear'), Easing.LINEAR],
            [_('Ease Out (Quad)'), Easing.EASE_OUT_QUAD],
            [_('Ease Out (Cubic)'), Easing.EASE_OUT_CUBIC],
            [_('Ease Out (Back)'), Easing.EASE_OUT_BACK],
        ], value => editCustomSetting(settings, 'custom-hover-easing', value), state);
    controls.reach = createSpinRow(
        hover.group, _('Reach'), Reach.MIN, Reach.MAX, 1,
        value => editCustomSetting(settings, 'custom-neighbor-radius', Math.round(value)), state,
        _('Reach on each side of the pointer, in icon steps'));
    holdWhileSliding(controls.hoverScale, hover);
    controls.dynamicSpacing = createSwitchRow(
        hover.group, _('Dynamic Spacing'),
        _('Move neighboring icons apart as they grow'),
        enabled => editCustomSetting(settings, 'custom-hover-dynamic-spacing', enabled), state,
        _('When off, icons keep their positions and may overlap at high magnification. ' +
        'Motion still adapts to the available space.'));

    const press = createPartGroup(pages, controls, settings, _('Press'), RecipePart.PRESS);
    controls.pressMode = createComboRow(
        press.group, _('Trigger'),
        [
            [_('Clicks Only'), PressMode.CLICKS_ONLY],
            [_('Launches Only'), PressMode.LAUNCHES_ONLY],
            [_('Clicks and Launches'), PressMode.CLICKS_AND_LAUNCHES],
        ], value => editCustomSetting(settings, 'custom-press-mode', value), state);
    controls.pressEffect = createComboRow(
        press.group, _('Effect'),
        [
            [_('Squash'), PressEffect.SQUASH],
            [_('Dim'), PressEffect.DIM],
        ], value => editCustomSetting(settings, 'custom-press-effect', value), state);
    controls.pressIntensity = createScaleRow(
        press.group, _('Intensity'), 0, 1, 0.05,
        value => editCustomSetting(settings, 'custom-press-intensity', value), state);
    controls.pressDuration = createSpinRow(
        press.group, _('Duration'), 80, 500, 10,
        value => editCustomSetting(settings, 'custom-press-duration', Math.round(value)), state,
        _('ms'));
    holdWhileSliding(controls.pressIntensity, press);

    const launch = createPartGroup(pages, controls, settings, _('Launch'), RecipePart.LAUNCH);
    controls.launchEffect = createComboRow(
        launch.group, _('Effect'),
        [
            [_('Pulse'), LaunchEffect.PULSE],
            [_('Bounce'), LaunchEffect.BOUNCE],
            [_('Stretch'), LaunchEffect.STRETCH],
            [_('Stock Zoom'), LaunchEffect.STOCK],
        ], value => editCustomSetting(settings, 'custom-launch-effect', value), state);
    controls.launchIntensity = createScaleRow(
        launch.group, _('Intensity'), 0, 1, 0.05,
        value => editCustomSetting(settings, 'custom-launch-intensity', value), state);
    controls.launchSpeed = createScaleRow(
        launch.group, _('Speed'), 0.30, 1.00, 0.05,
        value => editCustomSetting(settings, 'custom-launch-speed', value), state);
    controls.launchRepeat = createSwitchRow(
        launch.group, _('Repeat While Starting'),
        _('Stop when the application is running'),
        enabled => editCustomSetting(settings, 'custom-launch-repeat', enabled), state);
    controls.launchSoftenRepeats = createSwitchRow(
        launch.group, _('Soften Repeated Cycles'),
        _('Reduce the intensity of each repeat'),
        enabled => editCustomSetting(settings, 'custom-launch-soften-repeats', enabled), state);
    controls.launchRepeatPause = createSpinRow(
        launch.group, _('Repeat Pause'), 0, 1000, 50,
        value => editCustomSetting(settings, 'custom-launch-repeat-pause', Math.round(value)),
        state, _('ms'));
    controls.launchMaxDuration = createSpinRow(
        launch.group, _('Maximum Duration'), 500, 15000, 500,
        value => editCustomSetting(settings, 'custom-launch-max-duration', Math.round(value)),
        state, _('ms'));
    controls.bounceDecay = createScaleRow(
        launch.group, _('Bounce Decay'), 0, 1, 0.05,
        value => editCustomSetting(settings, 'custom-bounce-decay', value), state);
    controls.pulseCount = createSpinRow(
        launch.group, _('Pulse Count'), 1, 4, 1,
        value => editCustomSetting(settings, 'custom-pulse-count', Math.round(value)), state);
    controls.stretchElasticity = createScaleRow(
        launch.group, _('Stretch Elasticity'), 0, 1, 0.05,
        value => editCustomSetting(settings, 'custom-stretch-elasticity', value), state);

    if (controls.dockPresent) {
        const attention = createPartGroup(
            pages, controls, settings, _('Attention'), RecipePart.ATTENTION);
        attention.group.description =
            _('Plays when an app asks for attention, with Dash to Dock or Ubuntu Dock.');
        controls.attentionEffect = createComboRow(
            attention.group, _('Effect'),
            [
                [_('Pulse'), AttentionEffect.PULSE],
                [_('Bounce'), AttentionEffect.BOUNCE],
                [_('Stretch'), AttentionEffect.STRETCH],
                [_('Wiggle'), AttentionEffect.WIGGLE],
            ], value => editCustomSetting(settings, 'custom-attention-effect', value), state);
        controls.attentionIntensity = createScaleRow(
            attention.group, _('Intensity'), 0, 1, 0.05,
            value => editCustomSetting(settings, 'custom-attention-intensity', value), state);
        controls.attentionSpeed = createScaleRow(
            attention.group, _('Speed'), 0.30, 1.00, 0.05,
            value => editCustomSetting(settings, 'custom-attention-speed', value), state);
        controls.attentionCycles = createSpinRow(
            attention.group, _('Cycles'),
            AttentionCycles.MIN, AttentionCycles.MAX, 1,
            value => editCustomSetting(settings, 'custom-attention-cycles', Math.round(value)),
            state, _('Cycles played at each reminder'));
        controls.attentionCyclePause = createSpinRow(
            attention.group, _('Cycle Pause'),
            AttentionCyclePause.MIN, AttentionCyclePause.MAX, 10,
            value => editCustomSetting(
                settings, 'custom-attention-cycle-pause', Math.round(value)),
            state, _('ms'));
        controls.attentionInterval = createSpinRow(
            attention.group, _('Reminder Interval'),
            AttentionInterval.MIN, AttentionInterval.MAX, 1,
            value => editCustomSetting(settings, 'custom-attention-interval', Math.round(value)),
            state, _('Seconds between two reminders'));
        controls.attentionReminders = createSpinRow(
            attention.group, _('Reminders'),
            AttentionReminders.MIN, AttentionReminders.MAX, 1,
            value => editCustomSetting(settings, 'custom-attention-reminders', Math.round(value)),
            state, _('Stop after this many reminders'));
        controls.attentionPeek = createSwitchRow(
            attention.group, _('Show When the Dock Is Hidden'),
            _('Slide the icon out from the dock edge'),
            enabled => editCustomSetting(settings, 'custom-attention-peek', enabled), state,
            _('Useful with IntelliHide or auto-hide: the icon slides out of the ' +
            'hidden dock on its own. For the best effect, turn off ' +
            '"Show dock for urgent notifications" in the Dash to Dock hiding ' +
            'settings, otherwise the whole dock comes out first. Nothing plays in ' +
            'Do Not Disturb, and over a fullscreen window the icon shows only if ' +
            'Dash to Dock may reveal the dock there.'));
        holdWhileSliding(controls.attentionIntensity, attention);
        holdWhileSliding(controls.attentionSpeed, attention);
    }
}

export function syncAnimationPages(controls, recipe) {
    controls.dynamicSpacing.toggle.active = recipe.hover.dynamicSpacing;
    controls.hoverScale.adjustment.value = recipe.hover.scale * 100;
    controls.hoverLift.value = recipe.hover.lift;
    controls.hoverDuration.value = recipe.hover.duration;
    setComboValue(controls.hoverEasing, recipe.hover.easing);
    controls.reach.value = recipe.hover.reach;
    setComboValue(controls.pressMode, recipe.press.mode);
    setComboValue(controls.pressEffect, recipe.press.effect);
    controls.pressIntensity.adjustment.value = recipe.press.intensity;
    controls.pressDuration.value = recipe.press.duration;
    setComboValue(controls.launchEffect, recipe.launch.effect);
    controls.launchIntensity.adjustment.value = recipe.launch.intensity;
    controls.launchSpeed.adjustment.value = recipe.launch.speed;
    controls.launchRepeat.active = recipe.launch.repeat;
    controls.launchSoftenRepeats.active = recipe.launch.softenRepeats;
    controls.launchRepeatPause.value = recipe.launch.repeatPause;
    controls.launchMaxDuration.value = recipe.launch.maxDuration;
    controls.bounceDecay.adjustment.value = recipe.launch.bounceDecay;
    controls.pulseCount.value = recipe.launch.pulseCount;
    controls.stretchElasticity.adjustment.value = recipe.launch.stretchElasticity;
    const stockLaunch = recipe.launch.effect === LaunchEffect.STOCK;
    controls.launchIntensity.row.visible = !stockLaunch;
    controls.launchSpeed.row.visible = !stockLaunch;
    controls.launchRepeat.visible = !stockLaunch;
    controls.launchSoftenRepeats.visible = recipe.launch.repeat && !stockLaunch;
    controls.launchRepeatPause.visible = recipe.launch.repeat && !stockLaunch;
    controls.launchMaxDuration.visible = !stockLaunch;
    controls.bounceDecay.row.visible = recipe.launch.effect === LaunchEffect.BOUNCE;
    controls.pulseCount.visible = recipe.launch.effect === LaunchEffect.PULSE;
    controls.stretchElasticity.row.visible =
        recipe.launch.effect === LaunchEffect.STRETCH;
    if (controls.attentionEffect) {
        setComboValue(controls.attentionEffect, recipe.attention.effect);
        controls.attentionIntensity.adjustment.value = recipe.attention.intensity;
        controls.attentionSpeed.adjustment.value = recipe.attention.speed;
        controls.attentionCycles.value = recipe.attention.cycles;
        controls.attentionCyclePause.value = recipe.attention.cyclePause;
        controls.attentionInterval.value = recipe.attention.interval;
        controls.attentionReminders.value = recipe.attention.reminders;
        controls.attentionPeek.toggle.active = recipe.attention.peekWhenHidden;
    }
    for (const preview of Object.values(controls.partPreviews))
        preview.updateRecipe(recipe);
}

function createPartGroup(pages, controls, settings, title, part) {
    const group = new Adw.PreferencesGroup({title});
    const preview = new MotionPreview({recipe: readActiveRecipe(settings), part});
    const pointer = new Gtk.EventControllerMotion();
    pointer.connect('enter', () => preview.playLoop());
    pointer.connect('leave', () => preview.stopLoop());
    group.add_controller(pointer);
    group.set_header_suffix(preview);
    controls.partPreviews[part] = preview;
    pages[part].add(group);
    return {group, preview, pointer};
}

// Raw events: the scale claims the drag and cancels a GestureClick.
function holdWhileSliding(control, {preview, pointer}) {
    const events = new Gtk.EventControllerLegacy();
    events.set_propagation_phase(Gtk.PropagationPhase.CAPTURE);
    events.connect('event', (_events, event) => {
        const type = event.get_event_type();
        if (type !== Gdk.EventType.BUTTON_PRESS &&
            type !== Gdk.EventType.BUTTON_RELEASE)
            return false;
        if (event.get_button() !== Gdk.BUTTON_PRIMARY)
            return false;
        if (type === Gdk.EventType.BUTTON_PRESS)
            preview.holdPose();
        else
            preview.releasePose(pointer.contains_pointer);
        return false;
    });
    control.scale.add_controller(events);
}
