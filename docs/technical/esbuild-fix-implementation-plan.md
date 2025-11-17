# esbuild Production Build Fix - Implementation Plan

## Executive Summary

**Problem**: esbuild binary works in development but not in packaged production builds due to lost executable permissions.

**Root Cause**: When electron-builder unpacks esbuild from asar, executable permissions are lost (644 instead of 755). Runtime `chmod` attempts fail due to OS security restrictions.

**Solution**: Set executable permissions during packaging using electron-builder's `afterPack` hook.

**Timeline**: 1-2 hours for implementation + 2-4 hours for testing across platforms

**Risk Level**: Low (graceful fallback to WASM exists)

---

## Implementation Plan

### Phase 1: Create Build Hook (30 minutes)

#### Task 1.1: Create afterPack Hook Script
**Priority**: Critical
**File**: `scripts/after-pack-esbuild.js` (NEW)

```javascript
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
module.exports = async function afterPackEsbuild(context) {
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
      join(unpackedDir, 'esbuild-windows-x64', 'esbuild.exe'),
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
  const resourcesPath = platform() === 'darwin'
    ? join(appOutDir, 'Contents', 'Resources')
    : join(appOutDir, 'resources')

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
    join(unpackedDir, 'esbuild-linux-arm', 'bin'),
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
```

**Checklist**:
- [ ] Create file `scripts/after-pack-esbuild.js`
- [ ] Copy complete code from above
- [ ] Verify file has proper Node.js CommonJS module structure
- [ ] Ensure file is executable: `chmod +x scripts/after-pack-esbuild.js` (optional)

#### Task 1.2: Update electron-builder Configuration
**Priority**: Critical
**File**: [`electron-builder.yml`](../../electron-builder.yml:135)

**Current** (line 135):
```yaml
afterPack: scripts/after-pack.js
```

**Change to**:
```yaml
afterPack:
  - scripts/after-pack.js
  - scripts/after-pack-esbuild.js
```

**Checklist**:
- [ ] Edit `electron-builder.yml` line 135
- [ ] Change from single string to array format
- [ ] Verify YAML indentation is correct (2 spaces)
- [ ] Commit changes with message: `fix(build): Add afterPack hook to set esbuild binary permissions`

---

### Phase 2: Code Improvements (30 minutes)

#### Task 2.1: Simplify Runtime Binary Management (RECOMMENDED)
**Priority**: High (Recommended)
**File**: [`src/main/services/ArtifactTranspilerService.ts`](../../src/main/services/ArtifactTranspilerService.ts:617-656)

**Goal**: Remove failing runtime `chmod` logic since permissions are now set during packaging.

**Changes**:

**Replace lines 617-656** with:
```typescript
private async ensureExecutable(path: string): Promise<boolean> {
  if (!(await this.fileExists(path))) {
    logger.debug(`[ArtifactTranspilerService] Binary does not exist: ${path}`)
    return false
  }

  // Log current permissions for debugging
  try {
    const stats = await stat(path)
    const mode = stats.mode
    const permissions = (mode & parseInt('777', 8)).toString(8)
    logger.debug(`[ArtifactTranspilerService] Binary at ${path}, permissions: ${permissions}`)
  } catch (error) {
    logger.debug(`[ArtifactTranspilerService] Could not stat binary: ${path}`, error)
  }

  // Check if executable (permissions should already be set by afterPack hook)
  const isExec = await this.isExecutable(path)

  if (!isExec) {
    logger.warn(
      `[ArtifactTranspilerService] Binary exists but is not executable: ${path}. ` +
      `This indicates a packaging issue - the binary should have been made executable ` +
      `during the electron-builder afterPack phase. Check build logs for [after-pack-esbuild] messages.`
    )
  } else {
    logger.debug(`[ArtifactTranspilerService] ✓ Binary is executable: ${path}`)
  }

  return isExec
}
```

