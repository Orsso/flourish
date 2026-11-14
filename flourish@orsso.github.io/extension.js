import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {GroupGap, OutlineStyle} from './lib/motion/catalog.js';
import {
    groupGaps, migrateAppearance, passGaps, readActiveRecipe, readGroupGaps, setGroupGap, writeGroupGaps,
} from './lib/motion/settings.js';
import {AttentionEngine} from './lib/runtime/attentionEngine.js';
import {DashIntegration} from './lib/runtime/dashIntegration.js';
import {DockIntegration} from './lib/runtime/dockIntegration.js';
import {LaunchEngine} from './lib/runtime/launchEngine.js';
import {Stylesheet} from './lib/runtime/stylesheet.js';

// The Shell loads stylesheet.css itself, for the whole time Flourish is enabled.
const STYLESHEETS = [
    'dock-hover-background-hidden.css',
    'dash-hover-background-hidden.css',
    'dock-focused-app-background-hidden.css',
    'dash-focused-app-background.css',
];

export default class FlourishExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        migrateAppearance(this._settings);
        this._recipe = readActiveRecipe(this._settings);

        const laters = global.compositor.get_laters();
        this._frameScheduler = {
            schedule: callback => laters.add(Meta.LaterType.BEFORE_REDRAW, () => {
                callback();
                return false;
            }),
            cancel: id => laters.remove(id),
        };

        this._dockIntegration = new DockIntegration({
            scheduler: this._frameScheduler,
            // Ubuntu Dock rebuilds its icons while disable() unloads the stylesheets.
            onUrgentChanged: (controller, urgent) =>
                this._attentionEngine?.onUrgentChanged(controller, urgent),
        });
        this._dashIntegration = new DashIntegration({
            scheduler: this._frameScheduler,
        });

        this._spacingClasses = [];
        this._styles = Object.fromEntries(STYLESHEETS.map(name => [name, new Stylesheet(this.dir.get_child(name))]));
        this._syncStyles();

        this._attentionEngine = new AttentionEngine({
            getDockContext: icon => this._dockIntegration.getDockContext(icon),
            scheduler: this._frameScheduler,
        });
        this._attentionEngine.enable();

        this._dockIntegration.enable(this._recipe);
        this._dashIntegration.enable(this._recipe);
        this._connectPointer();
        this._favoriteIds = pinnedIds();
        this._syncGroups();
        AppFavorites.getAppFavorites().connectObject('changed', () => this._onFavoritesChanged(), this);

        this._launchEngine = new LaunchEngine({
            getController: icon =>
                this._dockIntegration.getController(icon) ??
                this._dashIntegration.getController(icon),
            getDockContext: icon => this._dockIntegration.getDockContext(icon),
            findIcon: app =>
                this._dockIntegration.findIcon(app) ??
                this._dashIntegration.findIcon(app),
            scheduler: this._frameScheduler,
            beforeLaunch: icon => this._attentionEngine.interrupt(icon),
        });
        this._launchEngine.enable();

        this._syncIdleId = 0;
        this._settings.connectObject(
            'changed', () => {
                // A preset switch writes many keys at once.
                if (this._syncIdleId)
                    return;
                this._syncIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                    this._syncIdleId = 0;
                    this._syncSettings();
                    return GLib.SOURCE_REMOVE;
                });
            },
            'changed::groups-enabled', () => this._syncGroups(),
            'changed::group-gaps', () => this._syncGroups(), this);
        // Same recipe, new transform: it depends on the animations setting.
        St.Settings.get().connectObject('notify::enable-animations', () => {
            this._dockIntegration.setRecipe(this._recipe);
            this._dashIntegration.setRecipe(this._recipe);
        }, this);
    }

    disable() {
        if (this._syncIdleId) {
            GLib.source_remove(this._syncIdleId);
            this._syncIdleId = 0;
        }
        this._settings.disconnectObject(this);
        St.Settings.get().disconnectObject(this);

        this._launchEngine.disable();
        this._launchEngine = null;
        AppFavorites.getAppFavorites().disconnectObject(this);
        this._favoriteIds = null;
        global.stage.disconnectObject(this);
        Main.overview.disconnectObject(this);
        this._attentionEngine.disable();
        this._attentionEngine = null;
        this._syncSpacing([]);
        this._spacingClasses = null;
        for (const style of Object.values(this._styles))
            style.disable();
        this._styles = null;
        // Dock widgets restyle through the controllers, so before those go.
        this._refreshStyles();
        this._dashIntegration.disable();
        this._dashIntegration = null;
        this._dockIntegration.disable();
        this._dockIntegration = null;
        this._frameScheduler = null;
        this._recipe = null;
        this._settings = null;
    }

    _syncSettings() {
        this._recipe = readActiveRecipe(this._settings);
        this._dockIntegration.setRecipe(this._recipe);
        this._dashIntegration.setRecipe(this._recipe);
        if (this._syncStyles())
            this._refreshStyles();
    }

    // The pinned list, not the installed one: an app missing for a while moves no gap.
    _onFavoritesChanged() {
        const pinned = pinnedIds();
        const gaps = readGroupGaps(this._settings);
        const passed = passGaps(this._favoriteIds, pinned, gaps);
        this._favoriteIds = pinned;
        if (passed !== gaps)
            writeGroupGaps(this._settings, passed);
        this._syncGroups();
    }

    _syncGroups() {
        const favorites = installedFavoriteIds();
        // Groups off: no gap and no menu item.
        const gaps = this._settings.get_boolean('groups-enabled')
            ? groupGaps(favorites, readGroupGaps(this._settings)) : new Map();
        const groups = {
            gaps,
            createMenuItem: id => this._createGroupItem(id, gaps.get(id)),
            moveAboveQuit,
        };
        this._dockIntegration.setGroups(groups);
        this._dashIntegration.setGroups(groups);
    }

    // One item: the first app of a group merges it into the previous one, any other starts one.
    _createGroupItem(id, gap) {
        const section = new PopupMenu.PopupMenuSection();
        section.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        section.addAction(gap ? _('Merge with Previous Group') : _('Start New Group Here'),
            () => setGroupGap(this._settings, id, gap ? null : GroupGap.NORMAL));
        return section;
    }

    // The stage covers gaps; native hover signals also refresh the pointer.
    _connectPointer() {
        global.stage.connectObject(
            'motion-event', (_stage, event) => {
                const [x, y] = event.get_coords();
                const pen = event.get_device_tool() !== null;
                this._dockIntegration.onPointerMotion(x, y, pen);
                this._dashIntegration.onPointerMotion(x, y, pen);
                return Clutter.EVENT_PROPAGATE;
            },
            'event', (_stage, event) => {
                if (event.type() === Clutter.EventType.PROXIMITY_OUT) {
                    this._dockIntegration.penLeft();
                    this._dashIntegration.penLeft();
                }
                return Clutter.EVENT_PROPAGATE;
            }, this);
        const holdDrag = held => {
            this._dockIntegration.holdPointer(Main.overview, held);
            this._dashIntegration.holdPointer(Main.overview, held);
        };
        Main.overview.connectObject(
            'item-drag-begin', () => holdDrag(true),
            'item-drag-end', () => holdDrag(false), this);
    }

    _syncStyles() {
        // Each switch off leaves that part to the dash, the dock or the theme.
        const backgrounds = this._settings.get_boolean('backgrounds-enabled');
        const hideHover = backgrounds && !this._settings.get_boolean('show-hover-background');
        const focused = this._settings.get_boolean('show-focused-app-background');
        const outline = [
            this._settings.get_boolean('outline-enabled')
                ? this._settings.get_string('dock-outline') : OutlineStyle.NONE,
            this._settings.get_int('outline-intensity'),
            this._settings.get_int('outline-light'),
        ];
        this._dockIntegration.setOutline(...outline);
        this._dashIntegration.setOutline(...outline);
        this._dashIntegration.setFocusMark(backgrounds && focused);
        const sheets = {
            'dock-hover-background-hidden.css': hideHover,
            'dash-hover-background-hidden.css': hideHover,
            'dock-focused-app-background-hidden.css': backgrounds && !focused,
            'dash-focused-app-background.css': backgrounds && focused,
        };
        // No short-circuit: every sheet must sync.
        const changed = Object.entries(sheets)
            .map(([name, enabled]) => this._styles[name].setEnabled(enabled))
            .includes(true);
        const spacing = this._settings.get_boolean('spacing-enabled') ? {
            gap: this._settings.get_double('spacing-gap'),
            across: this._settings.get_double('spacing-across'),
            ends: this._settings.get_double('spacing-ends'),
        } : null;
        // Before the rows: their next pass reads the background margins the flush rule sets.
        const flush = this._settings.get_boolean('dock-flush') ? ['flourish-flush'] : [];
        this._syncSpacing(spacing ? ['flourish-spacing', ...flush] : []);
        this._dockIntegration.setSpacing(spacing);
        this._dashIntegration.setSpacing(spacing);
        return changed;
    }

    // Classes on uiGroup select the fixed rules of stylesheet.css.
    _syncSpacing(names) {
        if (names.join() === this._spacingClasses.join())
            return;
        const group = Main.layoutManager.uiGroup;
        for (const name of this._spacingClasses)
            group.remove_style_class_name(name);
        for (const name of names)
            group.add_style_class_name(name);
        this._spacingClasses = names;
    }

    _refreshStyles() {
        this._dockIntegration.refreshStyles();
        this._dashIntegration.refreshStyles();
    }
}

function installedFavoriteIds() {
    return AppFavorites.getAppFavorites().getFavorites().map(app => app.get_id());
}

function pinnedIds() {
    return global.settings.get_strv('favorite-apps');
}

// Above the last separator so Quit stays last; by actor, as a submenu shifts the box indices.
function moveAboveQuit(menu, section) {
    const separator = menu.box.get_children().findLast(child => child instanceof PopupMenu.PopupSeparatorMenuItem);
    if (separator)
        menu.box.set_child_below_sibling(section.actor, separator);
}
