import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';
import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    Easing,
    LaunchEffect,
    NeighborRadius,
    PressEffect,
    PressMode,
} from '../motion/catalog.js';
import {OVERSHOOT_RESERVE, fitHoverToBudget} from '../motion/transforms.js';
import {MotionPreview} from './motionPreview.js';
import {
    connectSwitch,
    createBackgroundRow,
    createComboRow,
    createHelpButton,
    createScaleRow,
    createSpinRow,
    createSwitchRow,
    setComboValue,
} from './rows.js';

export function buildAdvancedPage(page, controls, editor, state) {
    controls.effectPreviews = {};

    const budgetGroup = new Adw.PreferencesGroup();
    const budgetRow = new Adw.ActionRow({
        title: _('Hover room'),
        subtitle: _('Measured from the dock'),
    });
    budgetRow.add_suffix(createHelpButton(
        _('The dock clips icons at its edge. Magnification and lift share ' +
        'the space that is left; a smaller dock icon size usually ' +
        'leaves more room. This only concerns the dock: the overview dash ' +
        'is never clipped, so the full values always apply there.')));
    controls.budgetRow = budgetRow;
    budgetGroup.add(budgetRow);
    page.add(budgetGroup);

    const hover = createEffectGroup(page, controls, editor, _('Hover'), 'hover');
    controls.hoverScale = createScaleRow(
        hover.group, _('Magnification'), 1, 1.30, 0.01,
        value => editor.edit('custom-hover-scale', value), state);
    controls.hoverLift = createSpinRow(
        hover.group, _('Outward lift'), 0, 12, 1,
        value => editor.edit('custom-hover-lift', Math.round(value)), state,
        _('px'));
    controls.hoverDuration = createSpinRow(
        hover.group, _('Duration'), 50, 500, 10,
        value => editor.edit('custom-hover-duration', Math.round(value)), state,
        _('ms'));
    controls.hoverEasing = createComboRow(
        hover.group, _('Easing'),
        [
            [_('Linear'), Easing.LINEAR],
            [_('Ease out (quad)'), Easing.EASE_OUT_QUAD],
            [_('Ease out (cubic)'), Easing.EASE_OUT_CUBIC],
            [_('Ease out (back)'), Easing.EASE_OUT_BACK],
        ], value => editor.edit('custom-hover-easing', value), state);
    controls.neighborScale = createScaleRow(
        hover.group, _('Neighbor scale'), 1, 1.15, 0.01,
        value => editor.edit('custom-neighbor-scale', value), state);
    controls.neighborRadius = createSpinRow(
        hover.group, _('Neighbor radius'), NeighborRadius.MIN, NeighborRadius.MAX, 1,
        value => editor.edit('custom-neighbor-radius', Math.round(value)), state,
        _('Icons on each side that follow the hover'));
    holdWhileSliding(controls.hoverScale, hover);
    holdWhileSliding(controls.neighborScale, hover);

    const press = createEffectGroup(page, controls, editor, _('Press'), 'press');
    controls.pressMode = createComboRow(
        press.group, _('Trigger'),
        [
            [_('Launches only'), PressMode.LAUNCHES_ONLY],
            [_('All primary clicks'), PressMode.ALL_PRIMARY_CLICKS],
        ], value => editor.edit('custom-press-mode', value), state);
    controls.pressEffect = createComboRow(
        press.group, _('Effect'),
        [
            [_('Squash'), PressEffect.SQUASH],
            [_('Dim'), PressEffect.DIM],
        ], value => editor.edit('custom-press-effect', value), state);
    controls.pressIntensity = createScaleRow(
        press.group, _('Intensity'), 0, 1, 0.05,
        value => editor.edit('custom-press-intensity', value), state);
    controls.pressDuration = createSpinRow(
        press.group, _('Duration'), 50, 300, 10,
        value => editor.edit('custom-press-duration', Math.round(value)), state,
        _('ms'));
    holdWhileSliding(controls.pressIntensity, press);

    const launch = createEffectGroup(page, controls, editor, _('Launch'), 'launch');
    controls.launchEffect = createComboRow(
        launch.group, _('Effect'),
        [
            [_('Pulse'), LaunchEffect.PULSE],
            [_('Bounce'), LaunchEffect.BOUNCE],
            [_('Stretch'), LaunchEffect.STRETCH],
            [_('Stock zoom'), LaunchEffect.STOCK],
        ], value => editor.edit('custom-launch-effect', value), state);
    controls.launchIntensity = createScaleRow(
        launch.group, _('Intensity'), 0, 1, 0.05,
        value => editor.edit('custom-launch-intensity', value), state);
    controls.launchSpeed = createScaleRow(
        launch.group, _('Speed'), 0.50, 2, 0.05,
        value => editor.edit('custom-launch-speed', value), state);
    controls.launchRepeat = createSwitchRow(
        launch.group, _('Repeat while starting'),
        _('Stop when the application is running'));
    connectSwitch(controls.launchRepeat, enabled =>
        editor.edit('custom-launch-repeat', enabled), state);
    controls.launchSoftenRepeats = createSwitchRow(
        launch.group, _('Soften repeated cycles'),
        _('Reduce the intensity of each repeat'));
    connectSwitch(controls.launchSoftenRepeats, enabled =>
        editor.edit('custom-launch-soften-repeats', enabled), state);
    controls.launchRepeatPause = createSpinRow(
        launch.group, _('Repeat pause'), 0, 1000, 50,
        value => editor.edit('custom-launch-repeat-pause', Math.round(value)),
        state, _('ms'));
    controls.launchMaxDuration = createSpinRow(
        launch.group, _('Maximum duration'), 500, 15000, 500,
        value => editor.edit('custom-launch-max-duration', Math.round(value)),
        state, _('ms'));
    controls.bounceDecay = createScaleRow(
        launch.group, _('Bounce decay'), 0, 1, 0.05,
        value => editor.edit('custom-bounce-decay', value), state);
    controls.pulseCount = createSpinRow(
        launch.group, _('Pulse count'), 1, 4, 1,
        value => editor.edit('custom-pulse-count', Math.round(value)), state);
    controls.stretchElasticity = createScaleRow(
        launch.group, _('Stretch elasticity'), 0, 1, 0.05,
        value => editor.edit('custom-stretch-elasticity', value), state);

    const appearanceGroup = new Adw.PreferencesGroup({title: _('Appearance')});
    controls.advancedHoverBackground = createBackgroundRow(
        appearanceGroup, 'hover', editor, state);
    controls.advancedFocusedAppBackground = createBackgroundRow(
        appearanceGroup, 'focusedApp', editor, state);
    page.add(appearanceGroup);

    const resetGroup = new Adw.PreferencesGroup();
    const resetRow = new Adw.ActionRow({
        title: _('Reset Custom'),
        subtitle: _('Copy the Subtle profile into Custom'),
    });
    const resetButton = new Gtk.Button({label: _('Reset'), valign: Gtk.Align.CENTER});
    resetButton.add_css_class('destructive-action');
    resetButton.connect('clicked', () => editor.resetCustom());
    resetRow.add_suffix(resetButton);
    resetGroup.add(resetRow);
    page.add(resetGroup);
}

