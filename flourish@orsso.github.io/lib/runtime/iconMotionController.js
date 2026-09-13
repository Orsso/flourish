import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {PressEffect, ScreenEdge, sampleRamp} from '../motion/catalog.js';
import {PressInteraction} from '../motion/pressInteraction.js';
import {
    dimOpacity,
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
    #clock;
    #hoverLevel = 0;
    #dimmed = false;
    #hovered = false;
    #icon;
    #onAnimate;
    #onDestroyed;
    #onHoverChanged;
    #onUrgentChanged;
    #original;
    #overlay = null;
    #edge;
    #press = new PressInteraction();
    #pressRamp = null;
    #recipe;
    #restoreTexture;
    #returnRamp = null;
    #urgent = false;

    constructor({
        icon,
        bin,
        edge,
        recipe,
        clock = () => 0,
        onAnimate = () => {},
        onHoverChanged = () => {},
        onDestroyed = () => {},
        onUrgentChanged = () => {},
    }) {
        this.#icon = icon;
        this.#bin = bin;
        this.#edge = edge;
        this.#recipe = recipe;
        this.#clock = clock;
        this.#onAnimate = onAnimate;
        this.#onHoverChanged = onHoverChanged;
        this.#onDestroyed = onDestroyed;
        this.#onUrgentChanged = onUrgentChanged;
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
            reactive: bin.reactive,
            redirect: bin.offscreen_redirect,
        };

        icon.connectObject(
            'notify::hover', () => this.#syncHover(),
            'notify::urgent', () => {
                this.#urgent = this.#icon.urgent;
                this.#onUrgentChanged(this, this.#urgent);
                // Dash to Dock centers the pivot for its wiggle first.
                this.applyHoverState();
            },
            'button-press-event', (_actor, event) => {
                if (event.get_button() === Clutter.BUTTON_PRIMARY &&
                    this.#press.beginPrimary(this.#recipe.press))
                    this.#pressChanged();
                return Clutter.EVENT_PROPAGATE;
            },
            'notify::pressed', () => {
                if (this.#press.syncButtonPressed(
                    this.#icon.pressed, this.#recipe.press))
                    this.#pressChanged();
            },
            'clicked', () => {
                if (this.#press.finishClick())
                    this.#pressChanged();
            }, GObject.ConnectFlags.AFTER, // after the stock click handler
            this);
        this.#syncHover();
    }

    get edge() {
        return this.#edge;
    }

    get recipe() {
        return this.#recipe;
    }

    get icon() {
        return this.#icon;
    }

    get urgent() {
        return this.#urgent;
    }

    get overlaid() {
        return this.#overlay !== null;
    }

    get atRest() {
        const {hover} = this.#recipe;
        if (this.#hovered || this.overlaid)
            return false;
        if (!hover.enabled)
            return true;
        return this.#hoverLevel === 0;
    }

    beginOverlay({followHover = false} = {}) {
        if (this.overlaid || !this.#bin)
            return false;
        this.#overlay = followHover ? 'follow' : 'hold';
        if (!followHover)
            this.#apply();
        return true;
    }

    endOverlay() {
        if (!this.overlaid)
            return;
        const held = this.#overlay === 'hold';
        this.#overlay = null;
        if (!held)
            return;
        const {hover} = this.#recipe;
        this.#returnRamp = {
            start: this.#clock(), from: 0, to: 1,
            duration: hover.duration, easing: hover.easing,
        };
        this.#apply();
        this.#onAnimate();
    }

    setRecipe(recipe) {
        this.#recipe = recipe;
        this.#press.reset();
        this.#pressRamp = null;
        this.#apply();
    }

    setHoverLevel(level) {
        if (this.#hoverLevel === level)
            return false;
        this.#hoverLevel = level;
        return this.#overlay !== 'hold';
    }

    refreshStyle() {
        refreshWidgetStyle(this.#icon);
        refreshWidgetStyle(this.#bin);
    }

    containsCrossPoint(x, y) {
        if (!(this.#hoverLevel > 0) || this.#overlay === 'hold')
            return false;
        const [left, top] = this.#bin.get_transformed_position();
        const [width, height] = this.#bin.get_transformed_size();
        return this.#edge === ScreenEdge.BOTTOM || this.#edge === ScreenEdge.TOP
            ? y >= top && y <= top + height
            : x >= left && x <= left + width;
    }

    beginLaunch(launchEnabled) {
        const steps = this.#press.consumeLaunchSteps(this.#recipe.press);
        if (this.overlaid ||
            (!launchEnabled && steps.length === 0)) {
            return {
                active: false,
                hoverDuration: this.#recipe.hover.duration,
                pressSteps: steps,
            };
        }

        this.#press.applyStep(false);
        this.#pressRamp = null;
        this.beginOverlay({followHover: true});
        this.#apply();
        return {
            active: true,
            hoverDuration: this.#recipe.hover.duration,
            pressSteps: steps,
        };
    }

    onTargetDestroyed() {
        this.#dimmed = false;
        this.#overlay = null;
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
        this.#overlay = null;
        this.#bin = null;
        this.#icon = null;
    }

    // Attention holds the bin while detached.
    applyHoverState(now = this.#clock()) {
        if (this.#overlay === 'hold')
            return false;
        this.#apply(now);
        return this.#animating(now);
    }

    clearHover() {
        this.#syncHover(false);
    }

    #syncHover(hovered = this.#icon.hover) {
        if (this.#hovered === hovered)
            return;
        this.#hovered = hovered;
        if (!hovered && this.#press.reset())
            this.#setPressLevel(0);
        this.#onHoverChanged(this, hovered);
    }

    #pressChanged() {
        this.#setPressLevel(this.#press.pressed ? 1 : 0);
        this.#apply();
        this.#onAnimate();
    }

    #setPressLevel(to) {
        const {hover, press} = this.#recipe;
        const now = this.#clock();
        this.#pressRamp = {
            start: now, from: this.#pressLevel(now), to,
            duration: press.effect === PressEffect.DIM ? 0 : press.duration,
            easing: hover.easing,
        };
    }

    #pressLevel(now) {
        return this.#pressRamp ? sampleRamp(this.#pressRamp, now) : 0;
    }

    #animating(now) {
        return [this.#pressRamp, this.#returnRamp].some(
            ramp => ramp && now - ramp.start < ramp.duration);
    }

    #apply(now = this.#clock()) {
        const animationsEnabled = St.Settings.get().enable_animations;
        const transform = resolveIconTransform({
            edge: this.#edge,
            recipe: this.#recipe,
            overlaid: this.#overlay === 'hold',
            hoverLevel: this.#hoverLevel *
                (this.#returnRamp ? sampleRamp(this.#returnRamp, now) : 1),
            pressLevel: this.#pressLevel(now),
            animationsEnabled,
        });
        const properties = {
            scale_x: this.#original.scaleX * transform.scaleX,
            scale_y: this.#original.scaleY * transform.scaleY,
            translation_x: this.#original.translationX + transform.translationX,
            translation_y: this.#original.translationY + transform.translationY,
        };

        this.#syncDim(transform.dim);
        this.#bin.reactive = this.#original.reactive ||
            (animationsEnabled && this.#hoverLevel > 0 && this.#overlay !== 'hold');
        this.#bin.set_pivot_point(...transform.pivot);
        this.#removeOwnedTransitions();
        Object.assign(this.#bin, properties);
    }

    measure() {
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

        switch (this.#edge) {
            case ScreenEdge.TOP:
                return {budgetPx: clipBottom - bottom, iconNormalSize: box.y2 - box.y1};
            case ScreenEdge.LEFT:
                return {budgetPx: left - clipLeft, iconNormalSize: box.x2 - box.x1};
            case ScreenEdge.RIGHT:
                return {budgetPx: clipRight - right, iconNormalSize: box.x2 - box.x1};
            case ScreenEdge.BOTTOM:
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
        this.#bin.reactive = this.#original.reactive;
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
