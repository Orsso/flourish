#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
source_dir=$(find "$repo_root" -maxdepth 1 -type d -name 'flourish@*' -print -quit)
work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT

mkdir -p "$work_dir/contents"
cp -R "$source_dir"/. "$work_dir/contents/"
cp "$repo_root/README.md" "$work_dir/contents/README.md"
cp "$repo_root/LICENSE" "$work_dir/contents/LICENSE"
rm -f "$work_dir/contents/schemas/gschemas.compiled"

(cd "$work_dir/contents" && zip -qr "$work_dir/extension.zip" .)
bash "$repo_root/scripts/verify-package.sh" "$work_dir/extension.zip"

zip -qd "$work_dir/extension.zip" lib/prefs/demoSequence.js
if bash "$repo_root/scripts/verify-package.sh" "$work_dir/extension.zip" 2>/dev/null; then
    printf 'Package verifier accepted an archive without demoSequence.js\n' >&2
    exit 1
fi

for css in hover-background-hidden.css focused-app-background-hidden.css dash-hover-background-hidden.css; do
    (cd "$work_dir/contents" && zip -qr "$work_dir/$css.zip" .)
    zip -qd "$work_dir/$css.zip" "$css"
    if bash "$repo_root/scripts/verify-package.sh" "$work_dir/$css.zip" 2>/dev/null; then
        printf 'Package verifier accepted an archive without %s\n' "$css" >&2
        exit 1
    fi
done
