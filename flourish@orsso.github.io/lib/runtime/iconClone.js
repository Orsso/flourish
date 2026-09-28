import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';

import {resolveAnimationMode} from '../motion/catalog.js';
import {getOrientation} from '../motion/transforms.js';
import {setIconDim} from './iconDim.js';
import {isNotificationBadge} from './iconDecorations.js';

export const OPAQUE = 255;
const RETREAT_DURATION = 180;
const RETREAT_SHRINK = 0.85;
const badgeOwners = new WeakMap();

const IconClone = GObject.registerClass(class IconClone extends Clutter.Actor {
    #badges = new Map();
    #badgeBox;

    constructor(source, badgeBox, params) {
        super({...params, layout_manager: new Clutter.BinLayout()});
        this.add_child(new Clutter.Clone({source, x_expand: true, y_expand: true}));
        this.#badgeBox = badgeBox;
        this.#badgeBox.connectObject(
            'child-added', (_box, child) => this.#addBadge(child),
            'destroy', () => { this.#badgeBox = null; }, this);
        for (const child of this.#badgeBox.get_children())
            this.#addBadge(child);
    }

    destroy() {
        this.#badgeBox?.disconnectObject(this);
        for (const badge of this.#badges.keys())
            this.#removeBadge(badge);
        super.destroy();
    }

    #addBadge(badge) {
        if (!isNotificationBadge(badge))
            return;
        // An attention retreat can overlap the next launch.
        const owner = badgeOwners.get(badge) ?? {opacity: badge.opacity, count: 0};
        owner.count++;
        badgeOwners.set(badge, owner);
        const clone = new Clutter.Clone({
            source: badge.child,
            opacity: owner.opacity,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.START,
            x_expand: true,
            y_expand: true,
        });
        this.add_child(clone);
        this.#badges.set(badge, {clone, owner});
        badge.opacity = 0;
        badge.connectObject('destroy', () => this.#removeBadge(badge, false), this);
    }

    #removeBadge(badge, restore = true) {
        const {clone, owner} = this.#badges.get(badge);
        badge.disconnectObject(this);
        this.#badges.delete(badge);
        clone.destroy();
        if (--owner.count === 0) {
            badgeOwners.delete(badge);
            if (restore)
                badge.opacity = owner.opacity;
        }
    }
});

// A clone on the stage that moves in place of an icon.
export function createIconClone(source, geometry, parent, {
    badgeBox = source.get_parent(),
    pivot = [0.5, 0.5],
    scale = {x: 1, y: 1},
    translation = {x: 0, y: 0},
    opacity = OPAQUE,
} = {}) {
    const clone = new IconClone(source, badgeBox, {
        reactive: false,
        ...geometry,
        opacity,
    });
    clone.set_pivot_point(...pivot);
    clone.set_scale(scale.x, scale.y);
    clone.translation_x = translation.x;
    clone.translation_y = translation.y;
    parent.add_child(clone);
    return clone;
}

export function runSegments(clone, segments, {
    isCancelled = () => false,
    onComplete = () => {},
}, index = 0) {
    if (isCancelled())
        return;
    if (index >= segments.length) {
        onComplete();
        return;
    }

    const segment = segments[index];
    const animation = {
        duration: segment.duration,
        mode: resolveAnimationMode(segment.easing, Clutter.AnimationMode),
    };
    // The frame captures the already-scaled clone, preserving its texture resolution.
    setIconDim(clone.get_parent(), segment.dim, animation);
    clone.ease({
        scale_x: segment.scaleX,
        scale_y: segment.scaleY,
        translation_x: segment.translationX,
        translation_y: segment.translationY,
        rotation_angle_z: segment.rotation,
        ...animation,
        onComplete: () => {
            // The ease callback can outlive its launch or attention session.
            if (isCancelled())
                return;
            setIconDim(clone.get_parent(), segment.dim);
            runSegments(clone, segments, {isCancelled, onComplete}, index + 1);
        },
    });
}

export function retreatClone(clone, edge, {
    momentum = false,
    duration = RETREAT_DURATION,
    onComplete = () => {},
} = {}) {
    const {outward} = getOrientation(edge);
    const [width, height] = clone.get_transformed_size();
    clone.ease({
        translation_x: clone.translation_x - outward[0] * width,
        translation_y: clone.translation_y - outward[1] * height,
        scale_x: clone.scale_x * RETREAT_SHRINK,
        scale_y: clone.scale_y * RETREAT_SHRINK,
        opacity: 0,
        duration,
        mode: momentum
            ? Clutter.AnimationMode.EASE_OUT_QUAD
            : Clutter.AnimationMode.EASE_IN_QUAD,
        onComplete,
    });
}
