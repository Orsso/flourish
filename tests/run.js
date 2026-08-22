import System from 'system';

const tests = [];

globalThis.test = (name, callback) => tests.push({name, callback});
globalThis.assertEqual = (actual, expected) => {
    if (!Object.is(actual, expected))
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
globalThis.assertDeepEqual = (actual, expected) => {
    const actualJson = JSON.stringify(actual);
    const expectedJson = JSON.stringify(expected);
    if (actualJson !== expectedJson)
        throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
};
globalThis.assertClose = (actual, expected, epsilon = 0.0001) => {
    if (Math.abs(actual - expected) > epsilon)
        throw new Error(`Expected ${expected} ± ${epsilon}, got ${actual}`);
};

const modules = [
    './catalog.test.js',
    './deferredLaunchEnds.test.js',
    './demoSequence.test.js',
    './hoverSweep.test.js',
    './iconMotionController.test.js',
    './iconTexture.test.js',
    './lifecycle.test.js',
    './motionSurface.test.js',
    './pressInteraction.test.js',
    './runtimeHelpers.test.js',
    './settings.test.js',
    './transforms.test.js',
];
for (const module of modules)
    await import(module);

let failures = 0;
for (const {name, callback} of tests) {
    try {
        await callback();
        console.log(`ok - ${name}`);
    } catch (error) {
        failures++;
        console.error(`not ok - ${name}: ${error.message}`);
    }
}

console.log(`${tests.length - failures}/${tests.length} tests passed`);
if (failures > 0)
    System.exit(1);
