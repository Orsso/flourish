import {groupGaps, passGaps} from '../flourish@orsso.github.io/lib/motion/settings.js';
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

test('a gap belongs to the app after it, never to the first', () => {
    const stored = {a: 'normal', c: 'small', gone: 'small'};
    assertDeepEqual([...groupGaps(['a', 'b', 'c'], stored)], [['b', null], ['c', 'small']]);
    assertDeepEqual([...groupGaps(['c', 'a', 'b'], stored)], [['a', 'normal'], ['b', null]]);
});

test('the container class follows the stored gap', () => {
    const {container, group, groups} = setup('second', {second: 'small'});
    assertDeepEqual([...container.classes], ['flourish-gap-small']);
    group.setGroups(groups({second: 'normal'}));
    assertDeepEqual([...container.classes], ['flourish-gap-normal']);
    group.setGroups(groups({}));
    assertEqual(container.classes.size, 0);
});

test('the menu offers the group item to favorites after the first only', () => {
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

test('each popup gets one fresh item, even after a rebuilt menu', () => {
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
    const {icon, container, group, open} = setup('second', {second: 'small'});
    open();
    group.dispose();
    assertEqual(container.classes.size, 0);
    assertEqual(icon._menu.items.length, 0);
    assertEqual(icon._menu.handlers.size, 0);
    assertEqual([...icon.handlers.values()].some(handler => handler.owner === group), false);
});

// Groups A B C | D E F, the gap stored on D.
const ROW = ['a', 'b', 'c', 'd', 'e', 'f'];
const GAPS = {d: 'normal'};
// Dash to Dock moves an app with two writes: out, then back in at the drop.
const drag = (row, gaps, id, to) => {
    const out = row.filter(other => other !== id);
    const back = [...out.slice(0, to), id, ...out.slice(to)];
    return passGaps(out, back, passGaps(row, out, gaps));
};

test('pinning inside a group or at its edge grows it', () => {
    assertEqual(passGaps(ROW, ['a', 'b', 'x', 'c', 'd', 'e', 'f'], GAPS), GAPS);
    assertEqual(passGaps(ROW, ['a', 'b', 'c', 'x', 'd', 'e', 'f'], GAPS), GAPS);
});

test('the first app of a group leaves its edge behind', () => {
    assertDeepEqual(drag(ROW, GAPS, 'd', 0), {e: 'normal'});
    assertDeepEqual(passGaps(ROW, ['a', 'b', 'c', 'e', 'f'], GAPS), {e: 'normal'});
    // A group of one disappears into the next.
    assertDeepEqual(passGaps(['a', 'b', 'c', 'd'], ['a', 'b', 'd'], {c: 'small', d: 'normal'}), {d: 'normal'});
    // Nothing after it: the edge goes.
    assertDeepEqual(passGaps(['a', 'b', 'c'], ['a', 'b'], {c: 'small'}), {});
});

test('other apps move without touching the edges', () => {
    assertEqual(passGaps(ROW, ['a', 'b', 'd', 'e', 'f'], GAPS), GAPS);
    assertDeepEqual(drag(ROW, GAPS, 'c', 4), GAPS);
    assertDeepEqual(drag(ROW, GAPS, 'f', 0), GAPS);
});

test('an edge never lands on the first favorite', () => {
    assertDeepEqual(passGaps(['a', 'b', 'c'], ['c'], {b: 'small'}), {});
});
