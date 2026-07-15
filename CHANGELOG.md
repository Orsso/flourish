# Changelog

## 1.0.0

- Renamed D2D Companion to Flourish.
- Flourish uses a new extension UUID. Beta users need to remove D2D Companion
  before installing it, and their settings will not carry over.
- Tested on GNOME Shell 46 to 50, Dash to Dock 90 to 105, and Ubuntu Dock on
  Ubuntu 24.04 and 26.04.

## 0.1.0-beta.5

- Reduced lag during fast pointer sweeps by skipping redundant animations
  and applying neighbor updates once per frame (#5). Special thanks to @rotntake
  for the report, captures, and testing.
- Fixed the neighbor hover dropping for an instant when launching an app.
- Fixed repeated clicks with the Dim press effect fading dock icons out
  for good (#4). Thanks to @rotntake for the report.
- Improved timing and motion in the Settings previews.
- Added an option to keep repeated launch animations at full intensity.
- Fixed missing Dim feedback when it was limited to app launches.

## 0.1.0-beta.4

- Added sliders and live previews for every effect setting in the More page.
- Added an adjustable neighbor hover radius with a linear falloff.
- The Expressive preset now reaches two neighbors.
- Fixed reattaching to Ubuntu Dock after a live toggle.
- Tested on GNOME Shell 46 to 50, Dash to Dock 90 to 105, and Ubuntu Dock
  on Ubuntu 24.04 and 26.04.

## 0.1.0-beta.3

- Added Ubuntu Dock support (#1). Thanks to @0xHertz for the report and
  initial patch.
- Fixed the Dim press effect blurring magnified icons.
- Tested on GNOME Shell 49, and with Ubuntu Dock on Ubuntu 24.04
  (GNOME Shell 46).

## 0.1.0-beta.2

- Added motion on the GNOME overview dash: hover, press, and launch.
- Dash to Dock is now optional.
- Launch animations play out on the desktop while the app starts.
- Hid the stock hover tile on the overview dash.
- Tested on GNOME Shell 49, with and without Dash to Dock.

## 0.1.0-beta.1

- Added Subtle, Lively, Expressive, and Custom profiles.
- Added hover zoom, neighbor response, and press feedback.
- Added Pulse, Bounce, and Stretch launch animations.
- Added a Stock zoom option to the launch effects.
- Added a Dim press effect next to Squash.
- Declared GNOME 47 and 48 support.
- Added settings previews and background controls.
- Tested on GNOME Shell 46 and 49 with Dash to Dock 105.
