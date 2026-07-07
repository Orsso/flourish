# Flourish

<sub>Formerly D2D Companion.</sub>

A small extension that animates the GNOME dash with hover zoom, press
feedback, and launch animations. Dash to Dock and Ubuntu Dock are supported
out of the box.

https://github.com/user-attachments/assets/764133e1-9f49-414c-8291-f9e08ff26cf6

<sub>In the video: [Blur My Shell](https://extensions.gnome.org/extension/3193/blur-my-shell/),
[Compiz alike magic lamp effect](https://extensions.gnome.org/extension/3740/compiz-alike-magic-lamp-effect/),
[Dynamic Music Pill](https://extensions.gnome.org/extension/9334/dynamic-music-pill/),
[GNOME macOS Tahoe theme](https://github.com/kayozxo/GNOME-macOS-Tahoe).</sub>

It is a companion, not a dock. The Shell or the dock does the dock work.
This adds the motion, and puts everything back when turned off.

## How it works

Hover and press feedback only listen to signals the icons already
emit. The launch animation is the one exception: it overrides
`AppIcon.animateLaunch` (the stock zoom) through GNOME Shell's official
`InjectionManager`, and restores it when the extension is disabled.
The built-in dash clips its icons; the extension lifts that while it runs
and puts it back. Nothing else in the Shell or in the dock is patched.

## Compatibility

Flourish declares support for GNOME Shell 46 to 50.

This beta was tested with:

- GNOME Shell 46, 47, 48, 49, and 50
- Dash to Dock 90 to 105
- Ubuntu Dock on Ubuntu 24.04 and 26.04

Other setups may work, but I have not tested them for this release.

## Install

Nothing else is required. With
[Dash to Dock](https://extensions.gnome.org/extension/307/dash-to-dock/)
or Ubuntu Dock enabled, the motion goes to the dock; without them, to the
overview dash.

Download the `.shell-extension.zip` file from the
[GitHub release](https://github.com/Orsso/d2d-companion/releases), then run:

```bash
gnome-extensions install --force flourish@orsso.github.io.shell-extension.zip
```

Log out and back in, then enable Flourish from the Extensions application.

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
