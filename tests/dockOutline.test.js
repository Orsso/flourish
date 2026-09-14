import {DockOutline} from '../flourish@orsso.github.io/lib/runtime/dockOutline.js';
import {FakeEmitter} from './fakes.js';

class FakeBackground extends FakeEmitter {
    constructor() {
        super();
        this._style = null;
    }

    get style() {
        return this._style;
    }

    set style(style) {
        this._style = style;
        this.emit('notify::style');
    }
}

class FakeInterface extends FakeEmitter {
    constructor(scheme = 'default') {
        super();
        this.scheme = scheme;
    }

    get_string() {
        return this.scheme;
    }

    setScheme(scheme) {
        this.scheme = scheme;
        this.emit('changed::color-scheme');
    }
}

const outlineWith = interfaceSettings =>
    new DockOutline({interfaceSettings: interfaceSettings ?? new FakeInterface()});

const DOCK_STYLE = 'background-color: rgba(0,0,0,0); border-color: rgba(0,0,0,0);';

test('the outline follows the dock inline style and outlives its rewrites', () => {
    const outline = outlineWith();
    const background = new FakeBackground();
    background.style = DOCK_STYLE;
    outline.setOutline('light');
    outline.track(background);
    assertEqual(background.style.startsWith(DOCK_STYLE), true);
    assertEqual(background.style.includes('border: 1px solid'), true);

    // Dash to Dock clears and rewrites the style on every theme update.
    background.style = null;
    assertEqual(background.style.includes('border: 1px solid'), true);
    background.style = DOCK_STYLE;
    assertEqual(background.style.endsWith(outline.style), true);
    assertEqual(background.style.split('border: 1px solid').length, 2);
});

test('an outline of none and disposal both leave the dock style alone', () => {
    const outline = outlineWith();
    const background = new FakeBackground();
    background.style = DOCK_STYLE;
    outline.setOutline('dark');
    outline.track(background);
    outline.setOutline('none');
    assertEqual(background.style, DOCK_STYLE);

    outline.setOutline('dark');
    outline.dispose();
    assertEqual(background.style, DOCK_STYLE);
    background.style = null;
    assertEqual(background.style, null);
});

test('auto follows the color scheme', () => {
    const interfaceSettings = new FakeInterface('prefer-dark');
    const outline = outlineWith(interfaceSettings);
    const background = new FakeBackground();
    outline.setOutline('auto');
    outline.track(background);
    assertEqual(background.style.includes('rgba(255, 255, 255'), true);
    interfaceSettings.setScheme('default');
    assertEqual(background.style.includes('rgba(0, 0, 0'), true);
    outline.destroy();
    assertEqual(background.style, null);
    assertEqual(interfaceSettings.handlers.size, 0);
});

test('a destroyed background is forgotten', () => {
    const outline = outlineWith();
    const background = new FakeBackground();
    outline.setOutline('light');
    outline.track(background);
    background.destroy();
    outline.setOutline('dark');
    assertEqual(background.style.includes('rgba(0, 0, 0'), false);
});
