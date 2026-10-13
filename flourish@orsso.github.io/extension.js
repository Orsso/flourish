import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {GroupGap, OutlineStyle} from './lib/motion/catalog.js';
import {followMoves, groupGaps, migrateAppearance, readActiveRecipe, setGroupGap} from './lib/motion/settings.js';
import {AttentionEngine} from './lib/runtime/attentionEngine.js';
import {DashIntegration} from './lib/runtime/dashIntegration.js';
import {DockIntegration} from './lib/runtime/dockIntegration.js';
import {LaunchEngine} from './lib/runtime/launchEngine.js';
import {BackgroundStyle} from './lib/runtime/backgroundStyle.js';

// In the order of the flags in _syncStyles.
const STYLESHEETS = [
    'dock-hover-background-hidden.css',
    'dash-hover-background-hidden.css',
    'dock-focused-app-background-hidden.css',
    'dash-focused-app-background.css',
    'icon-spacing.css',
    'group-gaps.css',
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

        this._spacingClass = null;
        this._styles = STYLESHEETS.map(cssFileName =>
            new BackgroundStyle({extension: this, cssFileName}));
        this._syncStyles();

        this._attentionEngine = new AttentionEngine({
            getDockContext: icon => this._dockIntegration.getDockContext(icon),
            scheduler: this._frameScheduler,
        });
        this._attentionEngine.enable();

        this._dockIntegration.enable(this._recipe);
        this._dashIntegration.enable(this._recipe);
        this._connectPointer();
        this._favoriteIds = favoriteIds();
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
        this._settings.connectObject('changed', () => {
            // A preset switch writes many keys at once.
            if (this._syncIdleId)
                return;
            this._syncIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                this._syncIdleId = 0;
                this._syncSettings();
                return GLib.SOURCE_REMOVE;
            });
        }, this);
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
        AppFavorites.getAppFavorites().disconnectObject(this);
        this._favoriteIds = null;

        this._launchEngine.disable();
        this._launchEngine = null;
        global.stage.disconnectObject(this);
        Main.overview.disconnectObject(this);
        this._attentionEngine.disable();
        this._attentionEngine = null;
        this._syncSpacing(null);
        for (const style of this._styles)
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
        this._syncGroups();
        if (this._syncStyles())
            this._refreshStyles();
    }

    // The gaps move with the dock's own reordering, pinning and unpinning.
    _onFavoritesChanged() {
        const favorites = favoriteIds();
        const gaps = this._settings.get_value('group-gaps').deep_unpack();
        const followed = followMoves(this._favoriteIds, favorites, gaps);
        this._favoriteIds = favorites;
        if (followed !== gaps)
            this._settings.set_value('group-gaps', new GLib.Variant('a{us}', followed));
        this._syncGroups();
    }

    _syncGroups() {
        const favorites = favoriteIds();
        // Groups off: no gap and no menu switch.
        const gaps = this._settings.get_boolean('groups-enabled')
            ? groupGaps(favorites, this._settings.get_value('group-gaps').deep_unpack()) : new Map();
        const groups = {
            gaps,
            createMenuItem: id => this._createGroupItem(favorites.indexOf(id), gaps.get(id) !== null),
            // Above the Quit block, where hands expect Quit to stay last. By actor:
            // a submenu adds its own child to the box, so menu positions drift.
            moveAboveQuit: (menu, section) => {
                const separator = menu.box.get_children()
                    .findLast(child => child instanceof PopupMenu.PopupSeparatorMenuItem);
                if (separator)
                    menu.box.set_child_below_sibling(section.actor, separator);
            },
        };
        this._dockIntegration.setGroups(groups);
        this._dashIntegration.setGroups(groups);
    }

    _createGroupItem(position, active) {
        const section = new PopupMenu.PopupMenuSection();
        section.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const item = new PopupMenu.PopupSwitchMenuItem(_('Start a group'), active);
        item.connect('toggled', (_item, state) =>
            setGroupGap(this._settings, position, state ? GroupGap.NORMAL : null));
        section.addMenuItem(item);
        return section;
    }

    // The stage covers gaps; native hover signals also refresh the pointer.
    _connectPointer() {
        global.stage.connectObject('motion-event', (_stage, event) => {
            const [x, y] = event.get_coords();
            this._dockIntegration.onPointerMotion(x, y);
            this._dashIntegration.onPointerMotion(x, y);
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
            this._settings.get_string('outline-light'),
        ];
        this._dockIntegration.setOutline(...outline);
        this._dashIntegration.setOutline(...outline);
        const spacing = this._settings.get_int('icon-spacing');
        const customSpacing = this._settings.get_boolean('spacing-enabled');
        // No short-circuit: every sheet must sync.
        const changed = [hideHover, hideHover, backgrounds && !focused, backgrounds && focused, customSpacing, true]
            .map((enabled, index) => this._styles[index].setEnabled(enabled))
            .includes(true);
        // After the sheets: the icon size pass needs the spacing rules loaded.
        this._syncSpacing(customSpacing ? `flourish-spacing-${spacing}` : null);
        return changed;
    }

    // One class on uiGroup selects the spacing rules of the dash and every dock.
    _syncSpacing(name) {
        if (this._spacingClass === name)
            return;
        const group = Main.layoutManager.uiGroup;
        if (this._spacingClass)
            group.remove_style_class_name(this._spacingClass);
        if (name)
            group.add_style_class_name(name);
        this._spacingClass = name;
        this._dashIntegration.refreshIconSize();
    }

    _refreshStyles() {
        this._dockIntegration.refreshStyles();
        this._dashIntegration.refreshStyles();
    }
}

function favoriteIds() {
    return AppFavorites.getAppFavorites().getFavorites().map(app => app.get_id());
}
