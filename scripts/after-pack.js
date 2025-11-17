const { chmod, stat, readdir } = require('fs/promises')
const fs = require('fs')
const path = require('path')
const { platform: osPlatform } = require('os')

// Recursively find all files with a given name
function findFiles(startPath, filter) {
  let results = []
  if (!fs.existsSync(startPath)) {
    console.log('Directory not found:', startPath)
    return results
  }

  const files = fs.readdirSync(startPath)
  for (let i = 0; i < files.length; i++) {
    const filename = path.join(startPath, files[i])
    try {
      const stat = fs.lstatSync(filename)
      if (stat.isDirectory()) {
        results = results.concat(findFiles(filename, filter))
      } else if (stat.isFile() && (filename.endsWith(filter) || path.basename(filename) === filter)) {
        results.push(filename)
      }
    } catch (e) {
      // Skip symlinks or inaccessible files
      continue
    }
  }
  return results
}

/**
 * Set executable permissions on esbuild binaries (macOS/Linux only)
 * This runs DURING packaging to ensure binaries work in production builds
 */
async function fixEsbuildPermissions(appOutDir) {
  console.log('\n[after-pack-esbuild] Starting esbuild binary permission setup...')
  console.log(`[after-pack-esbuild] appOutDir: ${appOutDir}`)

  // Determine the correct resources path structure for each platform
  let resourcesPath
  if (osPlatform() === 'darwin') {
    // macOS: appOutDir/AppName.app/Contents/Resources/
    const files = fs.readdirSync(appOutDir)
    const appBundle = files.find((f) => f.endsWith('.app'))
    if (!appBundle) {
      console.error('[after-pack-esbuild] Could not find .app bundle in', appOutDir)
      return
    }
    resourcesPath = path.join(appOutDir, appBundle, 'Contents', 'Resources')
    console.log(`[after-pack-esbuild] macOS app bundle: ${appBundle}`)
  } else if (osPlatform() === 'linux') {
    // Linux: appOutDir/resources/
    resourcesPath = path.join(appOutDir, 'resources')
  } else {
    // Windows: appOutDir/resources/
    resourcesPath = path.join(appOutDir, 'resources')
  }

  console.log(`[after-pack-esbuild] Resources path: ${resourcesPath}`)
  const unpackedDir = path.join(resourcesPath, 'app.asar.unpacked', 'node_modules')
  console.log(`[after-pack-esbuild] Unpacked directory: ${unpackedDir}`)

  // Check if unpacked directory exists
  if (!fs.existsSync(unpackedDir)) {
    console.error(`[after-pack-esbuild] Unpacked directory does not exist: ${unpackedDir}`)
    return
  }

  // Windows .exe files are executable by default, just verify they exist
  if (osPlatform() === 'win32') {
    console.log('[after-pack-esbuild] Platform: Windows - .exe files automatically executable')

    const winBinaries = [
      path.join(unpackedDir, 'esbuild', 'esbuild.exe'),
      path.join(unpackedDir, '@esbuild', 'win32-x64', 'esbuild.exe'),
      path.join(unpackedDir, '@esbuild', 'win32-arm64', 'esbuild.exe'),
      path.join(unpackedDir, 'esbuild-windows-x64', 'esbuild.exe'),
      path.join(unpackedDir, 'esbuild-windows-arm64', 'esbuild.exe')
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

  // Unix platforms (macOS/Linux) - set executable permissions
  console.log(`[after-pack-esbuild] Platform: ${osPlatform()} - setting executable permissions...`)

  // Possible esbuild binary locations in unpacked asar
  const esbuildPaths = [
    // Generic esbuild package
    path.join(unpackedDir, 'esbuild', 'bin'),
    // Modern @esbuild scoped packages (esbuild >= 0.17)
    path.join(unpackedDir, '@esbuild', 'darwin-arm64', 'bin'),
    path.join(unpackedDir, '@esbuild', 'darwin-x64', 'bin'),
    path.join(unpackedDir, '@esbuild', 'linux-arm64', 'bin'),
    path.join(unpackedDir, '@esbuild', 'linux-x64', 'bin'),
    path.join(unpackedDir, '@esbuild', 'linux-arm', 'bin'),
    // Legacy esbuild-* packages (esbuild < 0.17)
    path.join(unpackedDir, 'esbuild-darwin-arm64', 'bin'),
    path.join(unpackedDir, 'esbuild-darwin-x64', 'bin'),
    path.join(unpackedDir, 'esbuild-linux-arm64', 'bin'),
    path.join(unpackedDir, 'esbuild-linux-x64', 'bin'),
    path.join(unpackedDir, 'esbuild-linux-arm', 'bin')
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
          const binaryPath = path.join(binDir, file)

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

exports.default = async function (context) {
  const { appOutDir, packager } = context
  const platform = packager.platform.name

  console.log(`[after-pack] Platform: ${platform}, appOutDir: ${appOutDir}`)

  // Clean up license files on Windows
  if (platform === 'windows') {
    fs.rmSync(path.join(appOutDir, 'LICENSE.electron.txt'), { force: true })
    fs.rmSync(path.join(appOutDir, 'LICENSES.chromium.html'), { force: true })
  }

  // Fix esbuild binary permissions
  await fixEsbuildPermissions(appOutDir)
}
