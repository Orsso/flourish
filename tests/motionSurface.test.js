import {getBuiltInRecipe} from '../flourish@orsso.github.io/lib/motion/catalog.js';
import {neighborScaleAt} from '../flourish@orsso.github.io/lib/motion/transforms.js';
import {MotionSurface} from '../flourish@orsso.github.io/lib/runtime/motionSurface.js';
import {
    FakeBox,
    FakeContainer,
    FakeEmitter,
    FakeIcon,
    makeScheduler,
} from './fakes.js';

const EXPRESSIVE = getBuiltInRecipe('expressive');

function makeSurface(recipe = EXPRESSIVE, iconCount = 0) {
    const scheduler = makeScheduler();
    const surface = new MotionSurface({recipe, scheduler});
    const box = new FakeBox(iconCount);
    surface.addBox(box, 'bottom');
    scheduler.flush();
    const {icons} = box;
    const bins = icons.map(icon => icon.icon._iconBin);
    return {surface, scheduler, box, icons, bins};
}

function scales(bins) {
    return bins.map(bin => Math.round(bin.scale_x * 1000) / 1000);
}

function neighbor(distance) {
    return Math.round(neighborScaleAt(EXPRESSIVE.hover, distance) * 1000) / 1000;
}

function eases(bins) {
    return bins.map(bin => bin.easeTargets.length);
}

function clearEases(bins) {
    for (const bin of bins)
        bin.easeTargets.length = 0;
}

test('addBox registers a controller per icon container', () => {
    const {surface} = makeSurface(EXPRESSIVE, 3);
    assertEqual(surface.controllers.length, 3);
    assertEqual(surface.controllers[0].position, 'bottom');
    assertEqual(surface.controllers[0].recipe, EXPRESSIVE);
});

test('containers without an icon bin are skipped', () => {
    const scheduler = makeScheduler();
    const surface = new MotionSurface({recipe: EXPRESSIVE, scheduler});
    const box = new FakeBox(1);
    box.append(new FakeEmitter());
    surface.addBox(box, 'bottom');
    assertEqual(surface.controllers.length, 1);
});

test('child-added registers late containers', () => {
    const {surface, box} = makeSurface(EXPRESSIVE, 1);
    box.add_child(new FakeContainer());
    assertEqual(surface.controllers.length, 2);
});

test('addBox refuses the same box twice', () => {
    const {surface, box} = makeSurface(EXPRESSIVE, 2);
    surface.addBox(box, 'bottom');
    assertEqual(surface.controllers.length, 2);
    assertEqual(box.handlers.size, 2);
});

test('getController maps the icon actor to its controller', () => {
    const {surface, icons} = makeSurface(EXPRESSIVE, 2);
    assertEqual(surface.getController(icons[1]), surface.controllers[1]);
    assertEqual(surface.getController(new FakeIcon()), undefined);
});

test('setRecipe reaches every controller', () => {
    const {surface} = makeSurface(EXPRESSIVE, 2);
    const subtle = getBuiltInRecipe('subtle');
    surface.setRecipe(subtle);
    assertEqual(surface.controllers.every(c => c.recipe === subtle), true);
});

test('refreshStyles touches every controller', () => {
    const {surface, icons} = makeSurface(EXPRESSIVE, 2);
    surface.refreshStyles();
    assertDeepEqual(icons.map(icon => icon.styleCalls.length), [5, 5]);
});

test('hovering an icon scales its neighbors by distance', () => {
    const {scheduler, icons, bins} = makeSurface(EXPRESSIVE, 4);
    icons[1].setHover(true);
    scheduler.flush();
    assertDeepEqual(scales(bins), [neighbor(1), 1.22, neighbor(1), neighbor(2)]);
});

test('unhover returns every icon to rest', () => {
    const {scheduler, icons, bins} = makeSurface(EXPRESSIVE, 3);
    icons[1].setHover(true);
    scheduler.flush();
    icons[1].setHover(false);
    scheduler.flush();
    assertDeepEqual(scales(bins), [1, 1, 1]);
});

test('icons beyond the neighbor radius stay at rest', () => {
    const {scheduler, icons, bins} = makeSurface(EXPRESSIVE, 6);
    icons[0].setHover(true);
    scheduler.flush();
    assertDeepEqual(scales(bins).slice(2), [neighbor(2), 1, 1, 1]);
});

