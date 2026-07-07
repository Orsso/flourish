import {
    LaunchEffect,
    PressEffect,
    getBuiltInRecipe,
} from '../flourish@orsso.github.io/lib/motion/catalog.js';
import {
    buildLaunchSegments,
    composeIconTransform,
    dimOpacity,
    fitHoverToBudget,
    getLaunchPivot,
    getOrientation,
    hoverIntroLift,
    hoverIntroScale,
    hoverNeedsBudget,
    launchDuration,
    launchRepeatPause,
    neighborScaleAt,
    projectHoverTransform,
    resolveIconTransform,
    resolvePressTransform,
    sampleLaunchSegments,
    shouldRepeatLaunch,
    shouldRetreatOnHandoff,
} from '../flourish@orsso.github.io/lib/motion/transforms.js';

test('bottom orientation grows upward', () => {
    assertDeepEqual(getOrientation('bottom'), {
        horizontal: true,
        normalAxis: 'y',
        tangentAxis: 'x',
        pivot: [0.5, 1],
        outward: [0, -1],
    });
});

test('all dock orientations map to the desktop-facing direction', () => {
    assertDeepEqual(getOrientation('top').outward, [0, 1]);
    assertDeepEqual(getOrientation('left').outward, [1, 0]);
    assertDeepEqual(getOrientation('right').outward, [-1, 0]);
});

test('pulse launches around the icon center', () => {
    assertDeepEqual(getLaunchPivot(LaunchEffect.PULSE, 'bottom'), [0.5, 0.5]);
    assertDeepEqual(getLaunchPivot(LaunchEffect.PULSE, 'left'), [0.5, 0.5]);
});

test('directional launches keep the dock-facing pivot', () => {
    assertDeepEqual(getLaunchPivot(LaunchEffect.BOUNCE, 'bottom'), [0.5, 1]);
    assertDeepEqual(getLaunchPivot(LaunchEffect.STRETCH, 'left'), [0, 0.5]);
});

test('press composition compresses the normal axis on a horizontal dock', () => {
    const transform = composeIconTransform({
        position: 'bottom',
        hoverScale: 1.2,
        lift: 4,
        pressIntensity: 0.5,
    });
    assertEqual(transform.scaleX > transform.scaleY, true);
    assertClose(transform.translationY, -4);
    assertClose(transform.translationX, 0);
});

test('press feedback compresses without widening past the hover scale', () => {
    const bottom = composeIconTransform({
        position: 'bottom',
        hoverScale: 1.2,
        pressIntensity: 0.85,
    });
    assertClose(bottom.scaleX, 1.2);          // tangent axis stays at hover, no bulge
    assertEqual(bottom.scaleY < 1.2, true);   // normal axis compresses
    const left = composeIconTransform({
        position: 'left',
        hoverScale: 1.2,
        pressIntensity: 0.85,
    });
    assertClose(left.scaleY, 1.2);            // tangent axis stays at hover, no bulge
    assertEqual(left.scaleX < 1.2, true);     // normal axis compresses
});

test('press composition swaps axes on a vertical dock', () => {
    const transform = composeIconTransform({
        position: 'left',
        hoverScale: 1.2,
        lift: 4,
        pressIntensity: 0.5,
    });
    assertEqual(transform.scaleX < transform.scaleY, true);
    assertClose(transform.translationX, 4);
    assertClose(transform.translationY, 0);
});

test('squash press table keeps the historical compression', () => {
    const press = resolvePressTransform(
        PressEffect.SQUASH, 0.5, getOrientation('bottom'));
    assertClose(press.scaleY, 1 - 0.22 * 0.5);
    assertClose(press.scaleX, 1);
    assertEqual(press.dim, 0);
});

test('dim press keeps geometry identity and darkens with intensity', () => {
    const press = resolvePressTransform(
        PressEffect.DIM, 0.6, getOrientation('bottom'));
    assertClose(press.scaleX, 1);
    assertClose(press.scaleY, 1);
    assertClose(press.translationX, 0);
    assertClose(press.translationY, 0);
    assertClose(press.dim, 0.18);
});

test('dim opacity is derived from the undimmed opacity', () => {
    assertEqual(dimOpacity(255, 0.105), 228);
    assertEqual(dimOpacity(200, 0.18), 164);
    assertEqual(dimOpacity(255, 0), 255);
});

