import { constants as fsConstants, createWriteStream } from 'node:fs'
import { access, chmod, copyFile, mkdir, mkdtemp, rm, stat } from 'node:fs/promises'
import type { IncomingMessage } from 'node:http'
import { request } from 'node:https'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'

import { loggerService } from '@logger'
import checkDiskSpace from 'check-disk-space'
import { app } from 'electron'
import type { Loader, Message, TransformFailure } from 'esbuild'
import * as esbuildNative from 'esbuild'
import react18Plugin from 'esbuild-plugin-react18'
import { solidPlugin } from 'esbuild-plugin-solid'
import vuePlugin from 'esbuild-plugin-vue3'
import sveltePlugin from 'esbuild-svelte'
import * as tar from 'tar'

const logger = loggerService.withContext('ArtifactTranspilerService')

// Type for esbuild implementation (native or WASM)
type EsbuildImpl = typeof esbuildNative

/**
 * Get current file and line number from stack trace
 */
function getCallerInfo(): { file: string; line: number; function: string } {
  const stack = new Error().stack
  if (!stack) {
    return { file: 'unknown', line: 0, function: 'unknown' }
  }

  const lines = stack.split('\n')
  // Skip Error, getCallerInfo, and the actual caller (index 3)
  const callerLine = lines[3] || lines[2] || lines[1] || ''

  // Match: "    at FunctionName (file:///path/to/file.ts:123:45)"
  const match = callerLine.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/)
  if (match) {
    const functionName = match[1] || 'anonymous'
    const file = match[2] || 'unknown'
    const line = parseInt(match[3] || '0', 10)
    return { file, line, function: functionName }
  }

  return { file: 'unknown', line: 0, function: 'unknown' }
}

/**
 * Format error with full context including file, line, and stack trace
 */
function formatErrorWithContext(
  error: unknown,
  context?: string
): {
  message: string
  stack: string | undefined
  file: string
  line: number
  function: string
  context?: string
} {
  const caller = getCallerInfo()
  const errorMessage = error instanceof Error ? error.message : String(error)
  const errorStack = error instanceof Error ? error.stack : undefined

  return {
    message: errorMessage,
    stack: errorStack,
    file: caller.file,
    line: caller.line,
    function: caller.function,
    context
  }
}

/**
 * Supported frameworks for artifact transpilation
 */
export type ArtifactFramework = 'react' | 'svelte' | 'vue' | 'solid' | 'preact'

/**
 * Request to transpile artifact code
 */
export interface TranspileRequest {
  code: string
  framework: ArtifactFramework
  language: 'typescript' | 'javascript'
  filename?: string
}

/**
 * Result of transpilation
 */
export interface TranspileResult {
  code: string
  map?: string
  warnings?: Message[]
}

/**
 * Transpilation error with location information
 */
export interface TranspileError {
  message: string
  location?: {
    file: string
    line: number
    column: number
    lineText: string
    suggestion?: string
  }
}

/**
 * Supported platforms for esbuild binary packages
 */
type EsbuildSupportedPlatform = 'darwin' | 'linux' | 'win32' | 'freebsd' | 'openbsd' | 'netbsd' | 'aix' | 'android'

interface ImportMappingDefinition {
  pattern: RegExp
  namespaceExpr: (moduleName: string) => string
  defaultExpr?: (moduleName: string) => string
}

interface ImportResolution {
  namespaceExpr: string
  defaultExpr?: string
}

const registryAccessor = (registryName: string, moduleName: string): string =>
  `(window.${registryName} && window.${registryName}[${JSON.stringify(moduleName)}])`

const IMPORT_MAPPINGS: ImportMappingDefinition[] = [
  {
    pattern: /^react$/,
    namespaceExpr: () => 'window.React'
  },
  {
    pattern: /^react-dom$/,
    namespaceExpr: () => 'window.ReactDOM'
  },
  {
    pattern: /^react\/jsx(?:-dev)?-runtime$/,
    namespaceExpr: () => 'window.React'
  },
  {
    pattern: /^@xyflow\/react$/,
    namespaceExpr: () => 'window.ReactFlow',
    defaultExpr: () => 'window.ReactFlow.ReactFlow'
  },
  {
    pattern: /^reactflow$/,
    namespaceExpr: () => 'window.ReactFlow',
    defaultExpr: () => 'window.ReactFlow.ReactFlow'
  },
  {
    pattern: /^lucide-react$/,
    namespaceExpr: () => 'window.LucideReact'
  },
  {
    pattern: /^clsx$/,
    namespaceExpr: () => 'window.clsx'
  },
  {
    pattern: /^axios$/,
    namespaceExpr: () => 'window.axios'
  },
  {
    pattern: /^@supabase\/supabase-js$/,
    namespaceExpr: () => 'window.supabase'
  },
  {
    pattern: /^ai$/,
    namespaceExpr: () => 'window.AISDK'
  },
  {
    pattern: /^ai-elements$/,
    namespaceExpr: () => 'window.AIElements'
  },
  {
    pattern: /^@ai-sdk\/react$/,
    namespaceExpr: () => 'window.AIElements'
  },
  {
    pattern: /^@ai-sdk\/openai$/,
    namespaceExpr: () => 'window.AISDKOpenAI'
  },
  {
    pattern: /^@ai-sdk\/anthropic$/,
    namespaceExpr: () => 'window.AISDKAnthropic'
  },
  {
    pattern: /^@langchain\/langgraph(?:\/web)?$/,
    namespaceExpr: (moduleName) => registryAccessor('LangGraph', moduleName)
  },
  {
    pattern: /^langchain\/.+$/,
    namespaceExpr: (moduleName) => registryAccessor('LangChain', moduleName)
  }
]

