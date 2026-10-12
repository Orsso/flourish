import {groupGaps} from '../flourish@orsso.github.io/lib/motion/settings.js';
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
