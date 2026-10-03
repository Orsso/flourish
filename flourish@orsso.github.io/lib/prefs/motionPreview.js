import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {PressMode, RecipePart, ScreenEdge, resolveAnimationMode} from '../motion/catalog.js';
import {hoverActive, waveOffsets, waveFalloff} from '../motion/continuum.js';
import {
    ATTENTION_SLIDE_DURATION,
    buildAttentionSegments,
    buildLaunchSegments,
    buildLaunchPressSegments,
    getAttentionPivot,
    getLaunchPivot,
    interpolateTransform,
    launchDuration,
    resolveIconTransform,
    sampleLaunchSegments,
} from '../motion/transforms.js';
import {
    buildDemoSequence,
    buildPartSequence,
    DemoPhase,
    PHASE_WAIT_MS,
} from './demoSequence.js';

const IDENTITY = {
    scaleX: 1,
    scaleY: 1,
    translationX: 0,
    translationY: 0,
    rotation: 0,
    dim: 0,
};
const BOTTOM_PIVOT = [0.5, 1];
// Stands in for an animation that never ran.
const IDLE_ANIMATION = {state: Adw.AnimationState.IDLE, pause() {}, skip() {}};

const INLINE_ICON_SIZE = 24;
const INLINE_STEP = INLINE_ICON_SIZE + 10;
const COUNT_GROW_MS = 250;
const SWEEP_MS = 1500;
const SWEEP_SETTLE_MS = 480;

