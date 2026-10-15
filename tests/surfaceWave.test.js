import {motionRecipe} from './fakes.js';
import {OVERSHOOT_RESERVE} from '../flourish@orsso.github.io/lib/motion/continuum.js';
import {MotionSurface} from '../flourish@orsso.github.io/lib/runtime/motionSurface.js';
import {FakeEmitter, FakeRow, FakeRowContainer, MeasurableBin, makeScheduler, surfaceContext} from './fakes.js';

import {fitHoverLevel} from '../flourish@orsso.github.io/lib/motion/continuum.js';

const DURATION = motionRecipe('expressive').hover.duration;

function makeSurface({
    preset = 'expressive',
    edge = 'bottom',
    position = [0, 0],
    animationsEnabled = () => true,
    room = 120,
    spreadRoom = 0,
    getPointer = () => null,
    containsPointer = () => true,
    pointerActor = null,
    clock = null,
    apps = false,
} = {}) {
    const horizontal = edge === 'bottom' || edge === 'top';
    const scheduler = makeScheduler();
    // Room between the icons and the clip, outward along the edge.
    const parent = horizontal
        ? {parentY: edge === 'bottom' ? 780 + room : 932 - room}
        : {parentX: edge === 'right' ? room - 10 : 942 - room};
    const box = new FakeRow(5, {
        horizontal, position, makeBin: () => new MeasurableBin(parent),
    });
    if (apps) {
        for (const icon of box.icons)
            icon.app = {get_n_windows: () => 1};
    }
    let now = 0;
    const surface = new MotionSurface({
        recipe: motionRecipe(preset),
        scheduler,
        clock: clock ?? (() => now),
        animationsEnabled,
        getPointer,
    });
    const overflow = {sideRoom: spreadRoom, get actors() { return box.get_children(); }};
    surface.addBox(box, edge, surfaceContext(box, {
        getSpacing: () => spreadRoom ? overflow : {sideRoom: Infinity, actors: []}, containsPointer,
        pointerActor: pointerActor ?? box,
    }));
    scheduler.flush();
    const bins = box.icons.map(icon => icon.icon._iconBin);
    const frame = ms => {
        now += ms;
        scheduler.flush();
    };
    // Advance past the hover duration until the envelope settles.
    const settle = () => {
        for (let i = 0; i < 8 && scheduler.pending.size > 0; i++)
            frame(DURATION / 2);
    };
    return {surface, scheduler, box, bins, icons: box.icons, frame, settle, overflow};
}

test('wave peaks at the pointer and falls off with distance', () => {
    const {surface, bins, frame, settle} = makeSurface();
    // Entry without hover: the envelope ramps to full over the duration.
    surface.onPointerMotion(125, 25);
    frame(0);
    assertEqual(bins[2].scale_x, 1);
    settle();
    assertClose(bins[2].scale_x, 1.22);
    assertClose(bins[1].scale_x, 1.11);
    assertClose(bins[3].scale_x, 1.11);
    assertEqual(bins[0].scale_x, 1);
    assertEqual(bins[4].scale_x, 1);
    // The wave lands per frame, not as a recipe-duration ease.
    assertEqual(bins[2].easeTargets.length, 0);
});

test('elevation alone follows the pointer, fits the clip and retreats on every edge', () => {
    for (const edge of ['bottom', 'top', 'left', 'right']) {
        const {surface, bins, frame, settle} = makeSurface({edge, room: 4, spreadRoom: 64});
        const recipe = motionRecipe();
        recipe.hover.scale = 1;
        recipe.hover.lift = 12;
        recipe.hover.easing = 'ease-out-cubic';
        surface.setRecipe(recipe);
        const horizontal = edge === 'bottom' || edge === 'top';
        surface.onPointerMotion(...(horizontal ? [125, 25] : [25, 125]));
        frame(0);
        settle();
        const key = horizontal ? 'translation_y' : 'translation_x';
        assertClose(Math.abs(bins[2][key]), 4);
        assertClose(Math.abs(bins[1][key]), 2);
        assertEqual(bins[2].scale_x, 1);
        assertEqual(bins[2].reactive, true);
        surface.clearPointer();
        settle();
        assertClose(bins[2][key], 0);
        assertEqual(bins[2].reactive, false);
        surface.dispose();
    }
});

