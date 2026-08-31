import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {PressMode} from '../motion/catalog.js';
import {
    buildLaunchSegments,
    getLaunchPivot,
    interpolateTransform,
    launchDuration,
    projectHoverTransform,
    resolveIconTransform,
    sampleLaunchSegments,
} from '../motion/transforms.js';
import {
    buildDemoSequence,
    buildEffectSequence,
    DemoPhase,
    hoverIsActive,
    HOVER_HOLD_MS,
    NEUTRAL_HOLD_MS,
    PRE_LAUNCH_PAUSE_MS,
    SETTLE_MS,
    SWEEP_MS,
    SWEEP_SETTLE_MS,
} from './demoSequence.js';

const IDENTITY = {
    scaleX: 1,
    scaleY: 1,
    translationX: 0,
    translationY: 0,
    dim: 0,
};
const BOTTOM_PIVOT = [0.5, 1];
// Stands in for an animation that never ran.
const IDLE_ANIMATION = {state: Adw.AnimationState.IDLE, reset() {}, skip() {}};

const INLINE_ICON_SIZE = 24;
const INLINE_STEP = INLINE_ICON_SIZE + 10;
const COUNT_GROW_MS = 250;

const EASINGS = {
    linear: Adw.Easing.LINEAR,
    'ease-out-quad': Adw.Easing.EASE_OUT_QUAD,
    'ease-out-cubic': Adw.Easing.EASE_OUT_CUBIC,
    'ease-out-back': Adw.Easing.EASE_OUT_BACK,
};

