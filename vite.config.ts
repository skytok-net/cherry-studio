import react from '@vitejs/plugin-react-swc'
import { CodeInspectorPlugin } from 'code-inspector-plugin'
import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron'
import { resolve } from 'path'
import { visualizer } from 'rollup-plugin-visualizer'
import { fileURLToPath } from 'url'
import pkg from './package.json'

// ESM equivalent of __dirname
const __dirname = fileURLToPath(new URL('.', import.meta.url))

const visualizerPlugin = (type: 'renderer' | 'main') => {
  return process.env[`VISUALIZER_${type.toUpperCase()}`] ? [visualizer({ open: true })] : []
}

const isDev = process.env.NODE_ENV === 'development'
const isProd = process.env.NODE_ENV === 'production'

export default defineConfig({
  plugins: [
    react({
      tsDecorators: true
    }),
    electron([
      {
        // Main process entry point
        entry: resolve(__dirname, 'src/main/index.ts'),
        vite: {
          resolve: {
            alias: {
              '@main': resolve('src/main'),
              '@types': resolve('src/renderer/src/types'),
              '@shared': resolve('packages/shared'),
              '@logger': resolve('src/main/services/LoggerService'),
              '@mcp-trace/trace-core': resolve('packages/mcp-trace/trace-core'),
              '@mcp-trace/trace-node': resolve('packages/mcp-trace/trace-node')
            }
          },
          build: {
            rollupOptions: {
              external: ['bufferutil', 'utf-8-validate', 'electron', 'esbuild', ...Object.keys(pkg.dependencies)]
            },
            sourcemap: isDev
          },
          esbuild: isProd ? { legalComments: 'none' } : {}
        }
      },
      {
        // Preload scripts
        entry: resolve(__dirname, 'src/preload/index.ts'),
        onstart(args) {
          // Notify the Renderer process to reload the page when the Preload scripts build is complete
          args.reload()
        },
        vite: {
          resolve: {
            alias: {
              '@shared': resolve('packages/shared'),
              '@mcp-trace/trace-core': resolve('packages/mcp-trace/trace-core')
            }
          },
          build: {
            sourcemap: isDev
          }
        }
      }
    ]),
    (async () => (await import('@tailwindcss/vite')).default())(),
    ...(isDev ? [CodeInspectorPlugin({ bundler: 'vite' })] : []),
    ...visualizerPlugin('renderer')
  ],
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@shared': resolve('packages/shared'),
      '@types': resolve('src/renderer/src/types'),
      '@logger': resolve('src/renderer/src/services/LoggerService'),
      '@mcp-trace/trace-core': resolve('packages/mcp-trace/trace-core'),
      '@mcp-trace/trace-web': resolve('packages/mcp-trace/trace-web'),
      '@cherrystudio/ai-core/provider': resolve('packages/aiCore/src/core/providers'),
      '@cherrystudio/ai-core/built-in/plugins': resolve('packages/aiCore/src/core/plugins/built-in'),
      '@cherrystudio/ai-core': resolve('packages/aiCore/src'),
      '@cherrystudio/extension-table-plus': resolve('packages/extension-table-plus/src'),
      '@cherrystudio/ai-sdk-provider': resolve('packages/ai-sdk-provider/src')
    }
  },
  optimizeDeps: {
    exclude: ['pyodide'],
    // Dedupe CodeMirror packages to prevent multiple instances
    include: [
      '@codemirror/state',
      '@codemirror/view',
      '@codemirror/language',
      '@codemirror/lint',
      'codemirror',
      '@uiw/react-codemirror',
      '@codesandbox/sandpack-react'
    ]
  },
  worker: {
    format: 'es'
  },
  define: {
    // Prevent path module externalization warnings in development
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
  },
  build: {
    target: 'esnext', // for build
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'src/renderer/index.html'),
        miniWindow: resolve(__dirname, 'src/renderer/miniWindow.html'),
        selectionToolbar: resolve(__dirname, 'src/renderer/selectionToolbar.html'),
        selectionAction: resolve(__dirname, 'src/renderer/selectionAction.html'),
        traceWindow: resolve(__dirname, 'src/renderer/traceWindow.html')
      },
      output: {
        manualChunks(id) {
          // Ensure CodeMirror packages are bundled together to prevent duplication
          if (id.includes('@codemirror/')) {
            return 'codemirror'
          }
          if (id.includes('@uiw/react-codemirror') || id.includes('@uiw/codemirror')) {
            return 'codemirror'
          }
          if (id.includes('codemirror-lang-') || id.includes('@viz-js/lang-')) {
            return 'codemirror'
          }
          // Group sandpack and related dependencies to prevent duplication
          if (id.includes('@codesandbox/sandpack')) {
            return 'sandpack'
          }
          return undefined
        }
      },
      onwarn(warning, warn) {
        if (warning.code === 'COMMONJS_VARIABLE_IN_ESM') return
        // Suppress path module externalization warnings - handled by sandbox shim
        if (warning.message?.includes('Module "path" has been externalized')) return
        if (warning.message?.includes('Cannot access "path.extname" in client code')) return
        warn(warning)
      }
    }
  },
  esbuild: isProd ? { legalComments: 'none' } : {}
})
