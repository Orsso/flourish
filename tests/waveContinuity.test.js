import {motionRecipe} from './fakes.js';

import Clutter from 'gi://Clutter';

import {easingProgress} from '../flourish@orsso.github.io/lib/motion/catalog.js';
import {waveFalloff} from '../flourish@orsso.github.io/lib/motion/continuum.js';
import {MotionSurface} from '../flourish@orsso.github.io/lib/runtime/motionSurface.js';
import {FakeRow, MeasurableBin, makeScheduler, surfaceContext} from './fakes.js';

const FRAME = 7;
const PROPS = ['scale_x', 'scale_y', 'translation_x', 'translation_y'];
const MODE_EASING = {
    [Clutter.AnimationMode.LINEAR]: 'linear',
    [Clutter.AnimationMode.EASE_OUT_QUAD]: 'ease-out-quad',
    [Clutter.AnimationMode.EASE_OUT_CUBIC]: 'ease-out-cubic',
    [Clutter.AnimationMode.EASE_OUT_BACK]: 'ease-out-back',
};

// A bin whose eases interpolate over the frame clock, like Clutter's.
class TimedBin extends MeasurableBin {
    constructor(clock) {
        super();
        this.clock = clock;
        this.live = {};
    }

    ease(props) {
        for (const key of PROPS) {
            if (props[key] === undefined)
                continue;
            this.live[key] = {
                from: this[key],
                to: props[key],
                start: this.clock(),
                duration: props.duration,
                easing: MODE_EASING[props.mode],
            };
        }
    }

    remove_transition(name) {
        delete this.live[name.replace('-', '_')];
    }

    tick() {
        const now = this.clock();
        for (const [key, ease] of Object.entries(this.live)) {
            const t = (now - ease.start) / ease.duration;
            this[key] = t >= 1
                ? ease.to
                : ease.from + (ease.to - ease.from) * easingProgress(ease.easing, t);
            if (t >= 1)
                delete this.live[key];
        }
    }
}

// Plays timed events against the surface and records icon 2 frame by frame.
function replay(easing, events) {
    let now = 0;
    const clock = () => now;
    const recipe = motionRecipe('expressive');
    recipe.hover.easing = easing;
    const scheduler = makeScheduler();
    const box = new FakeRow(5, {makeBin: () => new TimedBin(clock)});
    const surface = new MotionSurface({
        getPointer: () => null,
        recipe, scheduler, clock, animationsEnabled: () => true,
    });
    surface.addBox(box, 'bottom', surfaceContext(box));
    scheduler.flush();
    const icon = box.children[2].child;
    const bin = icon.icon._iconBin;
    const controller = surface.getController(icon);
    const frames = [];
    const queue = events({surface, icon, controller});
    for (; now <= 1200; now += FRAME) {
        for (const container of box.children)
            container.child.icon._iconBin.tick();
        while (queue.length > 0 && queue[0].t <= now)
            queue.shift().fn();
        scheduler.flush();
        frames.push({t: now, sy: bin.scale_y, ty: bin.translation_y, overlaid: controller.overlaid});
    }
    return frames;
}

function largestStep(frames, from, to) {
    let largest = 0;
    for (let i = 1; i < frames.length; i++) {
        const frame = frames[i];
        if (frame.t < from || frame.t > to || frame.overlaid || frames[i - 1].overlaid)
            continue;
        largest = Math.max(largest, Math.abs(frame.sy - frames[i - 1].sy));
    }
    return largest;
}

// Enter over icon 2, press mid ramp, launch, the launch ends, the pointer moves.
function gesture({surface, icon, controller}) {
    const launch = {};
    return {
        launch,
        events: [
            {t: 0, fn: () => {
                icon.setHover(true);
                surface.onPointerMotion(125, 25);
            }},
            {t: 100, fn: () => icon.emit('button-press-event', {get_button: () => 1})},
            {t: 130, fn: () => {
                launch.result = controller.beginLaunch(true);
            }},
            {t: 700, fn: () => controller.endOverlay()},
            {t: 720, fn: () => surface.onPointerMotion(128, 25)},
        ],
    };
}

// The largest frame step of an ideal ease over `amplitude`, with slack.
function stepLimit(easing, duration, amplitude) {
    let largest = 0;
    for (let t = 0; t < duration; t += FRAME) {
        largest = Math.max(largest,
            easingProgress(easing, (t + FRAME) / duration) - easingProgress(easing, t / duration));
    }
    return largest * amplitude * 1.1;
}

for (const easing of ['linear', 'ease-out-cubic', 'ease-out-back']) {
    test(`a press during the entry ramp squashes over its duration (${easing})`, () => {
        const frames = replay(easing, context => gesture(context).events);
        // Expressive squash on a 1.22 icon: 0.22 * 0.85 * 1.22 of scale.
        const limit = stepLimit(easing, 170, 0.23);
        assertEqual(largestStep(frames, 100, 130) < limit, true);
    });

    test(`the return from a launch stays continuous under motion (${easing})`, () => {
        const frames = replay(easing, context => gesture(context).events);
        const limit = stepLimit(easing, 280, 0.22);
        assertEqual(largestStep(frames, 700, 1000) < limit, true);
        // The pointer ended 3px off center.
        assertClose(frames[frames.length - 1].sy, 1 + 0.22 * waveFalloff(3 / 50, 2));
    });
}

test('a launch during the entry ramp starts without a separate magnify target', () => {
    let launch;
    replay('linear', context => {
        const played = gesture(context);
        launch = played.launch;
        return played.events;
    });
    assertEqual(launch.result.active, true);
    assertEqual('magnify' in launch.result, false);
});
