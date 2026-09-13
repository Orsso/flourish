import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';

import {getOrientation} from '../motion/transforms.js';
import {expandDockClip} from './geometry.js';

const OVERFLOW_ROOM = 64;

const OverflowVolume = GObject.registerClass(
    class OverflowVolume extends Clutter.Effect {
        _init(edge) {
            super._init();
            this._edge = edge;
        }

        vfunc_modify_paint_volume(volume) {
            const actor = this.get_actor();
            const [x, y, width, height] = expandDockClip(
                [0, 0, actor.width, actor.height], this._edge, OVERFLOW_ROOM);
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
    #injections;
    #onChanged;
    #onDisposed;
    #ownClip;
    #requested = 0;
    #row;
    #scroll;
    #style;
    #slider;
    #viewport;

    constructor({actor, row, edge, injections, onChanged, onDisposed}) {
        this.#actor = actor;
        this.#row = row;
        this.#edge = edge;
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
            this.setActive(false);
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

    setActive(active) {
        this.#requested = active ? OVERFLOW_ROOM : 0;
        this.#sync();
    }

    get room() {
        return this.#adjustments ? OVERFLOW_ROOM : 0;
    }

    get actors() {
        return [
            ...this.#row.get_children(),
            ...this.#viewport.get_children().filter(actor => actor !== this.#row),
            ...this.#scroll.get_parent().get_children().filter(actor => actor !== this.#scroll),
        ];
    }

    #room() {
        const {horizontal} = getOrientation(this.#edge);
        const size = horizontal ? this.#row.width : this.#row.height;
        const available = horizontal ? this.#viewport.width : this.#viewport.height;
        return this.#slider.slide_x === 1 && size > 0 && size <= available
            ? this.#requested : 0;
    }

    #sync() {
        const room = this.#room();
        if (room && !this.#adjustments) {
            this.#adjustments = [this.#viewport.hadjustment, this.#viewport.vadjustment];
            // ScrollViewFade can retain an offscreen crop after its scroll range shrinks.
            const base = this.#style ? `${this.#style}; ` : '';
            this.#scroll.set_style(`${base}-st-hfade-offset: 0px; -st-vfade-offset: 0px;`);
            // StViewport clips picking whenever scroll adjustments are attached.
            this.#viewport.hadjustment = null;
            this.#viewport.vadjustment = null;
            this.#effect = new OverflowVolume(this.#edge);
            this.#scroll.add_effect(this.#effect);
        } else if (!room && this.#adjustments) {
            this.#scroll.remove_effect(this.#effect);
            this.#effect = null;
            [this.#viewport.hadjustment, this.#viewport.vadjustment] = this.#adjustments;
            this.#adjustments = null;
            this.#scroll.set_style(this.#style);
        } else {
            return;
        }
        this.#viewport.invalidate_transform();
        // StScrollable setters leave cached ancestor paint volumes intact.
        for (let actor = this.#viewport; actor; actor = actor.get_parent())
            actor.invalidate_paint_volume();
        if (this.#clip)
            this.#actor.set_clip(...this.#clip);
        this.#actor.queue_redraw();
        this.#onChanged();
    }
}
