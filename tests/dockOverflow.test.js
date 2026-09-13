import {expandDockClip} from '../flourish@orsso.github.io/lib/runtime/geometry.js';
import {DockOverflow} from '../flourish@orsso.github.io/lib/runtime/dockOverflow.js';
import {FakeEmitter} from './fakes.js';

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
        injections: {overrideMethod(actor, name, factory) { actor[name] = factory(actor[name]); },
            clear() { slid.set_clip = original; }},
        onChanged() {}, onDisposed() { disposed++; }});
    overflow.enable();
    overflow.setActive(true);
    return {overflow, viewport, scroll, dash, slid, dashContainer, disposed: () => disposed};
}

test('overflow restores scroll resources and styles on live disable', () => {
    const {overflow, viewport, scroll, slid, disposed} = makeOverflow();
    assertEqual(viewport.hadjustment, null);
    assertEqual(scroll.style, '-st-hfade-offset: 0px; -st-vfade-offset: 0px;');
    slid.set_clip(0, 0, 300, 80);
    assertDeepEqual(slid.get_clip(), [-64, -64, 428, 144]);
    overflow.dispose();
    assertDeepEqual(slid.get_clip(), [0, 0, 300, 80]);
    assertEqual(scroll.style, null);
    assertEqual(viewport.hadjustment.axis, 'h');
    assertEqual(scroll.effects.length, 0);
    assertEqual(disposed(), 1);
});

test('a dying dash releases ownership without restoring dying scroll resources', () => {
    const {viewport, scroll, dash, disposed} = makeOverflow();
    dash.emit('destroy');
    assertEqual(viewport.hadjustment, null);
    assertEqual(scroll.styles.length, 1);
    assertEqual(scroll.effects.length, 0);
    assertEqual(disposed(), 1);
});
