import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';

import {OVERSHOOT_RESERVE} from '../motion/continuum.js';
import {getOrientation} from '../motion/transforms.js';
import {actorGeometry, expandDockClip} from './geometry.js';

const OverflowVolume = GObject.registerClass(
    class OverflowVolume extends Clutter.Effect {
        _init(edge, reserve, raisedBox) {
            super._init();
            this._edge = edge;
            this._raisedBox = raisedBox;
            this.reserve = reserve;
        }

        // Gaps between raised icons belong to the dock, not to what lies beneath it.
        vfunc_pick(context) {
            const actor = this.get_actor();
            const box = this._raisedBox(actor);
            if (box)
                actor.pick_box(context, box);
            actor.continue_pick(context);
        }

        vfunc_modify_paint_volume(volume) {
            const actor = this.get_actor();
            const [x, y, width, height] = expandDockClip(
                [0, 0, actor.width, actor.height], this._edge, this.reserve);
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
    #appliedReserve = 0;
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
            original.call(this.#actor, ...expandDockClip(clip, this.#edge, this.#reserve()));
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

    get sideRoom() {
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
            // A hidden Show Apps button reports no transformed size.
            if (!actor.visible)
                continue;
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
        return Math.min(this.#appliedReserve, Math.max(0, margin) / scale);
    }

    get actors() {
        return [
            ...this.#row.get_children(),
            ...this.#siblings(),
        ];
    }

    // Bounds of the magnified icons, in the coordinates of the given actor.
    #raisedBox(actor) {
        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        for (const item of this.actors) {
            const bin = item.icon?._iconBin ?? item.child?.icon?._iconBin;
            if (!bin?.reactive || bin.scale_x === 1 && bin.scale_y === 1)
                continue;
            const extents = bin.get_transformed_extents();
            for (const [stageX, stageY] of [
                [extents.get_x(), extents.get_y()],
                [extents.get_x() + extents.get_width(), extents.get_y() + extents.get_height()],
            ]) {
                const [, x, y] = actor.transform_stage_point(stageX, stageY);
                x1 = Math.min(x1, x);
                y1 = Math.min(y1, y);
                x2 = Math.max(x2, x);
                y2 = Math.max(y2, y);
            }
        }
        return x1 < x2 && y1 < y2 ? new Clutter.ActorBox({x1, y1, x2, y2}) : null;
    }

    #siblings() {
        return [
            ...this.#viewport.get_children().filter(actor => actor !== this.#row),
            ...this.#scroll.get_parent().get_children().filter(actor => actor !== this.#scroll),
        ];
    }

    #reserve() {
        const {horizontal} = getOrientation(this.#edge);
        const size = horizontal ? this.#row.width : this.#row.height;
        const available = horizontal ? this.#viewport.width : this.#viewport.height;
        // The row animates through fractional widths; the viewport width is whole.
        if (!this.#hover?.enabled || this.#slider.slide_x !== 1 || size <= 0 || Math.round(size) > available)
            return 0;
        const normalSize = horizontal ? this.#row.height : this.#row.width;
        const {scale, lift, reach} = this.#hover;
        // Room for the widest wave plus the back overshoot.
        return Math.ceil((normalSize * (scale - 1) * reach + lift) * (1 + OVERSHOOT_RESERVE));
    }

    #sync() {
        const reserve = this.#reserve();
        this.#onChanged();
        if (reserve === this.#appliedReserve)
            return;
        this.#appliedReserve = reserve;
        if (reserve && !this.#adjustments) {
            this.#adjustments = [this.#viewport.hadjustment, this.#viewport.vadjustment];
            // ScrollViewFade can retain an offscreen crop after its scroll range shrinks.
            const base = this.#style ? `${this.#style}; ` : '';
            this.#scroll.set_style(`${base}-st-hfade-offset: 0px; -st-vfade-offset: 0px;`);
            // StViewport clips picking whenever scroll adjustments are attached.
            this.#viewport.hadjustment = null;
            this.#viewport.vadjustment = null;
            this.#effect = new OverflowVolume(this.#edge, reserve, actor => this.#raisedBox(actor));
            this.#scroll.add_effect(this.#effect);
        } else if (!reserve && this.#adjustments) {
            this.#scroll.remove_effect(this.#effect);
            this.#effect = null;
            [this.#viewport.hadjustment, this.#viewport.vadjustment] = this.#adjustments;
            this.#adjustments = null;
            this.#scroll.set_style(this.#style);
        } else
            this.#effect.reserve = reserve;
        this.#viewport.invalidate_transform();
        // StScrollable setters leave cached ancestor paint volumes intact.
        for (let actor = this.#viewport; actor; actor = actor.get_parent())
            actor.invalidate_paint_volume();
        if (this.#clip)
            this.#actor.set_clip(...this.#clip);
        this.#actor.queue_redraw();
    }
}
