import { loggerService } from '@logger'
import * as esbuild from 'esbuild'

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
  warnings?: esbuild.Message[]
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

  /**
   * Initialize the service (esbuild is ready to use immediately)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      // esbuild is ready to use immediately (no initialization needed)
      // Just verify it's available
      const version = esbuild.version
      logger.info(`esbuild initialized (version ${version})`)
      this.isInitialized = true
    } catch (error) {
      logger.error('Failed to initialize esbuild:', error as Error)
      throw new Error('Failed to initialize transpiler service')
    }
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
  private async transpileReact(code: string, language: 'typescript' | 'javascript'): Promise<TranspileResult> {
    const loader = language === 'typescript' ? 'tsx' : 'jsx'

    const result = await esbuild.transform(code, {
      loader,
      jsx: 'transform',
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
      target: 'es2020',
      format: 'cjs',
      sourcemap: 'inline'
    })

    return {
      code: this.wrapModule(result.code),
      warnings: result.warnings
    }
  }

  /**
   * Transpile Svelte component
   * Note: Requires esbuild-svelte plugin (optional dependency)
   */
  private async transpileSvelte(_code: string): Promise<TranspileResult> {
    // TODO: Implement Svelte support with esbuild-svelte plugin
    // For now, return error
    throw new Error(
      'Svelte transpilation not yet implemented. Install esbuild-svelte plugin and uncomment implementation.'
    )

    /*
    // Example implementation (requires esbuild-svelte):
    import { svelte } from 'esbuild-svelte'
    
    const result = await esbuild.build({
      stdin: {
        contents: code,
        loader: 'ts',
        resolveDir: '.'
      },
      plugins: [svelte()],
      format: 'cjs',
      bundle: false,
      write: false,
      sourcemap: 'inline'
    })
    
    return {
      code: result.outputFiles[0].text,
      warnings: result.warnings
    }
    */
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
      // Step 1: Pre-process imports
      const processedCode = this.preprocessImports(request.code)

      logger.debug('Transpiling artifact:', {
        framework: request.framework,
        language: request.language,
        codeLength: request.code.length
      })

      // Step 2: Transpile with appropriate handler
      let result: TranspileResult

      switch (request.framework) {
        case 'react':
        case 'preact': // Preact uses same JSX syntax
          result = await this.transpileReact(processedCode, request.language)
          break

        case 'svelte':
          result = await this.transpileSvelte(processedCode)
          break

        case 'vue':
        case 'solid':
          throw new Error(`${request.framework} support not yet implemented`)

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
        const esbuildError = error as esbuild.TransformFailure
        const firstError = esbuildError.errors[0]

        if (firstError) {
          const transpileError: TranspileError = {
            message: firstError.text,
            location: firstError.location
              ? {
                  file: request.filename || 'Component.tsx',
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
}

// Export singleton instance
export const artifactTranspilerService = new ArtifactTranspilerService()