test('enabling hover under a stationary pointer starts the shared envelope', () => {
    const {surface, bins, frame, settle} = makeSurface({getPointer: () => [125, 25]});
    const recipe = motionRecipe();
    recipe.hover.enabled = false;
    surface.setRecipe(recipe);
    frame(0);
    assertEqual(bins[2].scale_x, 1);
    recipe.hover.enabled = true;
    surface.setRecipe(recipe);
    frame(0);
    settle();
    assertClose(bins[2].scale_x, 1.22);
    surface.dispose();
});

test('dock spacing translates native containers, not their allocations', () => {
    const {surface, box, frame, settle} = makeSurface({spreadRoom: 64});
    surface.onPointerMotion(125, 25);
    frame(0);
    settle();
    assertClose(box.children[2].translation_x, 0);
    assertEqual(box.children[1].translation_x < 0, true);
    assertEqual(box.children[3].translation_x > 0, true);
    assertEqual(box.children[1].get_allocation_box().x1, 50);
    surface.dispose();
    for (const actor of box.children)
        assertEqual(actor.translation_x, 0);
});

test('Lively sweeps magnify without moving containers on every edge', () => {
    for (const edge of ['bottom', 'top', 'left', 'right']) {
        const {surface, box, bins, frame, settle} = makeSurface({preset: 'balanced', edge, spreadRoom: 64});
        const horizontal = edge === 'bottom' || edge === 'top';
        for (let point = 25; point <= 225; point += 4) {
            surface.onPointerMotion(...(horizontal ? [point, 25] : [25, point]));
            frame(16);
            settle();
            assertEqual(bins.some(bin => bin.scale_x > 1.05), true);
            for (const actor of box.children) {
                assertEqual(actor.translation_x, 0);
                assertEqual(actor.translation_y, 0);
            }
        }
        surface.dispose();
    }
});

test('spacing can toggle under a stationary wave and restores foreign translations', () => {
    const {surface, box, bins, frame, settle, scheduler} = makeSurface({spreadRoom: 64});
    box.children[1].translation_x = 7;
    surface.onPointerMotion(125, 25);
    frame(0);
    settle();
    assertEqual(box.children[1].translation_x < 7, true);
    const recipe = motionRecipe('expressive');
    recipe.hover.dynamicSpacing = false;
    surface.setRecipe(recipe);
    frame(0);
    settle();
    assertClose(bins[2].scale_x, 1.22);
    assertEqual(box.children[1].translation_x, 7);
    assertEqual(box.children[3].translation_x, 0);
    assertEqual(scheduler.pending.size, 0);
    surface.setRecipe(motionRecipe('expressive'));
    frame(0);
    settle();
    assertEqual(box.children[1].translation_x < 7, true);
    surface.dispose();
    assertEqual(box.children[1].translation_x, 7);
});

test('fixed spacing keeps the zoom fit during entry and retreat', () => {
    for (const dynamicSpacing of [true, false]) {
        const {surface, box, bins, frame, settle, overflow} = makeSurface({spreadRoom: 2});
        const recipe = motionRecipe('expressive');
        recipe.hover.dynamicSpacing = dynamicSpacing;
        recipe.hover.easing = 'ease-out-cubic';
        surface.setRecipe(recipe);
        surface.onPointerMotion(125, 25);
        frame(0);
        settle();
        const fitted = bins[2].scale_x;
        assertEqual(fitted > 1 && fitted < 1.22, true);
        if (!dynamicSpacing)
            for (const actor of box.children)
                assertEqual(actor.translation_x, 0);
        surface.onPointerMotion(125, 1000);
        frame(1);
        assertClose(bins[2].scale_x, fitted);
        overflow.sideRoom = 0;
        frame(10);
        for (const bin of bins)
            assertEqual(bin.scale_x, 1);
        settle();
        surface.dispose();
    }
});

test('RTL uses the same physical wave and spacing as LTR', () => {
    const {surface, box, bins, frame, settle} = makeSurface({spreadRoom: 64});
    box.children.forEach((container, index) => { container.index = 4 - index; });
    surface.onPointerMotion(75, 25);
    frame(0);
    settle();
    assertClose(bins[3].scale_x, 1.22);
    assertClose(bins[2].scale_x, 1.11);
    assertEqual(box.children[4].translation_x < 0, true);
    assertEqual(box.children[2].translation_x > 0, true);
    surface.dispose();
    for (const child of box.children)
        assertEqual(child.translation_x, 0);
});

