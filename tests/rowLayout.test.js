import St from 'gi://St';

import {GroupGap, ScreenEdge} from '../flourish@orsso.github.io/lib/motion/catalog.js';
import {Surface, containerStyle, css, dockLayout} from '../flourish@orsso.github.io/lib/motion/dockLayout.js';
import {RowLayout} from '../flourish@orsso.github.io/lib/runtime/rowLayout.js';
import {FakeStyled} from './fakes.js';

const OURS = {gap: 0.093, across: 0.186, ends: 0.186};

class FakeScheduler {
    constructor() {
        this.pending = new Map();
        this.nextId = 1;
    }

    schedule(callback) {
        const id = this.nextId++;
        this.pending.set(id, callback);
        return id;
    }

    cancel(id) {
        this.pending.delete(id);
    }

    flush() {
        const callbacks = [...this.pending.values()];
        this.pending.clear();
        for (const callback of callbacks)
            callback();
    }
}

function appContainer(id) {
    const container = new FakeStyled({classes: ['dash-item-container']});
    container.child = new FakeStyled();
    container.child.icon = {_iconBin: {}};
    container.child.app = {get_id: () => id};
    return container;
}

function setup() {
    const [a, b, c] = ['a', 'b', 'c'].map(appContainer);
    const separator = new FakeStyled({classes: ['dash-separator']});
    // Another extension's widget, and a drag placeholder.
    const foreign = new FakeStyled();
    foreign.child = new FakeStyled();
    const placeholder = new FakeStyled({classes: ['dash-item-container']});
    const box = new FakeStyled();
    box.children = [a, b, separator, c, foreign, placeholder];
    const showApps = new FakeStyled({classes: ['dash-item-container']});
    showApps.toggleButton = new FakeStyled();
    showApps.icon = new FakeStyled({padding: {[St.Side.TOP]: 0, [St.Side.BOTTOM]: 4}});
    const scrollView = new FakeStyled({margin: {[St.Side.RIGHT]: 2}});
    const dashContainer = new FakeStyled();
    const background = new FakeStyled({margin: {[St.Side.BOTTOM]: 4}});
    const dash = {_box: box, _showAppsIcon: showApps, _background: background, _dashContainer: dashContainer, _scrollView: scrollView};
    const scheduler = new FakeScheduler();
    const state = {changes: 0, destroyed: 0};
    const layout = new RowLayout({
        dash, edge: ScreenEdge.BOTTOM, surface: Surface.DOCK, scheduler,
        getScale: () => 1,
        onChanged: () => state.changes++,
        onDestroyed: () => state.destroyed++,
    });
    const actors = [a, a.child, b, b.child, c, c.child, separator, foreign, foreign.child, placeholder,
        showApps, showApps.toggleButton, scrollView, dashContainer, background];
    const writes = () => actors.reduce((sum, actor) => sum + actor.writes, 0);
    return {a, b, c, separator, foreign, placeholder, box, showApps, scrollView, dashContainer, background, scheduler,
        layout, state, actors, writes};
}

const expected = spacing => dockLayout({
    size: 48, spacing, edge: ScreenEdge.BOTTOM, surface: Surface.DOCK,
    halo: {top: 0, bottom: 4}, backgroundMargins: {inner: 0, outer: 4},
});

test('the row layout styles app tiles, Show Apps, the separator and the ends', () => {
    const row = setup();
    row.layout.update(OURS, 48);
    row.scheduler.flush();
    const layout = expected(OURS);
    for (const app of [row.a, row.b, row.c]) {
        assertEqual(app.style, css(containerStyle(ScreenEdge.BOTTOM, undefined, true)));
        assertEqual(app.child.style, css(layout.tile));
    }
    assertEqual(row.separator.style, css(layout.separator));
    assertEqual(row.showApps.style, css(layout.container));
    assertEqual(row.showApps.toggleButton.style, css(layout.tile));
    assertEqual(row.dashContainer.style, css(layout.ends));
    for (const untouched of [row.foreign, row.foreign.child, row.placeholder, row.background])
        assertEqual(untouched.writes, 0);
    assertEqual(row.state.changes, 1);
});

test('a second pass writes nothing', () => {
    const row = setup();
    row.layout.update(OURS, 48);
    row.scheduler.flush();
    const writes = row.writes();
    row.layout.update(OURS, 48);
    row.scheduler.flush();
    assertEqual(row.writes(), writes);
    assertEqual(row.state.changes, 1);
});

test('Icon Spacing off leaves only the group gaps', () => {
    const row = setup();
    row.layout.update(OURS, 48);
    row.scheduler.flush();
    row.layout.setGroups({gaps: new Map([['b', GroupGap.NORMAL]])});
    row.layout.update(null, 48);
    row.scheduler.flush();
    assertEqual(row.b.style, 'margin-left: 32px;');
    for (const actor of [row.a, row.a.child, row.b.child, row.separator, row.showApps, row.showApps.toggleButton, row.dashContainer])
        assertEqual(actor.style, null);
});

// DockOverflow owns the scroll view's inline style; stylesheet.css takes the theme margin before Show Apps.
test('the scroll view is left to the overflow', () => {
    const row = setup();
    row.layout.update(OURS, 48);
    row.scheduler.flush();
    row.layout.dispose();
    assertEqual(row.scrollView.writes, 0);
});

test('a new icon is styled before the next frame', () => {
    const row = setup();
    row.layout.update(OURS, 48);
    row.scheduler.flush();
    const d = appContainer('d');
    row.box.children.push(d);
    row.box.emit('child-added', d);
    assertEqual(d.child.style, css(expected(OURS).tile));
});

test('a dock background restyle schedules a pass', () => {
    const row = setup();
    row.layout.update(OURS, 48);
    row.scheduler.flush();
    row.background.emit('style-changed');
    assertEqual(row.scheduler.pending.size, 1);
});

test('dispose clears every inline style', () => {
    const row = setup();
    row.layout.setGroups({gaps: new Map([['b', GroupGap.SMALL]])});
    row.layout.update(OURS, 48);
    row.scheduler.flush();
    row.layout.dispose();
    for (const actor of row.actors)
        assertEqual(actor.style, null);
    assertEqual(row.state.changes, 2);
    assertEqual(row.scheduler.pending.size, 0);
});

test('a destroyed row cancels its pending pass', () => {
    const row = setup();
    row.layout.update(OURS, 48);
    row.box.destroy();
    assertEqual(row.scheduler.pending.size, 0);
    assertEqual(row.state.destroyed, 1);
    row.layout.dispose();
    assertEqual(row.writes(), 0);
});
