import { loggerService } from '@logger'
import { FileCode2Icon, Loader2Icon, PlayIcon, RefreshCwIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

const logger = loggerService.withContext('UniversalArtifactViewer')

/**
 * Supported artifact frameworks
 */
export type ArtifactFramework = 'react' | 'preact' | 'svelte' | 'vue' | 'solid'

/**
 * Artifact metadata
 */
export interface ArtifactMetadata {
  framework: ArtifactFramework
  language: 'typescript' | 'javascript'
  title?: string
  description?: string
}

/**
 * Props for UniversalArtifactViewer
 */
export interface UniversalArtifactViewerProps {
  code: string
  metadata: ArtifactMetadata
  blockId?: string
  conversationHistory?: string[]
  onError?: (error: Error) => void
  onSuccess?: () => void
}

/**
 * Framework runtime dependencies (CDN)
 */
const FRAMEWORK_RUNTIMES: Record<ArtifactFramework, { scripts: string[]; styles: string[] }> = {
  react: {
    scripts: [
      'https://unpkg.com/react@18/umd/react.production.min.js',
      'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js'
    ],
    styles: []
  },
  preact: {
    scripts: [
      'https://unpkg.com/preact@10/dist/preact.umd.js',
      'https://unpkg.com/preact@10/hooks/dist/hooks.umd.js'
    ],
    styles: []
  },
  svelte: {
    scripts: [],
    styles: []
  },
  vue: {
    scripts: ['https://unpkg.com/vue@3/dist/vue.global.prod.js'],
    styles: []
  },
  solid: {
    scripts: [
      'https://unpkg.com/solid-js@1/dist/solid.js',
      'https://unpkg.com/solid-js@1/web/dist/web.js'
    ],
    styles: []
  }
}

/**
 * Shared library dependencies (used across frameworks)
 */
const SHARED_LIBRARIES = {
  scripts: [
    'https://cdn.tailwindcss.com',
    'https://cdn.jsdelivr.net/npm/@xyflow/react@12.9.3/dist/umd/index.min.js',
    'https://unpkg.com/lucide@latest/dist/umd/lucide.js',
    'https://unpkg.com/clsx@2.1.1/dist/clsx.min.js'
  ],
  styles: ['https://cdn.jsdelivr.net/npm/@xyflow/react@12.9.3/dist/style.min.css']
}

/**
 * Universal Artifact Viewer - Handles React, Preact, Svelte, Vue, Solid
 * 
 * Architecture:
 * 1. Detect framework from metadata
 * 2. Load appropriate runtime (React, Svelte, etc.)
 * 3. Transpile code via IPC (server-side esbuild)
 * 4. Inject transpiled code into iframe
 * 5. Auto-retry with LLM if transpilation fails
 */
export function UniversalArtifactViewer({
  code,
  metadata,
  blockId: _blockId,
  conversationHistory: _conversationHistory = [],
  onError,
  onSuccess
}: UniversalArtifactViewerProps) {
  const { t } = useTranslation()
  const [isTranspiling, setIsTranspiling] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [retryAttempt, setRetryAttempt] = useState(0)
  const [isRetrying, setIsRetrying] = useState(false)
  
  const previewFrameRef = useRef<HTMLIFrameElement>(null)
  const lastCodeRef = useRef<string>('')

  /**
   * Detect framework from code if not specified in metadata
   */
  const detectFramework = useCallback((sourceCode: string): ArtifactFramework => {
    if (metadata.framework) {
      return metadata.framework
    }

    // Auto-detect based on imports/syntax
    if (sourceCode.includes('from "react"') || sourceCode.includes("from 'react'")) {
      return 'react'
    }
    if (sourceCode.includes('from "preact"') || sourceCode.includes("from 'preact'")) {
      return 'preact'
    }
    if (sourceCode.includes('<script') && sourceCode.includes('</script>')) {
      return 'svelte'
    }
    if (sourceCode.includes('from "vue"') || sourceCode.includes("from 'vue'")) {
      return 'vue'
    }
    if (sourceCode.includes('from "solid-js"') || sourceCode.includes("from 'solid-js'")) {
      return 'solid'
    }

    // Default to React
    return 'react'
  }, [metadata.framework])

  /**
   * Generate iframe HTML with runtime and libraries
   */
  const generateIframeHTML = useCallback((transpiledCode: string, framework: ArtifactFramework): string => {
    const runtimeDeps = FRAMEWORK_RUNTIMES[framework]

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${metadata.title || `${framework} Artifact`}</title>

  <!-- STEP 1: Load React and ReactDOM FIRST -->
  ${runtimeDeps.scripts.map((src) => `<script crossorigin src="${src}"></script>`).join('\n  ')}
  ${runtimeDeps.styles.map((href) => `<link rel="stylesheet" href="${href}" />`).join('\n  ')}

  <!-- STEP 2: JSX Runtime Polyfill (BEFORE ReactFlow loads) -->
  <script>
    // CRITICAL: Wait for React to load, then install JSX runtime SYNCHRONOUSLY
    // This MUST complete before ReactFlow starts loading
    (function() {
      var maxAttempts = 200;
      var attempts = 0;
      
      while (attempts < maxAttempts) {
        if (typeof window.React !== 'undefined' && window.React && 
            typeof window.ReactDOM !== 'undefined' && window.ReactDOM) {
          
          // Install JSX runtime polyfill
          if ('${framework}' === 'react' || '${framework}' === 'preact') {
            window.React.jsx = function(type, props, key) {
              if (key !== undefined && props) {
                props.key = key;
              }
              return window.React.createElement(type, props);
            };
            window.React.jsxs = window.React.jsx;
            window.React.jsxDEV = window.React.jsx;
            window.React.Fragment = Symbol.for('react.fragment');
            console.log('[Universal Artifact] React JSX runtime polyfill installed');
          }
          
          // Framework is ready
          window.__FRAMEWORK_READY__ = true;
          window.__INIT_CALLBACKS__ = [];
          window.onFrameworkReady = function(callback) { callback(); };
          console.log('[Universal Artifact] ${framework} runtime ready');
          return;
        }
        
        // Busy wait 10ms
        attempts++;
        var start = Date.now();
        while (Date.now() - start < 10) {}
      }
      
      // Failed to load
      console.error('[Universal Artifact] FATAL: React failed to load');
      document.write('<div style="padding:20px;color:red;"><h3>React Failed to Load</h3><p>Could not initialize React runtime. Please refresh.</p></div>');
    })();
  </script>

  <!-- STEP 3: Now load ReactFlow and other libraries (JSX runtime is ready) -->
  ${SHARED_LIBRARIES.scripts.map((src) => `<script src="${src}"></script>`).join('\n  ')}
  ${SHARED_LIBRARIES.styles.map((href) => `<link rel="stylesheet" href="${href}" />`).join('\n  ')}

  <!-- STEP 4: Global Setup -->
  <script>
    // Provide fetch API
    window.fetchApi = window.fetch.bind(window);
    
    // Setup ReactFlow
    if (window.ReactFlow) {
      var rf = window.ReactFlow;
      Object.keys(rf).forEach(function(key) {
        if (!window[key] && key !== 'default') {
          window[key] = rf[key];
        }
      });
    }
    
    // Setup Lucide
    if (window.lucide) {
      window.LucideReact = window.lucide;
    }
    
    // Setup clsx
    window.cn = function() {
      return window.clsx ? window.clsx.apply(null, arguments) : Array.from(arguments).filter(Boolean).join(' ');
    };
  </script>

  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    :root {
      --background: 0 0% 100%;
      --foreground: 222.2 84% 4.9%;
      --primary: 222.2 47.4% 11.2%;
      --primary-foreground: 210 40% 98%;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
      padding: 20px;
      background: hsl(var(--background));
      color: hsl(var(--foreground));
    }
    
    #root { width: 100%; min-height: 100vh; }
    
    .error {
      color: #ff4d4f;
      padding: 20px;
      background: #fff2f0;
      border: 1px solid #ffccc7;
      border-radius: 4px;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  
  <script>
    // Wait for framework, then execute component code
    window.onFrameworkReady(function() {
      try {
        ${transpiledCode}
        
        // Find and render component
        var rootElement = document.getElementById('root');
        var ComponentToRender = null;
        
        // Check common export names
        var candidates = [];
        if (typeof window.__tsxComponent === 'function') candidates.push(window.__tsxComponent);
        if (typeof window.App === 'function') candidates.push(window.App);
        if (typeof window.Component === 'function') candidates.push(window.Component);
        if (typeof window.default === 'function') candidates.push(window.default);
        
        // Find first valid component
        if (!candidates.length) {
          var componentNames = Object.keys(window).filter(function(key) {
            return /^[A-Z]/.test(key) && typeof window[key] === 'function';
          });
          componentNames.forEach(function(name) { candidates.push(window[name]); });
        }
        
        if (candidates.length) {
          ComponentToRender = candidates[0];
        }
        
        if (!ComponentToRender) {
          throw new Error('No component found. Export a default component.');
        }
        
        // Render based on framework
        if ('${framework}' === 'react' && window.ReactDOM) {
          if (window.ReactDOM.createRoot) {
            var root = window.ReactDOM.createRoot(rootElement);
            root.render(window.React.createElement(ComponentToRender));
          } else {
            window.ReactDOM.render(window.React.createElement(ComponentToRender), rootElement);
          }
        } else if ('${framework}' === 'preact' && window.preact) {
          window.preact.render(window.preact.h(ComponentToRender), rootElement);
        } else if ('${framework}' === 'vue' && window.Vue) {
          window.Vue.createApp(ComponentToRender).mount(rootElement);
        } else if ('${framework}' === 'solid') {
          // Solid rendering logic
          console.warn('Solid.js rendering not yet implemented');
        }
        
        console.log('[Universal Artifact] Component rendered successfully');
        
      } catch (error) {
        console.error('[Universal Artifact] Render error:', error);
        document.getElementById('root').innerHTML = 
          '<div class="error"><h3>Render Error:</h3><pre>' + 
          error.toString() + '\\n\\n' + (error.stack || '') + '</pre></div>';
      }
    });
  </script>
</body>
</html>
    `
  }, [metadata.title])

  /**
   * Transpile and render artifact
   */
  const transpileAndRender = useCallback(async () => {
    if (!code.trim()) return

    // Detect framework
    const framework = detectFramework(code)
    
    logger.info(`Transpiling ${framework} artifact (attempt ${retryAttempt + 1})`)

    setIsTranspiling(true)
    setPreviewError(null)

    try {
      // Call IPC to transpile server-side
      const result = await window.api.transpileArtifact({
        code,
        framework,
        language: metadata.language,
        filename: `Component.${metadata.language === 'typescript' ? 'tsx' : 'jsx'}`
      })

      if (!result.success) {
        throw new Error(result.error.message)
      }

      const transpiledCode = result.data.code

      // Generate iframe HTML
      const htmlContent = generateIframeHTML(transpiledCode, framework)

      // Wait for iframe
      const iframe = previewFrameRef.current
      if (!iframe) {
        throw new Error('Preview iframe not available')
      }

      // Write to iframe
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
      if (!iframeDoc) {
        throw new Error('Cannot access iframe document')
      }

      iframeDoc.open()
      iframeDoc.write(htmlContent)
      iframeDoc.close()

      logger.info(`${framework} artifact rendered successfully`)
      
      if (onSuccess) {
        onSuccess()
      }

      // Reset retry counter on success
      setRetryAttempt(0)
      setIsRetrying(false)

    } catch (error) {
      logger.error('Artifact transpilation/render failed:', error as Error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      setPreviewError(errorMessage)

      if (onError) {
        onError(error as Error)
      }

      // Auto-retry with LLM fix (up to 3 attempts)
      if (retryAttempt < 2 && !isRetrying) {
        setIsRetrying(true)
        setTimeout(() => {
          setRetryAttempt((prev) => prev + 1)
        }, 1000)
      }
    } finally {
      setIsTranspiling(false)
    }
  }, [code, metadata, retryAttempt, isRetrying, detectFramework, generateIframeHTML, onError, onSuccess])

  /**
   * Manual retry
   */
  const handleManualRetry = useCallback(() => {
    setRetryAttempt(0)
    setIsRetrying(false)
    transpileAndRender()
  }, [transpileAndRender])

  /**
   * Auto-render when code changes
   */
  useEffect(() => {
    if (code !== lastCodeRef.current) {
      lastCodeRef.current = code
      transpileAndRender()
    }
  }, [code, transpileAndRender])

  /**
   * Auto-retry effect
   */
  useEffect(() => {
    if (isRetrying && retryAttempt > 0) {
      transpileAndRender()
    }
  }, [retryAttempt, isRetrying, transpileAndRender])

  return (
    <div className="universal-artifact-viewer">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 text-sm text-neutral-600 dark:text-neutral-400">
        <div className="flex items-center gap-2">
          <FileCode2Icon size={16} />
          <span>
            {metadata.title || `${metadata.framework} Artifact`}
            {metadata.description && ` - ${metadata.description}`}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {isTranspiling && (
            <div className="flex items-center gap-1">
              <Loader2Icon size={14} className="animate-spin" />
              <span>Transpiling...</span>
            </div>
          )}
          
          {isRetrying && (
            <div className="flex items-center gap-1 text-yellow-600">
              <RefreshCwIcon size={14} className="animate-spin" />
              <span>Retrying ({retryAttempt}/3)...</span>
            </div>
          )}
          
          <button
            onClick={handleManualRetry}
            disabled={isTranspiling}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
            title={t('code_block.run') || 'Run'}
          >
            <PlayIcon size={14} />
            <span>{t('code_block.run') || 'Run'}</span>
          </button>
        </div>
      </div>

      {/* Error Display */}
      {previewError && (
        <div className="mb-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-400">
          <div className="font-semibold mb-1">Transpilation Error:</div>
          <pre className="whitespace-pre-wrap font-mono text-xs">{previewError}</pre>
          {retryAttempt < 2 && (
            <div className="mt-2 text-xs text-red-600 dark:text-red-500">
              Attempting to auto-fix with LLM...
            </div>
          )}
        </div>
      )}

      {/* Preview Iframe */}
      <div className="artifact-preview border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
        <iframe
          ref={previewFrameRef}
          className="w-full h-[600px] bg-white dark:bg-neutral-900"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          title={`${metadata.framework} Artifact Preview`}
        />
      </div>
    </div>
  )
}

