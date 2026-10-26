#!/bin/sh
# Generates the app icons from the resources/icon.svg file.
#
# The 256x256 icon is stored as PNG data in the ICO file to keep it small.
#
# Writes PNG files at each Linux icon size to resources/icons/, the
# resources/icon.ico file for Windows, and the resources/icon.icns file for
# macOS. The generated files are checked in, so installer builds don't need
# these tools.
#
# Requires rsvg-convert (librsvg2-bin), icotool (icoutils), and png2icns
# (icnsutils).
set -eu

cd "$(dirname "$0")/.."
src=resources/icon.svg
out=resources/icons
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$out"
for size in 16 24 32 48 64 128 256 512 1024; do
  rsvg-convert -w "$size" -h "$size" "$src" -o "$out/${size}x${size}.png"
done
cp "$out/1024x1024.png" resources/icon-1024.png
cp "$out/512x512.png" resources/icon.png

icotool -c -o resources/icon.ico \
  "$out/16x16.png" "$out/24x24.png" "$out/32x32.png" "$out/48x48.png" \
  "$out/64x64.png" "$out/128x128.png" -r "$out/256x256.png"

# png2icns accepts only the sizes that the ICNS format defines.
png2icns resources/icon.icns \
  "$out/16x16.png" "$out/32x32.png" "$out/48x48.png" "$out/128x128.png" \
  "$out/256x256.png" "$out/512x512.png" "$out/1024x1024.png" >/dev/null

echo "Wrote $out/, resources/icon.ico, and resources/icon.icns."
