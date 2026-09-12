// Spike-only: per-frame work counters and JS elapsed time, one object per
// MotionSurface. The baseline run pays the same increments, so comparisons
// include them.
export function makeCounters() {
    return {
        events: 0,
        flushes: 0,
        boxGeom: 0,
        contGeom: 0,
        measures: 0,
        writes: 0,
        eases: 0,
        noopEases: 0,
        rmTrans: 0,
        touches: 0,
        eventUs: 0,
        eventMaxUs: 0,
        flushUs: 0,
        flushMaxUs: 0,
        // Recent flush durations in µs, for percentiles in the probe.
        flushSamples: [],
    };
}
