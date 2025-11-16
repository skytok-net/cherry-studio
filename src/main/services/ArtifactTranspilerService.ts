import { constants as fsConstants, createWriteStream } from 'node:fs'
import { access, chmod, copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { IncomingMessage } from 'node:http'
import { request } from 'node:https'

import { loggerService } from '@logger'
import checkDiskSpace from 'check-disk-space'
import { app } from 'electron'
import type { Loader, Message, TransformFailure } from 'esbuild'
import * as esbuildNative from 'esbuild'
import react18Plugin from 'esbuild-plugin-react18'
import { solidPlugin } from 'esbuild-plugin-solid'
import sveltePlugin from 'esbuild-svelte'
import * as tar from 'tar'
import vuePlugin from 'esbuild-plugin-vue3'

const logger = loggerService.withContext('ArtifactTranspilerService')

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

/**
 * Global import mappings for artifact libraries
 */
const GLOBAL_IMPORT_MAP: Record<string, string> = {
  react: 'React',
  'react-dom': 'ReactDOM',
  'react/jsx-runtime': 'React',
  '@xyflow/react': 'ReactFlow',
  // Alias for legacy reactflow package name used in many examples
  reactflow: 'ReactFlow',
  'lucide-react': 'LucideReact',
  clsx: 'clsx'
}

/**
 * Service for transpiling artifact code (React, Svelte, etc.) using native esbuild
 * This runs in the main process for maximum performance (10-50ms vs 500-2000ms with Babel)
 */
export class ArtifactTranspilerService {
  private isInitialized = false
  private esbuildImpl: typeof esbuildNative = esbuildNative

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
    if (this.isInitialized) {
      return
    }

    try {
      await this.ensureDiskSpace()
      await this.ensureEsbuildBinary()

      // Test native esbuild
      try {
        await this.esbuildImpl.transform('let __esbuild_probe__ = 1', { loader: 'js' })
        logger.info(`Native esbuild initialized successfully (version ${this.esbuildImpl.version})`)
      } catch (nativeError) {
        // Native esbuild failed - try to download/ensure binary is available
        logger.warn('Native esbuild probe failed, attempting to ensure binary is available...', nativeError as Error)
        
        // Try to ensure binary one more time
        await this.ensureEsbuildBinary()
        
        // Retry the probe
        try {
          await this.esbuildImpl.transform('let __esbuild_probe__ = 1', { loader: 'js' })
          logger.info(`Native esbuild initialized successfully after retry (version ${this.esbuildImpl.version})`)
        } catch (retryError) {
          logger.error('Native esbuild failed to initialize after retry', {
            originalError: nativeError as Error,
            retryError: retryError as Error,
            isPackaged: app && app.isPackaged ? app.isPackaged : false,
            esbuildBinaryPath: process.env.ESBUILD_BINARY_PATH,
            platform: process.platform,
            arch: process.arch,
            resourcesPath: process.resourcesPath
          })
          
          // Provide helpful error message
          const errorDetails = [
            `Platform: ${process.platform}/${process.arch}`,
            `Packaged: ${app && app.isPackaged ? app.isPackaged : false}`,
            `ESBUILD_BINARY_PATH: ${process.env.ESBUILD_BINARY_PATH || 'not set'}`,
            `Resources path: ${process.resourcesPath}`
          ].join(', ')
          
          throw new Error(
            `Failed to initialize native esbuild. ${errorDetails}. ` +
            `Ensure esbuild binary is unpacked in electron-builder.yml and ESBUILD_BINARY_PATH is set correctly.`
          )
        }
      }

      logger.info(`esbuild initialized (version ${this.esbuildImpl.version})`)

      this.isInitialized = true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorStack = error instanceof Error ? error.stack : undefined
      logger.error('Failed to initialize esbuild:', {
        message: errorMessage,
        stack: errorStack,
        error: error,
        isPackaged: app && app.isPackaged ? app.isPackaged : false,
        platform: process.platform,
        arch: process.arch,
        esbuildBinaryPath: process.env.ESBUILD_BINARY_PATH,
        resourcesPath: process.resourcesPath
      })
      throw new Error(`Failed to initialize transpiler service: ${errorMessage}`)
    }
  }

  /**
   * Ensure there is enough free disk space for esbuild temp files
   */
  private async ensureDiskSpace(): Promise<void> {
    try {
      const targetPath = (app && app.isPackaged) ? process.resourcesPath : process.cwd()
      const info = await checkDiskSpace(targetPath)
      const freeGB = info.free / (1024 ** 3)
      if (freeGB < 0.5) {
        logger.warn(
          `[ArtifactTranspilerService] Low disk space detected (${freeGB.toFixed(
            2
          )} GB free). Esbuild may fail if insufficient space is available.`
        )
      } else {
        logger.info(
          `[ArtifactTranspilerService] Disk space check OK (${freeGB.toFixed(2)} GB free at ${targetPath}).`
        )
      }
    } catch (error) {
      logger.warn('[ArtifactTranspilerService] Unable to determine disk space', error as Error)
    }
  }

  private async ensureEsbuildBinary(): Promise<void> {
    if (!app || !app.isPackaged) {
      delete process.env.ESBUILD_BINARY_PATH
      return
    }

    // Try 1: Check generic esbuild binary in unpacked directory
    const bundledPath = this.getBundledBinaryPath()
    if (await this.isExecutable(bundledPath)) {
      process.env.ESBUILD_BINARY_PATH = bundledPath
      logger.info(`[ArtifactTranspilerService] Using bundled esbuild binary at ${bundledPath}`)
      return
    }

    // Try 2: Check platform-specific esbuild package in unpacked directory
    const packageName = this.getPlatformPackageName()
    if (packageName) {
      const platformSpecificPath = join(
        process.resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        packageName,
        'bin',
        this.getBinaryFilename()
      )
      
      if (await this.isExecutable(platformSpecificPath)) {
        process.env.ESBUILD_BINARY_PATH = platformSpecificPath
        logger.info(`[ArtifactTranspilerService] Using platform-specific esbuild binary at ${platformSpecificPath}`)
        return
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
    if (!(await this.isExecutable(fallbackPath))) {
      logger.warn(
        `[ArtifactTranspilerService] Bundled esbuild binary missing. Downloading fallback for ${packageName}...`
      )
      try {
        await this.downloadAndExtractEsbuild(packageName, fallbackPath)
      } catch (downloadError) {
        logger.error('Failed to download esbuild binary:', downloadError as Error)
        throw new Error(
          `Failed to download esbuild binary for ${packageName}. ` +
          `Ensure esbuild packages are unpacked in electron-builder.yml or network access is available.`
        )
      }
    }

    process.env.ESBUILD_BINARY_PATH = fallbackPath
    logger.info(`[ArtifactTranspilerService] Using downloaded esbuild binary at ${fallbackPath}`)
  }

  private getPlatformPackageName(): string | undefined {
    const platformMap =
      ArtifactTranspilerService.ESBUILD_PACKAGES[process.platform as EsbuildSupportedPlatform]
    return platformMap?.[process.arch]
  }

  private getBinaryFilename(): string {
    return process.platform === 'win32' ? 'esbuild.exe' : 'esbuild'
  }

  private getBundledBinaryPath(): string {
    return join(
      process.resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      'esbuild',
      'bin',
      this.getBinaryFilename()
    )
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

  private async isExecutable(path: string): Promise<boolean> {
    try {
      await access(path, fsConstants.X_OK)
      return true
    } catch {
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

    // Transform each known import to global variable access
    Object.entries(GLOBAL_IMPORT_MAP).forEach(([module, globalVar]) => {
      const escapedModule = module.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

      // Match three patterns:
      // 1. import Default from 'module'
      // 2. import { Named } from 'module'
      // 3. import Default, { Named } from 'module'
      const importRegex = new RegExp(
        `import\\s+(?:([\\w*]+)(?:\\s*,\\s*{([^}]+)})?|{([^}]+)})\\s+from\\s+['"]${escapedModule}['"]`,
        'g'
      )

      processedCode = processedCode.replace(importRegex, (match, defaultImport, namedWithDefault, namedOnly) => {
        const parts: string[] = []

        // Handle default import
        if (defaultImport) {
          // Special handling for ReactFlow: default import should be the ReactFlow component
          if (module === '@xyflow/react' || module === 'reactflow') {
            parts.push(`const ${defaultImport} = window.${globalVar}.ReactFlow;`)
          } else {
            parts.push(`const ${defaultImport} = window.${globalVar};`)
          }
        }

        // Handle named imports
        const namedImports = namedWithDefault || namedOnly
        if (namedImports) {
          const imports = namedImports
            .split(',')
            .map((imp: string) => {
              const trimmed = imp.trim()
              if (!trimmed) return ''

              const [name, alias] = trimmed.split(/\s+as\s+/)
              const finalName = (alias || name).trim()
              const importName = name.trim()

              if (!finalName || !importName) return ''

              // For ReactFlow modules, named imports come from the ReactFlow namespace
              if (module === '@xyflow/react' || module === 'reactflow') {
                return `const ${finalName} = window.${globalVar}.${importName};`
              }

              return `const ${finalName} = window.${globalVar}.${importName};`
            })
            .filter(Boolean)

          parts.push(...imports)
        }

        return parts.length > 0 ? parts.join('\n') : match
      })
    })

    // Remove CSS imports (stylesheets are already loaded via <link> tags in sandbox)
    // Matches: import "file.css", import './file.css', import '../file.css', etc.
    processedCode = processedCode.replace(/import\s+['"][^'"]*\.css['"];?\s*\n?/g, '')
    
    // Remove remaining unknown imports (will error if used)
    processedCode = processedCode.replace(/import\s+.*?from\s+['"][^'"]+['"];?\n?/g, '')

    // Remove type-only imports
    processedCode = processedCode.replace(/import\s+type\s+[^'"]+\s+from\s+['"][^'"]+['"];?\n?/g, '')

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
      'clsx': window.clsx
    };
    
    if (moduleMap[moduleName]) {
      return moduleMap[moduleName];
    }
    
    throw new Error('Module not found: ' + moduleName + '. Only React, ReactFlow, Lucide, and clsx are available.');
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
    const { loader, extension } = this.resolveReactLoader(language, hasJsx)

    try {
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

      const output = result.outputFiles?.[0]
      if (!output) {
        throw new Error('React transpilation produced no output')
      }

      return {
        code: this.wrapModule(output.text),
        warnings: result.warnings
      }
    } catch (error) {
      if (!hasJsx && this.isJsxNotEnabledError(error)) {
        logger.warn(
          '[ArtifactTranspilerService] JSX syntax error detected for artifact marked as plain JS. Retrying with JSX loader...'
        )
        return this.transpileReact(code, language, true)
      }
      throw error
    }
  }

  /**
   * Transpile Svelte component using esbuild-svelte
   */
  private async transpileSvelte(code: string): Promise<TranspileResult> {
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

    const output = result.outputFiles?.[0]
    if (!output) {
      throw new Error('Svelte transpilation produced no output')
    }

    return {
      code: this.wrapModule(output.text),
      warnings: result.warnings
    }
  }

  /**
   * Transpile Solid component using esbuild-plugin-solid
   */
  private async transpileSolid(code: string): Promise<TranspileResult> {
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

    const output = result.outputFiles?.[0]
    if (!output) {
      throw new Error('Solid transpilation produced no output')
    }

    return {
      code: this.wrapModule(output.text),
      warnings: result.warnings
    }
  }

  /**
   * Transpile Vue component using esbuild-plugin-vue3
   */
  private async transpileVue(code: string): Promise<TranspileResult> {
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

    const output = result.outputFiles?.[0]
    if (!output) {
      throw new Error('Vue transpilation produced no output')
    }

    return {
      code: this.wrapModule(output.text),
      warnings: result.warnings
    }
  }

  /**
   * Main transpile method - routes to appropriate transpiler based on framework
   */
  async transpile(request: TranspileRequest): Promise<TranspileResult> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    const startTime = performance.now()

    try {
      const hasJsx = this.containsLikelyJsx(request.code)
      
      logger.debug('Transpiling artifact:', {
        framework: request.framework,
        language: request.language,
        codeLength: request.code.length
      })

      // Step 1: Pre-process imports (only for React/Preact/Solid - Svelte/Vue handle imports themselves)
      // Step 2: Transpile with appropriate handler
      let result: TranspileResult

      switch (request.framework) {
        case 'react':
        case 'preact': // Preact uses same JSX syntax
          const processedReactCode = this.preprocessImports(request.code)
          result = await this.transpileReact(processedReactCode, request.language, hasJsx)
          break

        case 'svelte':
          // Svelte compiler handles imports internally - don't preprocess
          result = await this.transpileSvelte(request.code)
          break

        case 'vue':
          // Vue compiler handles imports internally - don't preprocess
          result = await this.transpileVue(request.code)
          break

        case 'solid':
          const processedSolidCode = this.preprocessImports(request.code)
          result = await this.transpileSolid(processedSolidCode)
          break

        default:
          throw new Error(`Unsupported framework: ${request.framework}`)
      }

      const duration = performance.now() - startTime
      logger.info(`Transpiled ${request.framework} artifact in ${duration.toFixed(2)}ms`)

      // Log warnings if any
      if (result.warnings && result.warnings.length > 0) {
        logger.warn('Transpilation warnings:', result.warnings)
      }

      return result
    } catch (error) {
      const duration = performance.now() - startTime
      logger.error(`Transpilation failed after ${duration.toFixed(2)}ms:`, error as Error)

      // Format esbuild errors nicely
      if (error && typeof error === 'object' && 'errors' in error) {
        const esbuildError = error as TransformFailure
        const firstError = esbuildError.errors[0]

        if (firstError) {
          // Determine default filename based on framework
          const defaultFilename = 
            request.framework === 'svelte' ? 'Component.svelte' :
            request.framework === 'vue' ? 'Component.vue' :
            request.framework === 'solid' ? 'Component.tsx' :
            `Component.${request.language === 'typescript' ? 'tsx' : 'jsx'}`
          
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

          throw transpileError
        }
      }

      // Generic error
      throw {
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

  private resolveReactLoader(language: 'typescript' | 'javascript', hasJsx: boolean): {
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

