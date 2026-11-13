import Cairo from 'cairo';
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import Gtk from 'gi://Gtk';

import {GROUP_GAP_PIXELS, GroupGap, ICON_HALO, SpacingFraction} from '../motion/catalog.js';
import {visibleSpacing} from '../motion/dockLayout.js';
import {outlinePaint, paintOutline, roundedRect} from '../motion/outline.js';

// Real dock lengths, scaled to the samples.
export const REAL_ICON = 48;
export const THEME_GAP = 16;
const PADDING = 10;
// Past this many pixels, a press on a gap drags it instead of clicking.
const DRAG_THRESHOLD = 4;
// Room above the dock for the pill that names the action, in widget pixels.
const PILL_ROOM = 24;
const PILL = {width: 24, height: 16, bottom: -6, tip: -2};
// Glyph strokes around the pill center: add, widen, remove, drop.
const ADD = [[[-4, 0], [4, 0]], [[0, -4], [0, 4]]];
const WIDEN = [[[-5, 0], [5, 0]], [[-2, -3], [-5, 0], [-2, 3]], [[2, -3], [5, 0], [2, 3]]];
const REMOVE = [[[-3.5, -3.5], [3.5, 3.5]], [[-3.5, 3.5], [3.5, -3.5]]];
const DROP = [[[0, -4], [0, 4]], [[-3, 1], [0, 4], [3, 1]]];
// What a click on a gap does next, after no gap.
const CLICK_GLYPHS = {[GroupGap.SMALL]: WIDEN, [GroupGap.NORMAL]: REMOVE};
const FALLBACK_ICON = new Gio.ThemedIcon({name: 'application-x-executable'});

// libadwaita 1.5 (Shell 46) has no system accent; this is its blue.
const DEFAULT_ACCENT = {red: 0.21, green: 0.52, blue: 0.89};

// The fill accent of switches, not the darker text one of the accent style class.
export function accentColor() {
    const manager = Adw.StyleManager.get_default();
    return manager.get_accent_color_rgba ? manager.get_accent_color_rgba() : DEFAULT_ACCENT;
}

// Icon and gap slots along the sample, in widget pixels; no spacing keeps the theme geometry.
export function sampleLayout({count, iconSize, spacing = null, gaps = {}}) {
    const scale = iconSize / REAL_ICON;
    const real = spacing ? visibleSpacing({size: REAL_ICON, spacing}) : {gap: THEME_GAP, across: PADDING, ends: PADDING};
    const gap = real.gap * scale;
    const ends = real.ends * scale;
    const icons = [];
    const slots = [];
    let x = ends;
    for (let position = 0; position < count; position++) {
        if (position > 0) {
            const width = gap + (GROUP_GAP_PIXELS[gaps[position]] ?? 0) * scale;
            slots.push({position, x1: x, x2: x + width});
            x += width;
        }
        icons.push(x);
        x += iconSize;
    }
    return {icons, slots, width: x + ends, height: iconSize + 2 * real.across * scale, scale};
}