test('spacing restores on hover exit, mode change and overflow closure', () => {
    const {surface, box, frame, settle, overflow} = makeSurface({spreadRoom: 64});
    for (const stop of [
        () => { surface.onPointerMotion(125, 1000); settle(); },
        () => { overflow.sideRoom = 0; surface.invalidateGeometry(); frame(0); },
        () => { const recipe = motionRecipe('expressive'); recipe.hover.enabled = false; surface.setRecipe(recipe); },
    ]) {
        surface.setRecipe(motionRecipe('expressive'));
        overflow.sideRoom = 64;
        surface.onPointerMotion(125, 25);
        frame(0);
        settle();
        assertEqual(box.children[1].translation_x < 0, true);
        stop();
        for (const actor of box.children)
            assertEqual(actor.translation_x, 0);
    }
    surface.dispose();
});

test('vertical spacing uses the dock axis and preserves foreign translation', () => {
    const {surface, box, frame, settle} = makeSurface({edge: 'left', spreadRoom: 64});
    box.children[1].translation_y = 7;
    surface.onPointerMotion(25, 125);
    frame(0);
    settle();
    assertEqual(box.children[1].translation_y < 7, true);
    assertEqual(box.children[3].translation_y > 0, true);
    assertEqual(box.children[3].translation_x, 0);
    surface.dispose();
    assertEqual(box.children[1].translation_y, 7);
});

test('spacing bounds magnification instead of sacrificing gaps', () => {
    const {surface, box, bins, frame, settle} = makeSurface({spreadRoom: 2});
    surface.onPointerMotion(125, 25);
    frame(0);
    settle();
    assertEqual(Math.abs(box.children[0].translation_x) <= 2.00001, true);
    assertEqual(bins[2].scale_x < 1.22, true);
    const gap = 50 + box.children[2].translation_x - box.children[1].translation_x -
        48 * (bins[1].scale_x + bins[2].scale_x) / 2;
    assertClose(gap, 2);
    surface.dispose();
});

test('a surface with no remaining spacing room reduces its wave to rest', () => {
    const {surface, box, bins, frame, settle, overflow} = makeSurface({spreadRoom: 64});
    surface.onPointerMotion(125, 25);
    frame(0);
    settle();
    assertEqual(box.children[1].translation_x < 0, true);
    overflow.sideRoom = 0;
    surface.invalidateGeometry();
    frame(0);
    settle();
    for (const actor of box.children)
        assertEqual(actor.translation_x, 0);
    for (const bin of bins)
        assertEqual(bin.scale_x, 1);
    surface.dispose();
});

test('disabling animations restores spacing without waiting for pointer motion', () => {
    let animations = true;
    const {surface, box, frame, settle} = makeSurface({spreadRoom: 64, animationsEnabled: () => animations});
    surface.onPointerMotion(125, 25);
    frame(0);
    settle();
    assertEqual(box.children[1].translation_x < 0, true);
    animations = false;
    surface.setRecipe(motionRecipe('expressive'));
    for (const actor of box.children)
        assertEqual(actor.translation_x, 0);
    surface.dispose();
});

test('a settled spread performs no further translation writes', () => {
    const {surface, box, frame, settle, scheduler} = makeSurface({spreadRoom: 64});
    surface.onPointerMotion(125, 25);
    frame(0);
    settle();
    let writes = 0;
    for (const actor of box.children) {
        let value = actor.translation_x;
        Object.defineProperty(actor, 'translation_x', {
            get: () => value,
            set: next => { writes++; value = next; },
        });
    }
    surface.onPointerMotion(125, 25);
    frame(0);
    assertEqual(writes, 0);
    assertEqual(scheduler.pending.size, 0);
    surface.dispose();
});

test('two motions in one frame coalesce into one apply', () => {
    const {surface, scheduler, bins, frame, settle} = makeSurface();
    let writes = 0;
    let value = 1;
    Object.defineProperty(bins[2], 'scale_x', {
        get: () => value,
        set: next => {
            writes++;
            value = next;
        },
    });
    surface.onPointerMotion(120, 25);
    surface.onPointerMotion(125, 25);
    assertEqual(scheduler.pending.size, 1);
    frame(0);
    assertEqual(writes, 1);
    settle();
    assertClose(value, 1.22);
});