export const MotionPreview = GObject.registerClass(class MotionPreview extends Gtk.DrawingArea {
    _init({recipe, part = null, ...params}) {
        const inline = Boolean(part);
        const iconCount = part === RecipePart.HOVER ? hoverIconCount(recipe) : 1;
        super._init({
            height_request: inline ? 72 : 96,
            width_request: inline ? inlineWidth(iconCount) : -1,
            hexpand: !inline,
            valign: inline ? Gtk.Align.CENTER : Gtk.Align.FILL,
            ...params,
        });
        this._selected = false;
        this._part = part;
        this._iconCount = iconCount;
        this._visibleCount = iconCount;
        this._countAnimation = IDLE_ANIMATION;
        this._recipe = this._adoptRecipe(recipe);
        this._held = false;
        this._hovered = false;
        this._hoverProgress = 0;
        this._pressed = false;
        this._launching = false;
        this._motionTransform = {...IDENTITY};
        this._launchTransform = {...IDENTITY};
        this._motionAnimation = IDLE_ANIMATION;
        this._launchAnimation = IDLE_ANIMATION;
        // Peek progress, 0 below the bottom edge and 1 in place.
        this._attending = false;
        this._peek = 0;
        this._peekAnimation = IDLE_ANIMATION;
        // Generation of the running loop, 0 when idle.
        this._loop = 0;
        this._timeoutId = 0;
        this._sweepActive = false;
        this._sweepValue = 0;
        this._sweepAnimation = IDLE_ANIMATION;
        this.set_draw_func((_area, cr, width, height) => {
            this._draw(cr, width, height);
            cr.$dispose();
        });

        this.connect('unmap', () => this.stop());
    }

    _adoptRecipe(recipe) {
        if (!this._part || recipe[this._part].enabled)
            return recipe;
        return {
            ...recipe,
            [this._part]: {...recipe[this._part], enabled: true},
        };
    }

    _resolveMotion() {
        return resolveIconTransform({
            recipe: this._recipe,
            hoverLevel: this._hovered ? 1 : 0,
            pressLevel: this._pressed ? 1 : 0,
        });
    }

    updateRecipe(recipe) {
        this._recipe = this._adoptRecipe(recipe);
        this._syncIconCount();
        if (this._motionAnimation.state !== Adw.AnimationState.PLAYING)
            this._motionTransform = this._resolveMotion();
        this.queue_draw();
    }

    _syncIconCount() {
        if (this._part !== RecipePart.HOVER)
            return;
        const count = hoverIconCount(this._recipe);
        if (count === this._iconCount)
            return;
        const from = this._visibleCount;
        this._countAnimation.pause();
        this._countAnimation = animate(this, COUNT_GROW_MS, Adw.Easing.EASE_OUT_CUBIC, value => {
            this._visibleCount = from + (count - from) * value;
            this.width_request = inlineWidth(this._visibleCount);
            this.queue_draw();
        });
    }

    setSelected(selected) {
        this._selected = selected;
        this.queue_draw();
    }

    stop() {
        this._cancelLoop();
        this._countAnimation.skip();
        this._held = false;
        this._sweepActive = false;
        this._motionAnimation.pause();
        this._motionAnimation = IDLE_ANIMATION;
        this._hovered = false;
        this._hoverProgress = 0;
        this._pressed = false;
        this._launching = false;
        this._motionTransform = {...IDENTITY};
        this.queue_draw();
    }

    _cancelLoop() {
        this._loop = 0;
        this._sweepAnimation.pause();
        this._sweepAnimation = IDLE_ANIMATION;
        this._launchAnimation.pause();
        this._launchAnimation = IDLE_ANIMATION;
        this._launchTransform = {...IDENTITY};
        this._peekAnimation.pause();
        this._peekAnimation = IDLE_ANIMATION;
        this._attending = false;
        this._peek = 0;
        this._clearTimeout();
    }

    _clearTimeout() {
        if (!this._timeoutId)
            return;
        GLib.source_remove(this._timeoutId);
        this._timeoutId = 0;
    }

    playLoop() {
        if (this._held || this._loop)
            return;
        const generation = GLib.get_monotonic_time();
        this._loop = generation;
        const run = () => this._runSequence(generation, this._part
            ? () => buildPartSequence(this._part, this._recipe)
            : () => buildDemoSequence(this._recipe));
        // Only a preview at rest sweeps in.
        if (this._part || !hoverActive(this._recipe.hover) ||
            this._hoverProgress > 0 && !this._sweepActive)
            run();
        else
            this._runIntroSweep(generation, run);
    }

    _runIntroSweep(generation, onComplete) {
        const count = ICON_COLORS.length;
        const middle = (count - 1) / 2;
        const start = this._sweepActive ? this._sweepValue : -0.6;
        const end = (count - 1) + 0.6;
        this._sweepActive = true;
        this._sweepValue = start;
        this._hovered = true;
        this._animateMotion(this._recipe.hover.duration);
        this._playSweepSegment(generation, start, end, SWEEP_MS,
            Adw.Easing.EASE_IN_OUT_CUBIC, () => {
                this._playSweepSegment(generation, end, middle, SWEEP_SETTLE_MS,
                    Adw.Easing.EASE_OUT_CUBIC, () => {
                        this._sweepActive = false;
                        this.queue_draw();
                        onComplete();
                    });
            });
    }

    _playSweepSegment(generation, fromValue, toValue, duration, easing, onDone) {
        this._sweepAnimation.pause();
        this._sweepAnimation = animate(this, duration, easing, value => {
            this._sweepValue = fromValue + (toValue - fromValue) * value;
            this.queue_draw();
        }, () => {
            if (generation === this._loop)
                onDone();
        });
    }

    stopLoop() {
        if (this._held)
            return;
        this._cancelLoop();
        this._pressed = false;
        this._launching = false;
        this._hovered = false;
        this._animateMotion(this._recipe.hover.duration, () => {
            this._sweepActive = false;
        });
    }

    holdPose() {
        this._cancelLoop();
        this._held = true;
        this._hovered = this._part === RecipePart.HOVER;
        this._pressed = this._part === RecipePart.PRESS;
        this._animateMotion(this._pressed
            ? this._recipe.press.duration
            : this._recipe.hover.duration);
    }

    releasePose(resume) {
        this._held = false;
        this._hovered = false;
        this._pressed = false;
        if (resume)
            this.playLoop();
        else
            this._animateMotion(this._recipe.hover.duration);
    }

    _runSequence(generation, getPhases) {
        let phases = getPhases();
        let index = 0;
        const advance = () => {
            if (generation !== this._loop)
                return;
            if (index >= phases.length) {
                phases = getPhases();
                index = 0;
            }
            const phase = phases[index++];
            this._runDemoPhase(phase, generation, advance);
        };
        advance();
    }

    _runDemoPhase(phase, generation, done) {
        if (phase in PHASE_WAIT_MS) {
            this._wait(PHASE_WAIT_MS[phase], generation, done);
            return;
        }
        switch (phase) {
            case DemoPhase.HOVER_IN:
                this._hovered = true;
                this._animateMotion(this._recipe.hover.duration, done);
                break;
            case DemoPhase.RESET:
                this._hovered = false;
                this._animateMotion(this._recipe.hover.duration, done);
                break;
            case DemoPhase.REPEAT_PAUSE:
                this._wait(this._recipe.launch.repeatPause, generation, done);
                break;
            case DemoPhase.CLICK:
                this._demoPlainClick(generation, done);
                break;
            case DemoPhase.CLICK_LAUNCH:
                this._demoClickLaunch(done);
                break;
            case DemoPhase.LAUNCH:
                this._beginLaunch({onComplete: done});
                break;
            case DemoPhase.ATTENTION:
                this._playAttention(generation, done);
                break;
        }
    }

    _wait(ms, generation, done) {
        this._clearTimeout();
        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this._timeoutId = 0;
            if (generation === this._loop)
                done();
            return GLib.SOURCE_REMOVE;
        });
    }

    _demoPlainClick(generation, done) {
        this._pressed = true;
        this._animateMotion(this._recipe.press.duration, () => {
            if (generation !== this._loop)
                return;
            this._pressed = false;
            this._animateMotion(this._recipe.press.duration, done);
        });
    }

    _demoClickLaunch(done) {
        const press = this._recipe.press;
        if (press.enabled && press.mode === PressMode.CLICKS_AND_LAUNCHES) {
            this._pressed = true;
            this._animateMotion(press.duration, () =>
                this._beginLaunch({onComplete: done}));
        } else {
            this._beginLaunch({onComplete: done});
        }
    }

    _animateMotion(duration, onDone = () => {}) {
        const from = this._motionTransform;
        const to = this._resolveMotion();
        const hoverFrom = this._hoverProgress;
        const hoverTo = this._hovered ? 1 : 0;
        this._motionAnimation.pause();
        this.queue_draw();
        this._motionAnimation = animate(this, duration, resolveAnimationMode(this._recipe.hover.easing, Adw.Easing), value => {
            this._hoverProgress = hoverFrom + (hoverTo - hoverFrom) * value;
            this._motionTransform = interpolateTransform(from, to, value);
            this.queue_draw();
        }, () => {
            this._hoverProgress = hoverTo;
            this._motionTransform = this._resolveMotion();
            this.queue_draw();
            onDone();
        });
    }

    _beginLaunch({onComplete = () => {}} = {}) {
        if (this._launching) {
            onComplete();
            return;
        }
        this._launching = true;
        const pressSegments = buildLaunchPressSegments(
            this._recipe.press, ScreenEdge.BOTTOM, this._pressed ? 1 : 0);
        this._pressed = false;
        const from = this._motionTransform;
        this._motionAnimation.pause();
        this._motionAnimation = IDLE_ANIMATION;
        this._motionTransform = this._resolveMotion();
        this._launchTransform = {
            ...IDENTITY,
            scaleX: from.scaleX / this._motionTransform.scaleX,
            scaleY: from.scaleY / this._motionTransform.scaleY,
            dim: from.dim,
        };
        const segments = [
            ...pressSegments,
            ...(this._recipe.launch.enabled ? buildLaunchSegments(
                this._recipe.launch.effect, this._recipe.launch, ScreenEdge.BOTTOM) : []),
        ];
        this._playSegments(segments, () => this._finishLaunch(onComplete));
    }

    _playSegments(segments, onDone) {
        const duration = launchDuration(segments);
        const from = this._launchTransform;
        this._launchAnimation.pause();
        this._launchAnimation = animate(this, duration, Adw.Easing.LINEAR, value => {
            this._launchTransform = sampleLaunchSegments(segments, value * duration, from);
            this.queue_draw();
        }, () => {
            this._launchTransform = {...IDENTITY};
            this.queue_draw();
            onDone();
        });
    }

    _finishLaunch(onComplete = () => {}) {
        if (!this._launching) {
            onComplete();
            return;
        }
        this._launching = false;
        if (this._part === RecipePart.LAUNCH) {
            this._motionTransform = {...IDENTITY};
            onComplete();
            return;
        }
        this._animateMotion(this._recipe.hover.duration, onComplete);
    }

    _playAttention(generation, done) {
        const {attention} = this._recipe;
        this._attending = true;
        if (!attention.peekWhenHidden) {
            this._playAttentionBurst(generation, () => {
                this._attending = false;
                done();
            });
            return;
        }
        this._animatePeek(0, 1, ATTENTION_SLIDE_DURATION, generation, () => {
            this._playAttentionBurst(generation, () => {
                this._animatePeek(1, 0, ATTENTION_SLIDE_DURATION, generation, () => {
                    this._attending = false;
                    done();
                });
            });
        });
    }

    _playAttentionBurst(generation, done) {
        let cyclesLeft = this._recipe.attention.cycles;
        const cycle = () => this._playSegments(
            buildAttentionSegments(this._recipe, ScreenEdge.BOTTOM), () => {
                if (generation !== this._loop)
                    return;
                cyclesLeft -= 1;
                if (cyclesLeft <= 0) {
                    done();
                    return;
                }
                this._wait(this._recipe.attention.cyclePause, generation, cycle);
            });
        cycle();
    }

    _animatePeek(from, to, duration, generation, done) {
        this._peekAnimation.pause();
        const easing = to > from ? Adw.Easing.EASE_OUT_CUBIC : Adw.Easing.EASE_IN_CUBIC;
        this._peekAnimation = animate(this, duration, easing, value => {
            this._peek = from + (to - from) * value;
            this.queue_draw();
        }, () => {
            if (generation !== this._loop)
                return;
            this._peek = to;
            this.queue_draw();
            done();
        });
    }

    _draw(cr, width, height) {
        if (this._part) {
            this._drawInline(cr, width, height);
            return;
        }
        const centerX = width / 2;
        const iconSize = 18;
        const pad = 12;
        const dockHeight = 38;
        const dockWidth = Math.min(width - 14, 210);
        const dockX = centerX - dockWidth / 2;
        const dockY = height - dockHeight - 8;
        const iconTop = dockY + (dockHeight - iconSize) / 2;

        roundedRectangle(cr, 1, 1, width - 2, height - 2, 14);
        cr.setSourceRGBA(0.08, 0.09, 0.11, 1);
        cr.fillPreserve();
        cr.setLineWidth(this._selected ? 2 : 1);
        cr.setSourceRGBA(0.22, 0.52, 0.85, this._selected ? 1 : 0.28);
        cr.stroke();

        roundedRectangle(cr, dockX, dockY, dockWidth, dockHeight, 13);
        cr.setSourceRGBA(0.16, 0.17, 0.20, 0.94);
        cr.fillPreserve();
        cr.setSourceRGBA(1, 1, 1, 0.12);
        cr.setLineWidth(1);
        cr.stroke();

        const count = ICON_COLORS.length;
        const middle = (count - 1) / 2;
        const innerLeft = dockX + pad + iconSize / 2;
        const innerRight = dockX + dockWidth - pad - iconSize / 2;
        const step = (innerRight - innerLeft) / (count - 1);

        const transforms = Array.from({length: count}, (_, i) => this._iconTransforms(i, middle));
        const offsets = this._spacing(transforms, iconSize);
        for (let i = 0; i < count; i++) {
            drawIcon(cr, innerLeft + i * step + offsets[i], iconTop, iconSize,
                ICON_COLORS[i], transforms[i]);
        }
    }

    _drawInline(cr, width, height) {
        const count = oddCountFor(this._visibleCount);
        const middle = (count - 1) / 2;
        const iconTop = height - INLINE_ICON_SIZE - 8;
        const first = width / 2 - middle * INLINE_STEP;
        const colorOffset = (ICON_COLORS.length - count) >> 1;
        const transforms = Array.from({length: count}, (_, i) => this._iconTransforms(i, middle));
        const offsets = this._spacing(transforms, INLINE_ICON_SIZE);
        for (let i = 0; i < count; i++) {
            const birth = iconBirth(this._visibleCount, Math.abs(i - middle));
            if (birth === 0)
                continue;
            const transform = transforms[i];
            const color = ICON_COLORS[
                PART_COLOR_INDEX[this._part] ??
                (i + colorOffset + ICON_COLORS.length) % ICON_COLORS.length];
            drawIcon(cr, first + i * INLINE_STEP + offsets[i], iconTop, INLINE_ICON_SIZE,
                color, {
                    ...transform,
                    motion: {
                        ...transform.motion,
                        scaleX: transform.motion.scaleX * birth,
                        scaleY: transform.motion.scaleY * birth,
                    },
                });
        }
    }

    _spacing(transforms, size) {
        return this._recipe.hover.dynamicSpacing && (!this._part || this._part === RecipePart.HOVER)
            ? waveOffsets(transforms.map(() => size),
                transforms.map(transform => transform.motion.scaleX))
            : transforms.map(() => 0);
    }

    _iconTransforms(index, middle) {
        if (!this._sweepActive && this._part !== RecipePart.HOVER && index === middle) {
            return {
                motion: this._motionTransform,
                launch: this._launchTransform,
                launchPivot: this._attending
                    ? getAttentionPivot(this._recipe.attention.effect, ScreenEdge.BOTTOM)
                    : this._launching
                        ? getLaunchPivot(this._recipe.launch.effect, ScreenEdge.BOTTOM)
                        : BOTTOM_PIVOT,
                peek: this._attending && this._recipe.attention.peekWhenHidden
                    ? this._peek : 1,
            };
        }
        const pointer = this._sweepActive ? this._sweepValue : middle;
        const level = waveFalloff(Math.abs(index - pointer), this._recipe.hover.reach) *
            this._hoverProgress;
        return {
            motion: resolveIconTransform({
                recipe: this._recipe,
                hoverLevel: level,
            }),
            launch: IDENTITY,
            launchPivot: BOTTOM_PIVOT,
            peek: 1,
        };
    }
});

