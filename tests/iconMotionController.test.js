import {getBuiltInRecipe} from '../flourish@orsso.github.io/lib/motion/catalog.js';
import {IconMotionController as RuntimeController} from '../flourish@orsso.github.io/lib/runtime/iconMotionController.js';
import {FakeBin, FakeIcon, MeasurableBin} from './fakes.js';

class IconMotionController extends RuntimeController {
    constructor(options) {
        super({...options, setDim: (actor, level) => {
            actor.effects = level > 0 ? [{name: 'flourish-dim', level}] : [];
        }});
    }
}

function makeMeasuredController(preset = 'expressive') {
    let now = 0;
    const icon = new FakeIcon();
    const bin = new MeasurableBin();
    const controller = new IconMotionController({
        icon,
        bin,
        edge: 'bottom',
        recipe: getBuiltInRecipe(preset),
        clock: () => now,
    });
    return {controller, icon, bin, advance(ms) { now += ms; controller.applyHoverState(); }};
}

function makeController(preset = 'expressive') {
    let now = 0;
    const hoverEvents = [];
    const icon = new FakeIcon();
    const bin = new FakeBin();
    const controller = new IconMotionController({
        icon,
        bin,
        edge: 'bottom',
        recipe: getBuiltInRecipe(preset),
        clock: () => now,
        onHoverChanged: (_controller, hovered) => hoverEvents.push(hovered),
    });
    return {controller, icon, bin, hoverEvents,
        advance(ms) { now += ms; controller.applyHoverState(); }};
}

test('monitor fitting uses icon-local units at every edge and parent scale', () => {
    for (const scale of [0.75, 1, 1.25, 1.5, 2, 3]) {
        const monitor = {x: -500, y: -300, width: 1200, height: 900};
        for (const [edge, expected] of Object.entries({
            bottom: 400 / scale + 20, top: 500 / scale - 68,
            left: 600 / scale - 58, right: 600 / scale + 10,
        })) {
            const bin = new MeasurableBin({parentX: 100, parentY: 100});
            bin._clip.has_clip = false;
            bin._parent.get_transformed_size = () => [48 * scale, 48 * scale];
            const controller = new IconMotionController({icon: new FakeIcon(), bin, edge,
                recipe: getBuiltInRecipe('expressive')});
            const measured = controller.measure(monitor);
            assertClose(measured.budgetPx, expected);
            assertEqual(measured.iconNormalSize, 48);
            controller.dispose();
        }
    }
});

test('ancestor clipping and monitor bounds both constrain magnification', () => {
    const {controller, bin} = makeMeasuredController();
    bin._parent.has_clip = true;
    bin._parent.get_clip = () => [-1000, -1000, 2000, 2000];
    assertClose(controller.measure().budgetPx, 120);
    assertClose(controller.measure({x: 0, y: 910, width: 1000, height: 800}).budgetPx, 10);
    bin._parent.get_transformed_size = () => [0, 0];
    assertEqual(controller.measure().budgetPx, 0);
    controller.dispose();
});

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
    assertClose(bin.scale_x, 1.25);
    assertClose(bin.translation_y, -5);
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
    recipe.press.effect = 'squash';
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

test('press dim follows its duration without an actor transition', () => {
    const {icon, bin, advance} = makeController('subtle');
    icon.emit('button-press-event', {get_button: () => 1});
    assertEqual(bin.opacity, 255);
    advance(50);
    assertEqual(icon.get_effect('flourish-dim').level > 0, true);
    assertEqual(bin.opacity, 255);
    advance(50);
    assertClose(icon.get_effect('flourish-dim').level, 0.21);
    icon.emit('clicked');
    advance(100);
    assertEqual(bin.opacity, 255);
    assertEqual(icon.get_effect('flourish-dim'), null);
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

test('a press ramp starts while a hover flush is pending', () => {
    const {icon, bin, advance} = makeController('subtle');
    icon.setHover(true);
    icon.emit('button-press-event', {get_button: () => 1});
    advance(100);
    assertEqual(bin.opacity, 255);
    assertClose(icon.get_effect('flourish-dim').level, 0.21);
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
    const {icon, bin, advance} = makeMeasuredController('subtle');
    icon.emit('button-press-event', {get_button: () => 1});
    advance(100);
    assertEqual(bin.measures, 0);
    assertEqual(bin.opacity, 255);
    assertClose(icon.get_effect('flourish-dim').level, 0.21);
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

test('launch preparation follows the press mode and the held click', () => {
    const modes = {
        'clicks-only': {plain: 1, launching: 0},
        'launches-only': {plain: 2, launching: 2},
        'all-primary-clicks': {plain: 1, launching: 1},
    };
    for (const [mode, expected] of Object.entries(modes)) {
        for (const [kind, launching] of [['plain', false], ['launching', true]]) {
            const {controller, icon, bin, advance} = makeController('subtle');
            const recipe = getBuiltInRecipe('subtle');
            Object.assign(recipe.press, {mode, effect: 'dim'});
            controller.setRecipe(recipe);
            icon.app = {get_n_windows: () => launching ? 0 : 1};
            icon.emit('button-press-event', {get_button: () => 1});
            advance(50);
            const preparation = controller.beginLaunch(false);
            const count = expected[kind];
            assertEqual(preparation.active, count > 0, `${mode} ${kind}`);
            if (preparation.active) {
                assertEqual(preparation.pressSegments.length, count, `${mode} ${kind}`);
                assertEqual(preparation.dim > 0, count === 1, `${mode} ${kind}`);
                assertEqual(bin.scale_y, 1);
                controller.endOverlay();
            }
            controller.dispose();
        }
    }
});

test('a keyboard launch has no press to release', () => {
    const {controller} = makeController('expressive');
    assertEqual(controller.beginLaunch(false).active, false);
    controller.dispose();
});

test('the press master switch disables the launch press too', () => {
    const {controller} = makeController('expressive');
    const recipe = getBuiltInRecipe('expressive');
    recipe.press.enabled = false;
    controller.setRecipe(recipe);
    assertEqual(controller.beginLaunch(false).active, false);
    assertEqual(controller.beginLaunch(true).active, true);
    controller.endOverlay();
    controller.dispose();
});