test('unknown press effects fall back to squash', () => {
    const press = resolvePressTransform('nope', 0.5, getOrientation('bottom'));
    assertClose(press.scaleY, 1 - 0.22 * 0.5);
});

test('pulse segments scale without translation', () => {
    const segments = buildLaunchSegments(LaunchEffect.PULSE, {
        intensity: 0.5,
        speed: 1,
        pulseCount: 2,
    }, 'bottom');
    assertEqual(segments.length, 4);
    assertEqual(segments.some(segment => segment.scaleX > 1), true);
    assertEqual(segments.every(segment => segment.translationX === 0), true);
    assertEqual(segments.every(segment => segment.translationY === 0), true);
});

test('bounce follows the outward vector and decays', () => {
    const segments = buildLaunchSegments(LaunchEffect.BOUNCE, {
        intensity: 0.6,
        speed: 1,
        bounceDecay: 0.55,
    }, 'right');
    const outward = segments.filter(segment => segment.translationX < 0);
    assertEqual(outward.length, 3);
    assertEqual(Math.abs(outward[0].translationX) > Math.abs(outward[1].translationX), true);
    assertEqual(Math.abs(outward[1].translationX) > Math.abs(outward[2].translationX), true);
});

test('subtle bounce defaults to one macOS-style hop per cycle', () => {
    const recipe = getBuiltInRecipe('subtle');
    const segments = buildLaunchSegments(
        recipe.launch.effect, recipe.launch, 'bottom');
    assertEqual(segments.length, 2);
    assertEqual(segments[0].translationY < 0, true);
    assertEqual(segments[1].translationY, 0);
});

test('bounce descends faster as it approaches the dock', () => {
    const segments = buildLaunchSegments(LaunchEffect.BOUNCE, {
        intensity: 0.6,
        speed: 1,
        bounceDecay: 0,
    }, 'bottom');
    const descentStart = segments[0].duration;
    const descent = segments[1].duration;
    const firstQuarter = sampleLaunchSegments(
        segments, descentStart + descent * 0.25).translationY;
    const secondQuarter = sampleLaunchSegments(
        segments, descentStart + descent * 0.50).translationY;
    const thirdQuarter = sampleLaunchSegments(
        segments, descentStart + descent * 0.75).translationY;
    const rest = sampleLaunchSegments(
        segments, descentStart + descent).translationY;

    const earlyTravel = Math.abs(secondQuarter - firstQuarter);
    const lateTravel = Math.abs(rest - thirdQuarter);
    assertEqual(lateTravel > earlyTravel, true);
});

test('bounce returns never dip past the resting line', () => {
    const segments = buildLaunchSegments(LaunchEffect.BOUNCE, {
        intensity: 0.6,
        speed: 1,
        bounceDecay: 0.55,
    }, 'bottom');
    const total = launchDuration(segments);
    for (let elapsed = 0; elapsed <= total; elapsed += 8) {
        const transform = sampleLaunchSegments(segments, elapsed);
        assertEqual(transform.translationY <= 0, true);
    }
});

test('zero bounce decay produces only the primary hop', () => {
    const segments = buildLaunchSegments(LaunchEffect.BOUNCE, {
        intensity: 0.6,
        speed: 1,
        bounceDecay: 0,
    }, 'bottom');
    assertEqual(segments.length, 2);
    assertEqual(segments[0].translationY < 0, true);
    assertEqual(segments[1].translationY, 0);
});

test('stretch swaps compression axes on vertical docks', () => {
    const horizontal = buildLaunchSegments(LaunchEffect.STRETCH, {
        intensity: 0.8,
        speed: 1,
        stretchElasticity: 0.7,
    }, 'bottom');
    const vertical = buildLaunchSegments(LaunchEffect.STRETCH, {
        intensity: 0.8,
        speed: 1,
        stretchElasticity: 0.7,
    }, 'left');
    assertEqual(horizontal[0].scaleX > horizontal[0].scaleY, true);
    assertEqual(vertical[0].scaleX < vertical[0].scaleY, true);
});