**Rationale**:
- Removes runtime `chmod` that fails in production
- Keeps permission checking for diagnostics
- Clear error message points to packaging issue if permissions wrong
- Simplifies code and removes failure point

**Checklist**:
- [ ] Update `ensureExecutable()` method
- [ ] Remove `chmod` import if no longer used elsewhere
- [ ] Test that development mode still works
- [ ] Commit with message: `refactor(transpiler): Remove runtime chmod - set permissions during packaging`

#### Task 2.2: Add Diagnostic Logging (OPTIONAL)
**Priority**: Medium (Nice to have)
**File**: [`src/main/services/ArtifactTranspilerService.ts`](../../src/main/services/ArtifactTranspilerService.ts:268)

Add diagnostic check in `initialize()` method after line 290:

```typescript
// After: this.esbuildImpl = esbuildNative

// Diagnostic: Log binary information in packaged mode
if (app && app.isPackaged && this.esbuildImpl && !this.usingWasm) {
  try {
    const binaryPath = process.env.ESBUILD_BINARY_PATH || 'using npm install default'
    logger.info(`[ArtifactTranspilerService] Native esbuild binary path: ${binaryPath}`)

    if (process.env.ESBUILD_BINARY_PATH) {
      const stats = await stat(process.env.ESBUILD_BINARY_PATH)
      const permissions = (stats.mode & parseInt('777', 8)).toString(8)
      logger.info(`[ArtifactTranspilerService] Binary permissions: ${permissions} (should be 755)`)
    }
  } catch (error) {
    logger.debug(`[ArtifactTranspilerService] Could not get binary diagnostic info`, error)
  }
}
```

**Checklist**:
- [ ] Add diagnostic logging after esbuild initialization
- [ ] Test in packaged mode to verify logs appear
- [ ] Verify permissions are reported as 755

---

### Phase 3: Testing & Verification (2-4 hours)

#### Task 3.1: Build and Test on macOS
**Priority**: Critical (if targeting macOS)

**Steps**:
1. Clean previous build:
   ```bash
   rm -rf dist/
   ```

2. Build for macOS:
   ```bash
   yarn build:mac
   # or
   yarn build:mac:arm64  # For Apple Silicon
   yarn build:mac:x64    # For Intel
   ```

3. Check build console output for:
   ```
   [after-pack-esbuild] Starting esbuild binary permission setup...
   [after-pack-esbuild] Platform: darwin - setting executable permissions...
   [after-pack-esbuild] Found binary: ...
   [after-pack-esbuild]   Current permissions: 644
   [after-pack-esbuild]   New permissions: 755
   [after-pack-esbuild] ✓ Successfully set executable permissions
   [after-pack-esbuild] ✅ Successfully set permissions on 1 esbuild binary(ies)
   ```

4. Verify in unpacked app:
   ```bash
   # Check permissions in the built app
   ls -la "dist/mac/KnowMe Studio.app/Contents/Resources/app.asar.unpacked/node_modules/esbuild/bin/"

   # Should show: -rwxr-xr-x (755)
   ```

5. Install and test the packaged app:
   ```bash
   open "dist/mac/KnowMe Studio.app"
   ```

6. Open DevTools in the app and check Console for:
   - ✅ `[ArtifactTranspilerService] ✓ esbuild file is executable`
   - ✅ `Native esbuild initialized successfully (version X.X.X)`
   - ❌ NO `Failed to set execute permissions` errors
   - ❌ NO `falling back to esbuild-wasm` unless WASM is intended

7. Test artifact transpilation:
   - Create a React artifact
   - Verify it renders correctly
   - Check logs for successful transpilation
   - Verify it used native esbuild (check timing - should be <100ms)

**Success Criteria**:
- [ ] Build completes without errors
- [ ] Hook logs appear in build output
- [ ] Binary has 755 permissions in packaged app
- [ ] App starts without permission errors
- [ ] Artifacts transpile successfully using native esbuild

**Rollback**: If fails, app falls back to WASM automatically