const importStatementRegex = /import\s+(type\s+)?(?:([\w$]+)(?:\s*,\s*{([^}]+)})?|{([^}]+)})\s+from\s+['"]([^'"]+)['"]/g

const resolveImportExpressions = (moduleName: string): ImportResolution | null => {
  for (const mapping of IMPORT_MAPPINGS) {
    if (mapping.pattern.test(moduleName)) {
      return {
        namespaceExpr: mapping.namespaceExpr(moduleName),
        defaultExpr: mapping.defaultExpr?.(moduleName)
      }
    }
  }
  return null
}

/**
 * Service for transpiling artifact code (React, Svelte, etc.) using esbuild
 * Uses native esbuild binary for maximum performance (10-50ms), falls back to esbuild-wasm
 * (pure JavaScript, no binary required) if native binary fails or is unavailable.
 * This runs in the main process for maximum performance (10-50ms vs 500-2000ms with Babel)
 */
export class ArtifactTranspilerService {
  private isInitialized = false
  private esbuildImpl: EsbuildImpl = esbuildNative
  private usingWasm = false

  private static readonly ESBUILD_PACKAGES: Record<EsbuildSupportedPlatform, Record<string, string>> = {
    darwin: {
      arm64: 'esbuild-darwin-arm64',
      x64: 'esbuild-darwin-x64'
    },
    linux: {
      arm64: 'esbuild-linux-arm64',
      arm: 'esbuild-linux-arm',
      ia32: 'esbuild-linux-ia32',
      x64: 'esbuild-linux-x64'
    },
    win32: {
      arm64: 'esbuild-windows-arm64',
      ia32: 'esbuild-windows-ia32',
      x64: 'esbuild-windows-x64'
    },
    freebsd: {
      arm64: 'esbuild-freebsd-arm64',
      x64: 'esbuild-freebsd-64'
    },
    openbsd: {
      x64: 'esbuild-openbsd-64'
    },
    netbsd: {
      x64: 'esbuild-netbsd-64'
    },
    aix: {
      ppc64: 'esbuild-aix-ppc64'
    },
    android: {
      arm64: 'esbuild-android-arm64',
      arm: 'esbuild-android-arm',
      x64: 'esbuild-android-64'
    }
  }

  /**
   * Initialize the service (esbuild is ready to use immediately)
   */
  async initialize(): Promise<void> {
    const caller = getCallerInfo()
    logger.info(`[ArtifactTranspilerService.initialize] ENTRY at ${caller.file}:${caller.line}`)

    if (this.isInitialized) {
      logger.info(`[ArtifactTranspilerService.initialize] Already initialized, skipping`)
      return
    }

    try {
      logger.info(`[ArtifactTranspilerService.initialize] Step 1: Ensuring disk space...`)
      await this.ensureDiskSpace()

      logger.info(`[ArtifactTranspilerService.initialize] Step 2: Ensuring esbuild binary...`)
      await this.ensureEsbuildBinary()

      // Test native esbuild - verify it can actually run
      try {
        logger.info(`[ArtifactTranspilerService] Testing esbuild binary execution...`)
        await this.esbuildImpl.transform('let __esbuild_probe__ = 1', { loader: 'js' })
        logger.info(
          `[ArtifactTranspilerService] ✓ esbuild file is executable (can run with no errors) - version ${this.esbuildImpl.version}`
        )
        logger.info(`Native esbuild initialized successfully (version ${this.esbuildImpl.version})`)
      } catch (nativeError) {
        // Native esbuild failed - try to download/ensure binary is available
        logger.warn('Native esbuild probe failed, attempting to ensure binary is available...', nativeError as Error)

        // Try to ensure binary one more time
        await this.ensureEsbuildBinary()

        // Retry the probe
        try {
          logger.info(`[ArtifactTranspilerService] Retrying esbuild binary execution test...`)
          await this.esbuildImpl.transform('let __esbuild_probe__ = 1', { loader: 'js' })
          logger.info(
            `[ArtifactTranspilerService] ✓ esbuild file is executable (can run with no errors) - version ${this.esbuildImpl.version}`
          )
          logger.info(`Native esbuild initialized successfully after retry (version ${this.esbuildImpl.version})`)
        } catch (retryError) {
          // Native esbuild failed - fallback to WASM version
          logger.warn('Native esbuild failed, falling back to esbuild-wasm (pure JavaScript, no binary required)', {
            originalError: nativeError as Error,
            retryError: retryError as Error
          })

          await this.initializeWasm()
        }
      }

      logger.info(
        `[ArtifactTranspilerService.initialize] ✓ esbuild initialized (version ${this.esbuildImpl.version}, usingWasm: ${this.usingWasm})`
      )

      this.isInitialized = true
      logger.info(`[ArtifactTranspilerService.initialize] EXIT - Success`)
    } catch (error) {
      const errorContext = formatErrorWithContext(error, 'initialize()')
      logger.error('[ArtifactTranspilerService.initialize] ✗ FAILED:', {
        ...errorContext,
        isPackaged: app && app.isPackaged ? app.isPackaged : false,
        platform: process.platform,
        arch: process.arch,
        esbuildBinaryPath: process.env.ESBUILD_BINARY_PATH,
        resourcesPath: process.resourcesPath,
        usingWasm: this.usingWasm
      })
      throw new Error(
        `Failed to initialize transpiler service at ${errorContext.file}:${errorContext.line} ` +
          `in ${errorContext.function}: ${errorContext.message}`
      )
    }
  }

