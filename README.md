<p align="center">
  <img src="assets/flourish-app-icon.svg" width="160" alt="Flourish icon">
</p>

<h1 align="center">Flourish</h1>

<p align="center"><sub>Formerly D2D Companion.</sub></p>

A small extension that adds a bit of motion to the GNOME dash. Icons respond
to hover and press, and animate when an app launches. It also works with
[Dash to Dock](https://extensions.gnome.org/extension/307/dash-to-dock/) and
Ubuntu Dock.

GNOME Shell and the dock keep doing their usual jobs. Flourish takes care of
the moving bits.

https://github.com/user-attachments/assets/764133e1-9f49-414c-8291-f9e08ff26cf6

## How it works

Hover and press feedback only listen to signals the icons already
emit. The launch animation is the one exception: it overrides
`AppIcon.animateLaunch` (the stock zoom) through GNOME Shell's official
`InjectionManager`, and restores it when the extension is disabled.
The built-in dash clips its icons; the extension lifts that while it runs
and puts it back. Nothing else in the Shell or in the dock is patched.

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

With Dash to Dock or Ubuntu Dock enabled, the motion goes to the dock; without them, to the
overview dash.

## Development

```bash
npm ci
make check
make pack
```

`make check` runs lint, tests, package checks, and schema checks. `make pack`
builds the installable archive.

Contributions are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) has a short map
of the code.

Licensed under GPL-2.0-or-later.

<p align="center"><sub>With thanks to everyone who keeps GNOME moving.</sub></p>
