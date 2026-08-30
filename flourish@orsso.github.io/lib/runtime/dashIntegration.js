import {Dash} from 'resource:///org/gnome/shell/ui/dash.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {DockPosition} from '../motion/catalog.js';
import {MotionSurface} from './motionSurface.js';

export class DashIntegration {
    #box = null;
    #savedClip = false;
    #scheduler;
    #surface = null;

    constructor({scheduler}) {
        this.#scheduler = scheduler;
    }

    enable(recipe) {
        // A dock extension replaces the dash; its icons belong to the dock integration.
        const dash = Main.overview.dash;
        if (!(dash instanceof Dash))
            return;
        // No public accessor for the icon row.
        const box = dash._box;
        if (!box) {
            console.warn('[flourish] the overview dash has no icon box; dash motion is off');
            return;
        }

        this.#surface = new MotionSurface({
            recipe,
            scheduler: this.#scheduler,
        });
        this.#box = box;
        box.connectObject('destroy', () => {
            this.#box = null;
        }, this);
        // The dash clips its row; hover motion overflows it.
        this.#savedClip = box.clip_to_allocation;
        box.clip_to_allocation = false;
        this.#surface.addBox(box, DockPosition.BOTTOM);
        this.#surface.refreshStyles();
    }

    disable() {
        if (!this.#surface)
            return;
        this.#surface.dispose();
        this.#surface = null;
        if (this.#box) {
            this.#box.disconnectObject(this);
            this.#box.clip_to_allocation = this.#savedClip;
        }
        this.#box = null;
    }

    setRecipe(recipe) {
        this.#surface?.setRecipe(recipe);
    }

    refreshStyles() {
        this.#surface?.refreshStyles();
    }

    getController(appIcon) {
        return this.#surface?.getController(appIcon);
    }
}
