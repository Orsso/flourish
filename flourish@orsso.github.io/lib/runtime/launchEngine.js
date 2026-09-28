import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import {AppIcon} from 'resource:///org/gnome/shell/ui/appDisplay.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {DockState, LaunchEffect, PressMode} from '../motion/catalog.js';
import {
    buildLaunchSegments,
    getLaunchPivot,
    hoverIntroLift,
    hoverIntroScale,
    launchIconRect,
    shouldRepeatLaunch,
    shouldRetreatOnHandoff,
} from '../motion/transforms.js';
import {DeferredLaunchEnds} from './deferredLaunchEnds.js';
import {actorGeometry} from './geometry.js';
import {createIconClone, retreatClone, runSegments} from './iconClone.js';
import {setIconDim} from './iconDim.js';
import {anchoredPlacement, followIcon} from './iconFollower.js';

const HANDOFF_DURATION = 80;
// Desktop entries that open a shell view instead of starting an app.
const OVERVIEW_ACTIONS = new Set([
    'org.gnome.Shell.Extensions.Kiwi.Launchpad.desktop',
]);

export class LaunchEngine {
    #beforeLaunch;
    #deferredEnds;
    #getController;
    #getDockContext;
    #injections = null;
    #scheduler;
    #sessions = new Map();

    constructor({
        getController, getDockContext, scheduler, beforeLaunch = () => {},
    }) {
        this.#getController = getController;
        this.#getDockContext = getDockContext;
        this.#scheduler = scheduler;
        this.#beforeLaunch = beforeLaunch;
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
        if (OVERVIEW_ACTIONS.has(appIcon.app.get_id()))
            return;
        this.#beforeLaunch(appIcon);

        const {launch, press} = controller.recipe;
        if (launch.enabled && launch.effect === LaunchEffect.STOCK &&
            !(press.enabled && press.mode === PressMode.LAUNCHES_ONLY))
            return playStock();

        // The St.Icon, not its bin: the bin carries the hover transform.
        const target = appIcon.icon.icon;
        if (this.#sessions.has(target) ||
            !St.Settings.get().enable_animations)
            return;

        // Release the press while keeping the shared hover geometry.
        const visibility = this.#getDockContext(appIcon)?.visibility;
        const launchPivot = getLaunchPivot(launch.effect, controller.edge);
        const place = placement(visibility, controller.edge, launchPivot);
        const visibleGeometry = place(actorGeometry(target));
        const preparation = controller.beginLaunch(launch.enabled);
        if (!preparation.active)
            return;
        const neutralGeometry = place(actorGeometry(target));
        const introScale = hoverIntroScale(visibleGeometry, neutralGeometry);
        const introLift = hoverIntroLift(
            visibleGeometry, neutralGeometry, launchPivot);
        const frame = new Clutter.Actor({
            ...neutralGeometry,
            layout_manager: new Clutter.BinLayout(),
            reactive: false,
        });
        Main.uiGroup.add_child(frame);
        setIconDim(frame, preparation.dim);
        const clone = createIconClone(target, {
            x: 0, y: 0, width: neutralGeometry.width, height: neutralGeometry.height,
            x_expand: true, y_expand: true,
        }, frame, {
            badgeBox: appIcon.icon.get_parent(),
            pivot: launchPivot,
            scale: introScale,
            translation: introLift,
        });

        const app = appIcon.app;
        const session = {
            app,
            appSeenRunning: false,
            clone,
            controller,
            cycle: 0,
            // Ends first of: ease chain, repeat timer, target destroy.
            finished: false,
            frame,
            originalOpacity: target.opacity,
            playStock,
            repeatSourceId: 0,
            startedAt: GLib.get_monotonic_time() / 1000,
            target,
            unfollow: followIcon({
                target, clone: frame, place, scheduler: this.#scheduler,
            }),
            visibility,
            wasLaunching: app.state !== Shell.AppState.RUNNING,
            // Window-backed apps have no desktop entry.
            startupNotify: app.get_app_info()?.get_string('StartupNotify'),
        };
        target.connectObject('destroy',
            () => this.#finish(session, {targetDestroyed: true}), session);
        Shell.AppSystem.get_default().connectObject('app-state-changed',
            (_system, changed) => {
                if (changed !== app || changed.state !== Shell.AppState.RUNNING)
                    return;
                session.appSeenRunning = true;
                Shell.AppSystem.get_default().disconnectObject(session);
            }, session);
        this.#sessions.set(target, session);
        target.opacity = 0;
        runSegments(clone, preparation.pressSegments, {
            isCancelled: () => session.finished,
            onComplete: () => this.#startEffect(session),
        });
    }

    #startEffect(session) {
        if (session.finished)
            return;
        const {launch} = session.controller.recipe;
        if (launch.enabled && launch.effect === LaunchEffect.STOCK) {
            this.#finish(session);
            session.playStock();
        } else if (launch.enabled) {
            this.#runCycle(session);
        } else {
            this.#handoff(session);
        }
    }

