<p align="center">
  <img src="assets/flourish-app-icon.svg" width="160" alt="Flourish icon">
</p>

<h1 align="center">Flourish</h1>

<p align="center"><sub>Formerly D2D Companion.</sub></p>

<p align="center">
  <a href="#compatibility"><img alt="GNOME Shell 46–51" src="https://img.shields.io/badge/GNOME%20Shell-46--51-4A86CF?style=flat-square&amp;logo=gnome&amp;logoColor=white"></a>
  <a href="LICENSE"><img alt="License: GPL-2.0-or-later" src="https://img.shields.io/badge/License-GPL--2.0--or--later-E95420?style=flat-square"></a>
</p>

Flourish adds motion to the GNOME dash so it feels more alive and more
satisfying to use. It stays light, and the dash works as before.

https://github.com/user-attachments/assets/2a218e67-96bf-4272-882a-71b7be4305e0

## Features

- Magnification on hover, and animations for clicks, app launches, and
  apps that ask for attention on a dock.
- A Style tab, in beta, for icon spacing, groups of favorites, an outline,
  and a dock flush with the screen edge.
- Works on the overview dash, Dash to Dock, and Ubuntu Dock.

Everything starts off. Pick Subtle, Lively, or Expressive, or turn on each
part in the preferences.

## How it works

Flourish drives the icons from the signals they already emit and replaces the
stock launch zoom. Icons load at twice their resolution to stay sharp when
magnified. Everything is restored on disable. Nothing runs while the dash sits
still.

It relies on these private or undocumented members:

- GNOME Shell: the dash's `_box`, `_background`, `_showAppsIcon`, `_maxWidth`
  and `_adjustIconSize`, each icon's `_iconBin`, `_createIconTexture` and
  `_menu`, and the window manager's `_getNthFavoriteApp`.
- Dash to Dock: `_allDocks`, each dock's `monitorIndex`, `position` and
  `_themeManager._transparency` (`_updateStyles`, `_base_actor_style`), each
  dash's `_box`, `_background`, `_dashContainer`, `_showAppsIcon`, `_maxWidth`,
  `_maxHeight`, `_isHorizontal` and `_adjustIconSize`, the slider's `slide-x`,
  the manager's settings, the icons' `urgent` and `focused` flags and `_menu`,
  and `iconAnimator`, to replace the urgent wiggle.
- Blur My Shell: `is_static`, and `dash`, `background` and `background_group`
  in `global.blur_my_shell._dash_to_dock_blur.dashes`, and the corner radius
  of the blur effect (`supports_corner_radius`, `corner_radius`).

On a dock, magnified icons overflow through a wider clip and the background
follows the wave. The Style tab sets the icon margins as inline style,
computed from the icon size, so it wins over other extensions' stylesheets.
Group gaps are icon margins too, and each app menu gets one item for groups.

## Known limitations

- With Layout on, Dash to Dock's Shrink the dash option has no effect.
- With Blur My Shell 76, the static dock blur lags a few pixels behind
  magnified icons. Version 78 does not.

## Compatibility

Tested with GNOME Shell 46 to 51, Dash to Dock 110, Ubuntu Dock on Ubuntu
24.04 and 26.04, and Blur My Shell 76 and 78. Other setups may work, but I
have not tested them.

## Install

Download the `.shell-extension.zip` file from the
[GitHub release](https://github.com/Orsso/flourish/releases), then run:

```bash
gnome-extensions install --force flourish@orsso.github.io.shell-extension.zip
```

Log out and back in, then enable Flourish from the Extensions application.

To try the development version instead, clone the repository and run
`make install` before logging out. Copying the source folder by hand leaves
the settings schema uncompiled.

With Dash to Dock or Ubuntu Dock enabled, the motion goes to the dock;
without them, to the overview dash.

## Development

```bash
npm ci
make check
make pack
```

`make check` runs lint, tests, package checks, and schema checks. `make pack`
runs them and builds the installable archive.

Contributions are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) has a short map
of the code.

Licensed under GPL-2.0-or-later.

<p align="center"><sub>With thanks to everyone who keeps GNOME moving.</sub></p>
