import {getBuiltInRecipe} from '../flourish@orsso.github.io/lib/motion/catalog.js';
import {IconMotionController} from '../flourish@orsso.github.io/lib/runtime/iconMotionController.js';
import {FakeBin, FakeIcon, MeasurableBin} from './fakes.js';

function makeMeasuredController(preset = 'expressive') {
    const icon = new FakeIcon();
    const bin = new MeasurableBin();
    const controller = new IconMotionController({
        icon,
        bin,
        edge: 'bottom',
        recipe: getBuiltInRecipe(preset),
    });
    return {controller, icon, bin};
}

function makeController(preset = 'expressive') {
    const hoverEvents = [];
    const icon = new FakeIcon();
    const bin = new FakeBin();
    const controller = new IconMotionController({
        icon,
        bin,
        edge: 'bottom',
        recipe: getBuiltInRecipe(preset),
        onHoverChanged: (_controller, hovered) => hoverEvents.push(hovered),
    });
    return {controller, icon, bin, hoverEvents};
}

test('hover changes notify the neighbor group', () => {
    const {icon, hoverEvents} = makeController();
    icon.setHover(true);
    icon.setHover(false);
    assertDeepEqual(hoverEvents, [true, false]);
});

test('only the shared hover level drives the icon transform', () => {
    const {controller, icon, bin} = makeController();
    icon.setHover(true);
    controller.applyHoverState();
    assertEqual(bin.scale_x, 1);
    assertEqual(controller.setHoverLevel(0.5), true);
    assertEqual(controller.setHoverLevel(0.5), false);
    controller.applyHoverState();
    assertClose(bin.scale_x, 1.16);
    assertClose(bin.translation_y, -1.5);
    assertEqual(bin.reactive, true);
    controller.setHoverLevel(0);
    controller.applyHoverState();
    assertEqual(bin.scale_x, 1);
    assertEqual(bin.reactive, false);
    controller.dispose();
});

test('a recipe change clears an in-flight press level', () => {
    let now = 0;
    const icon = new FakeIcon();
    const bin = new FakeBin();
    const recipe = getBuiltInRecipe('expressive');
    recipe.press.mode = 'all-primary-clicks';
    const controller = new IconMotionController({icon, bin, recipe, edge: 'bottom', clock: () => now});
    icon.emit('button-press-event', {get_button: () => 1});
    now = 200;
    controller.applyHoverState();
    assertEqual(bin.scale_y < 1, true);
    controller.setRecipe(getBuiltInRecipe('expressive'));
    controller.applyHoverState();
    assertEqual(bin.scale_y, 1);
    controller.dispose();
});

test('beginLaunch leaves the neighbor group hover in place', () => {
    const {controller, icon, hoverEvents} = makeController();
    icon.setHover(true);
    controller.beginLaunch(true);
    assertDeepEqual(hoverEvents, [true]);
});

test('hover changes mid-launch still reach the neighbor group', () => {
    const {controller, icon, hoverEvents} = makeController();
    icon.setHover(true);
    controller.beginLaunch(true);
    icon.setHover(false);
    icon.setHover(true);
    assertDeepEqual(hoverEvents, [true, false, true]);
});

test('press dim settles back even with two controllers on the same bin', () => {
    const icon = new FakeIcon();
    const bin = new FakeBin();
    const recipe = getBuiltInRecipe('subtle');
    const controllers = [
        new IconMotionController({icon, bin, edge: 'bottom', recipe}),
        new IconMotionController({icon, bin, edge: 'bottom', recipe}),
    ];
    for (let click = 0; click < 3; click++) {
        icon.emit('button-press-event', {get_button: () => 1});
        icon.pressed = true;
        icon.emit('notify::pressed');
        icon.pressed = false;
        icon.emit('notify::pressed');
        icon.emit('clicked');
    }
    assertEqual(bin.opacity, 255);
    assertEqual(controllers.length, 2);
});

test('a hover flip alone does not ease until applyHoverState', () => {
    const {controller, icon, bin} = makeController('expressive');
    icon.setHover(true);
    assertEqual(bin.eases, 0);
    controller.applyHoverState();
    assertEqual(bin.eases, 0);
});

test('hover with an unchanged transform does not ease', () => {
    const {icon, bin} = makeController('subtle');
    icon.setHover(true);
    icon.setHover(false);
    icon.setHover(true);
    assertEqual(bin.eases, 0);
});

test('press dim lands without easing an unchanged transform', () => {
    const {icon, bin} = makeController('subtle');
    icon.emit('button-press-event', {get_button: () => 1});
    assertEqual(bin.opacity, 244);
    assertEqual(bin.eases, 0);
});

