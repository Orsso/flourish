import {expandDockClip} from '../flourish@orsso.github.io/lib/runtime/geometry.js';
import {DockOverflow} from '../flourish@orsso.github.io/lib/runtime/dockOverflow.js';
import {FakeEmitter} from './fakes.js';
import {getBuiltInRecipe} from '../flourish@orsso.github.io/lib/motion/catalog.js';

test('overflow opens toward the desktop and along the row, never past its back edge', () => {
    const clip = [10, 20, 200, 80];
    assertDeepEqual(expandDockClip(clip, 'bottom', 32), [-22, -12, 264, 112]);
    assertDeepEqual(expandDockClip(clip, 'top', 32), [-22, 20, 264, 112]);
    assertDeepEqual(expandDockClip(clip, 'left', 32), [10, -12, 232, 144]);
    assertDeepEqual(expandDockClip(clip, 'right', 32), [-22, -12, 232, 144]);
    assertDeepEqual(clip, [10, 20, 200, 80]);
});

test('a moving or scrolling dock keeps its exact clip with zero overflow room', () => {
    assertDeepEqual(expandDockClip([-10, 7, 310, 63], 'bottom', 0), [-10, 7, 310, 63]);
});

function makeOverflow() {
    const actors = Array.from({length: 6}, () => Object.assign(new FakeEmitter(), {
        width: 200, height: 80, has_clip: false, clip: [0, 0, 200, 80],
        get_transformed_position() { return [400, 700]; },
        get_transformed_size() { return [this.width, this.height]; },
        get_children() { return actors.filter(actor => actor.parent === this); },
        style: null, styles: [], effects: [], slide_x: 1,
        get_parent() { return this.parent ?? null; },
        get_clip() { return this.clip; },
        set_clip(...clip) { this.clip = clip; },
        get_style() { return this.style; },
        set_style(style) { this.styles.push(style); this.style = style; },
        add_effect(effect) { this.effects.push(effect); },
        remove_effect(effect) { this.effects = this.effects.filter(item => item !== effect); },
        invalidate_transform() {}, invalidate_paint_volume() {}, queue_redraw() {},
    }));
    const [row, viewport, scroll, dashContainer, dash, slid] = actors;
    for (let index = 0; index < actors.length - 1; index++)
        actors[index].parent = actors[index + 1];
    slid.parent = Object.assign(new FakeEmitter(), {slide_x: 1, get_parent: () => null, invalidate_paint_volume() {}});
    slid.has_clip = true;
    viewport.hadjustment = {axis: 'h'};
    viewport.vadjustment = {axis: 'v'};
    const original = slid.set_clip;
    let disposed = 0;
    const overflow = new DockOverflow({actor: slid, row, edge: 'bottom',
        getMonitor: () => ({x: 0, y: 0, width: 1000, height: 800}),
        injections: {overrideMethod(actor, name, factory) { actor[name] = factory(actor[name]); },
            clear() { slid.set_clip = original; }},
        onChanged() {}, onDisposed() { disposed++; }});
    overflow.enable();
    overflow.setHover({...getBuiltInRecipe('expressive').hover, scale: 2, lift: 16});
    return {overflow, row, viewport, scroll, dash, slid, dashContainer, disposed: () => disposed};
}

test('overflow restores scroll resources and styles on live disable', () => {
    const {overflow, viewport, scroll, slid, disposed} = makeOverflow();
    assertEqual(viewport.hadjustment, null);
    assertEqual(scroll.style, '-st-hfade-offset: 0px; -st-vfade-offset: 0px;');
    slid.set_clip(0, 0, 300, 80);
    assertEqual(slid.get_clip()[0] < -64, true);
    overflow.dispose();
    assertDeepEqual(slid.get_clip(), [0, 0, 300, 80]);
    assertEqual(scroll.style, null);
    assertEqual(viewport.hadjustment.axis, 'h');
    assertEqual(scroll.effects.length, 0);
    assertEqual(disposed(), 1);
});

test('overflow resizes with icon allocation and restores after scrolling', () => {
    const {overflow, row, viewport, slid} = makeOverflow();
    const initial = -slid.get_clip()[0];
    row.height = 160;
    row.emit('notify::allocation');
    assertEqual(-slid.get_clip()[0] > initial, true);
    assertEqual(overflow.sideRoom <= 400, true);
    row.width = viewport.width + 1;
    row.emit('notify::allocation');
    assertEqual(overflow.sideRoom, 0);
    assertDeepEqual(slid.get_clip(), [0, 0, 200, 80]);
    row.width = viewport.width;
    row.emit('notify::allocation');
    assertEqual(overflow.sideRoom > 0, true);
    overflow.setHover(null);
    assertEqual(overflow.sideRoom, 0);
    overflow.dispose();
});

test('a row animating through fractional widths keeps its overflow room', () => {
    const {overflow, row, viewport} = makeOverflow();
    row.width = viewport.width + 0.42;
    row.emit('notify::allocation');
    assertEqual(overflow.sideRoom > 0, true);
    assertEqual(viewport.hadjustment, null);
    overflow.dispose();
});

test('an extended dock fits its content rather than its full-width background', () => {
    const {overflow, dashContainer} = makeOverflow();
    dashContainer.width = 1000;
    dashContainer.get_transformed_position = () => [0, 700];
    assertEqual(overflow.sideRoom > 64, true);
    overflow.dispose();
});

test('Show Apps fits its visible icon and ignores its current wave translation', () => {
    const {overflow, dashContainer, scroll} = makeOverflow();
    const apps = {child: {}, translation_x: 0, visible: true};
    const parent = {width: 48, height: 64,
        get_transformed_position: () => [952 + apps.translation_x, 700],
        get_transformed_size: () => [48, 64]};
    apps.icon = {_iconBin: {get_parent: () => parent,
        get_allocation_box: () => ({x1: 8, y1: 16, x2: 40, y2: 48})}};
    dashContainer.get_children = () => [scroll, apps];
    assertEqual(overflow.sideRoom, 8);
    apps.translation_x = 6;
    assertEqual(overflow.sideRoom, 8);
    overflow.dispose();
});

test('a hidden Show Apps button does not take part in the margins', () => {
    const {overflow, dashContainer, scroll} = makeOverflow();
    const parent = {width: 0, height: 0,
        get_transformed_position: () => [NaN, NaN], get_transformed_size: () => [NaN, NaN]};
    const apps = {child: {}, translation_x: 0, visible: false,
        icon: {_iconBin: {get_parent: () => parent, get_allocation_box: () => ({x1: 0, y1: 0, x2: 0, y2: 0})}}};
    dashContainer.get_children = () => [scroll, apps];
    assertEqual(Number.isFinite(overflow.sideRoom), true);
    overflow.dispose();
});

test('a dying dash releases ownership without restoring dying scroll resources', () => {
    const {overflow, viewport, scroll, dash, disposed} = makeOverflow();
    dash.emit('destroy');
    assertEqual(viewport.hadjustment, null);
    assertEqual(scroll.styles.length, 1);
    assertEqual(scroll.effects.length, 0);
    assertEqual(overflow.sideRoom, 0);
    assertEqual(disposed(), 1);
});
