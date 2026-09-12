import {
    waveFalloff,
    waveScaleAt,
    waveScales,
} from '../flourish@orsso.github.io/lib/motion/continuum.js';

test('waveFalloff is 1 at zero and 0 from the radius on', () => {
    assertClose(waveFalloff(0, 2), 1);
    assertClose(waveFalloff(2, 2), 0);
    assertEqual(waveFalloff(3, 2), 0);
    assertEqual(waveFalloff(-1, 2), 0);
    assertEqual(waveFalloff(0, 0), 0);
});

test('waveFalloff falls off monotonically with a flat end', () => {
    let previous = Infinity;
    for (let distance = 0; distance < 2; distance += 0.25) {
        const value = waveFalloff(distance, 2);
        assertEqual(value <= previous, true);
        previous = value;
    }
    // Zero slope at both ends: the last step barely moves.
    assertClose(waveFalloff(0.01, 2), 1, 0.01);
    assertClose(waveFalloff(1.99, 2), 0, 0.01);
});

test('waveScaleAt maps the falloff onto a scale of one', () => {
    assertEqual(waveScaleAt(0, 2, 1.22), 1.22);
    assertEqual(waveScaleAt(2, 2, 1.22), 1);
    assertEqual(waveScaleAt(9, 2, 1.22), 1);
    assertEqual(waveScaleAt(0, 2, 1), 1);
});

test('waveScales peaks at the pointer and is identity past the radius', () => {
    // Five icons, pitch 50, centers 25..225.
    const centers = [25, 75, 125, 175, 225];
    const scales = waveScales(125, centers, 2, 50, 1.22);
    assertClose(scales[2], 1.22);
    assertClose(scales[1], 1.11);
    assertClose(scales[3], 1.11);
    assertEqual(scales[0], 1);
    assertEqual(scales[4], 1);
});

test('waveScales is continuous across icon boundaries', () => {
    const centers = [25, 75, 125, 175, 225];
    const before = waveScales(49, centers, 2, 50, 1.22);
    const after = waveScales(51, centers, 2, 50, 1.22);
    for (let index = 0; index < centers.length; index++)
        assertEqual(Math.abs(before[index] - after[index]) < 0.01, true);
});

test('waveScales degrades on degenerate input', () => {
    assertDeepEqual(waveScales(5, [10, 10], 2, 0, 1.22), [1, 1]);
    assertDeepEqual(waveScales(5, [], 2, 0, 1.22), []);
});
