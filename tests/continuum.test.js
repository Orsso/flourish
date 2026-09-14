import {
    waveFalloff,
    fitHoverLevel,
    waveGeometry,
    waveOffsets,
} from '../flourish@orsso.github.io/lib/motion/continuum.js';

test('200 percent fits dense waves at small, fractional and large icon sizes', () => {
    for (const size of [16, 24, 48, 60, 64, 96, 128, 192]) {
        for (const room of [0, 1, 8, 32, 64, 200, 1000]) {
            const hover = {scale: 2, lift: 16};
            const peak = fitHoverLevel(hover, size, room, 0.1);
            assertEqual(peak * (size + 16) * 1.1 <= room + 0.0001, true);
            const levels = [0.25, 0.75, 1, 0.75, 0.25].map(level => level * peak * 1.1);
            const geometry = waveGeometry({levels, hover, sizes: Array(5).fill(size), room});
            assertEqual(geometry.growth.reduce((sum, growth) => sum + growth, 0) <= 2 * room + 0.0001, true);
            assertEqual(geometry.levels.every(level => Number.isFinite(level) && level >= 0), true);
        }
    }
});

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

test('spacing preserves the resting gaps and centers the row', () => {
    assertDeepEqual(waveOffsets([48, 48, 48], [1.25, 1.5, 1.25]), [-18, 0, 18]);
    assertDeepEqual(waveOffsets([48, 48], [1.5, 1.5]), [-12, 12]);
});

test('spacing is identity at rest and accepts an empty row', () => {
    assertDeepEqual(waveOffsets([48, 48, 48], [1, 1, 1]), [0, 0, 0]);
    assertDeepEqual(waveOffsets([], []), []);
});

test('spacing preserves gaps for unequal sizes and an off-center pointer', () => {
    const centers = [20, 75, 150];
    const sizes = [32, 48, 64];
    const scales = [1.4, 1.3, 1.1];
    const shifts = waveOffsets(sizes, scales);
    for (let i = 1; i < centers.length; i++) {
        const oldGap = centers[i] - centers[i - 1] - (sizes[i] + sizes[i - 1]) / 2;
        const gap = centers[i] + shifts[i] - centers[i - 1] - shifts[i - 1] -
            (sizes[i] * scales[i] + sizes[i - 1] * scales[i - 1]) / 2;
        assertClose(gap, oldGap);
    }
    assertClose(shifts[0] - sizes[0] * (scales[0] - 1) / 2,
        -(shifts[2] + sizes[2] * (scales[2] - 1) / 2));
});

test('room limits preserve independent zoom and elevation', () => {
    assertClose(fitHoverLevel({scale: 1, lift: 10}, 48, 5), 0.5);
    assertClose(fitHoverLevel({scale: 1.5, lift: 0}, 48, 12), 0.5);
    assertClose(fitHoverLevel({scale: 1.5, lift: 6}, 48, 15, 0.1), 0.5 / 1.1);
    assertEqual(fitHoverLevel({scale: 1.5, lift: 6}, 48, Infinity), 1);
    assertEqual(fitHoverLevel({scale: 1.5, lift: 6}, 48, -2), 0);
    assertEqual(fitHoverLevel({scale: 1, lift: 0}, 48, 0), 1);
});

test('geometry returns fitted levels without mutating the sampled wave', () => {
    const levels = [0.5, 1, 0.5];
    const hover = {scale: 1.5, lift: 5};
    const geometry = waveGeometry({levels, hover, sizes: [48, 48, 48], room: 12});
    assertDeepEqual(levels, [0.5, 1, 0.5]);
    assertDeepEqual(geometry.levels, [0.25, 0.5, 0.25]);
    assertClose(geometry.first, -12);
    assertClose(geometry.offsets.at(-1) + geometry.growth.at(-1) / 2, 12);
});

test('uniform sweeps do not ripple the row anchor at any supported radius', () => {
    const sizes = new Array(15).fill(48);
    for (const radius of [1, 2, 3]) {
        let first;
        for (let pointer = 4; pointer < 10; pointer += 0.05) {
            const levels = sizes.map((_, i) => waveFalloff(Math.abs(i - pointer), radius));
            const geometry = waveGeometry({levels, hover: {scale: 1.1}, sizes});
            first ??= geometry.offsets[0];
            assertClose(geometry.offsets[0], first);
        }
    }
});
