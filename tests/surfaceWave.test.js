import {getBuiltInRecipe} from '../flourish@orsso.github.io/lib/motion/catalog.js';
import {MotionSurface} from '../flourish@orsso.github.io/lib/runtime/motionSurface.js';
import {FakeEmitter, FakeIcon, makeScheduler} from './fakes.js';

// Containers and box with neutral geometry: 50px pitch, 42px icons.
class WaveContainer {
    constructor(index, horizontal) {
        this.child = new FakeIcon();
        this.index = index;
        this.horizontal = horizontal;
        this.parent = null;
    }

    get_parent() {
        return this.parent;
    }

    get_stage() {
        return 'stage';
    }

    get_transformed_position() {
        return this.horizontal ? [this.index * 50, 0] : [0, this.index * 50];
    }

    get_allocation_box() {
        // Parent-relative, like the real dash containers: the box is the
        // region of the parent row this container was assigned.
        return this.horizontal
            ? {x1: this.index * 50, y1: 4, x2: (this.index + 1) * 50, y2: 46}
            : {x1: 4, y1: this.index * 50, x2: 46, y2: (this.index + 1) * 50};
    }
}

class WaveBox extends FakeEmitter {
    constructor(count, horizontal, position = [0, 0]) {
        super();
        this.position = position;
        this.children = [];
        for (let index = 0; index < count; index++)
            this.append(new WaveContainer(index, horizontal));
    }

    append(container) {
        container.parent = this;
        this.children.push(container);
    }

    get_children() {
        return this.children;
    }

    add_child(container) {
        this.append(container);
        this.emit('child-added', container);
    }

    get icons() {
        return this.children.map(container => container.child);
    }

    get_stage() {
        return 'stage';
    }

    get_transformed_position() {
        return this.position;
    }

    get_allocation_box() {
        // The live dash box reports an empty allocation box, so the wave
        // never reads this one; it stays for completeness.
        return this.children[0].horizontal
            ? {x1: 0, y1: 0, x2: 50 * this.children.length, y2: 50}
            : {x1: 0, y1: 0, x2: 50, y2: 50 * this.children.length};
    }
}

function makeSurface(
    preset = 'expressive',
    edge = 'bottom',
    position = [0, 0],
    animationsEnabled = () => true,
) {
    const horizontal = edge === 'bottom' || edge === 'top';
    const scheduler = makeScheduler();
    const box = new WaveBox(5, horizontal, position);
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
        const duration = Math.max(1, surface.recipe.hover.duration);
        for (let i = 0; i < 8 && scheduler.pending.size > 0; i++)
            frame(duration / 2);
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
    // 10px right of center: inside the peak, below it. Entering over a
    // hovered icon seeds the envelope full, so no dip below the classic.
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

test('entry over an icon starts the wave at full amplitude', () => {
    const {surface, bins, icons, frame, settle} = makeSurface();
    icons[2].setHover(true);
    frame(0);
    assertClose(bins[2].scale_x, 1.22);
    // The pointer lands on the hovered icon: the wave must not dip to 1
    // first, the icon already shows the classic peak.
    surface.onPointerMotion(125, 25);
    frame(0);
    assertClose(bins[2].scale_x, 1.22);
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
    const duration = Math.max(1, surface.recipe.hover.duration);
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
    frame(duration * 0.45);
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
    const duration = Math.max(1, surface.recipe.hover.duration);
    surface.onPointerMotion(125, 25);
    frame(0);
    settle();
    surface.onPointerMotion(125, 1000);
    frame(0);
    // A back-eased decay crosses zero fast; catch it early instead.
    frame(duration * 0.15);
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
    const recipe = {
        ...surface.recipe,
        hover: {...surface.recipe.hover, duration: 1},
    };
    surface.setRecipe(recipe);
    surface.onPointerMotion(125, 1000);
    frame(0);
    frame(2);
    for (const bin of bins)
        assertEqual(bin.scale_x, 1);
});

test('disabled animations snap the envelope instead of easing it', () => {
    const {surface, bins, frame} = makeSurface(
        'expressive', 'bottom', [0, 0], () => false);
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
    const {surface, scheduler, bins, frame} = makeSurface('subtle');
    surface.onPointerMotion(125, 25);
    frame(0);
    for (const bin of bins)
        assertEqual(bin.scale_x, 1);
    assertEqual(scheduler.pending.size, 0);
});

test('the wave runs along the axis of a vertical dock', () => {
    const {surface, bins, frame, settle} = makeSurface('expressive', 'left');
    surface.onPointerMotion(25, 125);
    frame(0);
    settle();
    assertClose(bins[2].scale_x, 1.22);
    assertClose(bins[1].scale_x, 1.11);
    assertClose(bins[3].scale_x, 1.11);
    assertEqual(bins[0].scale_x, 1);
});

test('a pointer off the cross band of a vertical dock costs no icon geometry', () => {
    const {surface, scheduler, frame} = makeSurface('expressive', 'left');
    // 70px right of the row: the pre-gate must reject it.
    surface.onPointerMotion(120, 25);
    frame(0);
    assertEqual(surface.counters.contGeom, 0);
    assertEqual(scheduler.pending.size, 0);
});

test('the wave tracks a translated box', () => {
    const {surface, bins, frame, settle} = makeSurface(
        'expressive', 'bottom', [100, 50]);
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
