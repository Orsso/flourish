# Contributing

Flourish is a small GNOME Shell extension. Keep changes small and
readable.

## Setup

Install GNOME Shell development tools, GJS, Node.js, `zip`, and `unzip`, then:

```bash
npm ci
make check
```

`make pack` builds the archive, `make install` installs it locally. The tests
run headless. Anything that touches the dock or the overview dash has to be
tried in a real session.

## Code Map

- `lib/motion/` has the presets and transform math.
- `lib/runtime/` wires them into the shell:
- `DockIntegration` talks to Dash to Dock and Ubuntu Dock; `DashIntegration`
  hooks the built-in overview dash. Both hand their icon box to `MotionSurface`.
- `MotionSurface` turns one box of icons into controllers.
- `IconMotionController` handles one icon.
- `LaunchEngine` handles launch clones and repeat timing.
- `prefs.js` builds the settings window.

Prefer plain functions unless something really owns state or cleanup.

## Adding a Motion Effect

Launch and press effects are small pure functions in
`lib/motion/transforms.js`. The easiest way to add one is to copy an existing
one (`bounceSegments()` for a launch effect, an entry of `PRESS_EFFECTS` for
a press effect) and grep for its name: the enum in `catalog.js`, the nick in
the schema, the dropdown in `prefs.js`, and a test in
`tests/transforms.test.js` are the only places to touch.

The preview cards only play the presets, so try a new effect through the
Custom profile in a real session.

## Translations

The preferences strings are marked for gettext. `make pot` refreshes
`flourish@orsso.github.io/po/flourish.pot`. To add a language,
copy it to `po/<lang>.po` next to it, fill it in, and open a pull request.
The build compiles `po/*.po` on its own.

## Reporting a Bug

Please include what you did, what happened, and the output of:

```bash
gnome-shell --version
gnome-extensions info dash-to-dock@micxgx.gmail.com
gnome-extensions info flourish@orsso.github.io
journalctl --user -b --no-pager | rg 'flourish|JS ERROR|CRITICAL'
```

On Ubuntu Dock, use `ubuntu-dock@ubuntu.com` instead of the Dash to Dock
id. Without either dock, skip that line.

Mention whether it also happens with other extensions and custom themes
disabled. That helps a lot for visual bugs.
