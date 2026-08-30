import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import {AppIcon} from 'resource:///org/gnome/shell/ui/appDisplay.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {LaunchEffect, resolveAnimationMode} from '../motion/catalog.js';
import {
    buildLaunchSegments,
    composeIconTransform,
    dimOpacity,
    getLaunchPivot,
    getOrientation,
    hoverIntroLift,
    hoverIntroScale,
    shouldRepeatLaunch,
    shouldRetreatOnHandoff,
} from '../motion/transforms.js';
import {DeferredLaunchEnds} from './deferredLaunchEnds.js';

const HANDOFF_DURATION = 80;
const RETREAT_DURATION = 180;
const RETREAT_SHRINK = 0.85;
const OPAQUE = 255;

export class LaunchEngine {
    #deferredEnds;
    #getController;
    #injections = null;
    #sessions = new Map();

    constructor({getController}) {
        this.#getController = getController;
        this.#deferredEnds = new DeferredLaunchEnds({
            schedule: callback =>
                GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, callback),
            cancel: sourceId => GLib.source_remove(sourceId),
        });
    }

    enable() {
        // The stock dash and Dash to Dock both play their launch zoom here.
        this.#injections = new InjectionManager();
        const engine = this;
        this.#injections.overrideMethod(
            AppIcon.prototype, 'animateLaunch', original => function (...args) {
                const controller = engine.#getController(this);
                if (!controller)
                    return original.call(this, ...args);
                return engine.#play(this, controller,
                    () => original.call(this, ...args));
            });
    }

    disable() {
        this.#injections.clear();
        this.#injections = null;
        for (const session of [...this.#sessions.values()])
            this.#finish(session);
        this.#deferredEnds.flush();
    }

    #play(appIcon, controller, playStock) {
        const {launch} = controller.recipe;
        if (launch.enabled && launch.effect === LaunchEffect.STOCK)
            return playStock();

        // The St.Icon, not its bin: the bin carries the hover transform.
        const target = appIcon.icon.icon;
        if (this.#sessions.has(target) ||
            !St.Settings.get().enable_animations)
            return;

        // beginLaunch resets the hover, so the clone needs both geometries.
        const visibleGeometry = actorGeometry(target);
        const preparation = controller.beginLaunch(
            controller.recipe.launch.enabled);
        if (!preparation.active)
            return;
        const neutralGeometry = actorGeometry(target);
        this.#startLaunch(
            appIcon, controller, target, visibleGeometry,
            neutralGeometry, preparation);
    }

    #startLaunch(appIcon, controller, target, visibleGeometry,
        neutralGeometry, preparation) {
        const recipe = controller.recipe;
        const {hoverDuration, magnify, pressSteps} = preparation;
        const launchPivot = getLaunchPivot(
            recipe.launch.effect, controller.position);
        const introScale = hoverIntroScale(visibleGeometry, neutralGeometry);
        const introLift = hoverIntroLift(
            visibleGeometry, neutralGeometry, launchPivot);
        const clone = new Clutter.Clone({
            source: target,
            reactive: false,
            ...neutralGeometry,
            opacity: OPAQUE,
        });
        clone.set_pivot_point(...launchPivot);
        clone.set_scale(introScale.x, introScale.y);
        clone.translation_x = introLift.x;
        clone.translation_y = introLift.y;
        Main.uiGroup.add_child(clone);

        const pressTransform = composeIconTransform({
            position: controller.position,
            pressIntensity: recipe.press.intensity,
            pressEffect: recipe.press.effect,
        });

        const session = {
            app: appIcon.app,
            appSeenRunning: false,
            clone,
            controller,
            cycle: 0,
            effectStart: 0,
            // Ends first of: ease chain, repeat timer, target destroy.
            finished: false,
            hoverDuration,
            introLift,
            magnifyBase: magnify,
            originalOpacity: target.opacity,
            launchPivot,
            pressSteps,
            pressTransform,
            repeatSourceId: 0,
            startedAt: GLib.get_monotonic_time() / 1000,
            target,
            wasLaunching: appIcon.app
                ? appIcon.app.state !== Shell.AppState.RUNNING
                : false,
        };
        target.connectObject('destroy',
            () => this.#finish(session, {targetDestroyed: true}), session);
        if (session.app) {
            Shell.AppSystem.get_default().connectObject('app-state-changed',
                (_system, app) => {
                    if (app !== session.app ||
                        app.state !== Shell.AppState.RUNNING)
                        return;
                    session.appSeenRunning = true;
                    Shell.AppSystem.get_default().disconnectObject(session);
                }, session);
        }
        this.#sessions.set(target, session);
        target.opacity = 0;
        this.#runIntroStep(session, 0);
    }

    #runIntroStep(session, index) {
        if (session.finished)
            return;
        while (index < session.pressSteps.length &&
            !session.pressSteps[index].pressed)
            index++;
        if (index >= session.pressSteps.length) {
            this.#startEffect(session);
            return;
        }

        const recipe = session.controller.recipe;
        const magnify = session.magnifyBase;
        const duration = Math.round(
            recipe.press.duration * session.pressSteps[index].durationFactor);
        const mode = resolveAnimationMode(
            recipe.hover.easing, Clutter.AnimationMode);
        const onComplete = () => this.#runIntroStep(session, index + 1);
        session.clone.opacity = dimOpacity(
            OPAQUE, session.pressTransform.dim);
        const geometry = {
            scale_x: magnify * session.pressTransform.scaleX,
            scale_y: magnify * session.pressTransform.scaleY,
            translation_x: session.introLift.x,
            translation_y: session.introLift.y,
            duration,
            mode,
        };
        if (session.pressTransform.dim > 0) {
            // Use opacity as the timeline when geometry does not change.
            session.clone.ease(geometry);
            session.clone.ease_property('opacity', session.clone.opacity, {
                duration,
                mode: Clutter.AnimationMode.LINEAR,
                onComplete,
            });
        } else {
            session.clone.ease({...geometry, onComplete});
        }
    }

    #startEffect(session) {
        if (session.finished)
            return;
        session.clone.opacity = OPAQUE;
        session.effectStart = GLib.get_monotonic_time() / 1000;
        if (session.controller.recipe.launch.enabled) {
            this.#runCycle(session);
            return;
        }
        session.clone.ease({
            scale_x: 1,
            scale_y: 1,
            translation_x: 0,
            translation_y: 0,
            duration: session.hoverDuration,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            onComplete: () => this.#handoff(session),
        });
    }

    #magnifyState(session) {
        if (session.magnifyBase === 1)
            return {magnify: 1, liftX: 0, liftY: 0};
        const elapsed = GLib.get_monotonic_time() / 1000 - session.effectStart;
        const progress = Math.min(1, Math.max(0, elapsed / session.hoverDuration));
        const remain = (1 - progress) ** 2;
        return {
            magnify: 1 + (session.magnifyBase - 1) * remain,
            liftX: session.introLift.x * remain,
            liftY: session.introLift.y * remain,
        };
    }

    #runCycle(session) {
        if (session.finished)
            return;
        const {launch} = session.controller.recipe;
        const segments = buildLaunchSegments(
            launch.effect, launch, session.controller.position, session.cycle);
        // The recipe can turn stock mid-session.
        if (segments.length === 0) {
            this.#handoff(session);
            return;
        }
        this.#runSegment(session, segments, 0);
    }

    #runSegment(session, segments, index) {
        if (session.finished)
            return;
        if (index >= segments.length) {
            this.#finishCycle(session);
            return;
        }

        const segment = segments[index];
        const {magnify, liftX, liftY} = this.#magnifyState(session);
        session.clone.ease({
            scale_x: magnify * segment.scaleX,
            scale_y: magnify * segment.scaleY,
            translation_x: segment.translationX + liftX,
            translation_y: segment.translationY + liftY,
            duration: segment.duration,
            mode: resolveAnimationMode(segment.easing, Clutter.AnimationMode),
            onComplete: () => this.#runSegment(session, segments, index + 1),
        });
    }

    #shouldRepeat(session) {
        const launch = session.controller.recipe.launch;
        return shouldRepeatLaunch({
            wasLaunching: session.wasLaunching,
            appRunning: session.appSeenRunning || !session.app ||
                session.app.state === Shell.AppState.RUNNING,
            repeat: launch.repeat,
            elapsed: GLib.get_monotonic_time() / 1000 - session.startedAt,
            maxDuration: launch.maxDuration,
        });
    }

    #finishCycle(session) {
        const launch = session.controller.recipe.launch;
        if (this.#shouldRepeat(session)) {
            session.cycle++;
            this.#scheduleNextCycle(session, launch.repeatPause);
            return;
        }
        const momentum = launch.effect !== LaunchEffect.PULSE &&
            launch.effect !== LaunchEffect.STRETCH;
        this.#handoff(session, {momentum});
    }

    #scheduleNextCycle(session, pause) {
        this.#clearRepeatTimer(session);
        session.repeatSourceId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, pause, () => {
                session.repeatSourceId = 0;
                if (session.finished)
                    return GLib.SOURCE_REMOVE;
                if (this.#shouldRepeat(session))
                    this.#runCycle(session);
                else
                    this.#handoff(session);
                return GLib.SOURCE_REMOVE;
            });
    }

    #handoff(session, {momentum = false} = {}) {
        if (session.finished)
            return;
        this.#clearRepeatTimer(session);
        session.clone.remove_all_transitions();
        session.target.opacity = session.originalOpacity;
        const retreat = shouldRetreatOnHandoff({
            targetMapped: session.target.mapped,
            overviewVisible: Main.overview.visible,
            overviewVisibleTarget: Main.overview.visibleTarget,
            dashContainsTarget: Main.overview.dash.contains(session.target),
        });
        if (retreat) {
            const {outward} = getOrientation(session.controller.position);
            const [width, height] = session.clone.get_transformed_size();
            session.clone.ease({
                translation_x: session.clone.translation_x - outward[0] * width,
                translation_y: session.clone.translation_y - outward[1] * height,
                scale_x: session.clone.scale_x * RETREAT_SHRINK,
                scale_y: session.clone.scale_y * RETREAT_SHRINK,
                opacity: 0,
                duration: RETREAT_DURATION,
                mode: momentum
                    ? Clutter.AnimationMode.EASE_OUT_QUAD
                    : Clutter.AnimationMode.EASE_IN_QUAD,
                onComplete: () => this.#finish(session),
            });
            return;
        }
        const [x, y] = session.target.get_transformed_position();
        const [width, height] = session.target.get_transformed_size();
        session.clone.ease({
            x,
            y,
            width,
            height,
            scale_x: 1,
            scale_y: 1,
            translation_x: 0,
            translation_y: 0,
            duration: HANDOFF_DURATION,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => this.#finish(session),
        });
    }

    // With a destroyed target, the controller's end waits for idle.
    #finish(session, {targetDestroyed = false} = {}) {
        if (session.finished)
            return;
        session.finished = true;
        this.#clearRepeatTimer(session);
        Shell.AppSystem.get_default().disconnectObject(session);
        session.clone.remove_all_transitions();
        session.clone.destroy();
        this.#sessions.delete(session.target);
        if (targetDestroyed) {
            this.#deferredEnds.defer(session.controller);
            return;
        }
        session.target.opacity = session.originalOpacity;
        session.target.disconnectObject(session);
        session.controller.endLaunch();
    }

    #clearRepeatTimer(session) {
        if (!session.repeatSourceId)
            return;
        GLib.source_remove(session.repeatSourceId);
        session.repeatSourceId = 0;
    }

}

function actorGeometry(actor) {
    const [x, y] = actor.get_transformed_position();
    const [width, height] = actor.get_transformed_size();
    return {x, y, width, height};
}
