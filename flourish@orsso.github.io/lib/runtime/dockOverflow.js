import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';

import {getOrientation, OVERSHOOT_RESERVE} from '../motion/transforms.js';
import {actorGeometry, expandDockClip} from './geometry.js';

const OverflowVolume = GObject.registerClass(
    class OverflowVolume extends Clutter.Effect {
        _init(edge, room) {
            super._init();
            this._edge = edge;
            this.room = room;
        }

        vfunc_modify_paint_volume(volume) {
            const actor = this.get_actor();
            const [x, y, width, height] = expandDockClip(
                [0, 0, actor.width, actor.height], this._edge, this.room);
            volume.set_origin(new Graphene.Point3D({x, y, z: 0}));
            volume.set_width(width);
            volume.set_height(height);
            return true;
        }
    });

export class DockOverflow {
    #actor;
    #adjustments = null;
    #clip = null;
    #dash;
    #edge;
    #effect = null;
    #getMonitor;
    #hover = null;
    #injections;
    #onChanged;
    #onDisposed;
    #ownClip;
    #appliedRoom = 0;
    #row;
    #scroll;
    #style;
    #slider;
    #viewport;

    constructor({actor, row, edge, getMonitor, injections, onChanged, onDisposed}) {
        this.#actor = actor;
        this.#row = row;
        this.#edge = edge;
        this.#getMonitor = getMonitor;
        this.#injections = injections;
        this.#onChanged = onChanged;
        this.#onDisposed = onDisposed;
        this.#slider = actor.get_parent();
        this.#viewport = row.get_parent();
        this.#scroll = this.#viewport.get_parent();
        this.#dash = this.#scroll.get_parent().get_parent();
    }

    enable() {
        this.#style = this.#scroll.get_style();
        this.#ownClip = Object.hasOwn(this.#actor, 'set_clip');
        this.#clip = this.#actor.has_clip ? this.#actor.get_clip() : null;
        this.#injections.overrideMethod(this.#actor, 'set_clip', original => (...clip) => {
            this.#clip = clip;
            original.call(this.#actor, ...expandDockClip(clip, this.#edge, this.#room()));
        });
        this.#slider.connectObject('notify::slide-x', () => this.#sync(), this);
        this.#viewport.connectObject('notify::allocation', () => this.#sync(), this);
        this.#row.connectObject('notify::allocation', () => this.#sync(), this);
        // ScrollView disposes its adjustments before destroying the icon row.
        this.#dash.connectObject('destroy', () => this.dispose(false), this);
    }

    dispose(restore = true) {
        this.#dash.disconnectObject(this);
        this.#row.disconnectObject(this);
        this.#viewport.disconnectObject(this);
        this.#slider.disconnectObject(this);
        if (restore) {
            this.setHover(null);
        } else {
            // A dying ScrollView must not regain a fade effect or scroll adjustments.
            if (this.#effect)
                this.#scroll.remove_effect(this.#effect);
            this.#effect = null;
            this.#adjustments = null;
        }
        this.#injections.clear();
        if (!this.#ownClip)
            delete this.#actor.set_clip;
        if (restore && this.#clip)
            this.#actor.set_clip(...this.#clip);
        this.#onDisposed(this);
    }

    setHover(hover) {
        this.#hover = hover;
        this.#sync();
    }

    get room() {
        const monitor = this.#getMonitor();
        if (!this.#adjustments || !monitor)
            return 0;
        const {horizontal} = getOrientation(this.#edge);
        const {x, y, width, height} = actorGeometry(this.#row);
        const scale = (horizontal ? width : height) / (horizontal ? this.#row.width : this.#row.height);
        if (!(scale > 0))
            return 0;
        let start = horizontal ? x : y;
        let end = start + (horizontal ? width : height);
        // Show Apps can sit outside the scroll viewport, even on an extended dock.
        for (const actor of this.#siblings()) {
            const icon = actor.icon?._iconBin ?? actor.child?.icon?._iconBin;
            const target = icon ?? actor;
            const parent = target.get_parent();
            const [px, py] = parent.get_transformed_position();
            const [pw, ph] = parent.get_transformed_size();
            const parentScale = horizontal ? pw / parent.width : ph / parent.height;
            const box = target.get_allocation_box();
            const translation = icon ? (horizontal ? actor.translation_x : actor.translation_y) * scale : 0;
            const origin = (horizontal ? px : py) - translation;
            start = Math.min(start, origin + (horizontal ? box.x1 : box.y1) * parentScale);
            end = Math.max(end, origin + (horizontal ? box.x2 : box.y2) * parentScale);
        }
        const margin = horizontal
            ? Math.min(start - monitor.x, monitor.x + monitor.width - end)
            : Math.min(start - monitor.y, monitor.y + monitor.height - end);
        return Math.min(this.#appliedRoom, Math.max(0, margin) / scale);
    }

    get actors() {
        return [
            ...this.#row.get_children(),
            ...this.#siblings(),
        ];
    }

    #siblings() {
        return [
            ...this.#viewport.get_children().filter(actor => actor !== this.#row),
            ...this.#scroll.get_parent().get_children().filter(actor => actor !== this.#scroll),
        ];
    }

    #room() {
        const {horizontal} = getOrientation(this.#edge);
        const size = horizontal ? this.#row.width : this.#row.height;
        const available = horizontal ? this.#viewport.width : this.#viewport.height;
        if (!this.#hover?.enabled || this.#slider.slide_x !== 1 || size <= 0 || size > available)
            return 0;
        const normalSize = horizontal ? this.#row.height : this.#row.width;
        const {scale, lift, neighborRadius} = this.#hover;
        // The padded row bounds both outward growth and the widest neighbor wave.
        return Math.ceil((normalSize * (scale - 1) * neighborRadius + lift) * (1 + OVERSHOOT_RESERVE));
    }

    #sync() {
        const room = this.#room();
        this.#onChanged();
        if (room === this.#appliedRoom)
            return;
        this.#appliedRoom = room;
        if (room && !this.#adjustments) {
            this.#adjustments = [this.#viewport.hadjustment, this.#viewport.vadjustment];
            // ScrollViewFade can retain an offscreen crop after its scroll range shrinks.
            const base = this.#style ? `${this.#style}; ` : '';
            this.#scroll.set_style(`${base}-st-hfade-offset: 0px; -st-vfade-offset: 0px;`);
            // StViewport clips picking whenever scroll adjustments are attached.
            this.#viewport.hadjustment = null;
            this.#viewport.vadjustment = null;
            this.#effect = new OverflowVolume(this.#edge, room);
            this.#scroll.add_effect(this.#effect);
        } else if (!room && this.#adjustments) {
            this.#scroll.remove_effect(this.#effect);
            this.#effect = null;
            [this.#viewport.hadjustment, this.#viewport.vadjustment] = this.#adjustments;
            this.#adjustments = null;
            this.#scroll.set_style(this.#style);
        } else
            this.#effect.room = room;
        this.#viewport.invalidate_transform();
        // StScrollable setters leave cached ancestor paint volumes intact.
        for (let actor = this.#viewport; actor; actor = actor.get_parent())
            actor.invalidate_paint_volume();
        if (this.#clip)
            this.#actor.set_clip(...this.#clip);
        this.#actor.queue_redraw();
    }
}