#### Task 3.2: Build and Test on Windows
**Priority**: Critical (if targeting Windows)

**Steps**:
1. Clean and build:
   ```bash
   rm -rf dist/
   yarn build:win
   # or
   yarn build:win:x64
   yarn build:win:arm64
   ```

2. Check build output for:
   ```
   [after-pack-esbuild] Platform: Windows - .exe files automatically executable
   [after-pack-esbuild] ✓ Found: ...esbuild.exe
   ```

3. Verify binary exists in package:
   ```bash
   # Check in unpacked app
   ls "dist/win-unpacked/resources/app.asar.unpacked/node_modules/esbuild/"
   ```

4. Install and test the .exe:
   - Run the installer
   - Open app
   - Check for esbuild initialization logs
   - Test artifact transpilation

**Success Criteria**:
- [ ] Build completes
- [ ] Binary exists in unpacked asar
- [ ] App initializes esbuild successfully
- [ ] Artifacts transpile correctly

#### Task 3.3: Build and Test on Linux
**Priority**: High (if targeting Linux)

**Steps**: Similar to macOS testing
1. Clean and build:
   ```bash
   rm -rf dist/
   yarn build:linux
   ```

2. Verify permissions:
   ```bash
   ls -la dist/linux-unpacked/resources/app.asar.unpacked/node_modules/esbuild/bin/
   ```

3. Test the AppImage/deb/rpm package

**Success Criteria**:
- [ ] Build completes
- [ ] Binary has 755 permissions
- [ ] App runs and transpiles artifacts

---

### Phase 4: Platform-Specific Build Matrix (4 hours)

Test all combinations if possible:

| Platform | Architecture | Build Command | Binary Path to Check |
|----------|-------------|---------------|---------------------|
| macOS | arm64 | `yarn build:mac:arm64` | `.../esbuild-darwin-arm64/bin/esbuild` |
| macOS | x64 | `yarn build:mac:x64` | `.../esbuild-darwin-x64/bin/esbuild` |
| Windows | x64 | `yarn build:win:x64` | `.../esbuild-windows-x64/esbuild.exe` |
| Windows | arm64 | `yarn build:win:arm64` | `.../esbuild-windows-arm64/esbuild.exe` |
| Linux | x64 | `yarn build:linux:x64` | `.../esbuild-linux-x64/bin/esbuild` |
| Linux | arm64 | `yarn build:linux:arm64` | `.../esbuild-linux-arm64/bin/esbuild` |

**For each build**:
1. Verify hook ran successfully
2. Check binary permissions (Unix) or existence (Windows)
3. Install and run app
4. Test artifact transpilation
5. Check performance (<100ms for React transpilation = native, >500ms = WASM)

---

## Rollout Strategy

### Stage 1: Development Testing (Day 1)
- [ ] Implement changes in development branch
- [ ] Test locally on developer machines
- [ ] Verify no regressions in development mode
- [ ] Get code review approval

### Stage 2: CI/CD Integration (Day 1-2)
- [ ] Update CI/CD pipelines to run builds
- [ ] Verify builds succeed on all platforms in CI
- [ ] Check build artifacts for correct permissions
- [ ] Archive builds for QA testing

### Stage 3: QA Testing (Day 2-3)
- [ ] Install on physical test machines (macOS, Windows, Linux)
- [ ] Test artifact transpilation extensively
- [ ] Verify no performance regressions
- [ ] Test edge cases (offline, restricted permissions, etc.)

### Stage 4: Beta Release (Day 3-4)
- [ ] Release to beta testers
- [ ] Monitor error reports
- [ ] Collect telemetry on transpiler usage
- [ ] Verify WASM fallback usage decreases

### Stage 5: Production Release (Day 5+)
- [ ] Release to all users
- [ ] Monitor support requests
- [ ] Track transpiler performance metrics
- [ ] Document lessons learned

---

## Success Metrics

