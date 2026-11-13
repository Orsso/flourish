#!/usr/bin/env bash
set -euo pipefail

archive=${1:?archive path is required}
contents=$(unzip -Z1 "$archive")

required=(
    LICENSE
    README.md
    extension.js
    lib/motion/catalog.js
    lib/motion/continuum.js
    lib/motion/outline.js
    lib/motion/settings.js
    lib/motion/transforms.js
    lib/prefs/animationPages.js
    lib/prefs/appearancePage.js
    lib/prefs/demoSequence.js
    lib/prefs/dockSample.js
    lib/prefs/motionPreview.js
    lib/prefs/rows.js
    lib/runtime/attentionEngine.js
    lib/runtime/dashIntegration.js
    lib/runtime/deferredLaunchEnds.js
    lib/runtime/dockIntegration.js
    lib/runtime/dockOverflow.js
    lib/runtime/dockVisibility.js
    lib/runtime/focusHighlight.js
    lib/runtime/geometry.js
    lib/runtime/iconClone.js
    lib/runtime/iconDecorations.js
    lib/runtime/iconDim.js
    lib/runtime/iconFollower.js
    lib/runtime/iconGroup.js
    lib/runtime/iconMotionController.js
    lib/runtime/launchEngine.js
    lib/runtime/liveRegistry.js
    lib/runtime/motionSurface.js
    lib/runtime/stylesheet.js
    lib/runtime/surfaceOutline.js
    metadata.json
    prefs.js
    schemas/org.gnome.shell.extensions.flourish.gschema.xml
    dock-hover-background-hidden.css
    dock-focused-app-background-hidden.css
    dash-hover-background-hidden.css
    dash-focused-app-background.css
    stylesheet.css
)

for path in "${required[@]}"; do
    if ! unzip -Z1 "$archive" "$path" >/dev/null; then
        printf 'Missing package file: %s\n' "$path" >&2
        exit 1
    fi
done

while IFS= read -r path; do
    case "$path" in
        dist/*|docs/*|node_modules/*|scripts/*|tests/*|*/gschemas.compiled)
            printf 'Development-only package file: %s\n' "$path" >&2
            exit 1
            ;;
    esac
done <<<"$contents"
