import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {DockPosition, resolveAnimationMode} from '../motion/catalog.js';
import {PressInteraction} from '../motion/pressInteraction.js';
import {
    dimOpacity,
    hoverNeedsBudget,
    neighborScaleAt,
    resolveIconTransform,
} from '../motion/transforms.js';
import {sharpenIconTexture} from './iconTexture.js';

// Toggling any class name invalidates the widget's style context.
const REFRESH_CLASS = 'flourish-style-refresh';

const OWNED_TRANSITIONS = [
    'scale-x',
    'scale-y',
    'translation-x',
    'translation-y',
];

export class IconMotionController {
    #bin;
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
        this.#urgent = icon.urgent;
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
        // At rest already: the first apply toward rest is skipped.
        this.#lastApplied = {
            scale_x: this.#original.scaleX,
            scale_y: this.#original.scaleY,
            translation_x: this.#original.translationX,
            translation_y: this.#original.translationY,
        };

        icon.connectObject(
            'notify::hover', () => this.#syncHover(),
            'notify::urgent', () => {
                this.#urgent = this.#icon.urgent;
                this.#apply();
            },
            'button-press-event', (_actor, event) => {
                if (event.get_button() === Clutter.BUTTON_PRIMARY &&
                    this.#press.beginPrimary(this.#recipe.press))
                    this.#apply(this.#recipe.press.duration);
                return Clutter.EVENT_PROPAGATE;
            },
            'notify::pressed', () => {
                if (this.#press.syncButtonPressed(
                    this.#icon.pressed, this.#recipe.press))
                    this.#apply(this.#recipe.press.duration);
            },
            'clicked', () => {
                if (this.#press.finishClick())
                    this.#apply(this.#recipe.press.duration);
            }, GObject.ConnectFlags.AFTER, // after the stock click handler
            this);
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
        refreshWidgetStyle(this.#icon);
        refreshWidgetStyle(this.#bin);
    }

    beginLaunch(launchEnabled) {
        const steps = this.#press.consumeLaunchSteps(this.#recipe.press);
        if (this.#launching ||
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
        if (!this.#launching)
            return;
        this.#launching = false;
        this.#apply(this.#recipe.hover.duration);
    }

    onTargetDestroyed() {
        this.#dimmed = false;
        this.#launching = false;
        this.#bin = null;
        this.#icon = null;
        this.#onDestroyed(this);
    }

    dispose() {
        this.#icon.disconnectObject(this);
        this.#syncDim(0);
        this.#restore();
        this.#restoreTexture();
        this.#onDestroyed(this);
        this.#bin = null;
        this.#icon = null;
    }

    // The launch clone owns the bin until endLaunch.
    applyHoverState() {
        if (this.#launching)
            return;
        this.#apply();
    }

    #syncHover() {
        const hovered = this.#icon.hover;
        if (this.#hovered === hovered)
            return;
        this.#hovered = hovered;
        this.#pendingBudgetReport = hovered;
        if (!hovered)
            this.#press.reset();
        this.#onHoverChanged(this, hovered);
    }

    #apply(duration = this.#recipe.hover.duration) {
        const animationsEnabled = St.Settings.get().enable_animations;
        // A pending report measures anyway; the prefs readout needs it.
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
        if (!animationsEnabled)
            duration = 0;
        const properties = {
            scale_x: this.#original.scaleX * transform.scaleX,
            scale_y: this.#original.scaleY * transform.scaleY,
            translation_x: this.#original.translationX + transform.translationX,
            translation_y: this.#original.translationY + transform.translationY,
        };

        this.#syncDim(transform.dim);
        // Dash to Dock wiggles urgent icons around a centered pivot.
        this.#bin.set_pivot_point(...(this.#urgent ? [0.5, 0.5] : transform.pivot));
        // Same target: keep the in-flight transition; instant applies still land.
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

    measure() {
        return this.#measureBudget();
    }

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

    // Opacity, not a brightness effect: offscreen rendering blurs the scaled icon.
    #syncDim(dim) {
        if (dim > 0) {
            if (!this.#dimmed) {
                this.#dimmed = true;
                // Opacity alone can go offscreen too.
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

// ensure_style alone does not repaint after a stylesheet change.
function refreshWidgetStyle(widget) {
    widget.add_style_class_name(REFRESH_CLASS);
    widget.remove_style_class_name(REFRESH_CLASS);
    widget.ensure_style();
    widget.queue_relayout();
    widget.queue_redraw();
}