### Build-Time Metrics
- [ ] afterPack hook completes successfully (exit code 0)
- [ ] Hook logs show permissions set to 755
- [ ] Build time increases <10 seconds (hook overhead)
- [ ] All platform builds succeed

### Runtime Metrics
- [ ] Native esbuild initialization success rate >95%
- [ ] WASM fallback usage <5% (only true edge cases)
- [ ] React artifact transpilation time <100ms (native esbuild)
- [ ] No permission-related errors in logs
- [ ] Zero reported user issues related to artifact rendering

### Quality Metrics
- [ ] All existing tests pass
- [ ] New diagnostic logs help troubleshooting
- [ ] Code is simpler (removed runtime chmod logic)
- [ ] Documentation is clear and complete

---

## Troubleshooting Procedures

### If Hook Doesn't Run

**Symptoms**:
- No `[after-pack-esbuild]` messages in build output
- Binary still has wrong permissions

**Debug Steps**:
1. Check electron-builder.yml syntax:
   ```yaml
   # Must be array format with dash
   afterPack:
     - scripts/after-pack.js
     - scripts/after-pack-esbuild.js
   ```

2. Verify script exists and is syntactically valid:
   ```bash
   node scripts/after-pack-esbuild.js
   # Should error about missing context, not syntax errors
   ```

3. Check electron-builder version supports hook arrays:
   ```bash
   npm list electron-builder
   # Should be v22+
   ```

4. Try explicit path:
   ```yaml
   afterPack:
     - ./scripts/after-pack.js
     - ./scripts/after-pack-esbuild.js
   ```

### If Binary Still Not Executable

**Symptoms**:
- Hook runs successfully
- Binary still shows 644 permissions
- App fails with permission errors

**Debug Steps**:
1. Check if code signing is overwriting permissions:
   ```bash
   # macOS: Check when signing happens
   # Signing should happen AFTER afterPack hook
   ```

2. Try `afterSign` hook instead:
   ```yaml
   afterSign: scripts/after-pack-esbuild.js
   ```

3. Verify unpacking actually works:
   ```bash
   # Check if files are actually unpacked
   ls -la "dist/mac/KnowMe Studio.app/Contents/Resources/app.asar.unpacked/node_modules/"

   # Should see: esbuild, esbuild-darwin-*, etc.
   ```

4. Check macOS specific path structure:
   ```javascript
   // In hook, try both paths:
   const resourcesPath1 = join(appOutDir, 'Contents', 'Resources') // macOS
   const resourcesPath2 = join(appOutDir, 'resources') // Linux
   ```

### If App Falls Back to WASM

**Symptoms**:
- Transpilation works but is slow (>500ms)
- Logs show `falling back to esbuild-wasm`

**Debug Steps**:
1. Check initialization logs in packaged app
2. Verify which path was checked
3. Verify binary exists at that path
4. Check permissions on actual binary file
5. Try manual execution:
   ```bash
   # In terminal, navigate to app and try:
   ./path/to/esbuild --version
   ```

---

## Risk Assessment

### High Risk Items
None - fallback to WASM provides safety net

### Medium Risk Items
1. **Hook Doesn't Execute**:
   - Impact: Binary not made executable
   - Mitigation: WASM fallback works
   - Detection: Build logs + runtime logs

2. **Platform-Specific Path Differences**:
   - Impact: Hook can't find binary
   - Mitigation: Try multiple path patterns
   - Detection: Hook logs show 0 binaries found

### Low Risk Items
1. **Code Signing Interference** (macOS only):
   - Impact: Signing might strip permissions
   - Mitigation: Use `afterSign` hook instead
   - Detection: Works in build, fails in signed DMG

2. **Performance Impact**:
   - Impact: Slower builds
   - Expected: <10 seconds added
   - Mitigation: None needed

---

## Rollback Procedures

### If Implementation Fails

**Quick Rollback** (revert changes):
```bash
git revert <commit-hash>
yarn build
```

