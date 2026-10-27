import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

import {OutlineStyle} from '../motion/catalog.js';
import {outlinePaint, paintOutline} from '../motion/outline.js';

// Drawn over the background so it follows the shape without restyling foreign actors.
export class SurfaceOutline {
    #areas = new Map();
    #interfaceSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
    #paint = null;
    #style = OutlineStyle.NONE;
    #intensity;
    #light;

    constructor() {
        this.#interfaceSettings.connectObject('changed::color-scheme', () => this.#sync(), this);
    }

    // Any settings change reaches here; only a new outline repaints.
    setStyle(style, intensity, light) {
        if (style === this.#style && intensity === this.#intensity && light === this.#light)
            return;
        this.#style = style;
        this.#intensity = intensity;
        this.#light = light;
        this.#sync();
    }

    track(background, getRadius) {
        const area = new St.DrawingArea({visible: this.#paint !== null});
        area.add_constraint(new Clutter.BindConstraint({
            source: background,
            coordinate: Clutter.BindCoordinate.SIZE,
        }));
        // A hidden outline still repaints when its background restyles or resizes.
        area.connectObject('repaint', () => {
            if (!this.#paint)
                return;
            const cr = area.get_context();
            paintOutline(cr, ...area.get_surface_size(), getRadius(), this.#paint);
            cr.$dispose();
        }, this);
        background.add_child(area);
        background.connectObject('style-changed', () => area.queue_repaint(),
            'destroy', () => this.#areas.delete(background), this);
        this.#areas.set(background, area);
    }

    // Blur changes can come before track() or after the background is gone.
    refresh(background) {
        this.#areas.get(background)?.queue_repaint();
    }

    dispose() {
        for (const [background, area] of this.#areas) {
            background.disconnectObject(this);
            area.destroy();
        }
        this.#areas.clear();
    }

    destroy() {
        this.dispose();
        this.#interfaceSettings.disconnectObject(this);
        this.#interfaceSettings = null;
    }

    #sync() {
        this.#paint = outlinePaint(this.#style, this.#intensity, this.#light,
            this.#interfaceSettings.get_string('color-scheme') === 'prefer-dark');
        for (const area of this.#areas.values()) {
            area.visible = this.#paint !== null;
            if (this.#paint)
                area.queue_repaint();
        }
    }
}
