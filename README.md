<p align="center">
  <img src="assets/flourish-app-icon.svg" width="160" alt="Flourish icon">
</p>

<h1 align="center">Flourish</h1>

<p align="center"><sub>Formerly D2D Companion.</sub></p>

<p align="center">
  <a href="#compatibility"><img alt="GNOME Shell 46–51" src="https://img.shields.io/badge/GNOME%20Shell-46--51-4A86CF?style=flat-square&amp;logo=gnome&amp;logoColor=white"></a>
  <a href="LICENSE"><img alt="License: GPL-2.0-or-later" src="https://img.shields.io/badge/License-GPL--2.0--or--later-E95420?style=flat-square"></a>
</p>

An extension that adds motion to the GNOME dash. Icons magnify as the
pointer moves along it, react to clicks, and animate when an app launches
or asks for attention. It also works with
[Dash to Dock](https://extensions.gnome.org/extension/307/dash-to-dock/) and
Ubuntu Dock.

GNOME Shell and the dock keep doing their usual jobs. Flourish takes care of
the moving bits.

https://github.com/user-attachments/assets/2a218e67-96bf-4272-882a-71b7be4305e0

## How it works

Flourish animates the dash icons from the signals they already emit and
replaces the stock launch zoom. Icons load at twice their resolution so
they stay sharp when magnified. Everything is restored on disable.

It relies on a few private or undocumented members:

- GNOME Shell: the dash's `_box`, `_background`, `_maxWidth` and
  `_adjustIconSize`, each icon's `_iconBin`, `_createIconTexture` and `_menu`,
  and the window manager's `_getNthFavoriteApp`.
- Dash to Dock: `_allDocks`, each dock's `monitorIndex` and `position`, the
  slider's `slide-x`, the manager's settings, the icons' `urgent` and
  `focused` flags and `_menu`, and `iconAnimator`, to replace the urgent
  wiggle.
- Blur My Shell: `is_static`, and `dash`, `background` and
  `background_group` in `global.blur_my_shell._dash_to_dock_blur.dashes`,
  plus the corner radius of that background's blur effect
  (`supports_corner_radius`, `corner_radius`).

On a dock, magnified icons overflow through a wider clip, a paint and pick
effect on the scroll view, and detached scroll adjustments while the row
fits. The background follows the wave through a layout constraint.

The outline is drawn inside the dash or dock background. Group gaps are icon
margins, which the dash's `_adjustIconSize` takes into account. App menus get
one extra item for groups.

## Compatibility

Flourish declares support for GNOME Shell 46 to 51.

This release was tested with:

- GNOME Shell 46, 50, and 51
- Dash to Dock 109
- Ubuntu Dock on Ubuntu 24.04 and 26.04

Other setups may work, but I have not tested them for this release.

With Blur My Shell, the dock blur follows magnification
(tested with version 76).

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
