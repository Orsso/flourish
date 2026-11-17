import {BackgroundExpansion, dashSpacing, fitBackgroundGrowth, marginsAlong, ownsPick, pointerOnSurface,
    tooltipPosition, withoutRowMargins} from '../flourish@orsso.github.io/lib/runtime/geometry.js';

test('background allocation grows symmetrically without scaling the other axis', () => {
    for (const horizontal of [true, false]) {
        const box = {x1: 20, y1: 30, x2: 420, y2: 90};
        const actor = {get_parent: () => ({width: 500, height: 120,
            get_transformed_position: () => [100, 100], get_transformed_size: () => [500, 120]})};
        BackgroundExpansion.prototype.vfunc_update_allocation.call(
            {_horizontal: horizontal, _growth: 48,
                _getMonitor: () => ({x: 0, y: 0, width: 1000, height: 800})}, actor, box);
        assertDeepEqual(box, horizontal
            ? {x1: -4, y1: 30, x2: 444, y2: 90}
            : {x1: 20, y1: 6, x2: 420, y2: 114});
    }
});

test('background padding fits monitor margins without feeding back into the wave', () => {
    assertEqual(fitBackgroundGrowth(100, 0, 1260, 10, 1, 0, 1280), 20);
    assertEqual(fitBackgroundGrowth(100, 0, 1280, 0, 1, 0, 1280), 0);
    assertEqual(fitBackgroundGrowth(40, 0, 580, 350, 1, 0, 1280), 40);
    assertEqual(fitBackgroundGrowth(100, 0, 600, 1040, 2, 1000, 1280), 40);
    assertEqual(fitBackgroundGrowth(100, 0, 600, 0, 0, 0, 1280), 0);
});

test('tooltips follow the visual icon on every edge and stay on its monitor', () => {
    const icon = {x: 120, y: 140, width: 80, height: 80};
    const label = {width: 100, height: 30};
    const monitor = {x: 100, y: 100, width: 400, height: 300};
    for (const [edge, position] of Object.entries({
        bottom: {x: 110, y: 102}, top: {x: 110, y: 228},
        left: {x: 208, y: 165}, right: {x: 100, y: 165},
    }))
        assertDeepEqual(tooltipPosition(icon, label, edge, 8, monitor), position);
    assertDeepEqual(tooltipPosition({...icon, x: 490, y: 390}, label, 'top', 8, monitor),
        {x: 400, y: 370});
});

function fixture({x = 100, width = 800, logicalWidth = 800} = {}) {
    const icons = [{}, {}];
    const showApps = {};
    const container = {
        width: logicalWidth,
        get_transformed_position: () => [x, 700],
        get_transformed_size: () => [width, 80],
        get_children: () => [box, showApps],
    };
    const box = {width: 720, get_preferred_width: () => [0, 720],
        get_parent: () => container, get_children: () => icons};
    return {box, icons, showApps};
}

test('native spacing includes Show Apps but excludes the row container', () => {
    const {box, icons, showApps} = fixture();
    const spacing = dashSpacing(box, {x: 0, width: 1000});
    assertEqual(spacing.sideRoom, 100);
    assertEqual(spacing.actors.length, 3);
    assertEqual(spacing.actors[0], icons[0]);
    assertEqual(spacing.actors[2], showApps);
});

test('native spacing uses the nearest monitor edge in local coordinates', () => {
    const {box} = fixture({x: 1040, width: 800, logicalWidth: 400});
    assertEqual(dashSpacing(box, {x: 1000, width: 1000}).sideRoom, 20);
});

test('native spacing has no room when the dash fills or crosses the monitor', () => {
    for (const [x, width] of [[0, 1000], [-10, 1020], [100, 0]]) {
        const {box} = fixture({x, width});
        assertEqual(dashSpacing(box, {x: 0, width: 1000}).sideRoom, 0);
    }
});

test('a clipped native row has no spacing room despite free monitor margins', () => {
    const {box} = fixture();
    box.width = 600;
    assertEqual(dashSpacing(box, {x: 0, width: 1000}).sideRoom, 0);
});