test('setRecipe reapplies even when the transform is unchanged', () => {
    const {controller, bin} = makeController('subtle');
    controller.setRecipe(getBuiltInRecipe('subtle'));
    assertEqual(bin.eases, 0);
});

test('beginLaunch snaps instantly even when the transform is unchanged', () => {
    const {controller, icon, bin} = makeController('subtle');
    icon.setHover(true);
    controller.beginLaunch(true);
    assertEqual(bin.removedTransitions, 4);
});

test('applyHoverState is inert during detached attention', () => {
    const {controller, icon, bin} = makeController('expressive');
    icon.setHover(true);
    controller.beginOverlay();
    const probes = bin.parentProbes;
    const eases = bin.eases;
    icon.setHover(false);
    controller.applyHoverState();
    assertEqual(bin.parentProbes, probes);
    assertEqual(bin.eases, eases);
});

test('a press stays immediate while a hover flush is pending', () => {
    const {icon, bin} = makeController('subtle');
    icon.setHover(true);
    icon.emit('button-press-event', {get_button: () => 1});
    assertEqual(bin.opacity, 244);
});

test('beginLaunch snaps immediately while a hover flush is pending', () => {
    const {controller, icon, bin} = makeController('expressive');
    icon.setHover(true);
    const result = controller.beginLaunch(true);
    assertEqual(result.active, true);
    assertEqual(bin.removedTransitions, 4);
});

test('applies toward identity skip the geometry measure', () => {
    const {controller, icon, bin} = makeMeasuredController('expressive');
    icon.setHover(true);
    controller.applyHoverState();
    const measures = bin.measures;
    icon.setHover(false);
    controller.applyHoverState();
    assertEqual(bin.measures, measures);
});

test('a press without hover reach skips the geometry measure', () => {
    const {icon, bin} = makeMeasuredController('subtle');
    icon.emit('button-press-event', {get_button: () => 1});
    assertEqual(bin.measures, 0);
    assertEqual(bin.opacity, 244);
});

test('endOverlay does not replay the hover notification', () => {
    const {controller, icon, hoverEvents} = makeController();
    icon.setHover(true);
    controller.beginLaunch(true);
    controller.endOverlay();
    assertDeepEqual(hoverEvents, [true]);
});

test('dispose restores the stock icon texture', () => {
    const icon = new FakeIcon();
    const sizes = () => icon.icon.created.map(created => created.size);
    const controller = new IconMotionController({
        icon, bin: new FakeBin(), edge: 'bottom', recipe: getBuiltInRecipe('expressive'),
    });
    assertDeepEqual(sizes(), [48, 96]);

    controller.dispose();

    assertDeepEqual(sizes(), [48, 96, 48]);
});

test('endOverlay after the target is destroyed is inert', () => {
    const {controller, bin} = makeController();
    controller.beginLaunch(true);
    const eases = bin.eases;

    controller.onTargetDestroyed();
    controller.endOverlay();

    assertEqual(bin.eases, eases);
});

test('refreshStyle invalidates and redraws the icon', () => {
    const {controller, icon} = makeController();

    controller.refreshStyle();

    assertDeepEqual(icon.styleCalls, [
        ['add', 'flourish-style-refresh'],
        ['remove', 'flourish-style-refresh'],
        ['ensure'],
        ['relayout'],
        ['redraw'],
    ]);
});

test('a hovered or scaled neighbor icon is not at rest', () => {
    const icon = new FakeIcon();
    const controller = new IconMotionController({
        icon, bin: icon.icon._iconBin, edge: 'bottom', recipe: getBuiltInRecipe('expressive'),
    });
    icon.setHover(true);
    assertEqual(controller.atRest, false);
    icon.setHover(false);
    controller.setHoverLevel(0.5);
    assertEqual(controller.atRest, false);
    controller.setHoverLevel(0);
    assertEqual(controller.atRest, true);
});

test('urgent changes reach the listener with the controller', () => {
    const icon = new FakeIcon();
    const seen = [];
    const controller = new IconMotionController({
        icon, bin: icon.icon._iconBin, edge: 'bottom', recipe: getBuiltInRecipe('subtle'),
        onUrgentChanged: (changed, urgent) => seen.push([changed === controller, urgent]),
    });
    assertEqual(controller.icon, icon);
    icon.urgent = true;
    icon.emit('notify::urgent');
    icon.urgent = false;
    icon.emit('notify::urgent');
    assertDeepEqual(seen, [[true, true], [true, false]]);
    assertEqual(controller.urgent, false);
});