export const DockSample = GObject.registerClass(class DockSample extends Gtk.Widget {
    // A fixed widget size: the dock grows and shrinks inside it without moving the page.
    _init({apps, iconSize, width, onSlotClicked, onGapDragged, ...params}) {
        super._init({hexpand: true, ...params});
        this._apps = apps;
        this._iconSize = iconSize;
        this._width = width;
        this._state = null;
        this._pointer = null;
        this._hoveredSlot = null;
        this._pressed = null;
        this._dragging = false;
        this._drop = null;
        const drag = new Gtk.GestureDrag();
        drag.connect('drag-begin', (_gesture, x) => {
            this._pressed = this._slotAt(x);
        });
        drag.connect('drag-update', (gesture, dx) => {
            const [, x] = gesture.get_start_point();
            this._dragging = Math.abs(dx) >= DRAG_THRESHOLD;
            this._drop = this._dragging ? this._dropAt(x + dx) : null;
            this._syncCursor();
            this.queue_draw();
        });
        drag.connect('drag-end', () => {
            const from = this._pressed;
            const drop = this._drop;
            const dragging = this._dragging;
            this._pressed = null;
            this._dragging = false;
            this._drop = null;
            this._syncCursor();
            this.queue_draw();
            if (from && !dragging)
                onSlotClicked(from.position);
            else if (drop)
                onGapDragged(from.position, drop.position);
        });
        this.add_controller(drag);
        const motion = new Gtk.EventControllerMotion();
        motion.connect('motion', (_controller, x) => {
            this._pointer = x;
            this._hover();
        });
        motion.connect('leave', () => {
            this._pointer = null;
            this._hover();
        });
        this.add_controller(motion);
    }

    setApps(apps, iconSize) {
        this._apps = apps;
        this._iconSize = iconSize;
        this.queue_resize();
    }

    update(state) {
        this._state = state;
        this._layout = sampleLayout({
            count: this._apps.length,
            iconSize: this._iconSize,
            spacing: state.spacing,
            gaps: state.gaps,
        });
        this._hover();
        this.queue_draw();
    }

    vfunc_measure(orientation) {
        if (orientation === Gtk.Orientation.HORIZONTAL)
            return [0, this._width, -1, -1];
        // The widest margin across, so the widget never grows.
        const widest = {gap: 0, across: SpacingFraction.MAX, ends: 0};
        const height = sampleLayout({count: 0, iconSize: this._iconSize, spacing: widest}).height + PILL_ROOM;
        return [height, height, -1, -1];
    }

    // A dock wider than the widget is scaled down, centered, under the pill room.
    _fit() {
        const {width, height} = this._layout;
        const factor = Math.min(1, this.get_width() / width);
        return {
            x: (this.get_width() - width * factor) / 2,
            y: this.get_height() - height * factor,
            factor,
        };
    }

    vfunc_snapshot(snapshot) {
        const {icons, width, height, scale} = this._layout;
        const fit = this._fit();
        snapshot.translate(new Graphene.Point().init(fit.x, fit.y));
        snapshot.scale(fit.factor, fit.factor);
        const dark = Adw.StyleManager.get_default().dark;
        const radius = height * 0.32;
        const cr = snapshot.append_cairo(new Graphene.Rect().init(-PILL.width, -PILL_ROOM, width + 2 * PILL.width,
            height + PILL_ROOM));
        roundedRect(cr, 0, 0, width, height, radius);
        // Darker than a card in either scheme, like the Shell's own dock.
        cr.setSourceRGBA(...(dark ? [0.1, 0.1, 0.11, 1] : [0.84, 0.84, 0.86, 1]));
        cr.fill();
        const shade = dark ? 1 : 0;
        const tile = (index, alpha) => {
            const halo = ICON_HALO * scale;
            roundedRect(cr, icons[index] - halo, height / 2 - this._iconSize / 2 - halo,
                this._iconSize + 2 * halo, this._iconSize + 2 * halo, 8 * scale + halo);
            cr.setSourceRGBA(shade, shade, shade, alpha);
            cr.fill();
        };
        const {hoverTile, focusTile, style, intensity, light} = this._state;
        if (focusTile && icons.length > 0)
            tile(0, 0.1);
        if (hoverTile && icons.length > 1)
            tile(1, 0.16);
        const paint = outlinePaint(style, intensity, light, dark);
        if (paint)
            paintOutline(cr, width, height, radius, paint);
        if (this._dragging)
            this._drawMark(cr, this._drop, DROP);
        else if (this._hoveredSlot)
            this._drawMark(cr, this._hoveredSlot, CLICK_GLYPHS[this._state.gaps[this._hoveredSlot.position]] ?? ADD);
        cr.$dispose();

        const theme = Gtk.IconTheme.get_for_display(Gdk.Display.get_default());
        for (const [index, app] of this._apps.entries()) {
            const icon = theme.lookup_by_gicon(app.get_icon() ?? FALLBACK_ICON, this._iconSize, this.get_scale_factor(),
                Gtk.TextDirection.NONE, 0);
            snapshot.save();
            snapshot.translate(new Graphene.Point().init(icons[index], height / 2 - this._iconSize / 2));
            icon.snapshot(snapshot, this._iconSize, this._iconSize);
            snapshot.restore();
        }
    }

    _drawMark(cr, slot, glyph) {
        if (!slot)
            return;
        const {height, scale} = this._layout;
        const {red, green, blue} = accentColor();
        const middle = (slot.x1 + slot.x2) / 2;
        if (this._state.gaps[slot.position]) {
            cr.rectangle(slot.x1, 0, slot.x2 - slot.x1, height);
            cr.setSourceRGBA(red, green, blue, 0.3);
        } else {
            const bar = Math.max(3, 4 * scale);
            roundedRect(cr, middle - bar / 2, 0, bar, height, bar / 2);
            cr.setSourceRGBA(red, green, blue, 1);
        }
        cr.fill();
        roundedRect(cr, middle - PILL.width / 2, PILL.bottom - PILL.height, PILL.width, PILL.height, PILL.height / 2);
        cr.moveTo(middle - 4, PILL.bottom);
        cr.lineTo(middle, PILL.tip);
        cr.lineTo(middle + 4, PILL.bottom);
        cr.closePath();
        cr.setSourceRGBA(red, green, blue, 1);
        cr.fill();
        const center = PILL.bottom - PILL.height / 2;
        for (const [[x, y], ...rest] of glyph) {
            cr.moveTo(middle + x, center + y);
            for (const [nextX, nextY] of rest)
                cr.lineTo(middle + nextX, center + nextY);
        }
        cr.setLineWidth(1.6);
        cr.setLineCap(Cairo.LineCap.ROUND);
        cr.setLineJoin(Cairo.LineJoin.ROUND);
        cr.setSourceRGBA(1, 1, 1, 1);
        cr.stroke();
    }

    // A gap lands only on a slot without one.
    _dropAt(widgetX) {
        const to = this._slotAt(widgetX);
        const {gaps} = this._state;
        return to && gaps[this._pressed?.position] && !gaps[to.position] ? to : null;
    }

    _slotAt(widgetX) {
        const fit = this._fit();
        const x = (widgetX - fit.x) / fit.factor;
        // Half an icon on each side keeps narrow slots easy to hit.
        const reach = this._iconSize / 2;
        return this._layout.slots.find(slot => x >= slot.x1 - reach && x < slot.x2 + reach) ?? null;
    }

    // Found again from the pointer after each update: a click or a drop moves the slots.
    _hover() {
        const slot = this._pointer === null ? null : this._slotAt(this._pointer);
        if (slot === this._hoveredSlot)
            return;
        this._hoveredSlot = slot;
        this._syncCursor();
        this.queue_draw();
    }

    _syncCursor() {
        const slot = this._hoveredSlot;
        this.set_cursor_from_name(this._dragging ? 'grabbing'
            : !slot ? null : this._state.gaps[slot.position] ? 'grab' : 'pointer');
    }
});