test('later launch cycles diminish', () => {
    const recipe = {intensity: 1, speed: 1, bounceDecay: 0.6};
    const first = buildLaunchSegments(LaunchEffect.BOUNCE, recipe, 'bottom', 0);
    const third = buildLaunchSegments(LaunchEffect.BOUNCE, recipe, 'bottom', 2);
    assertEqual(Math.abs(first[0].translationY) > Math.abs(third[0].translationY), true);
});

test('repeat softening can be disabled', () => {
    const recipe = {
        intensity: 1,
        speed: 1,
        bounceDecay: 0.6,
        softenRepeats: false,
    };
    const first = buildLaunchSegments(LaunchEffect.BOUNCE, recipe, 'bottom', 0);
    const third = buildLaunchSegments(LaunchEffect.BOUNCE, recipe, 'bottom', 2);
    assertDeepEqual(third, first);
});

test('stock launch effect produces no companion segments', () => {
    assertDeepEqual(buildLaunchSegments(LaunchEffect.STOCK, {
        intensity: 0.6,
        speed: 1,
    }, 'bottom'), []);
});

test('hover and press compose into one controller target', () => {
    const recipe = getBuiltInRecipe('expressive');
    const transform = resolveIconTransform({
        position: 'bottom',
        recipe,
        hovered: true,
        pressed: true,
    });
    assertClose(transform.scaleX, recipe.hover.scale); // tangent axis holds at hover, no bulge
    assertEqual(transform.scaleY < recipe.hover.scale, true);
    assertEqual(transform.translationY, -recipe.hover.lift);
});

test('neighbor response uses only the configured neighbor scale', () => {
    const recipe = getBuiltInRecipe('expressive');
    const transform = resolveIconTransform({
        position: 'bottom',
        recipe,
        neighborDistance: 1,
    });
    assertEqual(transform.scaleX, recipe.hover.neighborScale);
    assertEqual(transform.scaleY, recipe.hover.neighborScale);
    assertEqual(transform.translationY, 0);
});

test('preview neighbor hover follows one shared progress', () => {
    const recipe = getBuiltInRecipe('expressive');
    const start = projectHoverTransform({
        position: 'bottom',
        recipe,
        neighborDistance: 1,
        progress: 0,
    });
    const halfway = projectHoverTransform({
        position: 'bottom',
        recipe,
        neighborDistance: 1,
        progress: 0.5,
    });
    const end = projectHoverTransform({
        position: 'bottom',
        recipe,
        neighborDistance: 1,
        progress: 1,
    });

    assertEqual(start.scaleX, 1);
    assertClose(halfway.scaleX, 1 + (recipe.hover.neighborScale - 1) / 2);
    assertEqual(end.scaleX, recipe.hover.neighborScale);
});

test('neighbor falloff is full at distance one and linear outward', () => {
    const hover = {neighborScale: 1.12, neighborRadius: 3};
    assertClose(neighborScaleAt(hover, 1), 1.12);
    assertClose(neighborScaleAt(hover, 2), 1.08);
    assertClose(neighborScaleAt(hover, 3), 1.04);
    assertEqual(neighborScaleAt(hover, 4), 1);
});

test('radius one keeps the legacy single-neighbor behavior', () => {
    const hover = {neighborScale: 1.08, neighborRadius: 1};
    assertClose(neighborScaleAt(hover, 1), 1.08);
    assertEqual(neighborScaleAt(hover, 2), 1);
    assertEqual(neighborScaleAt(hover, 0), 1);
    assertEqual(neighborScaleAt(hover, Infinity), 1);
});

test('resolved transform applies the falloff to far neighbors', () => {
    const recipe = getBuiltInRecipe('expressive');
    recipe.hover.neighborRadius = 2;
    const transform = resolveIconTransform({
        position: 'bottom',
        recipe,
        neighborDistance: 2,
    });
    assertClose(transform.scaleX, 1 + (recipe.hover.neighborScale - 1) / 2);
    assertEqual(resolveIconTransform({
        position: 'bottom',
        recipe,
        neighborDistance: 3,
    }).scaleX, 1);
});

test('disabled system animations return the identity transform', () => {
    const transform = resolveIconTransform({
        position: 'bottom',
        recipe: getBuiltInRecipe('expressive'),
        hovered: true,
        pressed: true,
        animationsEnabled: false,
    });
    assertDeepEqual(transform, {
        scaleX: 1,
        scaleY: 1,
        translationX: 0,
        translationY: 0,
        dim: 0,
        pivot: [0.5, 1],
    });
});

