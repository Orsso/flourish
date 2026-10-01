import {IconDecorations} from '../flourish@orsso.github.io/lib/runtime/iconDecorations.js';
import {FakeEmitter} from './fakes.js';

class FakeLabel extends FakeEmitter {
    visible = false;
    opacity = 255;
    disposed = false;

    hide() {
        if (this.disposed)
            throw new Error('hide on a disposed label');
        this.visible = false;
    }

    destroy() {
        super.destroy();
        this.disposed = true;
    }
}

class FakeIconBox extends FakeEmitter {
    get_children() {
        return [];
    }
}

function decorate() {
    const label = new FakeLabel();
    const iconBox = new FakeIconBox();
    const decorations = new IconDecorations({
        container: {label},
        icon: {icon: {get_parent: () => iconBox}},
        bin: {},
        edge: 'bottom',
        getMonitor: () => null,
        labelOffset: '-y-offset',
        onChanged: () => {},
    });
    return {label, iconBox, decorations};
}

test('disposal hides the label and releases its signals', () => {
    const {label, iconBox, decorations} = decorate();
    label.visible = true;
    decorations.dispose();
    assertEqual(label.visible, false);
    assertEqual(label.handlers.size, 0);
    assertEqual(iconBox.handlers.size, 0);
});

test('a label destroyed before its container is left alone', () => {
    const {label, decorations} = decorate();
    label.destroy();
    decorations.dispose();
    assertEqual(label.disposed, true);
});
