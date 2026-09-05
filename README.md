<p align="center">
  <img src="assets/flourish-app-icon.svg" width="160" alt="Flourish icon">
</p>

<h1 align="center">Flourish</h1>

<p align="center"><sub>Formerly D2D Companion.</sub></p>

<p align="center">
  <a href="#compatibility"><img alt="GNOME Shell 46–50" src="https://img.shields.io/badge/GNOME%20Shell-46--50-4A86CF?style=flat-square&amp;logo=gnome&amp;logoColor=white"></a>
  <a href="LICENSE"><img alt="License: GPL-2.0-or-later" src="https://img.shields.io/badge/License-GPL--2.0--or--later-E95420?style=flat-square"></a>
</p>

A small extension that adds a bit of motion to the GNOME dash. Icons respond
to hover and press, and animate when an app launches. It also works with
[Dash to Dock](https://extensions.gnome.org/extension/307/dash-to-dock/) and
Ubuntu Dock.

GNOME Shell and the dock keep doing their usual jobs. Flourish takes care of
the moving bits.

https://github.com/user-attachments/assets/2a218e67-96bf-4272-882a-71b7be4305e0

## How it works

Flourish listens to the signals the dash icons already emit and animates
them from there. It overrides the stock launch zoom and loads the dash
icons at twice their resolution so they stay sharp when magnified.
It reaches into four private members to do so. `_box` is the icon row of
the dash, `_iconBin` and `_createIconTexture` belong to each icon, and
`_allDocks` is the list of docks Dash to Dock keeps.
With Dash to Dock it also reads a few public but undocumented members:
the `urgent` and `focused` flags of each icon, the dock's `monitorIndex`,
the dock manager's settings, and the dash's `iconAnimator`, whose urgent
wiggle Flourish replaces with its own attention animation.
Everything is restored when the extension is disabled.

## Compatibility

Flourish declares support for GNOME Shell 46 to 50.

This release was tested with:

- GNOME Shell 46, 47, 48, 49, and 50
- Dash to Dock 90 to 105
- Ubuntu Dock on Ubuntu 24.04 and 26.04

Other setups may work, but I have not tested them for this release.

## Install

If you used a D2D Companion beta, remove it before installing.
Flourish uses a new UUID, so the old settings will **not** carry over.

Download the `.shell-extension.zip` file from the
[GitHub release](https://github.com/Orsso/flourish/releases), then run:

```bash
gnome-extensions install --force flourish@orsso.github.io.shell-extension.zip
```

Log out and back in, then enable Flourish from the Extensions application.

To try the development version instead, clone the repository and run
`make install` before logging out. Copying the source folder by hand leaves
the settings schema uncompiled.

With Dash to Dock or Ubuntu Dock enabled, the motion goes to the dock; without them, to the
overview dash.

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