test('launch state suppresses hover magnification', () => {
    const transform = resolveIconTransform({
        position: 'bottom',
        recipe: getBuiltInRecipe('balanced'),
        hovered: true,
        launching: true,
    });
    assertDeepEqual(transform, {
        scaleX: 1,
        scaleY: 1,
        translationX: 0,
        translationY: 0,
        dim: 0,
        pivot: [0.5, 1],
    });
});

test('cold launch repetition stops when the app runs', () => {
    assertEqual(shouldRepeatLaunch({
        wasLaunching: true,
        appRunning: true,
        repeat: true,
        elapsed: 500,
        maxDuration: 10000,
    }), false);
});

test('cold launch repetition stops at the configured deadline', () => {
    assertEqual(shouldRepeatLaunch({
        wasLaunching: true,
        appRunning: false,
        repeat: true,
        elapsed: 10000,
        maxDuration: 10000,
    }), false);
});

test('cold launch repetition continues only while all conditions hold', () => {
    assertEqual(shouldRepeatLaunch({
        wasLaunching: true,
        appRunning: false,
        repeat: true,
        elapsed: 9999,
        maxDuration: 10000,
    }), true);
    assertEqual(shouldRepeatLaunch({
        wasLaunching: false,
        appRunning: false,
        repeat: true,
        elapsed: 100,
        maxDuration: 10000,
    }), false);
});

test('handoff retreats when the launch icon is gone', () => {
    assertEqual(shouldRetreatOnHandoff({
        targetMapped: false,
        overviewVisible: false,
        overviewVisibleTarget: false,
        dashContainsTarget: true,
    }), true);
});

test('handoff settles into a dock on the desktop', () => {
    assertEqual(shouldRetreatOnHandoff({
        targetMapped: true,
        overviewVisible: false,
        overviewVisibleTarget: false,
        dashContainsTarget: true,
    }), false);
});

test('handoff retreats while the overview takes the dash away', () => {
    assertEqual(shouldRetreatOnHandoff({
        targetMapped: true,
        overviewVisible: true,
        overviewVisibleTarget: false,
        dashContainsTarget: true,
    }), true);
});

test('handoff settles into the dash of a steady overview', () => {
    assertEqual(shouldRetreatOnHandoff({
        targetMapped: true,
        overviewVisible: true,
        overviewVisibleTarget: true,
        dashContainsTarget: true,
    }), false);
});

test('repeated launch cycles pause briefly between hops', () => {
    assertEqual(launchRepeatPause({
        wasLaunching: true,
        appRunning: false,
        repeat: true,
        repeatPause: 300,
        elapsed: 500,
        maxDuration: 10000,
    }), 300);
    assertEqual(launchRepeatPause({
        wasLaunching: true,
        appRunning: true,
        repeat: true,
        repeatPause: 300,
        elapsed: 500,
        maxDuration: 10000,
    }), 0);
    assertEqual(launchRepeatPause({
        wasLaunching: true,
        appRunning: false,
        repeat: true,
        repeatPause: 0,
        elapsed: 500,
        maxDuration: 10000,
    }), 0);
});

test('launch segment sampling uses the shared timeline', () => {
    const segments = buildLaunchSegments(LaunchEffect.PULSE, {
        intensity: 0.5,
        speed: 1,
        pulseCount: 1,
    }, 'bottom');
    const total = launchDuration(segments);
    assertEqual(total, segments[0].duration + segments[1].duration);
    assertDeepEqual(sampleLaunchSegments(segments, 0), {
        scaleX: 1,
        scaleY: 1,
        translationX: 0,
        translationY: 0,
    });
    assertDeepEqual(sampleLaunchSegments(segments, total), {
        scaleX: 1,
        scaleY: 1,
        translationX: 0,
        translationY: 0,
    });
    assertEqual(sampleLaunchSegments(segments, segments[0].duration).scaleX > 1, true);
});

test('hover intro scale recovers the magnification ratio from geometry', () => {
    const neutral = {x: 100, y: 200, width: 50, height: 50};
    const visible = {x: 95, y: 188, width: 60, height: 60};
    assertDeepEqual(hoverIntroScale(visible, neutral), {x: 1.2, y: 1.2});
});