  /**
   * Initialize esbuild-wasm as fallback when native binary fails
   */
  private async initializeWasm(): Promise<void> {
    const caller = getCallerInfo()
    logger.info(`[ArtifactTranspilerService.initializeWasm] ENTRY at ${caller.file}:${caller.line}`)

    try {
      logger.info('[ArtifactTranspilerService.initializeWasm] Dynamically importing esbuild-wasm...')
      const esbuildWasm = await import('esbuild-wasm')
      logger.info('[ArtifactTranspilerService.initializeWasm] ✓ imported successfully')

      // Initialize for Node.js - let esbuild-wasm auto-detect and load from node_modules
      logger.info('[ArtifactTranspilerService.initializeWasm] Initializing for Node.js...')
      await esbuildWasm.initialize({})

      this.esbuildImpl = esbuildWasm as EsbuildImpl
      this.usingWasm = true

      // Test WASM version
      logger.info('[ArtifactTranspilerService.initializeWasm] Step 3: Testing WASM with transform probe...')
      await this.esbuildImpl.transform('let __esbuild_probe__ = 1', { loader: 'js' })
      logger.info(
        `[ArtifactTranspilerService.initializeWasm] ✓ esbuild-wasm initialized successfully (version ${this.esbuildImpl.version})`
      )
      logger.info('[ArtifactTranspilerService.initializeWasm] Using esbuild-wasm (slower but no binary required)')
      logger.info(`[ArtifactTranspilerService.initializeWasm] EXIT - Success`)
    } catch (wasmError) {
      const errorContext = formatErrorWithContext(wasmError, 'initializeWasm()')
      logger.error('[ArtifactTranspilerService.initializeWasm] ✗ FAILED:', errorContext)
      throw new Error(
        `Failed to initialize esbuild (both native and WASM failed) at ${errorContext.file}:${errorContext.line} ` +
          `in ${errorContext.function}: ${errorContext.message}. ` +
          `Please ensure esbuild-wasm is installed: yarn add esbuild-wasm`
      )
    }
  }

  /**
   * Ensure there is enough free disk space for esbuild temp files
   */
  private async ensureDiskSpace(): Promise<void> {
    try {
      const targetPath = app && app.isPackaged ? process.resourcesPath : process.cwd()
      const info = await checkDiskSpace(targetPath)
      const freeGB = info.free / 1024 ** 3
      if (freeGB < 0.5) {
        logger.warn(
          `[ArtifactTranspilerService] Low disk space detected (${freeGB.toFixed(
            2
          )} GB free). Esbuild may fail if insufficient space is available.`
        )
      } else {
        logger.info(`[ArtifactTranspilerService] Disk space check OK (${freeGB.toFixed(2)} GB free at ${targetPath}).`)
      }
    } catch (error) {
      logger.warn('[ArtifactTranspilerService] Unable to determine disk space', error as Error)
    }
  }

