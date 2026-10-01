import St from 'gi://St';

import {actorGeometry, tooltipPosition} from './geometry.js';

export function isNotificationBadge(actor) {
    return actor instanceof St.Bin && actor.child instanceof St.Label &&
        actor.child.has_style_class_name('notification-badge');
}

export class IconDecorations {
    #badges = new Map();
    #bin;
    #edge;
    #getMonitor;
    #iconBox;
    #label;
    #labelOffset;

    constructor({container, icon, bin, edge, getMonitor, labelOffset, onChanged}) {
        this.#bin = bin;
        this.#edge = edge;
        this.#getMonitor = getMonitor;
        this.#labelOffset = labelOffset;
        this.#label = container.label;
        // DashItemContainer destroys its label in its own destroy handler, before ours.
        this.#label.connectObject(
            'notify::visible', onChanged,
            'notify::opacity', () => {
                if (this.#label.opacity === 0)
                    onChanged();
            },
            'destroy', () => {
                this.#label = null;
            }, this);
        this.#iconBox = icon.icon.get_parent();
        this.#iconBox.connectObject('child-added', (_box, child) => {
            this.#trackBadge(child);
            this.update();
        }, this);
        for (const child of this.#iconBox.get_children())
            this.#trackBadge(child);
    }

    update() {
        if (this.#badges.size > 0) {
            const bin = this.#bin;
            const [pivotX, pivotY] = bin.get_pivot_point();
            const x = bin.translation_x + (1 - pivotX) * bin.width * (bin.scale_x - 1);
            const y = bin.translation_y - pivotY * bin.height * (bin.scale_y - 1);
            for (const [badge, original] of this.#badges) {
                badge.translation_x = original.x + x;
                badge.translation_y = original.y + y;
            }
        }
        if (!this.#label.visible || !this.#bin.mapped)
            return;
        const monitor = this.#getMonitor();
        if (!monitor)
            return;
        const offset = this.#label.get_theme_node().get_length(this.#labelOffset);
        // Preferred size includes the theme margins; allocated size does not.
        const [, , width, height] = this.#label.get_preferred_size();
        const position = tooltipPosition(actorGeometry(this.#bin),
            {width, height}, this.#edge, offset, monitor);
        this.#label.set_position(position.x, position.y);
    }

    dispose() {
        this.#label?.disconnectObject(this);
        this.#label?.hide();
        this.#iconBox.disconnectObject(this);
        for (const [badge, original] of this.#badges) {
            badge.disconnectObject(this);
            badge.translation_x = original.x;
            badge.translation_y = original.y;
        }
        this.#badges.clear();
    }

    #trackBadge(actor) {
        // Indicator children also include the base icon, drawing areas and running dots.
        if (!isNotificationBadge(actor))
            return;
        this.#badges.set(actor, {x: actor.translation_x, y: actor.translation_y});
        actor.connectObject('destroy', () => this.#badges.delete(actor), this);
    }
}
