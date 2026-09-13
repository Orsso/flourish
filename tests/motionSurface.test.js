import {getBuiltInRecipe} from '../flourish@orsso.github.io/lib/motion/catalog.js';
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
    const surface = new MotionSurface({getPointer: () => null, recipe, scheduler});
    const box = new FakeBox(iconCount);
    surface.addBox(box, 'bottom');
    scheduler.flush();
    const {icons} = box;
    const bins = icons.map(icon => icon.icon._iconBin);
    return {surface, scheduler, box, icons, bins};
}

test('addBox registers a controller per icon container', () => {
    const {surface} = makeSurface(EXPRESSIVE, 3);
    assertEqual(surface.controllers.length, 3);
    assertEqual(surface.controllers[0].edge, 'bottom');
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
    const handlers = box.handlers.size;
    surface.addBox(box, 'bottom');
    assertEqual(surface.controllers.length, 2);
    assertEqual(box.handlers.size, handlers);
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

test('dispose releases the icons and stops watching the box', () => {
    const {surface, box, icons} = makeSurface(EXPRESSIVE, 2);
    surface.dispose();
    assertEqual(icons.every(icon => icon.handlers.size === 0), true);
    assertEqual(icons.every(icon => icon.icon.icon.size === 48), true);
    box.add_child(new FakeContainer());
    assertEqual(surface.controllers.length, 0);
    assertEqual(box.handlers.size, 0);
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

test('a box context is served through its icons and dropped with them', () => {
    const scheduler = makeScheduler();
    const surface = new MotionSurface({recipe: EXPRESSIVE, scheduler});
    const box = new FakeBox(2);
    const context = {edge: 'bottom'};
    assertEqual(surface.addBox(box, 'bottom', context), true);
    assertEqual(surface.addBox(box, 'bottom', context), false);
    const [first, second] = box.icons;
    assertEqual(surface.getContext(first), context);
    assertEqual(surface.getContext(second), context);
    assertEqual(surface.getContext(new FakeIcon()), null);
    first.destroy();
    assertEqual(surface.getContext(first), null);
});

test('the surface reports urgent icons, including ones already urgent when found', () => {
    const scheduler = makeScheduler();
    const seen = [];
    const surface = new MotionSurface({
        recipe: EXPRESSIVE,
        scheduler,
        onUrgentChanged: (controller, urgent) => seen.push([controller.icon, urgent]),
    });
    const box = new FakeBox(1);
    box.icons[0].urgent = true;
    surface.addBox(box, 'bottom');
    const late = new FakeContainer();
    box.add_child(late);
    late.child.urgent = true;
    late.child.emit('notify::urgent');
    assertDeepEqual(seen.map(([icon, urgent]) => [box.icons.indexOf(icon), urgent]),
        [[0, true], [1, true]]);
});
