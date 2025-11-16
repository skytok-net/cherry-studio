#!/usr/bin/env node

import * as esbuild from 'esbuild'
import react18Plugin from 'esbuild-plugin-react18'
import { solidPlugin } from 'esbuild-plugin-solid'
import vuePlugin from 'esbuild-plugin-vue3'
import sveltePlugin from 'esbuild-svelte'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

/**
 * Artifact Transpiler Test Utility
 *
 * This utility demonstrates how the Cherry Studio artifact transpiler works
 * using esbuild with various framework plugins.
 */

type Framework = 'react' | 'svelte' | 'vue' | 'solid' | 'preact'

interface TranspileOptions {
  framework: Framework
  inputFile: string
  outputFile: string
}

/**
 * Global import mappings (same as artifact service)
 */
const GLOBAL_IMPORT_MAP: Record<string, string> = {
  react: 'React',
  'react-dom': 'ReactDOM',
  'react/jsx-runtime': 'React',
  '@xyflow/react': 'ReactFlow',
  reactflow: 'ReactFlow',
  'lucide-react': 'LucideReact',
  clsx: 'clsx'
}

/**
 * Pre-process imports to use global variables
 */
function preprocessImports(code: string): string {
  let processedCode = code

  Object.entries(GLOBAL_IMPORT_MAP).forEach(([module, globalVar]) => {
    const escapedModule = module.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    const importRegex = new RegExp(
      `import\\s+(?:([\\w*]+)(?:\\s*,\\s*{([^}]+)})?|{([^}]+)})\\s+from\\s+['"]${escapedModule}['"]`,
      'g'
    )

    processedCode = processedCode.replace(importRegex, (match, defaultImport, namedWithDefault, namedOnly) => {
      const parts: string[] = []

      if (defaultImport) {
        if (module === '@xyflow/react' || module === 'reactflow') {
          parts.push(`const ${defaultImport} = window.${globalVar}.ReactFlow;`)
        } else {
          parts.push(`const ${defaultImport} = window.${globalVar};`)
        }
      }

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

  // Remove CSS imports
  processedCode = processedCode.replace(/import\s+['"][^'"]*\.css['"];?\s*\n?/g, '')

  // Remove remaining unknown imports
  processedCode = processedCode.replace(/import\s+.*?from\s+['"][^'"]+['"];?\n?/g, '')

  // Remove type-only imports
  processedCode = processedCode.replace(/import\s+type\s+[^'"]+\s+from\s+['"][^'"]+['"];?\n?/g, '')

  return processedCode
}

/**
 * Wrap transpiled code in module wrapper
 */
function wrapModule(code: string): string {
  return `
(function() {
  try {
    const existingKeys = Array.isArray(window.__tsxAssignedKeys) ? window.__tsxAssignedKeys : [];
    existingKeys.forEach(function(key) {
      try { delete window[key]; } catch (err) {}
    });
    window.__tsxAssignedKeys = [];
    window.__tsxComponent = null;
    window.__tsxLastModule = null;
  } catch (err) {}

  const require = function(moduleName) {
    if (typeof moduleName === 'string' && moduleName.endsWith('.css')) {
      return {};
    }

    const moduleMap = {
      'react': window.React,
      'react-dom': window.ReactDOM,
      '@xyflow/react': window.ReactFlow,
      'reactflow': window.ReactFlow,
      'lucide-react': window.LucideReact,
      'clsx': window.clsx
    };

    if (moduleMap[moduleName]) {
      return moduleMap[moduleName];
    }

    throw new Error('Module not found: ' + moduleName);
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
 * Transpile React/Preact component
 */
async function transpileReact(code: string, loader: esbuild.Loader): Promise<string> {
  const result = await esbuild.build({
    stdin: {
      contents: code,
      resolveDir: process.cwd(),
      sourcefile: `Component.${loader === 'tsx' ? 'tsx' : 'jsx'}`,
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

  return output.text
}

/**
 * Transpile Svelte component
 */
async function transpileSvelte(code: string): Promise<string> {
  const result = await esbuild.build({
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
          css: true,
          generate: 'dom'
        }
      })
    ]
  })

  const output = result.outputFiles?.[0]
  if (!output) {
    throw new Error('Svelte transpilation produced no output')
  }

  return output.text
}

/**
 * Transpile Solid component
 */
async function transpileSolid(code: string): Promise<string> {
  const result = await esbuild.build({
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

  return output.text
}

/**
 * Transpile Vue component
 */
async function transpileVue(code: string): Promise<string> {
  const result = await esbuild.build({
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

  return output.text
}

/**
 * Main transpile function
 */
async function transpile(options: TranspileOptions): Promise<void> {
  console.log(`\n📦 Transpiling ${options.framework} component...`)
  console.log(`   Input: ${options.inputFile}`)
  console.log(`   Output: ${options.outputFile}`)

  const startTime = performance.now()

  try {
    // Read source code
    const code = readFileSync(options.inputFile, 'utf-8')

    // Transpile based on framework
    let transpiledCode: string

    switch (options.framework) {
      case 'react':
      case 'preact':
        // React/Preact: preprocess imports BEFORE transpilation
        const processedCode = preprocessImports(code)
        console.log(`   ✓ Pre-processed imports`)
        transpiledCode = await transpileReact(processedCode, 'tsx')
        break
      case 'svelte':
        // Svelte: transpile first, then preprocess the output
        transpiledCode = await transpileSvelte(code)
        transpiledCode = preprocessImports(transpiledCode)
        console.log(`   ✓ Post-processed imports`)
        break
      case 'vue':
        // Vue: transpile first, then preprocess the output
        transpiledCode = await transpileVue(code)
        transpiledCode = preprocessImports(transpiledCode)
        console.log(`   ✓ Post-processed imports`)
        break
      case 'solid':
        // Solid: preprocess imports BEFORE transpilation
        const processedSolidCode = preprocessImports(code)
        console.log(`   ✓ Pre-processed imports`)
        transpiledCode = await transpileSolid(processedSolidCode)
        break
      default:
        throw new Error(`Unsupported framework: ${options.framework}`)
    }

    console.log(`   ✓ Transpiled with esbuild`)

    // Wrap in module wrapper
    const wrappedCode = wrapModule(transpiledCode)

    console.log(`   ✓ Wrapped in module loader`)

    // Write output
    writeFileSync(options.outputFile, wrappedCode, 'utf-8')

    const duration = performance.now() - startTime
    console.log(`   ✅ Complete in ${duration.toFixed(2)}ms\n`)
  } catch (error) {
    console.error(`   ❌ Error:`, error)
    throw error
  }
}

/**
 * CLI entry point
 */
async function main() {
  const args = process.argv.slice(2)

  console.log('🔧 Artifact Transpiler Test Utility\n')
  console.log('This utility demonstrates esbuild transpilation for various frameworks.')
  console.log('It uses the same plugins and methods as the Cherry Studio artifact service.\n')

  // Parse arguments
  const frameworkArg = args.find((arg) => arg.startsWith('--framework='))
  const allFlag = args.includes('--all')

  const frameworks: Framework[] = ['react', 'svelte', 'vue', 'solid', 'preact']

  let selectedFrameworks: Framework[]

  if (allFlag) {
    selectedFrameworks = frameworks
  } else if (frameworkArg) {
    const framework = frameworkArg.split('=')[1] as Framework
    if (!frameworks.includes(framework)) {
      console.error(`❌ Invalid framework: ${framework}`)
      console.error(`   Valid frameworks: ${frameworks.join(', ')}`)
      process.exit(1)
    }
    selectedFrameworks = [framework]
  } else {
    selectedFrameworks = frameworks
  }

  // Ensure output directory exists
  const outputDir = join(process.cwd(), 'output')
  mkdirSync(outputDir, { recursive: true })

  // Transpile each framework
  const results: { framework: Framework; success: boolean; error?: Error }[] = []

  for (const framework of selectedFrameworks) {
    const extension = framework === 'svelte' ? 'svelte' : framework === 'vue' ? 'vue' : 'tsx'
    const inputFile = join(process.cwd(), 'src', 'samples', `${framework}.${extension}`)
    const outputFile = join(outputDir, `${framework}.js`)

    try {
      await transpile({ framework, inputFile, outputFile })
      results.push({ framework, success: true })
    } catch (error) {
      results.push({ framework, success: false, error: error as Error })
    }
  }

  // Print summary
  console.log('\n📊 Summary:')
  console.log('━'.repeat(50))

  results.forEach(({ framework, success, error }) => {
    const status = success ? '✅' : '❌'
    console.log(`${status} ${framework.padEnd(10)} - ${success ? 'Success' : `Failed: ${error?.message}`}`)
  })

  console.log('━'.repeat(50))

  const successCount = results.filter((r) => r.success).length
  console.log(`\n${successCount}/${results.length} transpilations successful\n`)

  // Exit with error code if any failed
  if (successCount < results.length) {
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