test('removing a non-hovered icon resyncs the distances', () => {
    const {scheduler, icons, bins} = makeSurface(EXPRESSIVE, 4);
    icons[2].setHover(true);
    scheduler.flush();
    icons[1].destroy();
    scheduler.flush();
    assertEqual(scales(bins)[0], neighbor(1));
});

test('a destroyed icon leaves the neighbor group', () => {
    const {scheduler, icons, bins} = makeSurface(EXPRESSIVE, 3);
    icons[1].destroy();
    icons[0].setHover(true);
    scheduler.flush();
    assertEqual(scales(bins)[2], neighbor(1));
});

test('dispose releases the icons and stops watching the box', () => {
    const {surface, box, icons} = makeSurface(EXPRESSIVE, 2);
    surface.dispose();
    assertEqual(icons.every(icon => icon.handlers.size === 0), true);
    assertEqual(icons.every(icon => icon.icon.icon.size === 48), true);
    box.add_child(new FakeContainer());
    assertEqual(surface.controllers.length, 0);
    assertEqual(box.handlers.size, 0);
});

test('hover updates wait for the scheduled frame flush', () => {
    const {scheduler, icons, bins} = makeSurface(EXPRESSIVE, 4);
    icons[1].setHover(true);
    assertDeepEqual(scales(bins), [1, 1, 1, 1]);
    scheduler.flush();
    assertDeepEqual(scales(bins), [neighbor(1), 1.22, neighbor(1), neighbor(2)]);
});

test('without a neighbor effect only the flipped icon eases', () => {
    const recipe = getBuiltInRecipe('balanced');
    const {scheduler, icons, bins} = makeSurface(recipe, 5);
    icons[1].setHover(true);
    scheduler.flush();
    assertDeepEqual(eases(bins), [0, 1, 0, 0, 0]);
});

test('a crossing eases the flipped icons and the shifted neighbors', () => {
    const {scheduler, icons, bins} = makeSurface(EXPRESSIVE, 5);
    icons[1].setHover(true);
    scheduler.flush();
    clearEases(bins);
    icons[1].setHover(false);
    icons[2].setHover(true);
    scheduler.flush();
    assertDeepEqual(eases(bins), [1, 1, 1, 1, 1]);
});

test('a flip made during a flush is applied by the next flush', () => {
    const {scheduler, icons, bins} = makeSurface(EXPRESSIVE, 3);
    // The first ease reacts by unhovering, like a pointer exit mid-flush.
    bins[0].onEase = () => {
        bins[0].onEase = null;
        icons[0].setHover(false);
    };
    icons[0].setHover(true);
    scheduler.flush();
    assertEqual(scheduler.pending.size, 1);
    scheduler.flush();
    assertDeepEqual(scales(bins), [1, 1, 1]);
});

test('a burst of hover flips coalesces into one flush', () => {
    const {scheduler, icons, bins} = makeSurface(EXPRESSIVE, 4);
    icons[0].setHover(true);
    icons[0].setHover(false);
    icons[1].setHover(true);
    assertEqual(scheduler.pending.size, 1);
    scheduler.flush();
    assertDeepEqual(scales(bins), [neighbor(1), 1.22, neighbor(1), neighbor(2)]);
    assertDeepEqual(eases(bins), [1, 1, 1, 1]);
});

test('dispose cancels the pending flush', () => {
    const {surface, scheduler, icons} = makeSurface(EXPRESSIVE, 2);
    icons[0].setHover(true);
    surface.dispose();
    assertEqual(scheduler.pending.size, 0);
    assertEqual(scheduler.cancelled.length, 1);
});

test('box destruction cancels the pending flush', () => {
    const {scheduler, box, icons} = makeSurface(EXPRESSIVE, 2);
    icons[0].setHover(true);
    box.destroy();
    assertEqual(scheduler.pending.size, 0);
});

test('a destroyed icon is not applied by the pending flush', () => {
    const {scheduler, icons, bins} = makeSurface(EXPRESSIVE, 3);
    icons[1].setHover(true);
    icons[1].destroy();
    scheduler.flush();
    assertEqual(bins[1].easeTargets.length, 0);
});

test('an icon born hovered resolves at the next flush', () => {
    const scheduler = makeScheduler();
    const surface = new MotionSurface({recipe: EXPRESSIVE, scheduler});
    const box = new FakeBox(3);
    box.icons[0].hover = true;
    surface.addBox(box, 'bottom');
    scheduler.flush();
    const bins = box.icons.map(icon => icon.icon._iconBin);
    assertDeepEqual(scales(bins), [1.22, neighbor(1), neighbor(2)]);
});