test('the hovered icon follows the wave and its lift tracks the falloff', () => {
    const {surface, bins, icons, frame, settle} = makeSurface();
    icons[2].setHover(true);
    frame(0);
    // 10px right of center: inside the peak, below it.
    surface.onPointerMotion(135, 25);
    frame(0);
    settle();
    assertEqual(bins[2].scale_x < 1.22, true);
    assertEqual(bins[2].scale_x > 1.11, true);
    // The lift is the wave's, not a binary hover step.
    const falloff = (bins[2].scale_x - 1) / (1.22 - 1);
    assertClose(bins[2].translation_y, -5 * falloff);
    assertEqual(bins[1].translation_y < 0, true);
});

test('entry over an icon ramps from rest', () => {
    const {surface, bins, icons, frame, settle} = makeSurface();
    // The enter and motion events land in the same frame; the icon is at
    // rest when the wave first flushes.
    icons[2].setHover(true);
    surface.onPointerMotion(125, 25);
    frame(0);
    assertClose(bins[2].scale_x, 1);
    frame(40);
    assertEqual(bins[2].scale_x > 1, true);
    assertEqual(bins[2].scale_x < 1.22, true);
    settle();
    assertClose(bins[2].scale_x, 1.22);
});

test('the entry ramp completes with a stationary pointer', () => {
    const {surface, scheduler, bins, frame, settle} = makeSurface();
    // Between icons 1 and 2, no hover: the ramp runs 0 to 1 on its own.
    surface.onPointerMotion(100, 25);
    frame(0);
    assertEqual(bins[2].scale_x, 1);
    assertEqual(scheduler.pending.size, 1);
    settle();
    assertEqual(scheduler.pending.size, 0);
    assertClose(bins[2].scale_x, 1 + 0.22 * 0.5 * (1 + Math.cos(Math.PI * 0.25)));
});

test('exit decays the last wave shape and releases ownership', () => {
    const {surface, scheduler, bins, frame, settle} = makeSurface();
    surface.onPointerMotion(125, 25);
    frame(0);
    settle();
    assertClose(bins[2].scale_x, 1.22);
    // Far outside: the amplitude decays over the duration, then releases.
    surface.onPointerMotion(125, 1000);
    frame(0);
    frame(1);
    assertEqual(bins[2].scale_x < 1.22, true);
    assertEqual(bins[2].scale_x > 1, true);
    assertEqual(scheduler.pending.size, 1);
    // The back-eased dip below zero is clamped: no icon shrinks.
    frame(DURATION * 0.45);
    for (const bin of bins)
        assertEqual(bin.scale_x >= 1, true);
    settle();
    for (const bin of bins)
        assertEqual(bin.scale_x, 1);
    assertEqual(scheduler.pending.size, 0);
    // A repeat of the same exit is a no-op: nothing is scheduled or written.
    surface.onPointerMotion(125, 1000);
    frame(0);
    assertEqual(scheduler.pending.size, 0);
});

test('an open menu or a drag lowers the wave, then the pointer raises it again', () => {
    const {surface, icons, bins, frame, settle, scheduler} = makeSurface({
        apps: true, getPointer: () => [125, 25],
    });
    surface.onPointerMotion(125, 25);
    frame(0);
    settle();
    assertClose(bins[2].scale_x, 1.22);
    for (const hold of [
        held => icons[2].emit('menu-state-changed', held),
        held => surface.holdPointer('drag', held),
    ]) {
        hold(true);
        frame(0);
        frame(1);
        assertEqual(bins[2].scale_x > 1 && bins[2].scale_x < 1.22, true);
        settle();
        for (const bin of bins)
            assertEqual(bin.scale_x, 1);
        assertEqual(scheduler.pending.size, 0);
        hold(false);
        frame(0);
        settle();
        assertClose(bins[2].scale_x, 1.22);
    }
});