test('hover intro scale is neutral when geometry is unchanged', () => {
    const neutral = {x: 10, y: 20, width: 48, height: 48};
    assertDeepEqual(hoverIntroScale(neutral, neutral), {x: 1, y: 1});
});

test('hover intro lift isolates the bottom-dock lift from the scale', () => {
    const neutral = {x: 100, y: 200, width: 50, height: 50};
    const visible = {x: 95, y: 188, width: 60, height: 60};
    const lift = hoverIntroLift(visible, neutral, getOrientation('bottom').pivot);
    assertClose(lift.x, 0);
    assertClose(lift.y, -2);
});

test('hover intro lift isolates the side-dock lift from the scale', () => {
    const neutral = {x: 10, y: 200, width: 50, height: 50};
    const visible = {x: 13, y: 195, width: 60, height: 60};
    const lift = hoverIntroLift(visible, neutral, getOrientation('left').pivot);
    assertClose(lift.x, 3);
    assertClose(lift.y, 0);
});

test('budget fit leaves a fitting magnification untouched', () => {
    assertDeepEqual(
        fitHoverToBudget(1.16, 2, 48, 100), {hoverScale: 1.16, lift: 2});
});

test('budget fit shrinks scale growth and lift by the same factor', () => {
    const factor = 12 / (48 * 0.22 + 5);
    const fit = fitHoverToBudget(1.22, 5, 48, 12);
    assertClose(fit.hoverScale, 1 + (48 * 0.22 * factor) / 48);
    assertClose(fit.lift, 5 * factor);
    assertClose(48 * (fit.hoverScale - 1) + fit.lift, 12);
});

test('budget fit preserves the scale-to-lift ratio when shrinking', () => {
    const fit = fitHoverToBudget(1.22, 5, 48, 8);
    const growth = 48 * (fit.hoverScale - 1);
    assertClose(growth / fit.lift, (48 * 0.22) / 5);
    assertClose(growth + fit.lift, 8);
});

test('budget fit reserves headroom for easing overshoot', () => {
    const budget = 12 / 1.1;
    const factor = budget / (48 * 0.22 + 5);
    const fit = fitHoverToBudget(1.22, 5, 48, 12, 0.1);
    assertClose(fit.hoverScale, 1 + (48 * 0.22 * factor) / 48);
    assertClose(fit.lift, 5 * factor);
});

test('budget fit is inert without measurable geometry', () => {
    assertDeepEqual(
        fitHoverToBudget(1.22, 5, 0, 12), {hoverScale: 1.22, lift: 5});
    assertDeepEqual(
        fitHoverToBudget(1.22, 5, 48, Infinity), {hoverScale: 1.22, lift: 5});
});

test('resolved transform fits the hovered reach within the dock budget', () => {
    const recipe = getBuiltInRecipe('balanced'); // scale 1.10, lift 0, cubic
    const transform = resolveIconTransform({
        position: 'bottom',
        recipe,
        hovered: true,
        budgetPx: 4,
        iconNormalSize: 48,
    });
    const liftPx = -transform.translationY;
    assertClose(48 * (transform.scaleY - 1) + liftPx, 4);
});

test('the budget is needed only when the hover reach can move', () => {
    const expressive = getBuiltInRecipe('expressive');
    assertEqual(hoverNeedsBudget(
        {recipe: expressive, hovered: true}), true);
    assertEqual(hoverNeedsBudget(
        {recipe: expressive, hovered: false, neighborDistance: 1}), true);
    assertEqual(hoverNeedsBudget(
        {recipe: expressive, hovered: false, neighborDistance: 3}), false);
    assertEqual(hoverNeedsBudget(
        {recipe: expressive, hovered: true, launching: true}), false);
    assertEqual(hoverNeedsBudget(
        {recipe: getBuiltInRecipe('subtle'), hovered: true}), false);
});

test('a lift alone still needs the budget', () => {
    const recipe = getBuiltInRecipe('expressive');
    recipe.hover.scale = 1;
    recipe.hover.lift = 5;
    assertEqual(hoverNeedsBudget({recipe, hovered: true}), true);
    recipe.hover.lift = 0;
    assertEqual(hoverNeedsBudget({recipe, hovered: true}), false);
});
