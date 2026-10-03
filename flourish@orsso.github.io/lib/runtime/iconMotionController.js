import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {ScreenEdge, sampleRamp} from '../motion/catalog.js';
import {
    buildLaunchPressSegments,
    getOrientation,
    pressStarts,
    resolveIconTransform,
} from '../motion/transforms.js';
import {setIconDim} from './iconDim.js';
import {IconDecorations} from './iconDecorations.js';

// St rasterizes an icon once at icon size; render at 2x so a scaled icon stays sharp.
const TEXTURE_FACTOR = 2;

export function sharpenIconTexture(baseIcon) {
    // BaseIcon routes every size change through this method.
    baseIcon._createIconTexture = function (size) {
        // A restyle can leave BaseIcon.icon pointing at a removed texture.
        this._iconBin.child?.destroy();
        this.iconSize = size;
        this.icon = this.createIcon(size * TEXTURE_FACTOR);
        // The dash sizes itself from the icon's preferred size; keep it stock.
        this.icon.set_size(size, size);
        this._iconBin.child = this.icon;
    };
    baseIcon._createIconTexture(baseIcon.iconSize);

    return () => {
        delete baseIcon._createIconTexture;
        baseIcon.icon = baseIcon._iconBin.child;
        baseIcon._createIconTexture(baseIcon.iconSize);
    };
}

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
    #decorations = null;
    #hoverLevel = 0;
    #hovered = false;
    #icon;
    #onAnimate;
    #onDestroyed;
    #onHoverChanged;
    #onUrgentChanged;
    #original;
    #overlay = null;
    #edge;
    #pressed = false;
    #pressRamp = null;
    #recipe;
    #setDim;
    #restoreTexture;
    #returnRamp = null;
    #urgent = false;

    constructor({
        icon,
        bin,
        edge,
        recipe,
        clock = () => 0,
        setDim = setIconDim,
        decorations = null,
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
        this.#setDim = setDim;
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
            reactive: bin.reactive,
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
                    this.#setPressed(pressStarts(this.#recipe.press,
                        this.#icon.app?.get_n_windows() === 0)))
                    this.#pressChanged();
                return Clutter.EVENT_PROPAGATE;
            },
            'notify::pressed', () => {
                if (!this.#icon.pressed && this.#setPressed(false))
                    this.#pressChanged();
            },
            'clicked', () => {
                if (this.#setPressed(false))
                    this.#pressChanged();
            }, GObject.ConnectFlags.AFTER,
            this);
        this.#syncHover();
        if (decorations)
            this.#decorations = new IconDecorations({
                ...decorations, icon, bin, edge, onChanged: onAnimate,
            });
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
        this.#pressed = false;
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
        return getOrientation(this.#edge).horizontal
            ? y >= top && y <= top + height
            : x >= left && x <= left + width;
    }

    beginLaunch(launchEnabled) {
        const pressLevel = this.#pressLevel(this.#clock());
        const pressSegments = buildLaunchPressSegments(
            this.#recipe.press, this.#edge, pressLevel);
        if (this.overlaid || (!launchEnabled && pressSegments.length === 0))
            return {active: false};

        const {dim} = resolveIconTransform({recipe: this.#recipe, pressLevel});
        this.#pressed = false;
        this.#pressRamp = null;
        this.beginOverlay({followHover: true});
        this.#apply();
        return {active: true, dim, pressSegments};
    }

    onTargetDestroyed() {
        this.#decorations?.dispose();
        this.#decorations = null;
        this.#overlay = null;
        this.#bin = null;
        this.#icon = null;
        this.#onDestroyed(this);
    }

    dispose() {
        this.#decorations?.dispose();
        this.#decorations = null;
        this.#icon.disconnectObject(this);
        this.#setDim(this.#icon, 0);
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

    updateDecorations() {
        this.#decorations?.update();
    }

    #syncHover(hovered = this.#icon.hover) {
        if (this.#hovered === hovered)
            return;
        this.#hovered = hovered;
        if (!hovered && this.#setPressed(false))
            this.#setPressLevel(0);
        this.#onHoverChanged(this, hovered);
    }

    #setPressed(pressed) {
        if (this.#pressed === pressed)
            return false;
        this.#pressed = pressed;
        return true;
    }

    #pressChanged() {
        this.#setPressLevel(this.#pressed ? 1 : 0);
        this.#apply();
        this.#onAnimate();
    }

    #setPressLevel(to) {
        const {hover, press} = this.#recipe;
        const now = this.#clock();
        this.#pressRamp = {
            start: now, from: this.#pressLevel(now), to,
            duration: press.duration,
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

        this.#setDim(this.#icon, transform.dim);
        this.#bin.reactive = this.#original.reactive ||
            (animationsEnabled && this.#hoverLevel > 0 && this.#overlay !== 'hold');
        this.#bin.set_pivot_point(...transform.pivot);
        this.#removeOwnedTransitions();
        Object.assign(this.#bin, properties);
    }

    measure(monitor = null) {
        const bin = this.#bin;
        if (!bin)
            return null;
        const parent = bin.get_parent();
        if (!parent)
            return null;
        const box = bin.get_allocation_box();
        const [parentWidth, parentHeight] = parent.get_transformed_size();
        const scaleX = parentWidth / parent.width;
        const scaleY = parentHeight / parent.height;
        if (!(scaleX > 0 && scaleY > 0))
            return {outwardRoom: 0, iconSize: 0};
        const [parentX, parentY] = parent.get_transformed_position();
        const top = parentY + box.y1 * scaleY;
        const bottom = parentY + box.y2 * scaleY;
        const left = parentX + box.x1 * scaleX;
        const right = parentX + box.x2 * scaleX;
        let clipTop = monitor ? monitor.y : -Infinity;
        let clipBottom = monitor ? monitor.y + monitor.height : Infinity;
        let clipLeft = monitor ? monitor.x : -Infinity;
        let clipRight = monitor ? monitor.x + monitor.width : Infinity;
        // Compare clips in stage coordinates, then return the room in icon-local units.
        for (let node = parent; node; node = node.get_parent()) {
            if (!node.has_clip)
                continue;
            const [x, y, width, height] = node.get_clip();
            const [originX, originY] = node.get_transformed_position();
            const [nodeWidth, nodeHeight] = node.get_transformed_size();
            const sx = node.width > 0 ? nodeWidth / node.width : 0;
            const sy = node.height > 0 ? nodeHeight / node.height : 0;
            clipTop = Math.max(clipTop, originY + y * sy);
            clipBottom = Math.min(clipBottom, originY + (y + height) * sy);
            clipLeft = Math.max(clipLeft, originX + x * sx);
            clipRight = Math.min(clipRight, originX + (x + width) * sx);
        }

        switch (this.#edge) {
            case ScreenEdge.TOP:
                return {outwardRoom: (clipBottom - bottom) / scaleY, iconSize: box.y2 - box.y1};
            case ScreenEdge.LEFT:
                return {outwardRoom: (clipRight - right) / scaleX, iconSize: box.x2 - box.x1};
            case ScreenEdge.RIGHT:
                return {outwardRoom: (left - clipLeft) / scaleX, iconSize: box.x2 - box.x1};
            case ScreenEdge.BOTTOM:
            default:
                return {outwardRoom: (top - clipTop) / scaleY, iconSize: box.y2 - box.y1};
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