test('an icon added during the exit decay does not cut the decay short', () => {
    const {surface, box, bins, frame, settle} = makeSurface();
    surface.onPointerMotion(125, 25);
    frame(0);
    settle();
    surface.onPointerMotion(125, 1000);
    frame(0);
    frame(DURATION * 0.15);
    box.add_child(new FakeRowContainer(5, true, new MeasurableBin({parentY: 900})));
    frame(1);
    assertEqual(bins[2].scale_x > 1, true);
    settle();
    assertEqual(bins[2].scale_x, 1);
});

test('re-entering during the exit decay resumes from the decayed amplitude', () => {
    const {surface, bins, frame, settle} = makeSurface();
    surface.onPointerMotion(125, 25);
    frame(0);
    settle();
    surface.onPointerMotion(125, 1000);
    frame(0);
    // A back-eased decay crosses zero fast; catch it early instead.
    frame(DURATION * 0.15);
    const decayed = bins[2].scale_x;
    assertEqual(decayed > 1 && decayed < 1.22, true);
    surface.onPointerMotion(125, 25);
    frame(0);
    // No jump to 0 nor to full: the ramp resumes from the decayed value.
    assertEqual(bins[2].scale_x >= decayed, true);
    assertEqual(bins[2].scale_x < 1.22, true);
    settle();
    assertClose(bins[2].scale_x, 1.22);
});

test('a stationary pointer settles and schedules no work', () => {
    const {surface, scheduler, bins, frame, settle} = makeSurface();
    surface.onPointerMotion(125, 25);
    frame(0);
    settle();
    assertClose(bins[2].scale_x, 1.22);
    assertEqual(scheduler.pending.size, 0);
});

test('beginLaunch keeps the wave level of a neighbor icon', () => {
    const {surface, bins, icons, frame, settle} = makeSurface();
    surface.onPointerMotion(75, 25);
    frame(0);
    settle();
    // Icon 2 is one pitch from the pointer.
    const result = surface.getController(icons[2]).beginLaunch(true);
    assertEqual(result.active, true);
    assertClose(bins[2].scale_x, 1.11);
    assertClose(bins[1].scale_x, 1.22);
});

test('a launching icon continues to follow the shared wave and its exit', () => {
    const {surface, bins, icons, frame, settle} = makeSurface();
    surface.onPointerMotion(125, 25);
    frame(0);
    settle();
    const controller = surface.getController(icons[2]);
    controller.beginLaunch(true);
    assertClose(bins[2].scale_x, 1.22);
    surface.onPointerMotion(75, 25);
    frame(0);
    assertClose(bins[2].scale_x, 1.11);
    surface.onPointerMotion(75, 1000);
    settle();
    assertClose(bins[2].scale_x, 1);
    controller.endOverlay();
    frame(0);
    assertClose(bins[2].scale_x, 1);
});

test('surface disappearance clears a stationary wave without new pointer motion', () => {
    const {surface, bins, box, frame, settle} = makeSurface({spreadRoom: 64});
    surface.onPointerMotion(125, 25);
    frame(0);
    settle();
    box.mapped = false;
    box.emit('notify::mapped');
    settle();
    for (const bin of bins)
        assertClose(bin.scale_x, 1);
    for (const actor of box.children)
        assertClose(actor.translation_x, 0);
    box.mapped = true;
    box.emit('notify::mapped');
    frame(0);
    for (const bin of bins)
        assertClose(bin.scale_x, 1);
});

test('leaving the Shell clears a cached wave even before native hover changes', () => {
    const {surface, icons, bins, frame, settle, scheduler} = makeSurface();
    icons[2].setHover(true);
    surface.onPointerMotion(125, 25);
    frame(0);
    settle();
    surface.clearPointer();
    settle();
    for (const bin of bins)
        assertClose(bin.scale_x, 1);
    assertEqual(scheduler.pending.size, 0);
    icons[2].setHover(false);
    icons[2].setHover(true);
    surface.onPointerMotion(125, 25);
    frame(0);
    settle();
    assertClose(bins[2].scale_x, 1.22);
});

test('native hover exit refreshes the pointer when client motion bypasses the stage', () => {
    let pointer = [125, 25];
    const {surface, icons, bins, frame, settle} = makeSurface({getPointer: () => pointer});
    icons[2].setHover(true);
    surface.onPointerMotion(...pointer);
    frame(0);
    settle();
    assertClose(bins[2].scale_x, 1.22);
    pointer = [120, 260];
    icons[2].setHover(false);
    settle();
    for (const bin of bins)
        assertClose(bin.scale_x, 1);
});