    #runCycle(session) {
        if (session.finished)
            return;
        const {launch} = session.controller.recipe;
        const segments = buildLaunchSegments(
            launch.effect, launch, session.controller.edge, session.cycle);
        // The recipe can turn stock mid-session.
        if (segments.length === 0) {
            this.#handoff(session);
            return;
        }
        runSegments(session.clone, segments, {
            isCancelled: () => session.finished,
            onComplete: () => this.#finishCycle(session),
        });
    }

    #shouldRepeat(session) {
        const launch = session.controller.recipe.launch;
        // A mapped window does not end STARTING; the startup sequence does.
        return shouldRepeatLaunch({
            wasLaunching: session.wasLaunching,
            startupNotify: session.startupNotify,
            appRunning: session.appSeenRunning ||
                session.app.state === Shell.AppState.RUNNING ||
                session.app.get_n_windows() > 0,
            repeat: launch.repeat,
            elapsed: GLib.get_monotonic_time() / 1000 - session.startedAt,
            maxDuration: launch.maxDuration,
        });
    }

    #finishCycle(session) {
        const launch = session.controller.recipe.launch;
        if (this.#shouldRepeat(session)) {
            session.cycle++;
            this.#scheduleNextCycle(session);
            return;
        }
        const momentum = launch.effect !== LaunchEffect.PULSE &&
            launch.effect !== LaunchEffect.STRETCH;
        this.#handoff(session, {momentum});
    }

    #scheduleNextCycle(session) {
        this.#clearRepeatTimer(session);
        const pause = session.controller.recipe.launch.repeatPause;
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
        const retreat = shouldRetreatOnHandoff({
            targetMapped: session.target.mapped,
            dockShown: session.visibility
                ? session.visibility.state === DockState.SHOWN : true,
            overviewVisible: Main.overview.visible,
            overviewVisibleTarget: Main.overview.visibleTarget,
            dashContainsTarget: Main.overview.dash.contains(session.target),
        });
        if (retreat) {
            session.unfollow();
            session.target.opacity = session.originalOpacity;
            retreatClone(session.clone, session.controller.edge, {
                momentum,
                onComplete: () => this.#finish(session),
            });
            return;
        }
        session.clone.ease({
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
        session.unfollow();
        Shell.AppSystem.get_default().disconnectObject(session);
        session.clone.remove_all_transitions();
        session.clone.destroy();
        session.frame.destroy();
        this.#sessions.delete(session.target);
        if (targetDestroyed) {
            this.#deferredEnds.defer(session.controller);
            return;
        }
        session.target.opacity = session.originalOpacity;
        session.target.disconnectObject(session);
        session.controller.endOverlay();
    }

    #clearRepeatTimer(session) {
        if (!session.repeatSourceId)
            return;
        GLib.source_remove(session.repeatSourceId);
        session.repeatSourceId = 0;
    }

}

function placement(visibility, edge, pivot) {
    if (!visibility)
        return anchoredPlacement(() => Main.overview.visibleTarget, pivot);
    return rect => launchIconRect(rect, {
        shownRect: visibility.shownRect,
        slidRect: visibility.measure(),
        edge,
    });
}
