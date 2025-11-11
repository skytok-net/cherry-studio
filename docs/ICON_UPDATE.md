# KnowMe Studio Icon Update

## Overview
All application icons have been successfully updated from the Cherry Studio logo to the KnowMe Studio flame logo (`flame_transparent.png`).

## Updated Icon Files

### Application Icons (Build Directory)
All icons in the `build/` directory have been regenerated from the flame source image:

1. **`build/icon.icns`** (1.1 MB) - macOS application icon
2. **`build/icon.ico`** (353 KB) - Windows application icon
3. **`build/icon.png`** (975 KB) - Generic PNG application icon
4. **`build/icons.icns`** (1.6 MB) - Additional macOS icon set
5. **`build/icons.ico`** (422 KB) - Additional Windows icon set
6. **`build/logo.png`** (975 KB) - Application logo

### Tray Icons
System tray icons for all color schemes:

7. **`build/tray_icon.png`** (975 KB) - Default tray icon
8. **`build/tray_icon_dark.png`** (975 KB) - Dark mode tray icon
9. **`build/tray_icon_light.png`** (975 KB) - Light mode tray icon

### Icon Sizes Generated
The icon generation process created multiple sizes in `build/icons/`:
- 16x16, 24x24, 32x32, 48x48, 64x64, 128x128, 256x256, 512x512, 1024x1024

## Source Image
**Source**: `src/renderer/src/assets/images/flame_transparent.png`

This flame icon represents the Prometheus branding and serves as the visual identity for KnowMe Studio.

## Icon Generation Tool
Icons were generated using `electron-icon-builder`:
```bash
npx electron-icon-builder --input=src/renderer/src/assets/images/flame_transparent.png --output=build --flatten
```

## Platform Support
- ✅ **macOS** - ICNS format icons for Dock, Finder, etc.
- ✅ **Windows** - ICO format icons for taskbar, file explorer, etc.
- ✅ **Linux** - PNG format icons for desktop environments

## Verification
To verify the icons are displaying correctly:

1. **Development Mode**: Run `yarn dev` or `npm run dev` and check:
   - Application window icon
   - Dock/taskbar icon
   - System tray icon

2. **Built Application**: After building with `yarn build`, check:
   - Installed application icon
   - File associations
   - System notifications

## Rebuilding Icons
If you need to regenerate icons from a different source image:

```bash
# Update source image
cp /path/to/new/icon.png src/renderer/src/assets/images/flame_transparent.png

# Regenerate all icon formats
npx electron-icon-builder \
  --input=src/renderer/src/assets/images/flame_transparent.png \
  --output=build \
  --flatten

# Copy to tray icons
cp src/renderer/src/assets/images/flame_transparent.png build/tray_icon.png
cp src/renderer/src/assets/images/flame_transparent.png build/tray_icon_dark.png
cp src/renderer/src/assets/images/flame_transparent.png build/tray_icon_light.png

# Copy base files
cp src/renderer/src/assets/images/flame_transparent.png build/icon.png
cp src/renderer/src/assets/images/flame_transparent.png build/logo.png
```

## Notes
- The flame icon uses a transparent background, making it suitable for various UI contexts
- Icon files are referenced in `electron-builder.yml` (buildResources: build)
- macOS requires ICNS format, Windows requires ICO format
- PNG fallbacks are provided for Linux and other platforms