export const MotionPreview = GObject.registerClass(class MotionPreview extends Gtk.DrawingArea {
    _init({recipe, effect = null, ...params}) {
        const inline = Boolean(effect);
        const iconCount = effect === 'hover' ? hoverIconCount(recipe) : 1;
        super._init({
            height_request: inline ? 64 : 96,
            width_request: inline ? inlineWidth(iconCount) : -1,
            hexpand: !inline,
            valign: inline ? Gtk.Align.CENTER : Gtk.Align.FILL,
            ...params,
        });
        this._selected = false;
        this._effect = effect;
        this._iconCount = iconCount;
        this._visibleCount = iconCount;
        this._countAnimation = IDLE_ANIMATION;
        this._recipe = this._adoptRecipe(recipe);
        this._held = false;
        this._hovered = false;
        this._hoverProgress = 0;
        this._pressed = false;
        this._launching = false;
        this._pressGeneration = 0;
        this._motionTransform = {...IDENTITY};
        this._launchTransform = {...IDENTITY};
        this._motionAnimation = IDLE_ANIMATION;
        this._launchAnimation = IDLE_ANIMATION;
        // Generation of the running loop, 0 when idle.
        this._loop = 0;
        this._timeoutId = 0;
        this._sweepActive = false;
        this._sweepValue = 0;
        this._sweepAnimation = IDLE_ANIMATION;
        this.set_draw_func((_area, cr, width, height) => {
            this._draw(cr, width, height);
        });

        this.connect('unmap', () => this.stop());
    }

    _adoptRecipe(recipe) {
        if (!this._effect || recipe[this._effect].enabled)
            return recipe;
        return {
            ...recipe,
            [this._effect]: {...recipe[this._effect], enabled: true},
        };
    }

    _resolveMotion() {
        return resolveIconTransform({
            position: 'bottom',
            recipe: this._recipe,
            hovered: this._hovered,
            pressed: this._pressed,
            launching: this._launching,
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
        if (this._effect !== 'hover')
            return;
        const count = hoverIconCount(this._recipe);
        if (count === this._iconCount)
            return;
        this._iconCount = count;
        this._animateIconCount();
    }

    _animateIconCount() {
        // reset() replays the initial value; read the count first.
        const from = this._visibleCount;
        this._countAnimation.reset();
        const to = this._iconCount;
        const target = Adw.CallbackAnimationTarget.new(value => {
            this._visibleCount = from + (to - from) * value;
            this.width_request = inlineWidth(this._visibleCount);
            this.queue_draw();
        });
        this._countAnimation = Adw.TimedAnimation.new(
            this, 0, 1, COUNT_GROW_MS, target);
        this._countAnimation.set_easing(Adw.Easing.EASE_OUT_CUBIC);
        this._countAnimation.play();
    }

    setSelected(selected) {
        this._selected = selected;
        this.queue_draw();
    }

    stop() {
        this._cancelLoop();
        this._countAnimation.skip();
        this._held = false;
        this._pressGeneration++;
        this._motionAnimation.reset();
        this._launchAnimation.reset();
        this._motionAnimation = IDLE_ANIMATION;
        this._launchAnimation = IDLE_ANIMATION;
        this._hovered = false;
        this._hoverProgress = 0;
        this._pressed = false;
        this._launching = false;
        this._motionTransform = {...IDENTITY};
        this._launchTransform = {...IDENTITY};
        this.queue_draw();
    }

    _cancelLoop() {
        this._loop = 0;
        this._sweepAnimation.reset();
        this._sweepAnimation = IDLE_ANIMATION;
        this._sweepActive = false;
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
        if (this._effect) {
            this._runSequence(generation,
                () => buildEffectSequence(this._effect, this._recipe));
            return;
        }
        if (!hoverIsActive(this._recipe)) {
            this._runSequence(generation, () => buildDemoSequence(this._recipe));
            return;
        }
        this._runIntroSweep(generation, () => this._runSequence(
            generation, () => buildDemoSequence(this._recipe)));
    }

    _runIntroSweep(generation, onComplete) {
        this._sweepActive = true;
        const count = ICON_COLORS.length;
        const middle = (count - 1) / 2;
        const start = -0.6;
        const end = (count - 1) + 0.6;
        this._sweepValue = start;
        this._playSweepSegment(generation, start, end, SWEEP_MS,
            Adw.Easing.EASE_IN_OUT_CUBIC, () => {
                this._playSweepSegment(generation, end, middle, SWEEP_SETTLE_MS,
                    Adw.Easing.EASE_OUT_CUBIC, () => {
                        this._sweepAnimation = IDLE_ANIMATION;
                        this._sweepActive = false;
                        this._hovered = true;
                        this._hoverProgress = 0;
                        this._motionTransform = resolveIconTransform({
                            position: 'bottom',
                            recipe: this._recipe,
                            hovered: true,
                        });
                        this.queue_draw();
                        onComplete();
                    });
            });
    }

    _playSweepSegment(generation, fromValue, toValue, duration, easing, onDone) {
        this._sweepAnimation.reset();
        const target = Adw.CallbackAnimationTarget.new(value => {
            this._sweepValue = fromValue + (toValue - fromValue) * value;
            this.queue_draw();
        });
        this._sweepAnimation = Adw.TimedAnimation.new(this, 0, 1, duration, target);
        this._sweepAnimation.set_easing(easing);
        this._sweepAnimation.connect('done', () => {
            if (generation !== this._loop)
                return;
            onDone();
        });
        this._sweepAnimation.play();
    }

    stopLoop() {
        if (this._held)
            return;
        if (!this._loop) {
            this._hovered = false;
            this._pressed = false;
            this._animateMotion(this._recipe.hover.duration);
            return;
        }
        this._cancelLoop();
        this._pressGeneration++;
        this._launchAnimation.reset();
        this._launchTransform = {...IDENTITY};
        this._pressed = false;
        this._launching = false;
        this._hovered = false;
        this._animateMotion(this._recipe.hover.duration);
    }

    holdPose() {
        this._cancelLoop();
        this._held = true;
        this._hovered = this._effect === 'hover';
        this._pressed = this._effect === 'press';
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
            if (!phases.length)
                return;
            const phase = phases[index++];
            this._runDemoPhase(phase, generation, advance);
        };
        advance();
    }

    _runDemoPhase(phase, generation, done) {
        switch (phase) {
            case DemoPhase.HOVER_IN:
                this._hovered = true;
                this._animateMotion(this._recipe.hover.duration, done);
                break;
            case DemoPhase.RESET:
                this._hovered = false;
                this._animateMotion(this._recipe.hover.duration, done);
                break;
            case DemoPhase.HOLD:
                this._wait(HOVER_HOLD_MS, generation, done);
                break;
            case DemoPhase.PRE_LAUNCH_PAUSE:
                this._wait(PRE_LAUNCH_PAUSE_MS, generation, done);
                break;
            case DemoPhase.REPEAT_PAUSE:
                this._wait(this._recipe.launch.repeatPause, generation, done);
                break;
            case DemoPhase.SETTLE:
                this._wait(SETTLE_MS, generation, done);
                break;
            case DemoPhase.NEUTRAL_HOLD:
                this._wait(NEUTRAL_HOLD_MS, generation, done);
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
            default:
                done();
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
        if (press.enabled && press.mode === PressMode.ALL_PRIMARY_CLICKS) {
            this._pressed = true;
            this._animateMotion(press.duration, () => {
                this._pressed = false;
                this._beginLaunch({ownsPressFeedback: true, onComplete: done});
            });
        } else if (press.enabled && press.mode === PressMode.LAUNCHES_ONLY) {
            this._playLaunchPressFeedback(done);
        } else {
            this._beginLaunch({onComplete: done});
        }
    }

    _animateMotion(duration, onDone = () => {},
        easing = EASINGS[this._recipe.hover.easing]) {
        const from = this._motionTransform;
        const to = this._resolveMotion();
        const hoverFrom = this._hoverProgress;
        const hoverTo = this._hovered ? 1 : 0;
        this._motionAnimation.reset();
        this._motionTransform = {...from, dim: to.dim ?? 0};
        this.queue_draw();
        const target = Adw.CallbackAnimationTarget.new(value => {
            this._hoverProgress = hoverFrom + (hoverTo - hoverFrom) * value;
            this._motionTransform = interpolateMotionTransform(from, to, value);
            this.queue_draw();
        });
        this._motionAnimation = Adw.TimedAnimation.new(this, 0, 1, duration, target);
        this._motionAnimation.set_easing(
            easing);
        this._motionAnimation.connect('done', () => {
            this._hoverProgress = hoverTo;
            this._motionTransform = this._resolveMotion();
            this.queue_draw();
            onDone();
        });
        this._motionAnimation.play();
    }

    _playLaunchPressFeedback(onComplete = () => {}) {
        const generation = ++this._pressGeneration;
        this._pressed = true;
        this._animateMotion(Math.round(this._recipe.press.duration / 2), () => {
            if (generation !== this._pressGeneration)
                return;
            this._beginLaunch({ownsPressFeedback: true, onComplete});
        });
    }

    _beginLaunch({ownsPressFeedback = false, onComplete = () => {}} = {}) {
        if (this._launching ||
            (!this._recipe.launch.enabled && !ownsPressFeedback)) {
            onComplete();
            return;
        }
        this._launching = true;
        this._pressed = false;
        if (this._recipe.launch.enabled) {
            if (this._effect === 'launch') {
                this._motionAnimation.reset();
                this._motionAnimation = IDLE_ANIMATION;
                this._motionTransform = {...IDENTITY};
            } else {
                this._animateMotion(
                    this._recipe.hover.duration, () => {},
                    Adw.Easing.EASE_OUT_CUBIC);
            }
            this._playLaunch(onComplete);
        } else {
            this._animateMotion(this._recipe.hover.duration,
                () => this._finishLaunch(onComplete), Adw.Easing.EASE_OUT_CUBIC);
        }
    }

    _playLaunch(onComplete = () => {}) {
        const segments = buildLaunchSegments(
            this._recipe.launch.effect, this._recipe.launch, 'bottom');
        const duration = launchDuration(segments);
        this._launchAnimation.reset();
        const target = Adw.CallbackAnimationTarget.new(value => {
            this._launchTransform = sampleLaunchSegments(segments, value * duration);
            this.queue_draw();
        });
        this._launchAnimation = Adw.TimedAnimation.new(this, 0, 1, duration, target);
        this._launchAnimation.set_easing(Adw.Easing.LINEAR);
        this._launchAnimation.connect('done', () => {
            this._launchTransform = {...IDENTITY};
            this._finishLaunch(onComplete);
        });
        this._launchAnimation.play();
    }

    _finishLaunch(onComplete = () => {}) {
        if (!this._launching) {
            onComplete();
            return;
        }
        this._launching = false;
        if (this._effect === 'launch') {
            this._motionTransform = {...IDENTITY};
            onComplete();
            return;
        }
        this._animateMotion(this._recipe.hover.duration, onComplete);
    }

    _draw(cr, width, height) {
        if (this._effect) {
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

        for (let i = 0; i < count; i++) {
            const transforms = this._iconTransforms(i, middle);
            drawIcon(cr, innerLeft + i * step, iconTop, iconSize,
                ICON_COLORS[i], transforms);
        }
    }

    _drawInline(cr, width, height) {
        const count = oddCountFor(this._visibleCount);
        const middle = (count - 1) / 2;
        const iconTop = height - INLINE_ICON_SIZE - 8;
        const first = width / 2 - middle * INLINE_STEP;
        const colorOffset = (ICON_COLORS.length - count) >> 1;
        for (let i = 0; i < count; i++) {
            const birth = iconBirth(this._visibleCount, Math.abs(i - middle));
            if (birth === 0)
                continue;
            const transforms = this._iconTransforms(i, middle);
            const color = ICON_COLORS[
                EFFECT_COLOR_INDEX[this._effect] ??
                (i + colorOffset + ICON_COLORS.length) % ICON_COLORS.length];
            drawIcon(cr, first + i * INLINE_STEP, iconTop, INLINE_ICON_SIZE,
                color, {
                    ...transforms,
                    motion: {
                        ...transforms.motion,
                        scaleX: transforms.motion.scaleX * birth,
                        scaleY: transforms.motion.scaleY * birth,
                    },
                });
        }
    }

    _iconTransforms(index, middle) {
        if (this._sweepActive) {
            const intensity = Math.max(0, 1 - Math.abs(index - this._sweepValue));
            const hoverFull = resolveIconTransform({
                position: 'bottom',
                recipe: this._recipe,
                hovered: true,
            });
            return {
                motion: interpolateTransform(IDENTITY, hoverFull, intensity),
                launch: IDENTITY,
                launchPivot: BOTTOM_PIVOT,
            };
        }
        const distance = Math.abs(index - middle);
        if (distance === 0) {
            return {
                motion: this._motionTransform,
                launch: this._launchTransform,
                launchPivot: this._launching
                    ? getLaunchPivot(this._recipe.launch.effect, 'bottom')
                    : BOTTOM_PIVOT,
            };
        }
        return {
            motion: projectHoverTransform({
                position: 'bottom',
                recipe: this._recipe,
                neighborDistance: distance,
                progress: this._hoverProgress,
            }),
            launch: IDENTITY,
            launchPivot: BOTTOM_PIVOT,
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

const EFFECT_COLOR_INDEX = {press: 1, launch: 3};

function hoverIconCount(recipe) {
    return 2 * recipe.hover.neighborRadius + 1;
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

function interpolateMotionTransform(from, to, progress) {
    return {
        ...interpolateTransform(from, to, progress),
        dim: to.dim ?? 0,
    };
}

function drawIcon(cr, centerX, top, size, color, {
    motion,
    launch,
    launchPivot,
}) {
    const radius = size * 0.28;
    // Scale dock-sized travel to the preview icons.
    const translateScale = size / REFERENCE_ICON_SIZE;
    const basePivot = motion.pivot ?? BOTTOM_PIVOT;
    const basePivotX = basePivot[0] * size;
    const basePivotY = basePivot[1] * size;
    const pivotX = launchPivot[0] * size;
    const pivotY = launchPivot[1] * size;
    const translationX =
        (motion.translationX + launch.translationX) * translateScale +
        (motion.scaleX - 1) * (pivotX - basePivotX);
    const translationY =
        (motion.translationY + launch.translationY) * translateScale +
        (motion.scaleY - 1) * (pivotY - basePivotY);
    cr.save();
    cr.translate(
        centerX - size / 2 + pivotX + translationX,
        top + pivotY + translationY);
    cr.scale(motion.scaleX * launch.scaleX, motion.scaleY * launch.scaleY);
    roundedRectangle(cr, -pivotX, -pivotY, size, size, radius);
    cr.setSourceRGBA(...color, 1);
    cr.fill();
    roundedRectangle(
        cr, -pivotX + 0.5, -pivotY + 0.5, size - 1, size - 1, radius);
    cr.setSourceRGBA(1, 1, 1, 0.10);
    cr.setLineWidth(1);
    cr.stroke();
    const dim = motion.dim ?? 0;
    if (dim > 0) {
        roundedRectangle(cr, -pivotX, -pivotY, size, size, radius);
        cr.setSourceRGBA(0, 0, 0, dim);
        cr.fill();
    }
    cr.restore();
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
