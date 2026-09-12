// The pointer wave: peak at the pointer, cosine falloff to 1 at the radius.

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
