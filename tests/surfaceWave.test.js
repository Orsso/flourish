import {getBuiltInRecipe} from '../flourish@orsso.github.io/lib/motion/catalog.js';
import {OVERSHOOT_RESERVE, fitHoverToBudget} from '../flourish@orsso.github.io/lib/motion/transforms.js';
import {MotionSurface} from '../flourish@orsso.github.io/lib/runtime/motionSurface.js';
import {FakeRow, MeasurableBin, makeScheduler} from './fakes.js';

const DURATION = getBuiltInRecipe('expressive').hover.duration;

function makeSurface({
    preset = 'expressive',
    edge = 'bottom',
    position = [0, 0],
    animationsEnabled = () => true,
    room = 120,
} = {}) {
    const horizontal = edge === 'bottom' || edge === 'top';
    const scheduler = makeScheduler();
    // Room between the icons and the clip, outward along the edge.
    const parent = horizontal ? {parentY: 780 + room} : {parentX: room - 10};
    const box = new FakeRow(5, {
        horizontal, position, makeBin: () => new MeasurableBin(parent),
    });
    let now = 0;
    const surface = new MotionSurface({
        recipe: getBuiltInRecipe(preset),
        continuous: true,
        scheduler,
        clock: () => now,
        animationsEnabled,
    });
    surface.addBox(box, edge);
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
    return {surface, scheduler, box, bins, icons: box.icons, frame, settle};
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

test('beginLaunch takes its magnify from the wave', () => {
    const {surface, bins, icons, frame, settle} = makeSurface();
    surface.onPointerMotion(75, 25);
    frame(0);
    settle();
    // Icon 2 is one pitch from the pointer: 1.11, not the 1.08 discrete.
    const result = surface.getController(icons[2]).beginLaunch(true);
    assertEqual(result.active, true);
    assertClose(result.magnify, 1.11);
    assertClose(bins[1].scale_x, 1.22);
});

test('hover enter and leave order cleanly around the wave', () => {
    const {surface, bins, icons, frame, settle} = makeSurface();
    surface.onPointerMotion(125, 25);
    frame(0);
    settle();
    icons[2].setHover(true);
    frame(0);
    // The wave owns the hovered icon; the value equals the classic peak.
    assertClose(bins[2].scale_x, 1.22);
    icons[2].setHover(false);
    frame(0);
    surface.onPointerMotion(125, 1000);
    frame(0);
    frame(1);
    settle();
    for (const bin of bins)
        assertEqual(bin.scale_x, 1);
    // The release may ease the last sliver of the decay, but only to 1:
    // never to the classic hover peak.
    const lastEase = bins[2].easeTargets[bins[2].easeTargets.length - 1];
    assertEqual(lastEase === undefined || lastEase === 1, true);
});

test('switching to classic mid-transition restores instantly', () => {
    const {surface, scheduler, bins, frame} = makeSurface();
    surface.onPointerMotion(100, 25);
    frame(0);
    assertEqual(scheduler.pending.size, 1);
    surface.setContinuous(false);
    frame(0);
    for (const bin of bins)
        assertEqual(bin.scale_x, 1);
    assertEqual(scheduler.pending.size, 0);
    // The wave is inert until re-enabled.
    surface.onPointerMotion(125, 25);
    frame(0);
    for (const bin of bins)
        assertEqual(bin.scale_x, 1);
    assertEqual(scheduler.pending.size, 0);
});

test('a recipe change is picked up by the next transition', () => {
    const {surface, bins, frame, settle} = makeSurface();
    surface.onPointerMotion(125, 25);
    frame(0);
    settle();
    // Short-recipe: the exit transition finishes almost at once.
    const recipe = getBuiltInRecipe('expressive');
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

test('the wave fits its peak to the row budget once per sweep', () => {
    // 10 px of room: the expressive peak and lift do not fit.
    const {surface, bins, frame, settle} = makeSurface({room: 10});
    surface.onPointerMotion(125, 25);
    frame(0);
    settle();
    const fitted = fitHoverToBudget(1.22, 5, 48, 10, OVERSHOOT_RESERVE);
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