  private async ensureEsbuildBinary(): Promise<void> {
    const caller = getCallerInfo()
    logger.info(`[ArtifactTranspilerService.ensureEsbuildBinary] ENTRY at ${caller.file}:${caller.line}`)

    if (!app || !app.isPackaged) {
      logger.info(`[ArtifactTranspilerService.ensureEsbuildBinary] Not packaged, clearing ESBUILD_BINARY_PATH`)
      delete process.env.ESBUILD_BINARY_PATH
      return
    }

    // Try 1: Check generic esbuild binary in unpacked directory
    const bundledPath = this.getBundledBinaryPath()
    logger.info(`[ArtifactTranspilerService.ensureEsbuildBinary] Try 1: Checking bundled path: ${bundledPath}`)
    if (await this.fileExists(bundledPath)) {
      logger.info(`[ArtifactTranspilerService.ensureEsbuildBinary] ✓ esbuild file found at ${bundledPath}`)
      if (await this.ensureExecutable(bundledPath)) {
        process.env.ESBUILD_BINARY_PATH = bundledPath
        logger.info(
          `[ArtifactTranspilerService.ensureEsbuildBinary] ✓ esbuild file is executable, using bundled binary at ${bundledPath}`
        )
        logger.info(`[ArtifactTranspilerService.ensureEsbuildBinary] EXIT - Success (bundled path)`)
        return
      } else {
        logger.warn(`[ArtifactTranspilerService.ensureEsbuildBinary] File exists but is not executable: ${bundledPath}`)
      }
    } else {
      logger.info(`[ArtifactTranspilerService.ensureEsbuildBinary] File not found: ${bundledPath}`)
    }

    // Try 2: Check platform-specific esbuild package in unpacked directory
    const packageName = this.getPlatformPackageName()
    logger.info(
      `[ArtifactTranspilerService.ensureEsbuildBinary] Try 2: Platform package name: ${packageName || 'none'}`
    )
    if (packageName) {
      const platformSpecificPath = join(
        process.resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        packageName,
        'bin',
        this.getBinaryFilename()
      )

      logger.info(
        `[ArtifactTranspilerService.ensureEsbuildBinary] Checking platform-specific path: ${platformSpecificPath}`
      )
      if (await this.fileExists(platformSpecificPath)) {
        logger.info(`[ArtifactTranspilerService.ensureEsbuildBinary] ✓ esbuild file found at ${platformSpecificPath}`)
        if (await this.ensureExecutable(platformSpecificPath)) {
          process.env.ESBUILD_BINARY_PATH = platformSpecificPath
          logger.info(
            `[ArtifactTranspilerService.ensureEsbuildBinary] ✓ esbuild file is executable, using platform-specific binary at ${platformSpecificPath}`
          )
          logger.info(`[ArtifactTranspilerService.ensureEsbuildBinary] EXIT - Success (platform-specific path)`)
          return
        } else {
          logger.warn(
            `[ArtifactTranspilerService.ensureEsbuildBinary] File exists but is not executable: ${platformSpecificPath}`
          )
        }
      } else {
        logger.info(`[ArtifactTranspilerService.ensureEsbuildBinary] File not found: ${platformSpecificPath}`)
      }
    }

    // Try 3: Download to userData as fallback
    if (!packageName) {
      logger.warn(
        `[ArtifactTranspilerService] No esbuild binary package mapping for ${process.platform}/${process.arch}`
      )
      return
    }

    const fallbackPath = this.getUserDataBinaryPath(packageName)
    logger.info(`[ArtifactTranspilerService.ensureEsbuildBinary] Try 3: Checking fallback path: ${fallbackPath}`)
    if (await this.fileExists(fallbackPath)) {
      logger.info(`[ArtifactTranspilerService.ensureEsbuildBinary] ✓ esbuild file found at ${fallbackPath}`)
      if (await this.ensureExecutable(fallbackPath)) {
        process.env.ESBUILD_BINARY_PATH = fallbackPath
        logger.info(
          `[ArtifactTranspilerService.ensureEsbuildBinary] ✓ esbuild file is executable, using downloaded binary at ${fallbackPath}`
        )
        logger.info(`[ArtifactTranspilerService.ensureEsbuildBinary] EXIT - Success (fallback path)`)
        return
      } else {
        logger.warn(
          `[ArtifactTranspilerService.ensureEsbuildBinary] File exists but is not executable: ${fallbackPath}`
        )
      }
    } else {
      logger.info(`[ArtifactTranspilerService.ensureEsbuildBinary] File not found: ${fallbackPath}`)
    }

    logger.warn(
      `[ArtifactTranspilerService.ensureEsbuildBinary] Bundled esbuild binary missing. Downloading fallback for ${packageName}...`
    )
    try {
      logger.info(`[ArtifactTranspilerService.ensureEsbuildBinary] Downloading esbuild binary for ${packageName}...`)
      await this.downloadAndExtractEsbuild(packageName, fallbackPath)
      logger.info(`[ArtifactTranspilerService.ensureEsbuildBinary] ✓ esbuild file downloaded to ${fallbackPath}`)
      // Ensure the downloaded binary is executable
      if (await this.ensureExecutable(fallbackPath)) {
        process.env.ESBUILD_BINARY_PATH = fallbackPath
        logger.info(
          `[ArtifactTranspilerService.ensureEsbuildBinary] ✓ esbuild file is executable, using downloaded binary at ${fallbackPath}`
        )
        logger.info(`[ArtifactTranspilerService.ensureEsbuildBinary] EXIT - Success (downloaded)`)
      } else {
        logger.error(
          `[ArtifactTranspilerService.ensureEsbuildBinary] ✗ Downloaded file is not executable: ${fallbackPath}`
        )
      }
    } catch (downloadError) {
      const errorContext = formatErrorWithContext(downloadError, 'ensureEsbuildBinary()')
      logger.error('[ArtifactTranspilerService.ensureEsbuildBinary] ✗ Failed to download esbuild binary:', errorContext)
      throw new Error(
        `Failed to download esbuild binary for ${packageName} at ${errorContext.file}:${errorContext.line} ` +
          `in ${errorContext.function}: ${errorContext.message}. ` +
          `Ensure esbuild packages are unpacked in electron-builder.yml or network access is available.`
      )
    }
  }

  private getPlatformPackageName(): string | undefined {
    const platformMap = ArtifactTranspilerService.ESBUILD_PACKAGES[process.platform as EsbuildSupportedPlatform]
    return platformMap?.[process.arch]
  }

  private getBinaryFilename(): string {
    return process.platform === 'win32' ? 'esbuild.exe' : 'esbuild'
  }

