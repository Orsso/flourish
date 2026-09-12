import Graphene from 'gi://Graphene';
import Shell from 'gi://Shell';
import {Dash} from 'resource:///org/gnome/shell/ui/dash.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {ScreenEdge} from '../motion/catalog.js';
import {FocusHighlight} from './focusHighlight.js';
import {MotionSurface} from './motionSurface.js';

export class DashIntegration {
    #box = null;
    #continuous = false;
    #highlight = null;
    #point = null;
    #savedClip = false;
    #scheduler;
    #surface = null;

    constructor({scheduler, continuous = false}) {
        this.#scheduler = scheduler;
        this.#continuous = continuous;
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
            continuous: this.#continuous,
            scheduler: this.#scheduler,
        });
        this.#box = box;
        box.connectObject('destroy', () => {
            this.#box = null;
            this.#highlight = null;
        }, this);
        if (this.#continuous)
            this.#hookMotion();
        this.#highlight = new FocusHighlight({
            box,
            tracker: Shell.WindowTracker.get_default(),
        });
        this.#highlight.enable();
        // The dash clips its row; hover motion overflows it.
        this.#savedClip = box.clip_to_allocation;
        box.clip_to_allocation = false;
        this.#surface.addBox(box, ScreenEdge.BOTTOM);
        this.#surface.refreshStyles();
    }

    // The stage sees every pointer motion, gaps included. This gjs binding
    // fills a GraphenePoint out arg instead of returning [x, y].
    #hookMotion() {
        if (!this.#surface)
            return;
        this.#point = new Graphene.Point();
        global.get_stage().connectObject('motion-event',
            (_stage, event) => {
                event.get_position(this.#point);
                this.#surface.onPointerMotion(this.#point.x, this.#point.y);
            }, this);
    }

    #unhookMotion() {
        if (!this.#point)
            return;
        global.get_stage().disconnectObject(this);
        this.#point = null;
    }

    // The hover-mode key flips mid session; classic pays no stage cost.
    setContinuous(on) {
        if (on === this.#continuous)
            return;
        this.#continuous = on;
        if (this.#surface)
            this.#surface.setContinuous(on);
        if (on)
            this.#hookMotion();
        else
            this.#unhookMotion();
    }

    disable() {
        if (!this.#surface)
            return;
        this.#surface.dispose();
        this.#surface = null;
        this.#unhookMotion();
        if (this.#box) {
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

    refreshStyles() {
        this.#surface?.refreshStyles();
    }

    // Spike: synthetic pointer injection for the headless probe.
    injectPointerMotion(x, y) {
        this.#surface?.onPointerMotion(x, y);
    }

    get surfaceCounters() {
        return this.#surface?.counters ?? null;
    }

    getController(appIcon) {
        return this.#surface?.getController(appIcon);
    }
}
