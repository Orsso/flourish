import Shell from 'gi://Shell';
import St from 'gi://St';
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import {Dash} from 'resource:///org/gnome/shell/ui/dash.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {ScreenEdge} from '../motion/catalog.js';
import {DASH_ICON_SIZE, Surface, smallHalo} from '../motion/dockLayout.js';
import {FocusHighlight} from './focusHighlight.js';
import {dashSpacing, pointerOnSurface, withoutRowMargins} from './geometry.js';
import {MotionSurface} from './motionSurface.js';
import {RowLayout} from './rowLayout.js';
import {SurfaceOutline} from './surfaceOutline.js';

const SMALL_HALO_CLASS = 'flourish-small-halo-dash';

export class DashIntegration {
    #box = null;
    #highlight = null;
    #injections = null;
    // Null before enable() and once the dash destroys its row.
    #layout = null;
    #markFocused = false;
    #outline;
    #savedClip = false;
    #scheduler;
    #spacing = null;
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
        if (this.#markFocused)
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
        this.#injections = new InjectionManager();
        this.#injections.overrideMethod(dash, '_adjustIconSize', original => withoutRowMargins(original, true));
        this.#layout = new RowLayout({
            dash,
            edge: ScreenEdge.BOTTOM,
            surface: Surface.DASH,
            scheduler: this.#scheduler,
            // The dash sizes its icons on redisplay only.
            onChanged: () => dash._adjustIconSize(),
            onDestroyed: () => {
                this.#layout = null;
            },
        });
        this.#layout.update(this.#spacing, DASH_ICON_SIZE);
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
        Main.layoutManager.uiGroup.remove_style_class_name(SMALL_HALO_CLASS);
        this.#outline.destroy();
        if (!this.#surface)
            return;
        this.#layout?.dispose();
        this.#layout = null;
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
        this.#layout?.setGroups(groups);
    }

    refreshStyles() {
        this.#surface?.refreshStyles();
    }

    // Null when Icon Spacing is off.
    setSpacing(spacing) {
        this.#spacing = spacing;
        if (spacing !== null && smallHalo(DASH_ICON_SIZE, spacing.gap))
            Main.layoutManager.uiGroup.add_style_class_name(SMALL_HALO_CLASS);
        else
            Main.layoutManager.uiGroup.remove_style_class_name(SMALL_HALO_CLASS);
        this.#layout?.update(spacing, DASH_ICON_SIZE);
    }

    // The class draws other extensions' styles (#15), so only while the mark is wanted.
    setFocusMark(marked) {
        if (this.#markFocused === marked)
            return;
        this.#markFocused = marked;
        if (marked)
            this.#highlight?.enable();
        else
            this.#highlight?.disable();
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