**App will**:
- Continue using existing runtime chmod logic
- Fall back to WASM when chmod fails
- Work but slower

### If Hook Causes Build Failures

**Emergency Rollback**:
```yaml
# electron-builder.yml line 135
afterPack: scripts/after-pack.js  # Revert to single hook
```

---

## Post-Implementation

### Documentation Updates
- [ ] Update CHANGELOG.md with fix description
- [ ] Add troubleshooting section to docs
- [ ] Document known limitations (if any)
- [ ] Update README if build process changed

### Monitoring
- [ ] Set up telemetry for transpiler usage (optional)
- [ ] Monitor support channels for packaging issues
- [ ] Track WASM fallback usage percentage
- [ ] Collect performance metrics

### Future Improvements
- [ ] Consider bundling binary as extraResource (more control)
- [ ] Evaluate SWC migration for React (from previous analysis)
- [ ] Add automated tests for packaged builds
- [ ] Create pre-flight check script

---

## Timeline Estimate

| Phase | Tasks | Duration | Dependencies |
|-------|-------|----------|--------------|
| **Phase 1** | Create hook + update config | 30 min | None |
| **Phase 2** | Code improvements | 30 min | Phase 1 complete |
| **Phase 3** | Single platform testing | 1 hour | Phase 1-2 complete |
| **Phase 4** | Multi-platform testing | 2-4 hours | Phase 3 validates approach |
| **Total** | | **4-6 hours** | |

**Parallel work possible**: If team has multiple platforms available, Phase 4 can run in parallel.

---

## Implementation Checklist

### Pre-Implementation
- [ ] Read `docs/technical/esbuild-packaging-fix.md` completely
- [ ] Understand root cause (permissions lost during asar unpacking)
- [ ] Backup current code/config
- [ ] Create feature branch: `fix/esbuild-binary-permissions`

### Core Implementation
- [ ] Create `scripts/after-pack-esbuild.js` (Task 1.1)
- [ ] Update `electron-builder.yml` line 135 (Task 1.2)
- [ ] Simplify `ensureExecutable()` method (Task 2.1)
- [ ] Add diagnostic logging (Task 2.2 - optional)
- [ ] Commit changes with clear messages

### Testing
- [ ] Test build on macOS (Task 3.1)
- [ ] Test build on Windows (Task 3.2)
- [ ] Test build on Linux (Task 3.3)
- [ ] Verify hook runs successfully on each platform
- [ ] Verify binary permissions correct on Unix platforms
- [ ] Verify binary exists on Windows
- [ ] Test artifact transpilation in packaged app
- [ ] Verify native esbuild used (not WASM)
- [ ] Check transpilation performance

### Validation
- [ ] Code review
- [ ] QA testing on physical devices
- [ ] Beta release to small user group
- [ ] Monitor for issues
- [ ] Collect feedback

### Deployment
- [ ] Merge to main branch
- [ ] Update CHANGELOG
- [ ] Create release notes
- [ ] Deploy to production
- [ ] Monitor metrics

---

## Quick Reference

### Key Files to Modify

1. **NEW**: `scripts/after-pack-esbuild.js` - Hook to set permissions
2. **EDIT**: `electron-builder.yml` line 135 - Add hook to afterPack array
3. **EDIT**: `src/main/services/ArtifactTranspilerService.ts` lines 617-656 - Simplify ensureExecutable()

### Commands

```bash
# Create hook file
touch scripts/after-pack-esbuild.js

# Test build
yarn build:mac    # or build:win, build:linux

# Check permissions (macOS/Linux)
ls -la "dist/mac/KnowMe Studio.app/Contents/Resources/app.asar.unpacked/node_modules/esbuild/bin/"

# Run packaged app
open "dist/mac/KnowMe Studio.app"
```

### Expected Log Output

