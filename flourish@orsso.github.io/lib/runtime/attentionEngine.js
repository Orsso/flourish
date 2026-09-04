import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {AttentionPlay, DockState} from '../motion/catalog.js';
import {
    ATTENTION_SLIDE_DURATION,
    attentionPeriod,
    buildAttentionSegments,
    getAttentionPivot,
    getOrientation,
    nextReminderDelay,
    projectIconRect,
    shouldPlayAttention,
} from '../motion/transforms.js';
import {actorGeometry} from './geometry.js';
import {OPAQUE, createIconClone, runSegments} from './iconClone.js';
import {followIcon} from './iconFollower.js';

const INTERRUPT_DURATION = 90;
const MS_PER_SECOND = 1000;

// With a dock per monitor, the icons of one app share a Shell.App.
function anchorKey(icon) {
    return icon.app ?? icon;
}

// One session per urgent icon.
export class AttentionEngine {
    #anchors = new Map();
    #getDockContext;
    #notifications = null;
    #rearmIds = new Set();
    #scheduler;
    #sessions = new Map();

    constructor({getDockContext, scheduler}) {
        this.#getDockContext = getDockContext;
        this.#scheduler = scheduler;
    }

    enable() {
        this.#notifications = new Gio.Settings({
            schema_id: 'org.gnome.desktop.notifications',
        });
    }

    disable() {
        for (const session of [...this.#sessions.values()])
            this.#finish(session);
        for (const id of this.#rearmIds)
            GLib.source_remove(id);
        this.#rearmIds.clear();
        this.#notifications = null;
    }

    onUrgentChanged(controller, urgent) {
        const icon = controller.icon;
        const session = this.#sessions.get(icon);
        if (!urgent) {
            if (session)
                this.#finish(session);
            return;
        }
        if (session)
            return;
        const context = this.#getDockContext(icon);
        if (!context)
            return;
        this.#start(icon, controller, context);
    }

    interrupt(icon) {
        const session = this.#sessions.get(icon);
        if (session?.clone)
            this.#endCycle(session, {abrupt: true});
    }

    #start(icon, controller, context) {
        const target = icon.icon.icon;
        const now = GLib.get_monotonic_time() / MS_PER_SECOND;
        const key = anchorKey(icon);
        if (!this.#anchors.has(key))
            this.#anchors.set(key, now);
        const session = {
            anchorKey: key,
            clone: null,
            context,
            controller,
            cyclesLeft: 0,
            dimmedTarget: false,
            finished: false,
            icon,
            originalOpacity: 0,
            overlaid: false,
            peeking: false,
            reminder: 0,
            retreating: null,
            settling: false,
            target,
            timerId: 0,
            unfollow: null,
            unsubscribe: null,
        };
        icon.connectObject(
            'notify::focused', () => {
                if (icon.focused)
                    this.#finish(session);
            },
            'destroy', () => this.#finish(session, {targetDestroyed: true}),
            session);
        // An icon size change rebuilds the St.Icon under a live icon.
        target.connectObject('destroy', () => {
            this.#finish(session, {targetDestroyed: true});
            this.#rearm(session.controller);
        }, session);
        session.unsubscribe = context.visibility.subscribe(
            state => this.#onDockStateChanged(session, state));
        this.#sessions.set(icon, session);
        this.#tick(session);
    }

    #decide(session) {
        const {controller, context, icon} = session;
        const {attention} = controller.recipe;
        const monitor = context.getMonitor();
        return shouldPlayAttention({
            enabled: attention.enabled,
            urgent: icon.urgent,
            focused: icon.focused,
            dnd: !(this.#notifications?.get_boolean('show-banners') ?? true),
            animationsEnabled: St.Settings.get().enable_animations,
            iconAtRest: controller.atRest,
            dockState: context.visibility.state,
            shownRectKnown: context.visibility.shownRect !== null,
            peekWhenHidden: attention.peekWhenHidden,
            fullscreen: monitor?.inFullscreen ?? false,
            peekInFullscreen: context.dockSettings?.autohideInFullscreen ?? false,
            reminder: session.reminder,
            reminders: attention.reminders,
        });
    }

    #tick(session) {
        if (session.finished || session.clone)
            return;
        session.settling = false;
        switch (this.#decide(session)) {
            case AttentionPlay.STOP:
                this.#finish(session);
                return;
            case AttentionPlay.IN_PLACE:
                this.#leadIn(session);
                return;
            case AttentionPlay.PEEK:
                this.#playPeek(session);
                return;
            case AttentionPlay.SETTLE:
                session.settling = true;
                this.#armTimer(session);
                return;
            case AttentionPlay.WAIT:
            default:
                this.#armTimer(session);
        }
    }

    #armTimer(session) {
        this.#clearTimer(session);
        const {attention} = session.controller.recipe;
        const now = GLib.get_monotonic_time() / MS_PER_SECOND;
        const pause = nextReminderDelay({
            now,
            anchor: this.#anchors.get(session.anchorKey) ?? now,
            period: attentionPeriod({
                segments: this.#segments(session),
                cycles: attention.cycles,
                cyclePause: attention.cyclePause,
                interval: attention.interval,
            }),
        });
        session.timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, pause, () => {
            session.timerId = 0;
            this.#tick(session);
            return GLib.SOURCE_REMOVE;
        });
    }

    #clearTimer(session) {
        if (!session.timerId)
            return;
        GLib.source_remove(session.timerId);
        session.timerId = 0;
    }

    #onDockStateChanged(session, state) {
        if (session.finished)
            return;
        // A dock coming out would show the icon twice.
        if (session.clone && session.peeking && state !== DockState.HIDDEN) {
            this.#endCycle(session, {abrupt: true});
            return;
        }
        // A dock on its way out leaves the clone where the icon no longer is.
        if (session.clone && !session.peeking && state !== DockState.SHOWN) {
            this.#endCycle(session, {abrupt: true});
            return;
        }
        if (session.settling && state !== DockState.MOVING) {
            this.#clearTimer(session);
            this.#tick(session);
        }
    }

    #segments(session) {
        return buildAttentionSegments(
            session.controller.recipe, session.controller.edge);
    }

    #pivot(session) {
        return getAttentionPivot(
            session.controller.recipe.attention.effect, session.controller.edge);
    }

    // An in-place burst waits the length of a peek slide so the icons of one
    // app on two docks move together.
    #leadIn(session) {
        this.#clearTimer(session);
        session.timerId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, ATTENTION_SLIDE_DURATION, () => {
                session.timerId = 0;
                // The dock or a launch may have moved during the lead-in.
                if (session.finished || session.clone)
                    return GLib.SOURCE_REMOVE;
                if (this.#decide(session) === AttentionPlay.IN_PLACE)
                    this.#playInPlace(session);
                else
                    this.#tick(session);
                return GLib.SOURCE_REMOVE;
            });
    }

    #playInPlace(session) {
        const {controller, target} = session;
        if (!controller.beginOverlay()) {
            this.#armTimer(session);
            return;
        }
        session.overlaid = true;
        session.peeking = false;
        const clone = createIconClone(
            target, actorGeometry(target), Main.uiGroup, {pivot: this.#pivot(session)});
        session.clone = clone;
        session.unfollow = followIcon({target, clone, scheduler: this.#scheduler});
        session.originalOpacity = target.opacity;
        session.dimmedTarget = true;
        target.opacity = 0;
        this.#runBurst(session, clone);
    }

    #playPeek(session) {
        const {context, controller, target} = session;
        const place = iconRect => projectIconRect(
            context.visibility.shownRect, context.visibility.measure(), iconRect,
            controller.edge);
        const rect = place(actorGeometry(target));
        const {outward} = getOrientation(controller.edge);
        const clone = createIconClone(target, rect, Main.uiGroup, {
            pivot: this.#pivot(session),
            translation: {x: -outward[0] * rect.width, y: -outward[1] * rect.height},
            opacity: 0,
        });
        session.clone = clone;
        session.unfollow = followIcon({
            target, clone, place, scheduler: this.#scheduler,
        });
        session.peeking = true;
        clone.ease({
            translation_x: 0,
            translation_y: 0,
            opacity: OPAQUE,
            duration: ATTENTION_SLIDE_DURATION,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            onComplete: () => this.#runBurst(session, clone),
        });
    }

    #runBurst(session, clone) {
        session.reminder += 1;
        session.cyclesLeft = session.controller.recipe.attention.cycles;
        this.#runCycle(session, clone);
    }

    #runCycle(session, clone) {
        runSegments(clone, this.#segments(session), {
            isCancelled: () => session.finished || session.clone !== clone,
            onComplete: () => this.#afterCycle(session, clone),
        });
    }

    #afterCycle(session, clone) {
        if (session.finished || session.clone !== clone)
            return;
        session.cyclesLeft -= 1;
        if (session.cyclesLeft <= 0) {
            this.#endCycle(session);
            return;
        }
        this.#clearTimer(session);
        const pause = session.controller.recipe.attention.cyclePause;
        session.timerId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, pause, () => {
                session.timerId = 0;
                if (!session.finished && session.clone === clone)
                    this.#runCycle(session, clone);
                return GLib.SOURCE_REMOVE;
            });
    }

    // The exit mirrors the entry.
    #retractPeek(session, clone, abrupt) {
        const {outward} = getOrientation(session.controller.edge);
        const [width, height] = clone.get_transformed_size();
        clone.ease({
            translation_x: clone.translation_x - outward[0] * width,
            translation_y: clone.translation_y - outward[1] * height,
            opacity: 0,
            duration: abrupt ? INTERRUPT_DURATION : ATTENTION_SLIDE_DURATION,
            mode: Clutter.AnimationMode.EASE_IN_CUBIC,
            onComplete: () => {
                if (session.retreating === clone)
                    session.retreating = null;
                clone.destroy();
            },
        });
    }

    #endCycle(session, {abrupt = false} = {}) {
        const clone = session.clone;
        if (!clone)
            return;
        session.clone = null;
        this.#unfollow(session);
        clone.remove_all_transitions();
        if (session.peeking) {
            session.retreating = clone;
            this.#retractPeek(session, clone, abrupt);
        } else {
            clone.destroy();
            if (session.dimmedTarget) {
                session.target.opacity = session.originalOpacity;
                session.dimmedTarget = false;
            }
        }
        session.peeking = false;
        this.#releaseOverlay(session);
        if (!session.finished)
            this.#armTimer(session);
    }

    #unfollow(session) {
        session.unfollow?.();
        session.unfollow = null;
    }

    #rearm(controller) {
        const id = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this.#rearmIds.delete(id);
            if (controller.icon && controller.urgent)
                this.onUrgentChanged(controller, true);
            return GLib.SOURCE_REMOVE;
        });
        this.#rearmIds.add(id);
    }

    #releaseOverlay(session) {
        if (!session.overlaid)
            return;
        session.overlaid = false;
        session.controller.endOverlay();
    }

    #finish(session, {targetDestroyed = false} = {}) {
        if (session.finished)
            return;
        session.finished = true;
        this.#clearTimer(session);
        this.#unfollow(session);
        session.unsubscribe?.();
        session.icon.disconnectObject(session);
        if (session.clone) {
            session.clone.remove_all_transitions();
            session.clone.destroy();
            session.clone = null;
        }
        if (session.retreating) {
            session.retreating.remove_all_transitions();
            session.retreating.destroy();
            session.retreating = null;
        }
        if (!targetDestroyed) {
            if (session.dimmedTarget) {
                session.target.opacity = session.originalOpacity;
                session.dimmedTarget = false;
            }
            session.target.disconnectObject(session);
        }
        this.#releaseOverlay(session);
        this.#sessions.delete(session.icon);
        const key = session.anchorKey;
        if (![...this.#sessions.values()].some(item => item.anchorKey === key))
            this.#anchors.delete(key);
    }
}
