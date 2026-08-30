import {getBuiltInRecipe} from '../flourish@orsso.github.io/lib/motion/catalog.js';
import {MotionSurface} from '../flourish@orsso.github.io/lib/runtime/motionSurface.js';
import {FakeBox, makeScheduler} from './fakes.js';

function makeSweep(iconCount, profile) {
    const scheduler = makeScheduler();
    const box = new FakeBox(iconCount);
    const surface = new MotionSurface({recipe: getBuiltInRecipe(profile), scheduler});
    surface.addBox(box, 'bottom');
    scheduler.flush();
    const {icons} = box;
    const bins = icons.map(icon => icon.icon._iconBin);
    return {scheduler, icons, bins};
}


function clearTargets(bins) {
    for (const bin of bins)
        bin.easeTargets.length = 0;
}

function countEases(bins) {
    return bins.reduce((total, bin) => total + bin.easeTargets.length, 0);
}

test('a coalesced crossing eases straight to the final state', () => {
    const {scheduler, icons, bins} = makeSweep(6, 'expressive');
    icons[0].setHover(true);
    scheduler.flush();
    clearTargets(bins);

    icons[0].setHover(false);
    icons[1].setHover(true);
    scheduler.flush();

    for (const bin of bins) {
        if (bin.easeTargets.length > 1)
            throw new Error(`two waves reached one bin: ${bin.easeTargets}`);
        // The intermediate "nobody hovered" state must never be eased.
        if (bin.easeTargets.some(target => Math.abs(target - 1) < 1e-6))
            throw new Error(`identity eased mid-crossing: ${bin.easeTargets}`);
    }
    assertEqual(countEases(bins), 4);
});

test('an expressive sweep stays under the per-crossing ease bound', () => {
    const {scheduler, icons, bins} = makeSweep(6, 'expressive');
    icons[0].setHover(true);
    scheduler.flush();
    for (let index = 1; index < icons.length; index++) {
        icons[index - 1].setHover(false);
        icons[index].setHover(true);
        scheduler.flush();
    }
    // Entry wave plus five crossings; the uncoalesced double wave blows this.
    assertEqual(countEases(bins) <= 30, true);
});

test('leaving the dock returns every icon to rest', () => {
    const {scheduler, icons, bins} = makeSweep(4, 'expressive');
    icons[0].setHover(true);
    scheduler.flush();
    icons[0].setHover(false);
    icons[1].setHover(true);
    scheduler.flush();

    icons[1].setHover(false);
    scheduler.flush();
    for (const bin of bins) {
        assertClose(bin.scale_x, 1);
        assertClose(bin.scale_y, 1);
        assertClose(bin.translation_x, 0);
        assertClose(bin.translation_y, 0);
    }
});
