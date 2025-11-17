const { chmod, stat, readdir } = require('fs/promises')
const { join } = require('path')
const { platform } = require('os')

/**
 * electron-builder afterPack hook to ensure esbuild binaries are executable
 * This runs DURING packaging, not at runtime
 *
 * @param {object} context - electron-builder context
 * @param {string} context.appOutDir - Output directory path
 * @param {object} context.packager - Packager instance
 */
exports.default = async function afterPackEsbuild(context) {
  const { appOutDir, packager } = context

  console.log('\n[after-pack-esbuild] Starting esbuild binary permission setup...')

  // Only needed on macOS and Linux (Windows .exe files are already executable)
  if (platform() === 'win32') {
    console.log('[after-pack-esbuild] Platform: Windows - .exe files automatically executable')
    // Still verify binaries exist
    const resourcesPath = join(appOutDir, 'resources')
    const unpackedDir = join(resourcesPath, 'app.asar.unpacked', 'node_modules')

    const winBinaries = [
      join(unpackedDir, 'esbuild', 'esbuild.exe'),
      join(unpackedDir, 'esbuild-windows-arm64', 'esbuild.exe'),
      join(unpackedDir, 'esbuild-windows-x64', 'esbuild.exe')
    ]

    let foundCount = 0
    for (const bin of winBinaries) {
      try {
        await stat(bin)
        console.log(`[after-pack-esbuild] ✓ Found: ${bin}`)
        foundCount++
      } catch {
        // Binary not found - that's ok, not all platform binaries are installed
      }
    }

    if (foundCount === 0) {
      console.warn('[after-pack-esbuild] ⚠ No Windows esbuild binaries found')
    } else {
      console.log(`[after-pack-esbuild] ✓ Windows: Found ${foundCount} esbuild binary(ies)`)
    }
    return
  }

  console.log(`[after-pack-esbuild] Platform: ${platform()} - setting executable permissions...`)

  // Determine the correct resources path structure
  // macOS: Contents/Resources/
  // Linux: resources/
  const resourcesPath =
    platform() === 'darwin' ? join(appOutDir, 'Contents', 'Resources') : join(appOutDir, 'resources')

  const unpackedDir = join(resourcesPath, 'app.asar.unpacked', 'node_modules')

  console.log(`[after-pack-esbuild] Unpacked directory: ${unpackedDir}`)

  // Possible esbuild binary locations in unpacked asar
  const esbuildPaths = [
    // Generic esbuild package
    join(unpackedDir, 'esbuild', 'bin'),
    // Platform-specific packages
    join(unpackedDir, 'esbuild-darwin-arm64', 'bin'),
    join(unpackedDir, 'esbuild-darwin-x64', 'bin'),
    join(unpackedDir, 'esbuild-linux-arm64', 'bin'),
    join(unpackedDir, 'esbuild-linux-x64', 'bin'),
    join(unpackedDir, 'esbuild-linux-arm', 'bin')
  ]

  let successCount = 0
  let errorCount = 0

  for (const binDir of esbuildPaths) {
    try {
      // Check if directory exists
      const files = await readdir(binDir).catch(() => null)
      if (!files) {
        continue // Directory doesn't exist, skip silently
      }

      // Find esbuild binary (no extension on Unix)
      for (const file of files) {
        if (file === 'esbuild') {
          const binaryPath = join(binDir, file)

          try {
            // Check current permissions
            const stats = await stat(binaryPath)
            const currentMode = (stats.mode & parseInt('777', 8)).toString(8)
            console.log(`[after-pack-esbuild] Found binary: ${binaryPath}`)
            console.log(`[after-pack-esbuild]   Current permissions: ${currentMode}`)

            // Set executable permissions (rwxr-xr-x)
            await chmod(binaryPath, 0o755)

            // Verify permissions were set
            const newStats = await stat(binaryPath)
            const newMode = (newStats.mode & parseInt('777', 8)).toString(8)
            console.log(`[after-pack-esbuild]   New permissions: ${newMode}`)

            if (newMode === '755') {
              successCount++
              console.log(`[after-pack-esbuild] ✓ Successfully set executable permissions`)
            } else {
              console.warn(`[after-pack-esbuild] ⚠ Permissions set but not 755: ${newMode}`)
              successCount++ // Count as success anyway
            }
          } catch (error) {
            console.error(`[after-pack-esbuild] ✗ Error setting permissions on ${binaryPath}:`, error.message)
            errorCount++
          }
        }
      }
    } catch (error) {
      // Only log if it's not a "directory not found" error
      if (error.code !== 'ENOENT') {
        console.error(`[after-pack-esbuild] Error processing ${binDir}:`, error.message)
        errorCount++
      }
    }
  }

  // Summary
  console.log('\n[after-pack-esbuild] Summary:')
  if (successCount > 0) {
    console.log(`[after-pack-esbuild] ✅ Successfully set permissions on ${successCount} esbuild binary(ies)`)
  }

  if (errorCount > 0) {
    console.warn(`[after-pack-esbuild] ⚠️  Failed to set permissions on ${errorCount} path(s)`)
    console.warn(`[after-pack-esbuild]    App will fall back to esbuild-wasm (slower but functional)`)
  }

  if (successCount === 0 && errorCount === 0) {
    console.warn('[after-pack-esbuild] ⚠️  No esbuild binaries found in unpacked asar')
    console.warn('[after-pack-esbuild]    App will use esbuild-wasm fallback')
  }

  console.log('[after-pack-esbuild] Complete\n')
}