test('a row allocated a fraction of a pixel short of its natural width is not clipped', () => {
    const {box} = fixture();
    box.get_preferred_width = () => [0, 720.458];
    assertEqual(dashSpacing(box, {x: 0, width: 1000}).sideRoom, 100);
});

const node = (name, parent = null) => ({
    name, parent,
    get_parent() {
        return this.parent;
    },
    contains(other) {
        for (let n = other; n; n = n.parent) {
            if (n === this)
                return true;
        }
        return false;
    },
});

test('a gap pick counts when it is an ancestor of the surface inside the gap root', () => {
    const stage = node('stage');
    const overviewGroup = node('overviewGroup', stage);
    const controls = node('controls', overviewGroup); // reactive since Shell 51
    const dash = node('dash', controls);
    const box = node('box', dash);
    const container = node('container', box);
    container.child = {icon: {_iconBin: {}}};
    const icon = node('icon', container);
    const pill = node('pill', box);
    const pillLabel = node('pillLabel', pill);
    const grid = node('grid', controls);
    assertEqual(ownsPick(dash, box, icon, overviewGroup), true);
    assertEqual(ownsPick(dash, box, overviewGroup, overviewGroup), true);
    assertEqual(ownsPick(dash, box, controls, overviewGroup), true);
    assertEqual(ownsPick(dash, box, grid, overviewGroup), false);
    assertEqual(ownsPick(dash, box, stage, overviewGroup), false);
    assertEqual(ownsPick(dash, box, controls, null), false);
    assertEqual(ownsPick(dash, box, null, overviewGroup), false);
    assertEqual(ownsPick(dash, box, box, overviewGroup), true);
    assertEqual(ownsPick(dash, box, pillLabel, overviewGroup), false);
    assertEqual(ownsPick(dash, box, pill, null), false);
});

test('beside the dash background the pointer is off the dash', () => {
    const overviewGroup = node('overviewGroup');
    const dash = node('dash', overviewGroup);
    const box = node('box', dash);
    const background = {get_transformed_position: () => [800, 1300], get_transformed_size: () => [900, 100]};
    const hadGlobal = 'global' in globalThis;
    const saved = globalThis.global;
    // Shell 51 picks the full-width dash beside its background; older Shells pick the overview.
    for (const picked of [overviewGroup, dash]) {
        globalThis.global = {stage: {get_actor_at_pos: () => picked}};
        try {
            assertEqual(pointerOnSurface(dash, box, 1000, 1340, overviewGroup, background), true);
            assertEqual(pointerOnSurface(dash, box, 760, 1340, overviewGroup, background), false);
            assertEqual(pointerOnSurface(dash, box, 1740, 1340, overviewGroup, background), false);
        } finally {
            if (hadGlobal)
                globalThis.global = saved;
            else
                delete globalThis.global;
        }
    }
});

test('row margins add up along the row on either orientation', () => {
    const child = (left, right, top, bottom) => ({
        ensure_style() {}, margin_left: left, margin_right: right, margin_top: top, margin_bottom: bottom});
    const box = {get_children: () => [child(32, 0, 1, 2), child(0, 0, 0, 0), child(8, 8, 16, 0)]};
    assertEqual(marginsAlong(box, true), 48);
    assertEqual(marginsAlong(box, false), 19);
});

test('the dash fits its icons in its max size less the row margins', () => {
    const child = margin => ({ensure_style() {}, margin_left: margin, margin_right: 0, margin_top: margin, margin_bottom: 0});
    const dash = {_maxWidth: 1000, _maxHeight: 600, _box: {get_children: () => [child(32), child(8)]}};
    const seen = [];
    const adjust = function () {
        seen.push([this._maxWidth, this._maxHeight]);
    };
    withoutRowMargins(adjust, true).call(dash);
    withoutRowMargins(adjust, false).call(dash);
    dash._maxWidth = -1;
    withoutRowMargins(adjust, true).call(dash);
    assertDeepEqual(seen, [[960, 600], [1000, 560], [-1, 600]]);
    assertDeepEqual([dash._maxWidth, dash._maxHeight], [-1, 600]);
});
