import St from 'gi://St';

import {Surface, containerStyle, css, dockLayout, edgeSides} from '../motion/dockLayout.js';

const ST_SIDES = {top: St.Side.TOP, right: St.Side.RIGHT, bottom: St.Side.BOTTOM, left: St.Side.LEFT};

// Inline style of one dash or dock row: its app tiles and their containers, Show Apps, the separator and the row ends.
export class RowLayout {
    #box;
    #dash;
    #edge;
    #getScale;
    #groups = {gaps: new Map()};
    // Null with Icon Spacing off.
    #layout = null;
    #onChanged;
    #onDestroyed;
    #pendingId = 0;
    #scheduler;
    #size = 0;
    #spacing = null;
    #surface;

    constructor({
        dash, edge, surface, scheduler,
        getScale = () => St.ThemeContext.get_for_stage(global.stage).scale_factor,
        onChanged = () => {},
        onDestroyed = () => {},
    }) {
        this.#dash = dash;
        this.#box = dash._box;
        this.#edge = edge;
        this.#surface = surface;
        this.#scheduler = scheduler;
        this.#getScale = getScale;
        this.#onChanged = onChanged;
        this.#onDestroyed = onDestroyed;
        // The previous pass styles a new icon before its first frame.
        this.#box.connectObject('child-added', (_box, child) => {
            this.#writeChild(child);
            this.#schedule();
        }, 'destroy', () => {
            this.#cancel();
            this.#box = null;
            this.#onDestroyed(this);
        }, this);
        // Dash to Dock restyles its background when its mode changes: fixed, shrunk, extended.
        if (surface === Surface.DOCK)
            dash._background.connectObject('style-changed', () => this.#schedule(), this);
    }

    update(spacing, size) {
        this.#spacing = spacing;
        this.#size = size;
        this.#schedule();
    }

    setGroups(groups) {
        this.#groups = groups;
        this.#schedule();
    }

    dispose() {
        this.#cancel();
        // The dock destroyed its row first.
        if (!this.#box)
            return;
        this.#spacing = null;
        this.#groups = {gaps: new Map()};
        this.#apply();
        this.#box.disconnectObject(this);
        this.#dash._background.disconnectObject(this);
        this.#box = null;
    }

    #schedule() {
        if (this.#pendingId)
            return;
        this.#pendingId = this.#scheduler.schedule(() => {
            this.#pendingId = 0;
            this.#apply();
        });
    }

    #cancel() {
        if (!this.#pendingId)
            return;
        this.#scheduler.cancel(this.#pendingId);
        this.#pendingId = 0;
    }

    #apply() {
        this.#layout = this.#spacing ? this.#measure() : null;
        const showApps = this.#dash._showAppsIcon;
        const ends = this.#surface === Surface.DOCK ? this.#dash._dashContainer : this.#dash._background;
        let changed = false;
        for (const child of this.#box.get_children())
            changed = this.#writeChild(child) || changed;
        changed = this.#write(showApps, this.#layout?.container) || changed;
        changed = this.#write(showApps.toggleButton, this.#layout?.showApps) || changed;
        changed = this.#write(ends, this.#layout?.ends) || changed;
        if (changed)
            this.#onChanged();
    }

    // Halo and background margins come from the theme, which other extensions' stylesheets can change.
    #measure() {
        const scale = this.#getScale();
        const sides = edgeSides(this.#edge);
        const length = (actor, getter, side) => actor.get_theme_node()[getter](ST_SIDES[side]) / scale;
        const halo = this.#dash._showAppsIcon.icon;
        halo.ensure_style();
        const input = {
            size: this.#size,
            spacing: this.#spacing,
            edge: this.#edge,
            surface: this.#surface,
            halo: {top: length(halo, 'get_padding', 'top'), bottom: length(halo, 'get_padding', 'bottom')},
        };
        if (this.#surface === Surface.DOCK) {
            const background = this.#dash._background;
            const first = this.#dash._dashContainer.get_first_child() === this.#dash._showAppsIcon;
            input.backgroundMargins = {
                inner: length(background, 'get_margin', sides.inner),
                outer: length(background, 'get_margin', sides.outer),
            };
            // Dash to Dock's theme spaces its scroll view from Show Apps.
            input.showApps = {first, offset: length(this.#dash._scrollView, 'get_margin', first ? sides.before : sides.after)};
        }
        return dockLayout(input);
    }

    #writeChild(child) {
        if (child.has_style_class_name('dash-separator'))
            return this.#write(child, this.#layout?.separator);
        // Drag placeholders have no child, other extensions' widgets no icon.
        const icon = child.child;
        if (!icon?.icon?._iconBin)
            return false;
        const gap = this.#groups.gaps.get(icon.app.get_id());
        const container = this.#write(child, containerStyle(this.#edge, gap, this.#layout !== null));
        return this.#write(icon, this.#layout?.tile) || container;
    }

    #write(actor, style = null) {
        const text = css(style);
        if (actor.get_style() === text)
            return false;
        actor.set_style(text);
        return true;
    }
}