**During Build**:
```
[after-pack-esbuild] Starting esbuild binary permission setup...
[after-pack-esbuild] Platform: darwin - setting executable permissions...
[after-pack-esbuild] Unpacked directory: .../Resources/app.asar.unpacked/node_modules
[after-pack-esbuild] Found binary: .../esbuild-darwin-arm64/bin/esbuild
[after-pack-esbuild]   Current permissions: 644
[after-pack-esbuild]   New permissions: 755
[after-pack-esbuild] ✓ Successfully set executable permissions
[after-pack-esbuild] ✅ Successfully set permissions on 1 esbuild binary(ies)
[after-pack-esbuild] Complete
```

**In Packaged App**:
```
[ArtifactTranspilerService] ✓ esbuild file found at .../esbuild/bin/esbuild
[ArtifactTranspilerService] Binary at .../esbuild/bin/esbuild, permissions: 755
[ArtifactTranspilerService] ✓ Binary is executable
[ArtifactTranspilerService] ✓ esbuild initialized successfully (version 0.27.0)
[ArtifactTranspilerService] Using native esbuild (not WASM)
```

---

## Decision Points

### After Phase 1 & 2 (Code Complete)
**Decision**: Does the hook run successfully?
- ✅ Yes → Proceed to Phase 3 testing
- ❌ No → Debug hook configuration, try alternative approaches

### After Phase 3 (Single Platform Test)
**Decision**: Does fix work on one platform?
- ✅ Yes → Proceed to Phase 4 (multi-platform)
- ❌ No → Investigate platform-specific issues, consider alternatives

### After Phase 4 (Multi-Platform Test)
**Decision**: Does fix work on all target platforms?
- ✅ Yes → Proceed to deployment
- ⚠️ Partial → Deploy on working platforms, investigate others
- ❌ No → Consider alternative approaches or accept WASM fallback

---

## Alternative Approaches (If Main Fix Fails)

### Plan B: Use afterExtract Hook
If afterPack timing doesn't work, use `afterExtract` (earlier in build process).

See `docs/technical/esbuild-packaging-fix.md` section "Alternative Solution".

### Plan C: Bundle as extraResource
Copy binaries to resources directory with proper permissions:

```yaml
extraResources:
  - from: "node_modules/esbuild-${platform}-${arch}/bin/esbuild"
    to: "bin/esbuild"
```

Then update binary paths in ArtifactTranspilerService.

### Plan D: Accept WASM as Primary
If native binary too problematic, switch to WASM by default:

```typescript
// In ArtifactTranspilerService.initialize()
// Skip native esbuild entirely on first failure
this.esbuildImpl = await import('esbuild-wasm')
await this.esbuildImpl.initialize()
this.usingWasm = true
```

**Tradeoff**: Slower but more reliable across all platforms.

---

## Communication Plan

### To Development Team
- Share this implementation plan
- Assign tasks if multiple developers
- Schedule testing windows on each platform
- Set up shared testing results spreadsheet

### To QA Team
- Provide testing checklist
- Explain expected behavior changes
- Share diagnostic commands
- Set up bug reporting process

### To Users (If Relevant)
- No communication needed (transparent fix)
- If beta testing: Mention performance improvements
- In release notes: "Fixed esbuild performance in packaged builds"

---

## Success Definition

The fix is successful when:

1. ✅ **Build succeeds** on all target platforms
2. ✅ **Hook runs** and logs show permissions set
3. ✅ **Binary is executable** (755 on Unix) in packaged app
4. ✅ **App initializes** native esbuild without errors
5. ✅ **Artifacts transpile** quickly (<100ms) using native esbuild
6. ✅ **No fallback to WASM** except in true edge cases (<5% of sessions)
7. ✅ **User experience** is identical or better (no visible changes, just faster/more reliable)

---

**Document Version**: 1.0
**Created**: 2025-11-17
**Purpose**: Actionable implementation plan
**Status**: Ready for Development Team
**Estimated Effort**: 4-6 hours total (1-2 hours implementation + 2-4 hours testing)
