import {dashSpacing, tooltipPosition} from '../flourish@orsso.github.io/lib/runtime/geometry.js';

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
    assertEqual(spacing.room, 100);
    assertEqual(spacing.actors.length, 3);
    assertEqual(spacing.actors[0], icons[0]);
    assertEqual(spacing.actors[2], showApps);
});

test('native spacing uses the nearest monitor edge in local coordinates', () => {
    const {box} = fixture({x: 1040, width: 800, logicalWidth: 400});
    assertEqual(dashSpacing(box, {x: 1000, width: 1000}).room, 20);
});

test('native spacing has no room when the dash fills or crosses the monitor', () => {
    for (const [x, width] of [[0, 1000], [-10, 1020], [100, 0]]) {
        const {box} = fixture({x, width});
        assertEqual(dashSpacing(box, {x: 0, width: 1000}).room, 0);
    }
});

test('a clipped native row has no spacing budget despite free monitor margins', () => {
    const {box} = fixture();
    box.width = 600;
    assertEqual(dashSpacing(box, {x: 0, width: 1000}).room, 0);
});
