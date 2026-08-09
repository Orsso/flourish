export function createWarnOnce() {
    const seen = new Set();
    return (key, message) => {
        if (seen.has(key))
            return;
        seen.add(key);
        console.warn(`[d2d-companion] ${message}`);
    };
}