test('native hover exit cannot sustain the wave through an overlapping client', () => {
    let pointer = [125, 25];
    let onSurface = true;
    const {surface, icons, bins, frame, settle} = makeSurface({
        getPointer: () => pointer, containsPointer: () => onSurface,
    });
    icons[2].setHover(true);
    surface.onPointerMotion(...pointer);
    frame(0);
    settle();
    assertClose(bins[2].scale_x, 1.22);
    onSurface = false;
    icons[2].setHover(false);
    pointer = [125, 26];
    frame(0);
    settle();
    for (const bin of bins)
        assertClose(bin.scale_x, 1);
    surface.dispose();
});

test('native hover exit samples the pointer after the notification', () => {
    let pointer = [125, 25];
    const {surface, icons, bins, frame, settle} = makeSurface({getPointer: () => pointer});
    icons[2].setHover(true);
    frame(0);
    settle();
    assertClose(bins[2].scale_x, 1.22);
    icons[2].setHover(false);
    pointer = [125, 260];
    frame(0);
    settle();
    for (const bin of bins)
        assertClose(bin.scale_x, 1);
    surface.dispose();
});

test('a pen drives the wave from its own cursor until it leaves proximity', () => {
    const mouse = [600, 500];
    const {surface, bins, frame, settle} = makeSurface({getPointer: () => mouse});
    surface.onPointerMotion(125, 25, true);
    frame(0);
    settle();
    assertClose(bins[2].scale_x, 1.22);
    surface.onPointerMotion(...mouse);
    settle();
    for (const bin of bins)
        assertClose(bin.scale_x, 1);
    surface.dispose();
});

test('surface picking is coalesced, bounded to the row and idle after settling', () => {
    let picks = 0;
    const {surface, frame, settle, scheduler} = makeSurface({
        containsPointer: () => { picks++; return true; },
    });
    surface.onPointerMotion(120, 25);
    surface.onPointerMotion(125, 25);
    frame(0);
    assertEqual(picks, 1);
    settle();
    const settled = picks;
    frame(1000);
    assertEqual(picks, settled);
    assertEqual(scheduler.pending.size, 0);
    surface.onPointerMotion(125, 1000);
    settle();
    assertEqual(picks, settled);
    surface.dispose();
});

test('surface gaps retain the wave after native icon hover ends', () => {
    const {surface, icons, bins, frame, settle} = makeSurface();
    icons[2].setHover(true);
    surface.onPointerMotion(125, 25);
    frame(0);
    settle();
    icons[2].setHover(false);
    surface.onPointerMotion(150, 25);
    frame(0);
    settle();
    assertEqual(bins[2].scale_x > 1, true);
    assertEqual(bins[3].scale_x > 1, true);
    surface.dispose();
});

test('the raised wave band bridges gaps without extending beyond its height', () => {
    const {surface, bins, frame, settle} = makeSurface();
    for (const [index, bin] of bins.entries()) {
        bin.get_transformed_position = () => [index * 50 + 10, index === 2 ? -12 : 4];
        bin.get_transformed_size = () => [30, 42];
    }
    surface.onPointerMotion(125, 25);
    frame(0);
    settle();
    surface.onPointerMotion(150, -4);
    frame(0);
    settle();
    assertEqual(bins[2].scale_x > 1, true);
    surface.onPointerMotion(150, -30);
    settle();
    for (const bin of bins)
        assertEqual(bin.scale_x, 1);
    surface.dispose();
});

test('surface leave refreshes a settled wave without an icon hover change', () => {
    const pointerActor = new FakeEmitter();
    let owned = true;
    const {surface, bins, frame, settle, scheduler} = makeSurface({
        pointerActor, containsPointer: () => owned,
    });
    surface.onPointerMotion(125, 25);
    frame(0);
    settle();
    assertEqual(bins[2].scale_x > 1, true);
    owned = false;
    pointerActor.emit('leave-event', {get_coords: () => [125, 25]});
    settle();
    for (const bin of bins)
        assertEqual(bin.scale_x, 1);
    surface.dispose();
    pointerActor.emit('leave-event', {get_coords: () => [125, 25]});
    assertEqual(scheduler.pending.size, 0);
});

