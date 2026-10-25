import {GroupGap} from '../motion/catalog.js';

const GAP_CLASSES = Object.values(GroupGap).map(gap => `flourish-gap-${gap}`);

// A favorite's gap and its group item in the icon menu.
export class IconGroup {
    #container;
    #groups;
    #icon;
    #item = null;
    #menu = null;

    constructor({container, icon, groups}) {
        this.#container = container;
        this.#icon = icon;
        this.#groups = groups;
        // No public accessor for the menu; it exists once the first popup starts.
        icon.connectObject('menu-state-changed', (_icon, open) => {
            if (open)
                this.#watchMenu(icon._menu);
        }, 'destroy', () => this.#menu?.disconnectObject(this), this);
        this.#mark();
    }

    setGroups(groups) {
        this.#groups = groups;
        this.#mark();
    }

    dispose() {
        this.#icon.disconnectObject(this);
        this.#menu?.disconnectObject(this);
        this.#menu = null;
        this.#item?.destroy();
        for (const name of GAP_CLASSES)
            this.#container.remove_style_class_name(name);
    }

    #mark() {
        const gap = this.#groups.gaps.get(this.#icon.app.get_id());
        const wanted = gap ? `flourish-gap-${gap}` : null;
        for (const name of GAP_CLASSES) {
            if (name === wanted)
                this.#container.add_style_class_name(name);
            else
                this.#container.remove_style_class_name(name);
        }
    }

    #watchMenu(menu) {
        if (menu === this.#menu)
            return;
        this.#menu?.disconnectObject(this);
        this.#menu = menu;
        menu.connectObject('open-state-changed', (_menu, open) => {
            if (open)
                this.#addItem();
        }, this);
    }

    // Dash to Dock rebuilds its menu on each popup, so the item is added after that.
    #addItem() {
        this.#item?.destroy();
        const id = this.#icon.app.get_id();
        if (!this.#groups.gaps.has(id))
            return;
        const item = this.#groups.createMenuItem(id);
        item.connectObject('destroy', () => {
            this.#item = null;
        }, this);
        this.#item = item;
        this.#menu.addMenuItem(item);
        this.#groups.moveAboveQuit(this.#menu, item);
    }
}
