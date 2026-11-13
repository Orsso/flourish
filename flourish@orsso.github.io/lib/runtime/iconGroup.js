// A favorite's group item in the icon menu; RowLayout draws the gap.
export class IconGroup {
    #groups;
    #icon;
    #item = null;
    #menu = null;

    constructor({icon, groups}) {
        this.#icon = icon;
        this.#groups = groups;
        // No public accessor for the menu; it exists once the first popup starts.
        icon.connectObject('menu-state-changed', (_icon, open) => {
            if (open)
                this.#watchMenu(icon._menu);
        }, 'destroy', () => this.#menu?.disconnectObject(this), this);
    }

    setGroups(groups) {
        this.#groups = groups;
    }

    dispose() {
        this.#icon.disconnectObject(this);
        this.#menu?.disconnectObject(this);
        this.#menu = null;
        this.#item?.destroy();
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