test('a vertical wave bridges gaps only along its own row axis', () => {
    const {surface, bins, frame, settle} = makeSurface({edge: 'left'});
    for (const [index, bin] of bins.entries()) {
        bin.get_transformed_position = () => [index === 2 ? -12 : 4, index * 50 + 10];
        bin.get_transformed_size = () => [42, 30];
    }
    surface.onPointerMotion(25, 125);
    frame(0);
    settle();
    surface.onPointerMotion(-4, 150);
    frame(0);
    settle();
    assertEqual(bins[2].scale_x > 1, true);
    surface.onPointerMotion(-30, 150);
    settle();
    for (const bin of bins)
        assertEqual(bin.scale_x, 1);
    surface.dispose();
});

test('a retreat completing during a flush still applies its final frame', () => {
    let time = 0;
    let step = 0;
    const {surface, bins, box, frame, scheduler} = makeSurface({
        spreadRoom: 64,
        clock: () => { const value = time; time += step; return value; },
    });
    const recipe = motionRecipe('expressive');
    recipe.hover.easing = 'ease-out-cubic';
    surface.setRecipe(recipe);
    surface.onPointerMotion(125, 25);
    frame(0);
    time = DURATION;
    frame(0);
    surface.onPointerMotion(125, 1000);
    frame(0);
    time = 2 * DURATION - 0.5;
    step = 1;
    frame(0);
    assertEqual(scheduler.pending.size, 1);
    frame(0);
    for (const bin of bins) {
        assertEqual(bin.scale_x, 1);
        assertEqual(bin.reactive, false);
    }
    for (const actor of box.children)
        assertEqual(actor.translation_x, 0);
    surface.dispose();
});

test('hover enter and leave order cleanly around the wave', () => {
    const {surface, bins, icons, frame, settle} = makeSurface();
    surface.onPointerMotion(125, 25);
    frame(0);
    settle();
    icons[2].setHover(true);
    frame(0);
    assertClose(bins[2].scale_x, 1.22);
    icons[2].setHover(false);
    frame(0);
    surface.onPointerMotion(125, 1000);
    frame(0);
    frame(1);
    settle();
    for (const bin of bins)
        assertEqual(bin.scale_x, 1);
    assertEqual(bins[2].easeTargets.length, 0);
});

test('a recipe change is picked up by the next transition', () => {
    const {surface, bins, frame, settle} = makeSurface();
    surface.onPointerMotion(125, 25);
    frame(0);
    settle();
    // Short-recipe: the exit transition finishes almost at once.
    const recipe = motionRecipe('expressive');
    recipe.hover.duration = 1;
    surface.setRecipe(recipe);
    surface.onPointerMotion(125, 1000);
    frame(0);
    frame(2);
    for (const bin of bins)
        assertEqual(bin.scale_x, 1);
});

test('disabled animations snap the envelope instead of easing it', () => {
    const {surface, bins, frame} = makeSurface({animationsEnabled: () => false});
    surface.onPointerMotion(125, 25);
    frame(0);
    assertClose(bins[2].scale_x, 1.22);
    surface.onPointerMotion(125, 1000);
    frame(0);
    for (const bin of bins)
        assertEqual(bin.scale_x, 1);
});

test('disposing mid-transition cancels the scheduled frames', () => {
    const {surface, scheduler, frame} = makeSurface();
    surface.onPointerMotion(100, 25);
    frame(0);
    assertEqual(scheduler.pending.size, 1);
    surface.dispose();
    assertEqual(scheduler.pending.size, 0);
});

test('a disabled hover profile keeps the wave inert', () => {
    const {surface, scheduler, bins, frame} = makeSurface({preset: 'subtle'});
    surface.onPointerMotion(125, 25);
    frame(0);
    for (const bin of bins)
        assertEqual(bin.scale_x, 1);
    assertEqual(scheduler.pending.size, 0);
});

test('the wave runs along the axis of a vertical dock', () => {
    const {surface, bins, frame, settle} = makeSurface({edge: 'left'});
    surface.onPointerMotion(25, 125);
    frame(0);
    settle();
    assertClose(bins[2].scale_x, 1.22);
    assertClose(bins[1].scale_x, 1.11);
    assertClose(bins[3].scale_x, 1.11);
    assertEqual(bins[0].scale_x, 1);
});

