import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';

import {ScreenEdge} from '../motion/catalog.js';
import {getOrientation} from '../motion/transforms.js';

export const BackgroundExpansion = GObject.registerClass(
    class BackgroundExpansion extends Clutter.Constraint {
        _init(actor, edge, getMonitor) {
            super._init({name: 'flourish-background'});
            this._horizontal = getOrientation(edge).horizontal;
            this._growth = 0;
            this._getMonitor = getMonitor;
            actor.add_constraint(this);
        }

        setGrowth(growth) {
            if (this._growth === growth)
                return;
            this._growth = growth;
            const actor = this.get_actor();
            if (actor)
                actor.queue_relayout();
        }

        vfunc_update_allocation(actor, box) {
            if (this._growth === 0)
                return;
            const monitor = this._getMonitor();
            if (!monitor)
                return;
            const parent = actor.get_parent();
            const position = parent.get_transformed_position();
            const size = parent.get_transformed_size();
            const axis = this._horizontal ? 0 : 1;
            const scale = size[axis] / (this._horizontal ? parent.width : parent.height);
            const start = this._horizontal ? box.x1 : box.y1;
            const end = this._horizontal ? box.x2 : box.y2;
            const half = fitBackgroundGrowth(this._growth, start, end, position[axis], scale,
                this._horizontal ? monitor.x : monitor.y,
                this._horizontal ? monitor.width : monitor.height) / 2;
            if (this._horizontal) {
                box.x1 -= half;
                box.x2 += half;
            } else {
                box.y1 -= half;
                box.y2 += half;
            }
        }

        // Dash to Dock can destroy the background before its dock.
        detach() {
            this.get_actor()?.remove_constraint(this);
        }
    });

export function fitBackgroundGrowth(growth, start, end, origin, scale, monitorStart, monitorSize) {
    if (!(scale > 0))
        return 0;
    const leading = start + (origin - monitorStart) / scale;
    const trailing = (monitorStart + monitorSize - origin) / scale - end;
    return Math.min(growth, 2 * Math.max(0, Math.min(leading, trailing)));
}

export function pointerOnSurface(actor, x, y, gapRoot = null) {
    return ownsPick(actor, global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y), gapRoot);
}

// A gap between icons picks a reactive ancestor: overviewGroup, or ControlsManager since Shell 51.
export function ownsPick(actor, picked, gapRoot) {
    if (picked === null)
        return false;
    return actor.contains(picked) ||
        (gapRoot !== null && gapRoot.contains(picked) && picked.contains(actor));
}

export function tooltipPosition(icon, label, edge, offset, monitor) {
    let x = icon.x + (icon.width - label.width) / 2;
    let y = icon.y + (icon.height - label.height) / 2;
    switch (edge) {
        case ScreenEdge.TOP: y = icon.y + icon.height + offset; break;
        case ScreenEdge.LEFT: x = icon.x + icon.width + offset; break;
        case ScreenEdge.RIGHT: x = icon.x - label.width - offset; break;
        default: y = icon.y - label.height - offset;
    }
    return {
        x: Math.max(monitor.x, Math.min(x, monitor.x + monitor.width - label.width)),
        y: Math.max(monitor.y, Math.min(y, monitor.y + monitor.height - label.height)),
    };
}

export function actorGeometry(actor) {
    const [x, y] = actor.get_transformed_position();
    const [width, height] = actor.get_transformed_size();
    return {x, y, width, height};
}

export function dashSpacing(box, monitor) {
    const container = box.get_parent();
    const {x, width} = actorGeometry(container);
    const margin = Math.min(x - monitor.x, monitor.x + monitor.width - x - width);
    const [, naturalWidth] = box.get_preferred_width(-1);
    return {
        sideRoom: width > 0 && naturalWidth <= box.width
            ? Math.max(0, margin) * container.width / width : 0,
        actors: [
            ...box.get_children(),
            ...container.get_children().filter(actor => actor !== box),
        ],
    };
}

export function expandDockClip([x, y, width, height], edge, reserve) {
    switch (edge) {
        case ScreenEdge.TOP:
            return [x - reserve, y, width + 2 * reserve, height + reserve];
        case ScreenEdge.LEFT:
            return [x, y - reserve, width + reserve, height + 2 * reserve];
        case ScreenEdge.RIGHT:
            return [x - reserve, y - reserve, width + reserve, height + 2 * reserve];
        default:
            return [x - reserve, y - reserve, width + 2 * reserve, height + reserve];
    }
}