const REFERENCE_ICON_SIZE = 46;

const ICON_COLORS = [
    [0.90, 0.42, 0.31],
    [0.95, 0.74, 0.30],
    [0.28, 0.55, 0.93],
    [0.30, 0.74, 0.56],
    [0.66, 0.45, 0.86],
];

const PART_COLOR_INDEX = {
    [RecipePart.PRESS]: 1,
    [RecipePart.LAUNCH]: 3,
    [RecipePart.ATTENTION]: 0,
};

function hoverIconCount(recipe) {
    return 2 * recipe.hover.reach + 1;
}

function inlineWidth(count) {
    return Math.round(count * INLINE_STEP + 22);
}

// Pair d shrinks while the count crosses 2d..2d+1, ahead of the frame edge.
function iconBirth(visibleCount, distance) {
    if (distance === 0)
        return 1;
    return Math.min(1, Math.max(0, visibleCount - 2 * distance));
}

function oddCountFor(value) {
    return 2 * Math.ceil((value - 1) / 2) + 1;
}

function drawIcon(cr, centerX, top, size, color, {motion, launch, launchPivot, peek}) {
    const radius = size * 0.28;
    // Scale dock-sized travel to the preview icons.
    const translateScale = size / REFERENCE_ICON_SIZE;
    const basePivotX = BOTTOM_PIVOT[0] * size;
    const basePivotY = BOTTOM_PIVOT[1] * size;
    const pivotX = launchPivot[0] * size;
    const pivotY = launchPivot[1] * size;
    const translationX =
        (motion.translationX + launch.translationX) * translateScale +
        (motion.scaleX - 1) * (pivotX - basePivotX);
    const translationY =
        (motion.translationY + launch.translationY) * translateScale +
        (motion.scaleY - 1) * (pivotY - basePivotY);
    const peekLift = (1 - peek) * (size + 8);
    cr.save();
    cr.translate(
        centerX - size / 2 + pivotX + translationX,
        top + pivotY + translationY + peekLift);
    cr.scale(motion.scaleX * launch.scaleX, motion.scaleY * launch.scaleY);
    cr.rotate(launch.rotation * Math.PI / 180);
    roundedRectangle(cr, -pivotX, -pivotY, size, size, radius);
    cr.setSourceRGBA(...color, peek);
    cr.fill();
    roundedRectangle(
        cr, -pivotX + 0.5, -pivotY + 0.5, size - 1, size - 1, radius);
    cr.setSourceRGBA(1, 1, 1, 0.10 * peek);
    cr.setLineWidth(1);
    cr.stroke();
    const dim = 1 - (1 - motion.dim) * (1 - launch.dim);
    if (dim > 0) {
        roundedRectangle(cr, -pivotX, -pivotY, size, size, radius);
        cr.setSourceRGBA(0, 0, 0, dim * peek);
        cr.fill();
    }
    cr.restore();
}

function animate(widget, duration, easing, onValue, onDone = null) {
    const animation = Adw.TimedAnimation.new(widget, 0, 1, duration,
        Adw.CallbackAnimationTarget.new(onValue));
    animation.set_easing(easing);
    if (onDone)
        animation.connect('done', onDone);
    animation.play();
    return animation;
}

function roundedRectangle(cr, x, y, width, height, radius) {
    const right = x + width;
    const bottom = y + height;
    cr.newSubPath();
    cr.arc(right - radius, y + radius, radius, -Math.PI / 2, 0);
    cr.arc(right - radius, bottom - radius, radius, 0, Math.PI / 2);
    cr.arc(x + radius, bottom - radius, radius, Math.PI / 2, Math.PI);
    cr.arc(x + radius, y + radius, radius, Math.PI, Math.PI * 1.5);
    cr.closePath();
}
