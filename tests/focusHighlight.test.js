import {FocusHighlight} from '../flourish@orsso.github.io/lib/runtime/focusHighlight.js';
import {FakeBox, FakeContainer, FakeEmitter, FakeIcon} from './fakes.js';

class FakeTracker extends FakeEmitter {
    constructor() {
        super();
        this.focus_app = null;
    }

    focus(app) {
        this.focus_app = app;
        this.emit('notify::focus-app');
    }
}

function setup(apps) {
    const box = new FakeBox();
    for (const app of apps) {
        const icon = new FakeIcon();
        icon.app = app;
        box.add_child(new FakeContainer(icon));
    }
    const tracker = new FakeTracker();
    const highlight = new FocusHighlight({box, tracker});
    return {box, tracker, highlight};
}

function classes(icon) {
    return icon.styleCalls.filter(([call]) => call === 'add' || call === 'remove');
}

test('the focused app icon gains the class and the previous one loses it', () => {
    const {box, tracker, highlight} = setup(['a', 'b']);
    const [first, second] = box.icons;
    tracker.focus_app = 'a';
    highlight.enable();
    assertDeepEqual(classes(first), [['add', 'focused']]);
    tracker.focus('b');
    assertDeepEqual(classes(first), [['add', 'focused'], ['remove', 'focused']]);
    assertDeepEqual(classes(second), [['add', 'focused']]);
});

test('losing focus clears the mark', () => {
    const {box, tracker, highlight} = setup(['a']);
    highlight.enable();
    tracker.focus('a');
    tracker.focus(null);
    assertDeepEqual(classes(box.icons[0]), [['add', 'focused'], ['remove', 'focused']]);
});

test('an icon added after focus is marked on arrival', () => {
    const {box, tracker, highlight} = setup(['a']);
    highlight.enable();
    tracker.focus('b');
    const icon = new FakeIcon();
    icon.app = 'b';
    box.add_child(new FakeContainer(icon));
    assertDeepEqual(classes(icon), [['add', 'focused']]);
});

test('a destroyed icon is not unmarked later', () => {
    const {box, tracker, highlight} = setup(['a', 'b']);
    const [first, second] = box.icons;
    highlight.enable();
    tracker.focus('a');
    first.destroy();
    tracker.focus('b');
    assertDeepEqual(classes(first), [['add', 'focused']]);
    assertDeepEqual(classes(second), [['add', 'focused']]);
});

test('disable clears the mark and stops listening', () => {
    const {box, tracker, highlight} = setup(['a']);
    const icon = box.icons[0];
    highlight.enable();
    tracker.focus('a');
    highlight.disable();
    assertDeepEqual(classes(icon), [['add', 'focused'], ['remove', 'focused']]);
    tracker.focus('a');
    assertEqual(classes(icon).length, 2);
    assertEqual(tracker.handlers.size, 0);
    assertEqual(box.handlers.size, 0);
});
