import {actorGeometry} from './geometry.js';

// Keeps a clone on its icon while the dock or dash lays out around it. Only
// allocations are watched; the clone mirrors the icon's own motion itself.
export function followIcon({target, clone, scheduler, place = rect => rect}) {
    const owner = {};
    let flushId = 0;
    let watched = [];

    const dispose = () => {
        if (flushId)
            scheduler.cancel(flushId);
        flushId = 0;
        for (const node of watched)
            node.disconnectObject(owner);
        watched = [];
    };

    const sync = () => {
        flushId = 0;
        const rect = place(actorGeometry(target));
        clone.set_position(rect.x, rect.y);
        clone.set_size(rect.width, rect.height);
    };

    const schedule = () => {
        if (!flushId)
            flushId = scheduler.schedule(sync);
    };

    let node = target;
    while (node) {
        node.connectObject('notify::allocation', schedule, owner);
        watched.push(node);
        node = node.get_parent();
    }
    target.connectObject('destroy', dispose, owner);
    return dispose;
}
