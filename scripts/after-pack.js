const fs = require('fs');
const path = require('path');

// Recursively find all files with a given name
function findFiles(startPath, filter) {
  let results = [];
  if (!fs.existsSync(startPath)) {
    console.log('Directory not found:', startPath);
    return results;
  }

  const files = fs.readdirSync(startPath);
  for (let i = 0; i < files.length; i++) {
    const filename = path.join(startPath, files[i]);
    try {
      const stat = fs.lstatSync(filename);
      if (stat.isDirectory()) {
        results = results.concat(findFiles(filename, filter));
      } else if (stat.isFile() && (filename.endsWith(filter) || path.basename(filename) === filter)) {
        results.push(filename);
      }
    } catch (e) {
      // Skip symlinks or inaccessible files
      continue;
    }
  }
  return results;
}

exports.default = async function (context) {
  const { appOutDir, packager } = context;
  const platform = packager.platform.name;

  console.log(`[after-pack] Platform: ${platform}, appOutDir: ${appOutDir}`);

  if (platform === 'windows') {
    fs.rmSync(path.join(appOutDir, 'LICENSE.electron.txt'), { force: true });
    fs.rmSync(path.join(appOutDir, 'LICENSES.chromium.html'), { force: true });
  }

  // On macOS and Linux, the esbuild native binary needs executable permissions.
  if (platform === 'mac' || platform === 'linux' || platform === 'darwin') {
    console.log('[after-pack] Adjusting esbuild binary permissions for macOS/Linux');
    
    // Try both possible paths for macOS
    const possibleUnpackedDirs = [
      path.join(appOutDir, 'Contents', 'Resources', 'app.asar.unpacked'),
      path.join(appOutDir, 'resources', 'app.asar.unpacked'),
      path.join(appOutDir, 'app.asar.unpacked')
    ];

    let unpackedDir = null;
    for (const dir of possibleUnpackedDirs) {
      if (fs.existsSync(dir)) {
        unpackedDir = dir;
        console.log(`[after-pack] Found unpacked directory at: ${unpackedDir}`);
        break;
      }
    }

    if (!unpackedDir) {
      console.warn(`[after-pack] WARN: asar unpacked directory not found. Tried: ${possibleUnpackedDirs.join(', ')}`);
      return;
    }

    const esbuildBinaryName = 'esbuild';
    const nodeModulesPath = path.join(unpackedDir, 'node_modules');

    if (!fs.existsSync(nodeModulesPath)) {
      console.warn(`[after-pack] WARN: node_modules not found at ${nodeModulesPath}`);
      return;
    }

    try {
      // First, try direct paths to known esbuild locations
      const knownPaths = [
        path.join(nodeModulesPath, 'esbuild', 'bin', esbuildBinaryName),
        path.join(nodeModulesPath, 'esbuild-darwin-arm64', 'bin', esbuildBinaryName),
        path.join(nodeModulesPath, 'esbuild-darwin-x64', 'bin', esbuildBinaryName),
        path.join(nodeModulesPath, 'esbuild-linux-arm64', 'bin', esbuildBinaryName),
        path.join(nodeModulesPath, 'esbuild-linux-x64', 'bin', esbuildBinaryName),
        path.join(nodeModulesPath, 'esbuild-linux-arm', 'bin', esbuildBinaryName),
        path.join(nodeModulesPath, 'esbuild-linux-ia32', 'bin', esbuildBinaryName),
      ];

      const esbuildBinaries = new Set();
      
      // Check known paths first
      for (const knownPath of knownPaths) {
        if (fs.existsSync(knownPath)) {
          esbuildBinaries.add(knownPath);
          console.log(`[after-pack] Found esbuild binary at known path: ${knownPath}`);
        }
      }

      // Also do recursive search as fallback
      console.log(`[after-pack] Searching recursively for esbuild binaries in ${unpackedDir}...`);
      const foundBinaries = findFiles(unpackedDir, esbuildBinaryName);
      foundBinaries.forEach(binary => esbuildBinaries.add(binary));

      if (esbuildBinaries.size > 0) {
        console.log(`[after-pack] Found ${esbuildBinaries.size} esbuild binary(ies) to fix permissions`);
        esbuildBinaries.forEach(filePath => {
          try {
            const statsBefore = fs.statSync(filePath);
            const modeBefore = statsBefore.mode;
            console.log(`[after-pack] Setting +x on ${filePath} (current mode: ${(modeBefore & parseInt('777', 8)).toString(8)})`);
            fs.chmodSync(filePath, 0o755);
            const statsAfter = fs.statSync(filePath);
            const modeAfter = statsAfter.mode;
            console.log(`[after-pack] Successfully set permissions on ${filePath} (new mode: ${(modeAfter & parseInt('777', 8)).toString(8)})`);
          } catch (e) {
            console.error(`[after-pack] ERROR: Failed to set permissions on ${filePath}:`, e.message);
          }
        });
      } else {
        console.warn(`[after-pack] WARN: esbuild binary not found in ${unpackedDir}. Transpilation may fail.`);
        console.warn(`[after-pack] Available directories in node_modules:`, fs.existsSync(nodeModulesPath) ? fs.readdirSync(nodeModulesPath).slice(0, 10).join(', ') : 'N/A');
      }
    } catch (error) {
      console.error('[after-pack] ERROR: Failed during esbuild permission fix:', error);
    }
  }
};