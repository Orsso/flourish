import {refreshWidgetStyle} from '../flourish@orsso.github.io/lib/runtime/styleRefresh.js';

class FakeWidget {
    constructor() {
        this.calls = [];
    }

    add_style_class_name(name) {
        this.calls.push(['add', name]);
    }

    remove_style_class_name(name) {
        this.calls.push(['remove', name]);
    }

    ensure_style() {
        this.calls.push(['ensure']);
    }

    queue_relayout() {
        this.calls.push(['relayout']);
    }

    queue_redraw() {
        this.calls.push(['redraw']);
    }
}

test('style refresh invalidates and redraws a widget locally', () => {
    const widget = new FakeWidget();

    refreshWidgetStyle(widget);

    assertDeepEqual(widget.calls, [
        ['add', 'flourish-style-refresh'],
        ['remove', 'flourish-style-refresh'],
        ['ensure'],
        ['relayout'],
        ['redraw'],
    ]);
});

test('style refresh ignores missing widgets', () => {
    refreshWidgetStyle(null);
});
