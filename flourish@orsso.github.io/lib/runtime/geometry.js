import Clutter from 'gi://Clutter';

export function pointerOnSurface(actor, x, y, gapActor = null) {
    const picked = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
    return picked !== null && (actor.contains(picked) || picked === gapActor);
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
        room: width > 0 && naturalWidth <= box.width
            ? Math.max(0, margin) * container.width / width : 0,
        actors: [
            ...box.get_children(),
            ...container.get_children().filter(actor => actor !== box),
        ],
    };
}

export function expandDockClip([x, y, width, height], edge, room) {
    switch (edge) {
        case 'top':
            return [x - room, y, width + 2 * room, height + room];
        case 'left':
            return [x, y - room, width + room, height + 2 * room];
        case 'right':
            return [x - room, y - room, width + room, height + 2 * room];
        default:
            return [x - room, y - room, width + 2 * room, height + room];
    }
}
