// Spike: the pointer-following neighbor wave. The scale peaks at `peak`
// at the pointer and falls off to 1 at `radius` icon pitches, measured in
// median pitch units. Outside the radius every icon is identity.
// The curve is a cosine ramp: value 1 at distance 0, value 0 at the
// radius, zero slope at both ends.

export function waveFalloff(distance, radius) {
    if (!(distance >= 0) || !(radius > 0))
        return 0;
    if (distance >= radius)
        return 0;
    return 0.5 * (1 + Math.cos((Math.PI * distance) / radius));
}

export function waveScaleAt(distance, radius, peak) {
    if (!(peak > 1))
        return 1;
    return 1 + (peak - 1) * waveFalloff(distance, radius);
}

// The median gap between consecutive centers; a single icon falls back
// to the provided width.
export function medianPitch(centers, fallback = 0) {
    if (centers.length < 2)
        return fallback;
    const gaps = [];
    for (let index = 1; index < centers.length; index++)
        gaps.push(Math.abs(centers[index] - centers[index - 1]));
    gaps.sort((first, second) => first - second);
    return gaps[Math.floor(gaps.length / 2)];
}

// Per-icon wave scales; pointer and centers share one 1D axis (stage px).
export function waveScales(pointer, centers, radius, pitch, peak) {
    const scales = new Array(centers.length).fill(1);
    if (!(pitch > 0) || !(peak > 1))
        return scales;
    for (let index = 0; index < centers.length; index++) {
        const distance = Math.abs(centers[index] - pointer) / pitch;
        scales[index] = waveScaleAt(distance, radius, peak);
    }
    return scales;
}