test('a pointer off the cross band of a vertical dock does not wave', () => {
    const {surface, scheduler, bins, frame} = makeSurface({edge: 'left'});
    // 70px right of the row.
    surface.onPointerMotion(120, 25);
    frame(0);
    for (const bin of bins)
        assertEqual(bin.scale_x, 1);
    assertEqual(scheduler.pending.size, 0);
});

test('a pointer past the reach reads only the row ends', () => {
    // Another monitor's dock shares the band: 2000px past the last icon.
    const {surface, scheduler, box, bins, frame} = makeSurface();
    surface.onPointerMotion(2225, 25);
    frame(0);
    for (const bin of bins)
        assertEqual(bin.scale_x, 1);
    assertEqual(scheduler.pending.size, 0);
    assertDeepEqual(box.children.map(container => container.reads), [1, 0, 0, 0, 1]);
});

test('the wave tracks a translated box', () => {
    const {surface, bins, frame, settle} = makeSurface({position: [100, 50]});
    // Stage coordinates: box origin (100, 50) plus the row-local pointer.
    surface.onPointerMotion(225, 75);
    frame(0);
    settle();
    assertClose(bins[2].scale_x, 1.22);
    assertClose(bins[1].scale_x, 1.11);
    assertEqual(bins[0].scale_x, 1);
});

test('removing an icon mid-wave keeps the row consistent', () => {
    const {surface, scheduler, box, bins, frame, settle} = makeSurface();
    surface.onPointerMotion(125, 25);
    frame(0);
    settle();
    // Destroy the middle icon; the neighbors slide over the gap.
    box.icons[2].destroy();
    frame(0);
    assertEqual(scheduler.pending.size, 0);
    assertEqual(bins[1].scale_x > 1, true);
    assertEqual(bins[3].scale_x > 1, true);
});

test('a destroyed box takes its row out of the pointer path', () => {
    const {surface, scheduler, box} = makeSurface();
    box.destroy();
    surface.onPointerMotion(125, 25);
    assertEqual(scheduler.pending.size, 0);
});

test('an unmapped row ignores the pointer', () => {
    const {surface, scheduler, box, bins, frame} = makeSurface();
    box.mapped = false;
    surface.onPointerMotion(125, 25);
    frame(0);
    for (const bin of bins)
        assertEqual(bin.scale_x, 1);
    assertEqual(scheduler.pending.size, 0);
});

test('the wave fits its peak to the outward room once per sweep', () => {
    // 10 px of room: the expressive peak and lift do not fit.
    const {surface, bins, frame, settle} = makeSurface({room: 10});
    surface.onPointerMotion(125, 25);
    frame(0);
    settle();
    const level = fitHoverLevel(motionRecipe().hover, 48, 10, OVERSHOOT_RESERVE);
    const fitted = {hoverScale: 1 + 0.22 * level, lift: 5 * level};
    assertClose(bins[2].scale_x, fitted.hoverScale);
    assertClose(bins[2].translation_y, -fitted.lift);
    // One measure for the row, none per icon per frame.
    assertEqual(bins[0].measures, 1);
    assertEqual(bins[2].measures, 0);
    surface.onPointerMotion(130, 25);
    frame(16);
    assertEqual(bins[0].measures, 1);
});

test('disposing the surface restores every bin', () => {
    const {surface, scheduler, bins, frame, settle} = makeSurface();
    surface.onPointerMotion(125, 25);
    frame(0);
    settle();
    surface.dispose();
    scheduler.flush();
    for (const bin of bins)
        assertEqual(bin.scale_x, 1);
});

test('the wave stays active over the visible overflow of an original icon', () => {
    const {surface, bins, frame, settle} = makeSurface();
    surface.onPointerMotion(125, 25);
    frame(0);
    settle();
    bins[2].get_transformed_position = () => [100, -8];
    bins[2].get_transformed_size = () => [50, 54];
    surface.onPointerMotion(125, -4);
    frame(16);
    settle();
    assertClose(bins[2].scale_x, 1.22);
    assertEqual(bins[2].reactive, true);
    surface.onPointerMotion(125, -12);
    frame(16);
    settle();
    assertClose(bins[2].scale_x, 1);
    assertEqual(bins[2].reactive, false);
});
