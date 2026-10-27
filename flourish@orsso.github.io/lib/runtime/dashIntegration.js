import Shell from 'gi://Shell';
import St from 'gi://St';
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import {Dash} from 'resource:///org/gnome/shell/ui/dash.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {ScreenEdge} from '../motion/catalog.js';
import {FocusHighlight} from './focusHighlight.js';
import {dashSpacing, marginsAlong, pointerOnSurface} from './geometry.js';
import {MotionSurface} from './motionSurface.js';
import {SurfaceOutline} from './surfaceOutline.js';

export class DashIntegration {
    #box = null;
    #highlight = null;
    #injections = null;
    #outline;
    #savedClip = false;
    #scheduler;
    #surface = null;

    constructor({scheduler}) {
        this.#scheduler = scheduler;
        this.#outline = new SurfaceOutline();
    }

    enable(recipe) {
        // A dock extension replaces the dash; its icons belong to the dock integration.
        const dash = Main.overview.dash;
        if (!(dash instanceof Dash))
            return;
        // No public accessor for the icon row.
        const box = dash._box;

        this.#surface = new MotionSurface({
            recipe,
            scheduler: this.#scheduler,
        });
        this.#box = box;
        box.connectObject('destroy', () => {
            this.#box = null;
            this.#highlight = null;
        }, 'notify::allocation', () => this.#surface.invalidateGeometry(), this);
        this.#highlight = new FocusHighlight({
            box,
            tracker: Shell.WindowTracker.get_default(),
        });
        this.#highlight.enable();
        // The dash clips its row; hover motion overflows it.
        this.#savedClip = box.clip_to_allocation;
        box.clip_to_allocation = false;
        this.#surface.addBox(box, ScreenEdge.BOTTOM, {
            pointerActor: dash,
            isAvailable: () => Main.overview.visibleTarget,
            containsPointer: (x, y) => pointerOnSurface(dash, box, x, y, Main.layoutManager.overviewGroup),
            getSpacing: () => dashSpacing(box, Main.layoutManager.primaryMonitor),
            background: dash._background,
            getMonitor: () => Main.layoutManager.primaryMonitor,
            labelOffset: '-y-offset',
        });
        const background = dash._background;
        this.#outline.track(background, () => background.get_theme_node().get_border_radius(St.Corner.TOPLEFT));
        Main.overview.connectObject('hiding', () => this.#surface.clearPointer(), this);
        Main.layoutManager.connectObject('monitors-changed', () => this.#surface.invalidateGeometry(), this);
        this.#surface.refreshStyles();
        // The dash fits its icons without the container margins that group gaps add.
        this.#injections = new InjectionManager();
        this.#injections.overrideMethod(dash, '_adjustIconSize', original => function () {
            const maxWidth = this._maxWidth;
            if (maxWidth !== -1)
                this._maxWidth -= marginsAlong(this._box);
            original.call(this);
            this._maxWidth = maxWidth;
        });
        this.refreshIconSize();
    }

    onPointerMotion(x, y, pen) {
        this.#surface?.onPointerMotion(x, y, pen);
    }

    penLeft() {
        this.#surface?.penLeft();
    }

    holdPointer(owner, held) {
        this.#surface?.holdPointer(owner, held);
    }

    disable() {
        this.#outline.destroy();
        if (!this.#surface)
            return;
        Main.layoutManager.disconnectObject(this);
        Main.overview.disconnectObject(this);
        this.#surface.dispose();
        this.#surface = null;
        this.#injections.clear();
        this.#injections = null;
        if (this.#box) {
            Main.overview.dash._adjustIconSize();
            this.#highlight.disable();
            this.#box.disconnectObject(this);
            this.#box.clip_to_allocation = this.#savedClip;
        }
        this.#highlight = null;
        this.#box = null;
    }

    setRecipe(recipe) {
        this.#surface?.setRecipe(recipe);
    }

    setGroups(groups) {
        this.#surface?.setGroups(groups);
        this.refreshIconSize();
    }

    refreshStyles() {
        this.#surface?.refreshStyles();
    }

    // The dash sizes its icons on redisplay only; a spacing change needs a new pass.
    refreshIconSize() {
        if (this.#box)
            Main.overview.dash._adjustIconSize();
    }

    setOutline(style, intensity, light) {
        this.#outline.setStyle(style, intensity, light);
    }

    getController(appIcon) {
        return this.#surface?.getController(appIcon);
    }

    findIcon(app) {
        return this.#surface?.findIcon(app) ?? null;
    }
}
