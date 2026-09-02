// Dash to Dock marks the focused app's icon with this class; themes style it.
const FOCUSED_CLASS = 'focused';

export class FocusHighlight {
    #box;
    #marked = null;
    #tracker;

    constructor({box, tracker}) {
        this.#box = box;
        this.#tracker = tracker;
    }

    enable() {
        this.#tracker.connectObject('notify::focus-app', () => this.#sync(), this);
        this.#box.connectObject('child-added', () => this.#sync(), this);
        this.#sync();
    }

    disable() {
        this.#tracker.disconnectObject(this);
        this.#box.disconnectObject(this);
        this.#mark(null);
    }

    #sync() {
        const app = this.#tracker.focus_app;
        const container = app && this.#box.get_children()
            .find(child => child.child?.app === app);
        this.#mark(container?.child ?? null);
    }

    #mark(icon) {
        if (this.#marked === icon)
            return;
        if (this.#marked) {
            this.#marked.remove_style_class_name(FOCUSED_CLASS);
            this.#marked.disconnectObject(this);
        }
        this.#marked = icon;
        if (!icon)
            return;
        icon.add_style_class_name(FOCUSED_CLASS);
        icon.connectObject('destroy', () => {
            this.#marked = null;
        }, this);
    }
}