  private getBundledBinaryPath(): string {
    return join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'esbuild', 'bin', this.getBinaryFilename())
  }

  private getUserDataBinaryPath(packageName: string): string {
    return join(
      app.getPath('userData'),
      'esbuild-bin',
      esbuildNative.version,
      packageName,
      'bin',
      this.getBinaryFilename()
    )
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await access(path, fsConstants.F_OK)
      return true
    } catch {
      return false
    }
  }

  private async isExecutable(path: string): Promise<boolean> {
    try {
      await access(path, fsConstants.X_OK)
      return true
    } catch {
      return false
    }
  }

  private async ensureExecutable(path: string): Promise<boolean> {
    if (!(await this.fileExists(path))) {
      logger.debug(`[ArtifactTranspilerService] Binary does not exist: ${path}`)
      return false
    }

    try {
      const stats = await stat(path)
      const mode = stats.mode
      const permissions = (mode & parseInt('777', 8)).toString(8)
      logger.debug(`[ArtifactTranspilerService] Binary exists at ${path}, permissions: ${permissions}`)
    } catch {
      // Ignore stat errors
    }

    if (await this.isExecutable(path)) {
      logger.debug(`[ArtifactTranspilerService] Binary is already executable: ${path}`)
      return true
    }

    // File exists but isn't executable, try to make it executable
    try {
      logger.info(`[ArtifactTranspilerService] Binary exists but is not executable, setting permissions: ${path}`)
      await chmod(path, 0o755)

      // Verify the permissions were set
      const stats = await stat(path)
      const mode = stats.mode
      const permissions = (mode & parseInt('777', 8)).toString(8)
      logger.info(`[ArtifactTranspilerService] Set execute permissions on ${path}, new permissions: ${permissions}`)

      const isNowExecutable = await this.isExecutable(path)
      if (!isNowExecutable) {
        logger.warn(`[ArtifactTranspilerService] Binary permissions set but still not executable: ${path}`)
      }
      return isNowExecutable
    } catch (error) {
      logger.error(`[ArtifactTranspilerService] Failed to set execute permissions on ${path}:`, error as Error)
      return false
    }
  }

  private async downloadAndExtractEsbuild(packageName: string, targetBinaryPath: string): Promise<void> {
    const version = esbuildNative.version
    const downloadUrl = `https://registry.npmjs.org/${packageName}/-/${packageName}-${version}.tgz`
    const tempDir = await mkdtemp(join(tmpdir(), 'esbuild-download-'))
    const archivePath = join(tempDir, `${packageName}-${version}.tgz`)

    try {
      await this.downloadFile(downloadUrl, archivePath)
      await tar.x({ file: archivePath, cwd: tempDir })

      const extractedBinary = join(tempDir, 'package', 'bin', this.getBinaryFilename())

      await mkdir(dirname(targetBinaryPath), { recursive: true })
      await copyFile(extractedBinary, targetBinaryPath)
      await chmod(targetBinaryPath, 0o755)
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  }

  private async downloadFile(url: string, destination: string): Promise<void> {
    await mkdir(dirname(destination), { recursive: true })

    await new Promise<void>((resolve, reject) => {
      const download = (currentUrl: string, redirectCount = 0) => {
        const req = request(currentUrl, (res: IncomingMessage) => {
          const statusCode = res.statusCode ?? 0
          if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
            if (redirectCount > 5) {
              reject(new Error(`Too many redirects while downloading ${url}`))
              return
            }
            const nextUrl = new URL(res.headers.location, currentUrl).toString()
            download(nextUrl, redirectCount + 1)
            req.destroy()
            return
          }

          if (statusCode !== 200) {
            reject(new Error(`Failed to download ${currentUrl}: status ${statusCode}`))
            return
          }

          const fileStream = createWriteStream(destination)
          pipeline(res, fileStream).then(resolve).catch(reject)
        })

        req.on('error', reject)
        req.end()
      }

      download(url)
    })
  }

  /**
   * Pre-process imports to use global variables (e.g., import React → const React = window.React)
   */
  private preprocessImports(code: string): string {
    let processedCode = code

    processedCode = processedCode.replace(
      importStatementRegex,
      (
        _match,
        typeKeyword: string | undefined,
        defaultImport: string,
        namedWithDefault: string,
        namedOnly: string,
        moduleName: string
      ) => {
        if (typeKeyword) {
          return ''
        }

        const resolution = resolveImportExpressions(moduleName)
        if (!resolution) {
          return ''
        }

        const statements: string[] = []

        if (defaultImport) {
          const sanitizedDefault = defaultImport.trim()
          if (sanitizedDefault) {
            const defaultExpr = resolution.defaultExpr ?? resolution.namespaceExpr
            statements.push(`const ${sanitizedDefault} = ${defaultExpr};`)
          }
        }

        const namedSection = namedWithDefault || namedOnly
        if (namedSection) {
          const namespaceExpr = `(${resolution.namespaceExpr})`
          const imports = namedSection
            .split(',')
            .map((segment: string) => {
              const trimmed = segment.trim()
              if (!trimmed) {
                return ''
              }

              const [rawName, rawAlias] = trimmed.split(/\s+as\s+/)
              const importName = rawName?.trim()
              const finalName = (rawAlias || rawName)?.trim()

              if (!importName || !finalName) {
                return ''
              }

              return `const ${finalName} = ${namespaceExpr}.${importName};`
            })
            .filter(Boolean)

          statements.push(...imports)
        }

        return statements.length > 0 ? statements.join('\n') : ''
      }
    )

    processedCode = processedCode.replace(/import\s+['"][^'"]*\.css['"];?\s*\n?/g, '')
    processedCode = processedCode.replace(/import\s+.*?from\s+['"][^'"]+['"];?\n?/g, '')
    processedCode = processedCode.replace(/import\s+type\s+[^'"]+\s+from\s+['"][^'"]+['"];?\s*\n?/g, '')

    return processedCode
  }

  /**
   * Wrap transpiled code in CommonJS-style module wrapper
   */
  private wrapModule(code: string): string {
    return `
(function() {
  try {
    // Clean up previous component
    const existingKeys = Array.isArray(window.__tsxAssignedKeys) ? window.__tsxAssignedKeys : [];
    existingKeys.forEach(function(key) {
      try { delete window[key]; } catch (err) {}
    });
    window.__tsxAssignedKeys = [];
    window.__tsxComponent = null;
    window.__tsxLastModule = null;
  } catch (err) {}

  // Polyfill require for CommonJS modules
  const require = function(moduleName) {
    // Handle CSS imports gracefully (stylesheets already loaded via <link> tags)
    if (typeof moduleName === 'string' && moduleName.endsWith('.css')) {
      // CSS is already loaded in the sandbox, just return empty object
      return {};
    }

    const moduleMap = {
      'react': window.React,
      'react-dom': window.ReactDOM,
      '@xyflow/react': window.ReactFlow,
      'reactflow': window.ReactFlow, // Alias for @xyflow/react
      'lucide-react': window.LucideReact,
      'clsx': window.clsx,
      'axios': window.axios,
      '@supabase/supabase-js': window.supabase,
      'ai': window.AISDK,
      'ai-elements': window.AIElements,
      '@ai-sdk/react': window.AIElements,
      '@ai-sdk/openai': window.AISDKOpenAI,
      '@ai-sdk/anthropic': window.AISDKAnthropic
    };

    if (moduleMap[moduleName]) {
      return moduleMap[moduleName];
    }

    if (typeof moduleName === 'string') {
      if (moduleName.startsWith('langchain/')) {
        const registry = window.LangChain;
        if (registry && registry[moduleName]) {
          return registry[moduleName];
        }
      }
      if (moduleName.startsWith('@langchain/langgraph')) {
        const registry = window.LangGraph;
        if (registry && registry[moduleName]) {
          return registry[moduleName];
        }
      }
      if (moduleName === '@langchain/core/runnables/remote') {
        return {
          RemoteRunnableNotSupported: function () {
            throw new Error('Remote LangChain runnables are unavailable inside the artifact sandbox.')
          }
        }
      }
    }

    throw new Error('Module not found: ' + moduleName + '. Only approved runtime libraries are available.');
  };

  const exports = {};
  const module = { exports };

  ${code}

  const resolved = module.exports || exports;
  if (resolved && typeof resolved === 'object') {
    Object.keys(resolved).forEach(function(key) {
      try {
        window[key] = resolved[key];
        window.__tsxAssignedKeys.push(key);
      } catch (err) {}
    });
    if (resolved.default) {
      window.App = resolved.default;
      window.__tsxComponent = resolved.default;
      window.__tsxLastModule = resolved;
    }
  }
  if (!window.__tsxComponent && typeof resolved === 'function') {
    window.__tsxComponent = resolved;
  }
})();
`
  }

  /**
   * Transpile React/JSX/TSX code using esbuild
   */
  private async transpileReact(
    code: string,
    language: 'typescript' | 'javascript',
    hasJsx: boolean
  ): Promise<TranspileResult> {
    const caller = getCallerInfo()
    logger.info(`[ArtifactTranspilerService.transpileReact] ENTRY at ${caller.file}:${caller.line}`, {
      language,
      hasJsx,
      codeLength: code.length,
      usingWasm: this.usingWasm
    })

    const { loader, extension } = this.resolveReactLoader(language, hasJsx)
    logger.info(`[ArtifactTranspilerService.transpileReact] Resolved loader: ${loader}, extension: ${extension}`)

    try {
      logger.info(`[ArtifactTranspilerService.transpileReact] Calling esbuild.build() with React plugin...`)
      const result = await this.esbuildImpl.build({
        stdin: {
          contents: code,
          resolveDir: process.cwd(),
          sourcefile: `Component.${extension}`,
          loader
        },
        write: false,
        bundle: false,
        format: 'cjs',
        platform: 'browser',
        target: 'es2020',
        sourcemap: 'inline',
        logLevel: 'warning',
        plugins: [react18Plugin()]
      })

      logger.info(`[ArtifactTranspilerService.transpileReact] ✓ esbuild.build() completed, checking output...`)
      const output = result.outputFiles?.[0]
      if (!output) {
        const errorContext = formatErrorWithContext(
          new Error('React transpilation produced no output'),
          'transpileReact()'
        )
        logger.error('[ArtifactTranspilerService.transpileReact] ✗ No output produced:', errorContext)
        throw new Error(`React transpilation produced no output at ${errorContext.file}:${errorContext.line}`)
      }

      logger.info(
        `[ArtifactTranspilerService.transpileReact] Output size: ${output.text.length} chars, warnings: ${result.warnings.length}`
      )
      const wrappedCode = this.wrapModule(output.text)
      logger.info(
        `[ArtifactTranspilerService.transpileReact] EXIT - Success (wrapped code size: ${wrappedCode.length} chars)`
      )

      return {
        code: wrappedCode,
        warnings: result.warnings
      }
    } catch (error) {
      const errorContext = formatErrorWithContext(error, 'transpileReact()')
      if (!hasJsx && this.isJsxNotEnabledError(error)) {
        logger.warn(
          `[ArtifactTranspilerService.transpileReact] JSX syntax error detected at ${errorContext.file}:${errorContext.line}. Retrying with JSX loader...`
        )
        return this.transpileReact(code, language, true)
      }
      logger.error('[ArtifactTranspilerService.transpileReact] ✗ FAILED:', errorContext)
      throw error
    }
  }

  /**
   * Transpile Svelte component using esbuild-svelte
   */
  private async transpileSvelte(code: string): Promise<TranspileResult> {
    const caller = getCallerInfo()
    logger.info(`[ArtifactTranspilerService.transpileSvelte] ENTRY at ${caller.file}:${caller.line}`, {
      codeLength: code.length,
      usingWasm: this.usingWasm
    })

    try {
      logger.info(`[ArtifactTranspilerService.transpileSvelte] Calling esbuild.build() with Svelte plugin...`)
      const result = await this.esbuildImpl.build({
        stdin: {
          contents: code,
          resolveDir: process.cwd(),
          sourcefile: 'Component.svelte'
        },
        bundle: true,
        write: false,
        format: 'cjs',
        platform: 'browser',
        target: 'es2020',
        sourcemap: 'inline',
        logLevel: 'warning',
        plugins: [
          sveltePlugin({
            compilerOptions: {
              css: 'injected',
              generate: 'client'
            }
          })
        ]
      })

      logger.info(`[ArtifactTranspilerService.transpileSvelte] ✓ esbuild.build() completed, checking output...`)
      const output = result.outputFiles?.[0]
      if (!output) {
        const errorContext = formatErrorWithContext(
          new Error('Svelte transpilation produced no output'),
          'transpileSvelte()'
        )
        logger.error('[ArtifactTranspilerService.transpileSvelte] ✗ No output produced:', errorContext)
        throw new Error(`Svelte transpilation produced no output at ${errorContext.file}:${errorContext.line}`)
      }

      logger.info(
        `[ArtifactTranspilerService.transpileSvelte] Output size: ${output.text.length} chars, warnings: ${result.warnings.length}`
      )
      const wrappedCode = this.wrapModule(output.text)
      logger.info(
        `[ArtifactTranspilerService.transpileSvelte] EXIT - Success (wrapped code size: ${wrappedCode.length} chars)`
      )

      return {
        code: wrappedCode,
        warnings: result.warnings
      }
    } catch (error) {
      const errorContext = formatErrorWithContext(error, 'transpileSvelte()')
      logger.error('[ArtifactTranspilerService.transpileSvelte] ✗ FAILED:', errorContext)
      throw error
    }
  }

  /**
   * Transpile Solid component using esbuild-plugin-solid
   */
  private async transpileSolid(code: string): Promise<TranspileResult> {
    const caller = getCallerInfo()
    logger.info(`[ArtifactTranspilerService.transpileSolid] ENTRY at ${caller.file}:${caller.line}`, {
      codeLength: code.length,
      usingWasm: this.usingWasm
    })

    try {
      logger.info(`[ArtifactTranspilerService.transpileSolid] Calling esbuild.build() with Solid plugin...`)
      const result = await this.esbuildImpl.build({
        stdin: {
          contents: code,
          resolveDir: process.cwd(),
          sourcefile: 'Component.tsx'
        },
        write: false,
        bundle: false,
        format: 'cjs',
        platform: 'browser',
        target: 'es2020',
        sourcemap: 'inline',
        logLevel: 'warning',
        plugins: [solidPlugin()]
      })

      logger.info(`[ArtifactTranspilerService.transpileSolid] ✓ esbuild.build() completed, checking output...`)
      const output = result.outputFiles?.[0]
      if (!output) {
        const errorContext = formatErrorWithContext(
          new Error('Solid transpilation produced no output'),
          'transpileSolid()'
        )
        logger.error('[ArtifactTranspilerService.transpileSolid] ✗ No output produced:', errorContext)
        throw new Error(`Solid transpilation produced no output at ${errorContext.file}:${errorContext.line}`)
      }

      logger.info(
        `[ArtifactTranspilerService.transpileSolid] Output size: ${output.text.length} chars, warnings: ${result.warnings.length}`
      )
      const wrappedCode = this.wrapModule(output.text)
      logger.info(
        `[ArtifactTranspilerService.transpileSolid] EXIT - Success (wrapped code size: ${wrappedCode.length} chars)`
      )

      return {
        code: wrappedCode,
        warnings: result.warnings
      }
    } catch (error) {
      const errorContext = formatErrorWithContext(error, 'transpileSolid()')
      logger.error('[ArtifactTranspilerService.transpileSolid] ✗ FAILED:', errorContext)
      throw error
    }
  }

  /**
   * Transpile Vue component using esbuild-plugin-vue3
   */
  private async transpileVue(code: string): Promise<TranspileResult> {
    const caller = getCallerInfo()
    logger.info(`[ArtifactTranspilerService.transpileVue] ENTRY at ${caller.file}:${caller.line}`, {
      codeLength: code.length,
      usingWasm: this.usingWasm
    })

    try {
      logger.info(`[ArtifactTranspilerService.transpileVue] Calling esbuild.build() with Vue plugin...`)
      const result = await this.esbuildImpl.build({
        stdin: {
          contents: code,
          resolveDir: process.cwd(),
          sourcefile: 'Component.vue'
        },
        write: false,
        bundle: true,
        format: 'cjs',
        platform: 'browser',
        target: 'es2020',
        sourcemap: 'inline',
        logLevel: 'warning',
        plugins: [vuePlugin()]
      })

      logger.info(`[ArtifactTranspilerService.transpileVue] ✓ esbuild.build() completed, checking output...`)
      const output = result.outputFiles?.[0]
      if (!output) {
        const errorContext = formatErrorWithContext(new Error('Vue transpilation produced no output'), 'transpileVue()')
        logger.error('[ArtifactTranspilerService.transpileVue] ✗ No output produced:', errorContext)
        throw new Error(`Vue transpilation produced no output at ${errorContext.file}:${errorContext.line}`)
      }

      logger.info(
        `[ArtifactTranspilerService.transpileVue] Output size: ${output.text.length} chars, warnings: ${result.warnings.length}`
      )
      const wrappedCode = this.wrapModule(output.text)
      logger.info(
        `[ArtifactTranspilerService.transpileVue] EXIT - Success (wrapped code size: ${wrappedCode.length} chars)`
      )

      return {
        code: wrappedCode,
        warnings: result.warnings
      }
    } catch (error) {
      const errorContext = formatErrorWithContext(error, 'transpileVue()')
      logger.error('[ArtifactTranspilerService.transpileVue] ✗ FAILED:', errorContext)
      throw error
    }
  }

  /**
   * Main transpile method - routes to appropriate transpiler based on framework
   */
  async transpile(request: TranspileRequest): Promise<TranspileResult> {
    const caller = getCallerInfo()
    logger.info(`[ArtifactTranspilerService.transpile] ENTRY at ${caller.file}:${caller.line}`, {
      framework: request.framework,
      language: request.language,
      filename: request.filename,
      codeLength: request.code.length
    })

    if (!this.isInitialized) {
      logger.info(`[ArtifactTranspilerService.transpile] Not initialized, calling initialize()...`)
      await this.initialize()
    }

    const startTime = performance.now()

    try {
      logger.info(`[ArtifactTranspilerService.transpile] Step 1: Checking for JSX syntax...`)
      const hasJsx = this.containsLikelyJsx(request.code)
      logger.info(`[ArtifactTranspilerService.transpile] JSX detected: ${hasJsx}`)

      // Step 1: Pre-process imports (only for React/Preact/Solid - Svelte/Vue handle imports themselves)
      // Step 2: Transpile with appropriate handler
      let result: TranspileResult

      logger.info(
        `[ArtifactTranspilerService.transpile] Step 2: Routing to framework-specific transpiler: ${request.framework}`
      )
      switch (request.framework) {
        case 'react':
        case 'preact': // Preact uses same JSX syntax
          logger.info(`[ArtifactTranspilerService.transpile] Preprocessing imports for React/Preact...`)
          const processedReactCode = this.preprocessImports(request.code)
          logger.info(
            `[ArtifactTranspilerService.transpile] Preprocessed code length: ${processedReactCode.length} (original: ${request.code.length})`
          )
          result = await this.transpileReact(processedReactCode, request.language, hasJsx)
          break

        case 'svelte':
          logger.info(
            `[ArtifactTranspilerService.transpile] Svelte compiler handles imports internally, skipping preprocessing`
          )
          result = await this.transpileSvelte(request.code)
          break

        case 'vue':
          logger.info(
            `[ArtifactTranspilerService.transpile] Vue compiler handles imports internally, skipping preprocessing`
          )
          result = await this.transpileVue(request.code)
          break

        case 'solid':
          logger.info(`[ArtifactTranspilerService.transpile] Preprocessing imports for Solid...`)
          const processedSolidCode = this.preprocessImports(request.code)
          logger.info(
            `[ArtifactTranspilerService.transpile] Preprocessed code length: ${processedSolidCode.length} (original: ${request.code.length})`
          )
          result = await this.transpileSolid(processedSolidCode)
          break

        default: {
          const errorContext = formatErrorWithContext(
            new Error(`Unsupported framework: ${request.framework}`),
            'transpile()'
          )
          logger.error('[ArtifactTranspilerService.transpile] ✗ Unsupported framework:', errorContext)
          throw new Error(`Unsupported framework: ${request.framework} at ${errorContext.file}:${errorContext.line}`)
        }
      }

      const duration = performance.now() - startTime
      logger.info(
        `[ArtifactTranspilerService.transpile] ✓ Transpilation complete: ${request.framework} artifact in ${duration.toFixed(2)}ms`
      )

      // Log warnings if any
      if (result.warnings && result.warnings.length > 0) {
        logger.warn(
          `[ArtifactTranspilerService.transpile] Transpilation warnings (${result.warnings.length}):`,
          result.warnings
        )
      }

      logger.info(`[ArtifactTranspilerService.transpile] EXIT - Success (final code size: ${result.code.length} chars)`)
      return result
    } catch (error) {
      const duration = performance.now() - startTime
      const errorContext = formatErrorWithContext(error, 'transpile()')
      logger.error(`[ArtifactTranspilerService.transpile] ✗ FAILED after ${duration.toFixed(2)}ms:`, {
        ...errorContext,
        framework: request.framework,
        language: request.language,
        filename: request.filename,
        codeLength: request.code.length
      })

      // Format esbuild errors nicely
      if (error && typeof error === 'object' && 'errors' in error) {
        const esbuildError = error as TransformFailure
        logger.info(
          `[ArtifactTranspilerService.transpile] Formatting esbuild error (${esbuildError.errors.length} error(s))...`
        )
        const firstError = esbuildError.errors[0]

        if (firstError) {
          // Determine default filename based on framework
          const defaultFilename =
            request.framework === 'svelte'
              ? 'Component.svelte'
              : request.framework === 'vue'
                ? 'Component.vue'
                : request.framework === 'solid'
                  ? 'Component.tsx'
                  : `Component.${request.language === 'typescript' ? 'tsx' : 'jsx'}`

          const transpileError: TranspileError = {
            message: firstError.text,
            location: firstError.location
              ? {
                  file: request.filename || defaultFilename,
                  line: firstError.location.line,
                  column: firstError.location.column,
                  lineText: firstError.location.lineText,
                  suggestion: firstError.location.suggestion
                }
              : undefined
          }

          logger.error(`[ArtifactTranspilerService.transpile] ✗ esbuild error formatted:`, {
            ...errorContext,
            esbuildError: {
              text: firstError.text,
              location: transpileError.location
            }
          })
          throw transpileError
        }
      }

      // Generic error
      logger.error(`[ArtifactTranspilerService.transpile] ✗ Generic error (not esbuild):`, errorContext)
      throw {
        ...errorContext,
        message: error instanceof Error ? error.message : String(error)
      } as TranspileError
    }
  }

  /**
   * Cleanup (not needed for esbuild, but provided for consistency)
   */
  async dispose(): Promise<void> {
    // esbuild doesn't need explicit cleanup
    this.isInitialized = false
    logger.info('ArtifactTranspilerService disposed')
  }

  private resolveReactLoader(
    language: 'typescript' | 'javascript',
    hasJsx: boolean
  ): {
    loader: Loader
    extension: string
  } {
    if (language === 'typescript') {
      return { loader: 'tsx', extension: 'tsx' }
    }

    if (hasJsx) {
      return { loader: 'jsx', extension: 'jsx' }
    }

    return { loader: 'js', extension: 'js' }
  }

  private containsLikelyJsx(code: string): boolean {
    const stripped = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    const tagPattern = /<\s*([A-Za-z][\w-]*|>)/m
    const fragmentPattern = /return\s*\(\s*(<>|<\/?[A-Za-z])/m
    const reactCreateElementPattern = /React\.createElement\s*\(/m
    return tagPattern.test(stripped) || fragmentPattern.test(stripped) || reactCreateElementPattern.test(stripped)
  }

  private isJsxNotEnabledError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false
    }

    const hasExplicitMessage =
      'message' in error && typeof (error as { message?: string }).message === 'string'
        ? (error as { message: string }).message
        : ''

    if (hasExplicitMessage.toLowerCase().includes('jsx syntax extension is not currently enabled')) {
      return true
    }

    if ('errors' in error) {
      const transformError = error as TransformFailure
      return (
        Array.isArray(transformError.errors) &&
        transformError.errors.some((e) =>
          e.text?.toLowerCase().includes('jsx syntax extension is not currently enabled')
        )
      )
    }

    return false
  }
}

// Export singleton instance
export const artifactTranspilerService = new ArtifactTranspilerService()
