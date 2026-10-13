import {followMoves, groupGaps} from '../flourish@orsso.github.io/lib/motion/settings.js';
import {IconGroup} from '../flourish@orsso.github.io/lib/runtime/iconGroup.js';
import {FakeContainer, FakeEmitter, FakeIcon} from './fakes.js';

class FakeMenu extends FakeEmitter {
    constructor() {
        super();
        this.items = [];
    }

    addMenuItem(item) {
        this.items.push(item);
        item.connect('destroy', () => this.items.splice(this.items.indexOf(item), 1));
    }

    // Dash to Dock empties its menu before each popup.
    removeAll() {
        for (const item of [...this.items])
            item.destroy();
    }
}

function setup(id, stored = {}) {
    const icon = new FakeIcon();
    icon.app = {get_id: () => id};
    icon._menu = new FakeMenu();
    const container = new FakeContainer(icon);
    const created = [];
    const groups = gaps => ({
        gaps: groupGaps(['first', 'second', 'third'], gaps),
        moveAboveQuit: (menu, item) => {
            menu.moved = item;
        },
        createMenuItem: appId => {
            const item = new FakeEmitter();
            item.appId = appId;
            created.push(item);
            return item;
        },
    });
    const group = new IconGroup({container, icon, groups: groups(stored)});
    const open = () => {
        icon.emit('menu-state-changed', true);
        icon._menu.emit('open-state-changed', true);
    };
    return {icon, container, group, groups, created, open};
}

test('a gap belongs to a position, not to an app', () => {
    const stored = {0: 'normal', 2: 'small', 9: 'small'};
    assertDeepEqual([...groupGaps(['a', 'b', 'c'], stored)], [['b', null], ['c', 'small']]);
    assertDeepEqual([...groupGaps(['c', 'a', 'b'], stored)], [['a', null], ['b', 'small']]);
});

test('the container class follows the stored gap', () => {
    const {container, group, groups} = setup('second', {1: 'small'});
    assertDeepEqual([...container.classes], ['flourish-gap-small']);
    group.setGroups(groups({1: 'normal'}));
    assertDeepEqual([...container.classes], ['flourish-gap-normal']);
    group.setGroups(groups({}));
    assertEqual(container.classes.size, 0);
});

test('the menu offers the switch to favorites after the first only', () => {
    const second = setup('second');
    second.open();
    assertDeepEqual(second.icon._menu.items.map(item => item.appId), ['second']);
    assertEqual(second.icon._menu.moved, second.icon._menu.items[0]);
    for (const id of ['first', 'running']) {
        const other = setup(id);
        other.open();
        assertEqual(other.icon._menu.items.length, 0);
    }
});

test('each popup gets one fresh switch, even after a rebuilt menu', () => {
    const {icon, open, created} = setup('second');
    open();
    open();
    assertEqual(icon._menu.items.length, 1);
    icon._menu.removeAll();
    open();
    assertEqual(icon._menu.items.length, 1);
    assertEqual(created.length, 3);
});

test('dispose clears the class, the switch and the signals', () => {
    const {icon, container, group, open} = setup('second', {1: 'small'});
    open();
    group.dispose();
    assertEqual(container.classes.size, 0);
    assertEqual(icon._menu.items.length, 0);
    assertEqual(icon._menu.handlers.size, 0);
    assertEqual([...icon.handlers.values()].some(handler => handler.owner === group), false);
});

test('gaps follow one moved, pinned or unpinned app like dock items', () => {
    const before = ['a', 'b', 'c', 'd', 'e', 'f'];
    const gaps = {2: 'small', 4: 'normal'};
    const follow = after => followMoves(before, after, gaps);
    // Within a group, to its front.
    assertDeepEqual(follow(['a', 'b', 'd', 'c', 'e', 'f']), {2: 'small', 4: 'normal'});
    // Across groups: only the moved app changes group.
    assertDeepEqual(follow(['b', 'c', 'd', 'e', 'a', 'f']), {1: 'small', 3: 'normal'});
    // The first app of a group leaves: the group keeps its start.
    assertDeepEqual(follow(['a', 'b', 'd', 'e', 'f', 'c']), {2: 'small', 3: 'normal'});
    // Dropped at a gap from the left: end of the left group.
    assertDeepEqual(follow(['b', 'a', 'c', 'd', 'e', 'f']), {2: 'small', 4: 'normal'});
    // Unpinned and pinned.
    assertDeepEqual(follow(['a', 'c', 'd', 'e', 'f']), {1: 'small', 3: 'normal'});
    assertDeepEqual(follow([...before, 'g']), gaps);
});

test('other favorite changes keep the gap positions', () => {
    const gaps = {2: 'small'};
    assertEqual(followMoves(['a', 'b', 'c'], ['a', 'b', 'c'], gaps), gaps);
    assertEqual(followMoves(['a', 'b', 'c'], ['c', 'b', 'a'], gaps), gaps);
    assertEqual(followMoves(['a', 'b', 'c'], ['x', 'y'], gaps), gaps);
    assertDeepEqual(followMoves(['a', 'b', 'c'], ['b', 'a', 'c'], {0: 'small'}), {});
});
