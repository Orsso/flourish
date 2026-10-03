// EASE_OUT_BACK overshoots by about 10%.
export const OVERSHOOT_RESERVE = 0.1;

export function hoverActive({enabled, scale, lift}) {
    return enabled && (scale > 1 || lift > 0);
}

export function waveFalloff(distance, radius) {
    if (!(distance >= 0) || !(radius > 0))
        return 0;
    if (distance >= radius)
        return 0;
    return 0.5 * (1 + Math.cos((Math.PI * distance) / radius));
}

export function waveOffsets(sizes, scales) {
    const offsets = [];
    let extra = 0;
    for (let index = 0; index < sizes.length; index++) {
        const growth = sizes[index] * (scales[index] - 1);
        offsets.push(extra + growth / 2);
        extra += growth;
    }
    return offsets.map(offset => offset - extra / 2);
}

export function fitHoverLevel(hover, iconSize, outwardRoom, overshoot = 0) {
    const reach = iconSize * (hover.scale - 1) + hover.lift;
    return reach > 0 ? Math.min(1, Math.max(0, outwardRoom) / ((1 + overshoot) * reach)) : 1;
}

export function waveGeometry({levels, hover, sizes, sideRoom = Infinity}) {
    const scales = levels.map(level => 1 + (hover.scale - 1) * level);
    let offsets = waveOffsets(sizes, scales);
    let growth = scales.map((scale, i) => sizes[i] * (scale - 1));
    const extent = growth.reduce((sum, value) => sum + value, 0) / 2;
    const fit = extent > sideRoom ? sideRoom / extent : 1;
    if (fit < 1) {
        offsets = offsets.map(offset => offset * fit);
        growth = growth.map(value => value * fit);
    }
    return {
        levels: levels.map(level => level * fit),
        offsets,
        growth,
        first: (offsets[0] ?? 0) - (growth[0] ?? 0) / 2,
    };
}
