import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import Gtk from 'gi://Gtk';

import {GroupGap} from '../motion/catalog.js';
import {outlinePaint, paintOutline, roundedRect} from '../motion/outline.js';

// Real dock lengths, scaled to the sample: 48 px icons, 6 px halo, 16 px theme gap.
const REAL_ICON = 48;
const HALO = 6;
const THEME_GAP = 16;
const GROUP_GAPS = {[GroupGap.SMALL]: 16, [GroupGap.NORMAL]: 32};
const PADDING = 10;
const FALLBACK_ICON = new Gio.ThemedIcon({name: 'application-x-executable'});

// Icon and gap slots along the sample, in widget pixels.
export function sampleLayout({count, iconSize, spacing, gaps = {}}) {
    const scale = iconSize / REAL_ICON;
    const gap = (spacing < 0 ? THEME_GAP : spacing) * scale;
    const padding = PADDING * scale;
    const icons = [];
    const slots = [];
    let x = padding;
    for (let position = 0; position < count; position++) {
        if (position > 0) {
            const width = gap + (GROUP_GAPS[gaps[position]] ?? 0) * scale;
            slots.push({position, x1: x, x2: x + width});
            x += width;
        }
        icons.push(x);
        x += iconSize;
    }
    return {icons, slots, width: x + padding, height: iconSize + 2 * padding, scale};
}

export const DockSample = GObject.registerClass(class DockSample extends Gtk.Widget {
    // A fixed widget size: the dock grows and shrinks inside it without moving the page.
    _init({apps, iconSize, width, onSlotClicked, ...params}) {
        super._init({hexpand: true, ...params});
        this._apps = apps;
        this._iconSize = iconSize;
        this._width = width;
        this._state = null;
        this._hoveredSlot = null;
        const click = new Gtk.GestureClick();
        click.connect('released', (_gesture, _count, x) => {
            const slot = this._slotAt(x);
            if (slot)
                onSlotClicked(slot.position);
        });
        this.add_controller(click);
        const motion = new Gtk.EventControllerMotion();
        motion.connect('motion', (_controller, x) => this._hover(this._slotAt(x)));
        motion.connect('leave', () => this._hover(null));
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
        this.queue_draw();
    }

    vfunc_measure(orientation) {
        if (orientation === Gtk.Orientation.HORIZONTAL)
            return [0, this._width, -1, -1];
        const height = sampleLayout({count: 0, iconSize: this._iconSize, spacing: -1}).height;
        return [height, height, -1, -1];
    }

    // A dock wider than the widget is scaled down, centered either way.
    _fit() {
        const {width, height} = this._layout;
        const factor = Math.min(1, this.get_width() / width);
        return {
            x: (this.get_width() - width * factor) / 2,
            y: (this.get_height() - height * factor) / 2,
            factor,
        };
    }

    vfunc_snapshot(snapshot) {
        if (!this._state)
            return;
        const {icons, width, height, scale} = this._layout;
        const fit = this._fit();
        snapshot.translate(new Graphene.Point().init(fit.x, fit.y));
        snapshot.scale(fit.factor, fit.factor);
        const dark = Adw.StyleManager.get_default().dark;
        const radius = height * 0.32;
        const cr = snapshot.append_cairo(new Graphene.Rect().init(0, 0, width, height));
        roundedRect(cr, 0, width, height, radius);
        // Darker than a card in either scheme, like the Shell's own dock.
        cr.setSourceRGBA(...(dark ? [0.1, 0.1, 0.11, 1] : [0.84, 0.84, 0.86, 1]));
        cr.fill();
        const shade = dark ? 1 : 0;
        const tile = (index, alpha) => {
            const halo = HALO * scale;
            cr.save();
            cr.translate(icons[index] - halo, height / 2 - this._iconSize / 2 - halo);
            roundedRect(cr, 0, this._iconSize + 2 * halo, this._iconSize + 2 * halo, 8 * scale + halo);
            cr.restore();
            cr.setSourceRGBA(shade, shade, shade, alpha);
            cr.fill();
        };
        const {hoverTile, focusTile, style, intensity, light} = this._state;
        if (focusTile && icons.length > 0)
            tile(0, 0.1);
        if (hoverTile && icons.length > 1)
            tile(1, 0.16);
        if (this._hoveredSlot) {
            const {x1, x2} = this._hoveredSlot;
            cr.rectangle(x1, height * 0.25, x2 - x1, height * 0.5);
            cr.setSourceRGBA(shade, shade, shade, 0.18);
            cr.fill();
        }
        const paint = outlinePaint(style, intensity, light, dark);
        if (paint)
            paintOutline(cr, width, height, radius, paint);
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

    _slotAt(widgetX) {
        if (!this._layout)
            return null;
        const fit = this._fit();
        const x = (widgetX - fit.x) / fit.factor;
        // Half an icon on each side keeps narrow slots easy to hit.
        const reach = this._iconSize / 2;
        return this._layout.slots.find(slot => x >= slot.x1 - reach && x < slot.x2 + reach) ?? null;
    }

    _hover(slot) {
        if (slot === this._hoveredSlot)
            return;
        this._hoveredSlot = slot;
        this.set_cursor_from_name(slot ? 'pointer' : null);
        this.queue_draw();
    }
});