export function syncAdvancedPage(settings, controls, recipe) {
    controls.hoverScale.adjustment.value = recipe.hover.scale;
    controls.hoverLift.value = recipe.hover.lift;
    // The stored measurement keeps its last value after the dock is gone.
    applyHoverBudget(
        controls, recipe,
        controls.dockPresent ? settings.get_double('measured-hover-budget') : 0,
        controls.dockPresent ? settings.get_double('measured-icon-size') : 0);
    controls.hoverDuration.value = recipe.hover.duration;
    setComboValue(controls.hoverEasing, recipe.hover.easing);
    controls.neighborScale.adjustment.value = recipe.hover.neighborScale;
    controls.neighborRadius.value = recipe.hover.neighborRadius;
    setComboValue(controls.pressMode, recipe.press.mode);
    setComboValue(controls.pressEffect, recipe.press.effect);
    controls.pressIntensity.adjustment.value = recipe.press.intensity;
    controls.pressDuration.value = recipe.press.duration;
    const instantPrimaryDim = recipe.press.effect === PressEffect.DIM &&
        recipe.press.mode === PressMode.ALL_PRIMARY_CLICKS;
    controls.pressDuration.sensitive = !instantPrimaryDim;
    controls.pressDuration.subtitle = instantPrimaryDim
        ? _('Dim is instant for primary clicks')
        : _('ms');
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
    controls.advancedHoverBackground.active =
        settings.get_boolean('show-hover-background');
    controls.advancedFocusedAppBackground.active =
        settings.get_boolean('show-focused-app-background');
    for (const preview of Object.values(controls.effectPreviews))
        preview.updateRecipe(recipe);
}

// The preview loops while the pointer is in the group.
function createEffectGroup(page, controls, editor, title, effect) {
    const group = new Adw.PreferencesGroup({title});
    const preview = new MotionPreview({recipe: editor.recipe, effect});
    const pointer = new Gtk.EventControllerMotion();
    pointer.connect('enter', () => preview.playLoop());
    pointer.connect('leave', () => preview.stopLoop());
    group.add_controller(pointer);
    group.set_header_suffix(preview);
    controls.effectPreviews[effect] = preview;
    page.add(group);
    return {group, preview, pointer};
}

// Raw events: the scale claims the drag, so a Gtk.GestureClick would be
// cancelled before the release arrives.
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

// Show how much room the dock leaves for hover motion.
function applyHoverBudget(controls, recipe, budgetPx, iconSize) {
    const budgetRow = controls.budgetRow;
    const scaleRow = controls.hoverScale.row;
    const liftRow = controls.hoverLift;

    if (!(budgetPx > 0) || !(iconSize > 0)) {
        budgetRow.subtitle = _('No dock to measure (full motion applies)');
        scaleRow.subtitle = _('Outward magnification on hover');
        liftRow.subtitle = _('Outward rise on hover, in pixels');
        return;
    }

    const overshoot =
        recipe.hover.easing === Easing.EASE_OUT_BACK ? OVERSHOOT_RESERVE : 0;
    const fit = fitHoverToBudget(
        recipe.hover.scale, recipe.hover.lift, iconSize, budgetPx, overshoot);
    const room = Math.round(budgetPx);
    const scaleUse = Math.max(0, iconSize * (fit.hoverScale - 1));
    const liftUse = Math.max(0, fit.lift);
    const reach = iconSize * Math.max(0, recipe.hover.scale - 1) +
        Math.max(0, recipe.hover.lift);
    const reduced = reach > budgetPx / (1 + overshoot) + 0.01;

    budgetRow.subtitle = _('About %s px of room per icon, updates with your dock')
        .replace('%s', room);
    scaleRow.subtitle = (reduced
        ? _('Reduced to fit the dock: ~%s of %s px')
        : _('Uses ~%s of %s px'))
        .replace('%s', scaleUse.toFixed(1)).replace('%s', room);
    liftRow.subtitle = (reduced
        ? _('Reduced to fit the dock: ~%s of %s px')
        : _('Uses ~%s of %s px'))
        .replace('%s', liftUse.toFixed(1)).replace('%s', room);
}
