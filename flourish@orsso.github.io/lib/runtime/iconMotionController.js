import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {DockPosition} from '../motion/catalog.js';
import {PressInteraction} from '../motion/pressInteraction.js';
import {
    dimOpacity,
    hoverNeedsBudget,
    neighborScaleAt,
    resolveIconTransform,
} from '../motion/transforms.js';
import {resolveAnimationMode} from './easing.js';
import {sharpenIconTexture} from './iconTexture.js';
import {refreshWidgetStyle} from './styleRefresh.js';

const OWNED_TRANSITIONS = Object.freeze([
    'scale-x',
    'scale-y',
    'translation-x',
    'translation-y',
]);

export class IconMotionController {
    #bin;
    #destroyed = false;
    #dimmed = false;
    #hovered = false;
    #icon;
    #lastApplied = null;
    #launching = false;
    #neighborDistance = Infinity;
    #onDestroyed;
    #onHoverChanged;
    #onMeasured;
    #original;
    #pendingBudgetReport = false;
    #position;
    #press = new PressInteraction();
    #recipe;
    #restoreTexture;
    #signalIds = [];
    #urgent = false;

    constructor({
        icon,
        bin,
        position,
        recipe,
        onHoverChanged = () => {},
        onDestroyed = () => {},
        onMeasured = () => {},
    }) {
        this.#icon = icon;
        this.#bin = bin;
        this.#position = position;
        this.#recipe = recipe;
        this.#onHoverChanged = onHoverChanged;
        this.#onDestroyed = onDestroyed;
        this.#onMeasured = onMeasured;
        this.#urgent = Boolean(icon.urgent);
        this.#restoreTexture = sharpenIconTexture(icon.icon);

        const [pivotX, pivotY] = bin.get_pivot_point();
        this.#original = {
            scaleX: bin.scale_x,
            scaleY: bin.scale_y,
            translationX: bin.translation_x,
            translationY: bin.translation_y,
            pivotX,
            pivotY,
            opacity: bin.opacity,
            redirect: bin.offscreen_redirect,
        };
        // The bin starts at rest, so the first apply toward rest skips.
        this.#lastApplied = {
            scale_x: this.#original.scaleX,
            scale_y: this.#original.scaleY,
            translation_x: this.#original.translationX,
            translation_y: this.#original.translationY,
        };

        this.#signalIds.push(icon.connect('notify::hover', () => this.#syncHover()));
        this.#signalIds.push(icon.connect('notify::urgent', () => {
            this.#urgent = Boolean(this.#icon.urgent);
            this.#apply();
        }));
        this.#signalIds.push(icon.connect('button-press-event', (_actor, event) => {
            if (event.get_button() === Clutter.BUTTON_PRIMARY &&
                this.#press.beginPrimary(this.#recipe.press))
                this.#apply(this.#recipe.press.duration);
            return Clutter.EVENT_PROPAGATE;
        }));
        this.#signalIds.push(icon.connect('notify::pressed', () => {
            if (this.#press.syncButtonPressed(
                Boolean(this.#icon.pressed), this.#recipe.press))
                this.#apply(this.#recipe.press.duration);
        }));
        this.#signalIds.push(icon.connect_after('clicked', () => {
            if (this.#press.finishClick())
                this.#apply(this.#recipe.press.duration);
        }));
        this.#syncHover();
    }

    get position() {
        return this.#position;
    }

    get recipe() {
        return this.#recipe;
    }

    setRecipe(recipe) {
        this.#recipe = recipe;
        this.#press.reset();
        this.#lastApplied = null;
        this.#apply();
    }

    // State only; true when the flush must apply this icon.
    setNeighborDistance(distance) {
        if (this.#neighborDistance === distance)
            return false;
        const {hover} = this.#recipe;
        const visibleChange = hover.enabled &&
            neighborScaleAt(hover, this.#neighborDistance) !==
            neighborScaleAt(hover, distance);
        this.#neighborDistance = distance;
        return visibleChange && !this.#hovered && !this.#launching;
    }

    refreshStyle() {
        if (this.#destroyed)
            return;
        refreshWidgetStyle(this.#icon);
        refreshWidgetStyle(this.#bin);
    }

    beginLaunch(launchEnabled) {
        const steps = this.#press.consumeLaunchSteps(this.#recipe.press);
        if (this.#destroyed || this.#launching ||
            (!launchEnabled && steps.length === 0)) {
            return {
                active: false,
                hoverDuration: this.#recipe.hover.duration,
                pressSteps: steps,
            };
        }

        this.#launching = true;
        this.#press.applyStep(false);
        const magnify = !this.#recipe.hover.enabled ? 1
            : this.#hovered ? this.#recipe.hover.scale
                : neighborScaleAt(this.#recipe.hover, this.#neighborDistance);
        this.#apply(0);
        return {
            active: true,
            hoverDuration: this.#recipe.hover.duration,
            magnify,
            pressSteps: steps,
        };
    }

    endLaunch() {
        if (this.#destroyed || !this.#launching)
            return;
        this.#launching = false;
        this.#apply(this.#recipe.hover.duration);
    }

    onTargetDestroyed() {
        if (this.#destroyed)
            return;
        this.#destroyed = true;
        this.#signalIds = [];
        this.#dimmed = false;
        this.#bin = null;
        this.#icon = null;
        this.#onDestroyed(this);
    }

    dispose() {
        if (this.#destroyed)
            return;
        for (const id of this.#signalIds)
            this.#icon.disconnect(id);
        this.#signalIds = [];
        this.#syncDim(0);
        this.#restore();
        this.#restoreTexture();
        this.#destroyed = true;
        this.#onDestroyed(this);
        this.#bin = null;
        this.#icon = null;
    }

    // The launch visual owns the bin until endLaunch reapplies.
    applyHoverState() {
        if (this.#launching)
            return;
        this.#apply();
    }

    // State only: the group schedules the apply.
    #syncHover() {
        const hovered = Boolean(this.#icon.hover);
        if (this.#hovered === hovered)
            return;
        this.#hovered = hovered;
        // The next apply measures the hovered icon once and publishes.
        this.#pendingBudgetReport = hovered;
        if (!hovered)
            this.#press.reset();
        this.#onHoverChanged(this, hovered);
    }

    #apply(durationOverride = null) {
        if (this.#destroyed)
            return;
        const animationsEnabled = St.Settings.get().enable_animations;
        // A pending report measures anyway to feed the prefs readout.
        const budget = this.#pendingBudgetReport ||
            (animationsEnabled && hoverNeedsBudget({
                recipe: this.#recipe,
                hovered: this.#hovered,
                launching: this.#launching,
                neighborDistance: this.#neighborDistance,
            }))
            ? this.#measureBudget()
            : null;
        if (this.#pendingBudgetReport) {
            this.#pendingBudgetReport = false;
            if (budget)
                this.#onMeasured(budget);
        }
        const transform = resolveIconTransform({
            position: this.#position,
            recipe: this.#recipe,
            hovered: this.#hovered,
            launching: this.#launching,
            neighborDistance: this.#neighborDistance,
            pressed: this.#press.pressed,
            animationsEnabled,
            budgetPx: budget ? budget.budgetPx : Infinity,
            iconNormalSize: budget ? budget.iconNormalSize : 0,
        });
        const baseDuration = durationOverride ?? this.#recipe.hover.duration;
        const duration = animationsEnabled ? baseDuration : 0;
        const properties = {
            scale_x: this.#original.scaleX * transform.scaleX,
            scale_y: this.#original.scaleY * transform.scaleY,
            translation_x: this.#original.translationX + transform.translationX,
            translation_y: this.#original.translationY + transform.translationY,
        };

        this.#syncDim(transform.dim);
        // Dash to Dock wiggles urgent icons; a centered pivot lets both
        // animations compose. The stock dash never sets the property.
        this.#bin.set_pivot_point(...(this.#urgent ? [0.5, 0.5] : transform.pivot));
        // Same target: keep any in-flight transition instead of restarting
        // it. Instant applies must settle the bin now.
        const last = this.#lastApplied;
        if (duration > 0 && last &&
            last.scale_x === properties.scale_x &&
            last.scale_y === properties.scale_y &&
            last.translation_x === properties.translation_x &&
            last.translation_y === properties.translation_y)
            return;
        this.#lastApplied = properties;

        this.#removeOwnedTransitions();
        if (duration === 0) {
            Object.assign(this.#bin, properties);
            return;
        }

        this.#bin.ease({
            ...properties,
            duration,
            mode: resolveAnimationMode(
                this.#recipe.hover.easing, Clutter.AnimationMode),
        });
    }

    // Probe used before the first hover.
    measure() {
        return this.#destroyed ? null : this.#measureBudget();
    }

    // Measure the room between the icon and the dock clip.
    #measureBudget() {
        const bin = this.#bin;
        if (!bin)
            return null;
        const parent = bin.get_parent();
        if (!parent)
            return null;
        let clipActor = null;
        for (let node = bin; node; node = node.get_parent()) {
            if (node.has_clip) {
                clipActor = node;
                break;
            }
        }
        if (!clipActor)
            return null;

        const box = bin.get_allocation_box();
        const clip = clipActor.get_clip();
        const [clipX, clipY] = clipActor.get_transformed_position();
        const [parentX, parentY] = parent.get_transformed_position();
        const top = parentY + box.y1;
        const bottom = parentY + box.y2;
        const left = parentX + box.x1;
        const right = parentX + box.x2;
        const clipTop = clipY + clip[1];
        const clipBottom = clipY + clip[1] + clip[3];
        const clipLeft = clipX + clip[0];
        const clipRight = clipX + clip[0] + clip[2];

        switch (this.#position) {
            case DockPosition.TOP:
                return {budgetPx: clipBottom - bottom, iconNormalSize: box.y2 - box.y1};
            case DockPosition.LEFT:
                return {budgetPx: left - clipLeft, iconNormalSize: box.x2 - box.x1};
            case DockPosition.RIGHT:
                return {budgetPx: clipRight - right, iconNormalSize: box.x2 - box.x1};
            case DockPosition.BOTTOM:
            default:
                return {budgetPx: top - clipTop, iconNormalSize: box.y2 - box.y1};
        }
    }

    // A brightness effect would render offscreen and blur the scaled icon.
    // Dim from the original opacity, never the current one: a snapshot of an
    // already dimmed bin would compound and darken the icon for good.
    #syncDim(dim) {
        if (dim > 0) {
            if (!this.#dimmed) {
                this.#dimmed = true;
                // Clutter can go offscreen for plain opacity too.
                this.#bin.offscreen_redirect = 0;
            }
            this.#bin.opacity = dimOpacity(this.#original.opacity, dim);
        } else if (this.#dimmed) {
            this.#bin.opacity = this.#original.opacity;
            this.#bin.offscreen_redirect = this.#original.redirect;
            this.#dimmed = false;
        }
    }

    #restore() {
        this.#removeOwnedTransitions();
        this.#bin.set_pivot_point(this.#original.pivotX, this.#original.pivotY);
        this.#bin.set_scale(this.#original.scaleX, this.#original.scaleY);
        this.#bin.translation_x = this.#original.translationX;
        this.#bin.translation_y = this.#original.translationY;
    }

    #removeOwnedTransitions() {
        for (const transition of OWNED_TRANSITIONS)
            this.#bin.remove_transition(transition);
    }
}
