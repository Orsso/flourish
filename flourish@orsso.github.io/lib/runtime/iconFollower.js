import {actorGeometry} from './geometry.js';

export function anchoredPlacement(isAttached, pivot) {
    let attachedRect = null;
    return rect => {
        if (isAttached() || attachedRect === null)
            attachedRect = rect;
        return {
            ...rect,
            x: attachedRect.x + (attachedRect.width - rect.width) * pivot[0],
            y: attachedRect.y + (attachedRect.height - rect.height) * pivot[1],
        };
    };
}

// Surface transforms can move an icon without changing its allocation.
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
        node.connectObject(
            'notify::allocation', schedule,
            'notify::translation-x', schedule,
            'notify::translation-y', schedule,
            'notify::scale-x', schedule,
            'notify::scale-y', schedule,
            owner);
        watched.push(node);
        node = node.get_parent();
    }
    // A reopened overview maps the icon again without moving anything.
    target.connectObject('notify::mapped', schedule, 'destroy', dispose, owner);
    return dispose;
}
