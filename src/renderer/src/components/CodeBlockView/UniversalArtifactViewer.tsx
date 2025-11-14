import { loggerService } from '@logger'
import { Loader2Icon, RefreshCwIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

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
      'https://unpkg.com/react@18/umd/react.development.js',
      'https://unpkg.com/react-dom@18/umd/react-dom.development.js'
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
    scripts: ['https://unpkg.com/solid-js@1/dist/solid.min.js'],
    styles: []
  }
}

const SHARED_LIBRARIES = {
  scripts: [
    'https://cdn.jsdelivr.net/npm/@xyflow/react@12.9.3/dist/umd/index.min.js',
    'https://unpkg.com/lucide@latest/dist/umd/lucide.js',
    'https://unpkg.com/clsx@2.1.1/dist/clsx.min.js',
    'https://cdn.tailwindcss.com'
  ],
  styles: ['https://cdn.jsdelivr.net/npm/@xyflow/react@12.9.3/dist/style.min.css']
}

/**
 * Universal Artifact Viewer
 * 
 * NEW ARCHITECTURE (Eliminates all timing issues):
 * 1. Iframe loads with framework runtimes (React, Vue, etc.)
 * 2. Iframe sends "READY" message when fully initialized
 * 3. Parent receives "READY" and triggers IPC transpilation
 * 4. Parent receives transpiled code and sends to iframe
 * 5. Iframe executes code (framework guaranteed ready)
 * 
 * This matches Claude Desktop and ChatGPT Canvas architecture.
 */
export function UniversalArtifactViewer({
  code,
  metadata,
  blockId: _blockId,
  conversationHistory = [],
  onError,
  onSuccess
}: UniversalArtifactViewerProps) {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(true)
  const [loadingMessage, setLoadingMessage] = useState('Initializing sandbox...')
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [retryAttempt, setRetryAttempt] = useState(0)
  
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const isReadyRef = useRef(false)
  const pendingCodeRef = useRef<string | null>(null)

  /**
   * Generate sandbox HTML (NO transpiled code yet)
   * Iframe will signal when ready
   */
  const generateSandboxHTML = useCallback((framework: ArtifactFramework): string => {
    const runtimeDeps = FRAMEWORK_RUNTIMES[framework]

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${framework.toUpperCase()} Artifact Sandbox</title>

  <!-- STEP 1: Load React and ReactDOM FIRST -->
  ${runtimeDeps.scripts.map(src => `<script crossorigin src="${src}"></script>`).join('\n  ')}
  ${runtimeDeps.styles.map(href => `<link rel="stylesheet" href="${href}" />`).join('\n  ')}

  <!-- STEP 2: Install JSX Runtime SYNCHRONOUSLY (BEFORE ReactFlow loads) -->
  <script>
    // CRITICAL: Wait for React to load, then install JSX runtime SYNCHRONOUSLY
    // This MUST complete before ReactFlow starts loading
    (function() {
      console.log('[Sandbox] Waiting for React to load...');
      var maxAttempts = 200; // 2 seconds max (200 * 10ms)
      var attempts = 0;
      
      // Busy-wait loop (synchronous, blocks script execution)
      while (attempts < maxAttempts) {
        if (typeof window.React !== 'undefined' && window.React && 
            typeof window.ReactDOM !== 'undefined' && window.ReactDOM) {
          
          // Install JSX runtime polyfill
          if ('${framework}' === 'react' || '${framework}' === 'preact') {
            // Create the jsx function
            var jsxFunc = function(type, props, key) {
              if (key !== undefined && props) {
                props.key = key;
              }
              return window.React.createElement(type, props);
            };

            var runtime = {
              jsx: jsxFunc,
              jsxs: jsxFunc,
              jsxDEV: jsxFunc,
              Fragment: window.React.Fragment
            };

            // Apply to all possible React references
            window.React.jsx = jsxFunc;
            window.React.jsxs = jsxFunc;
            window.React.jsxDEV = jsxFunc;
            window.React.Fragment = Symbol.for('react.fragment');

            if (window.React.default) {
              window.React.default.jsx = jsxFunc;
              window.React.default.jsxs = jsxFunc;
              window.React.default.jsxDEV = jsxFunc;
              window.React.default.Fragment = window.React.Fragment;
            }

            window.jsx = jsxFunc;
            window.jsxs = jsxFunc;
            window.jsxRuntime = runtime;
            window.ReactJsxRuntime = runtime;

            if (typeof define !== 'undefined' && define.amd) {
              define('react/jsx-runtime', [], function() {
                return runtime;
              });
              define('react/jsx-dev-runtime', [], function() {
                return runtime;
              });
            }

            if (!window.__MODULE_CACHE__) {
              window.__MODULE_CACHE__ = {};
            }
            window.__MODULE_CACHE__['react/jsx-runtime'] = runtime;
            window.__MODULE_CACHE__['react/jsx-dev-runtime'] = runtime;
            window.__MODULE_CACHE__['react'] = window.React;

            // Create lightweight path shim for artifacts relying on Node's path module
            if (!window.__SANDBOX_PATH_MODULE__) {
              var pathShim = (function() {
                var pathModule = {};
                var normalize = function(pathStr) {
                  return (pathStr || '').replace(/\\\\/g, '/');
                };
                pathModule.sep = '/';
                pathModule.delimiter = ':';
                pathModule.extname = function(pathStr) {
                  pathStr = normalize(pathStr).split('/').pop() || '';
                  var match = pathStr.match(/(\\.[^.\\/?#]+)(?:[?#]|$)/);
                  return match ? match[1] : '';
                };
                pathModule.basename = function(pathStr, ext) {
                  pathStr = normalize(pathStr).split('/').pop() || '';
                  if (ext && pathStr.endsWith(ext)) {
                    return pathStr.slice(0, -ext.length);
                  }
                  return pathStr;
                };
                pathModule.dirname = function(pathStr) {
                  var parts = normalize(pathStr).split('/');
                  parts.pop();
                  var dir = parts.join('/');
                  return dir || '.';
                };
                pathModule.join = function() {
                  return normalize(Array.prototype.join.call(arguments, '/').replace(/\\/+/g, '/'));
                };
                pathModule.resolve = function() {
                  return pathModule.join.apply(null, arguments);
                };
                pathModule.normalize = normalize;
                pathModule.posix = pathModule;
                pathModule.win32 = pathModule;
                pathModule.default = pathModule;
                return pathModule;
              })();
              window.__SANDBOX_PATH_MODULE__ = pathShim;
            }

            if (!window.__SANDBOX_REQUIRE__) {
              window.__SANDBOX_REQUIRE__ = true;
              var originalRequire = typeof window.require === 'function' ? window.require : null;
              window.require = function(moduleName) {
                if (moduleName === 'react/jsx-runtime' || moduleName === 'react/jsx-dev-runtime') {
                  return window.jsxRuntime;
                }
                if (moduleName === 'path') {
                  return window.__SANDBOX_PATH_MODULE__;
                }
                if (originalRequire) {
                  try {
                    return originalRequire(moduleName);
                  } catch (err) {
                    console.warn('[Sandbox] Failed to load module via original require:', moduleName, err);
                  }
                }
                console.warn('[Sandbox] Module request not supported:', moduleName);
                return {};
              };
            }

            console.log('[Sandbox] JSX runtime polyfill installed successfully');
          }
          
          // Mark framework as ready
          window.__FRAMEWORK_READY__ = true;
          return; // SUCCESS - Exit immediately
        }
        
        // Busy wait 10ms (synchronous)
        attempts++;
        var start = Date.now();
        while (Date.now() - start < 10) {
          // Busy wait
        }
      }
      
      // FATAL: React failed to load after timeout
      console.error('[Sandbox] FATAL: React failed to load within timeout');
      window.__FRAMEWORK_READY__ = false;
    })();
  </script>

  <!-- STEP 3: Load ReactFlow and other libraries (NOW React.jsx exists!) -->
  ${SHARED_LIBRARIES.scripts.map(src => `<script src="${src}"></script>`).join('\n  ')}
  ${SHARED_LIBRARIES.styles.map(href => `<link rel="stylesheet" href="${href}" />`).join('\n  ')}

  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --background: 0 0% 100%;
      --foreground: 222.2 84% 4.9%;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
      padding: 20px;
      background: hsl(var(--background));
      color: hsl(var(--foreground));
    }
    #root { width: 100%; min-height: 100vh; }
    .sandbox-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      color: #666;
    }
    .sandbox-error {
      color: #ff4d4f;
      padding: 20px;
      background: #fff2f0;
      border: 1px solid #ffccc7;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div id="root">
    <div class="sandbox-loading">Initializing ${framework} sandbox...</div>
  </div>
  
  <script>
    (function() {
      console.log('[Sandbox] Starting final initialization for ${framework}');
      
      // Wait for all libraries to load (ReactFlow, Lucide, etc.)
      var checkInterval = setInterval(function() {
        var isReady = false;
        
        // Check if framework is loaded and JSX runtime is ready
        if ('${framework}' === 'react' || '${framework}' === 'preact') {
          if (window.__FRAMEWORK_READY__ && typeof window.React !== 'undefined' && window.React && 
              typeof window.ReactDOM !== 'undefined' && window.ReactDOM && window.React.jsx) {
            
            // Setup ReactFlow globals (if loaded)
            if (window.ReactFlow) {
              var rf = window.ReactFlow;
              Object.keys(rf).forEach(function(key) {
                if (!window[key] && key !== 'default') {
                  window[key] = rf[key];
                }
              });
              console.log('[Sandbox] ReactFlow globals configured');
            }
            
            // Setup Lucide
            if (window.lucide) {
              window.LucideReact = window.lucide;
              console.log('[Sandbox] Lucide configured');
            }
            
            // Setup clsx
            window.cn = function() {
              return window.clsx ? window.clsx.apply(null, arguments) : '';
            };
            
            // Fetch API
            window.fetchApi = window.fetch.bind(window);
            
            isReady = true;
          }
        } else if ('${framework}' === 'vue') {
          if (typeof window.Vue !== 'undefined' && window.Vue) {
            isReady = true;
          }
        } else if ('${framework}' === 'solid') {
          if (typeof window.Solid !== 'undefined' && window.Solid) {
            isReady = true;
          }
        } else if ('${framework}' === 'svelte') {
          isReady = true; // Svelte components are self-contained
        }
        
        if (isReady) {
          clearInterval(checkInterval);
          console.log('[Sandbox] All libraries loaded, framework ready, signaling parent');
          
          // Signal parent that sandbox is ready
          window.parent.postMessage({ 
            type: 'SANDBOX_READY',
            framework: '${framework}'
          }, '*');
        }
      }, 50);
      
      // Listen for code execution requests
      window.addEventListener('message', function(event) {
        if (event.data.type === 'EXECUTE_CODE') {
          console.log('[Sandbox] Received code to execute');
          try {
            // Clear previous content
            var root = document.getElementById('root');
            root.innerHTML = '';
            
            // Execute transpiled code
            eval(event.data.code);
            
            // Find and render component
            var ComponentToRender = window.__tsxComponent || window.App || window.Component || window.default;
            
            if (!ComponentToRender) {
              // Try to find any exported component
              var componentNames = Object.keys(window).filter(function(key) {
                return /^[A-Z]/.test(key) && typeof window[key] === 'function';
              });
              if (componentNames.length) {
                ComponentToRender = window[componentNames[0]];
              }
            }
            
            if (!ComponentToRender) {
              throw new Error('No component found. Export a default component.');
            }
            
            // Render based on framework
            if ('${framework}' === 'react' && window.ReactDOM) {
              if (window.ReactDOM.createRoot) {
                var reactRoot = window.ReactDOM.createRoot(root);
                reactRoot.render(window.React.createElement(ComponentToRender));
              } else {
                window.ReactDOM.render(window.React.createElement(ComponentToRender), root);
              }
              console.log('[Sandbox] React component rendered');
            } else if ('${framework}' === 'vue' && window.Vue) {
              window.Vue.createApp(ComponentToRender).mount(root);
              console.log('[Sandbox] Vue component rendered');
            } else if ('${framework}' === 'svelte' && ComponentToRender) {
              new ComponentToRender({ target: root });
              console.log('[Sandbox] Svelte component rendered');
            } else if ('${framework}' === 'solid' && window.Solid) {
              window.Solid.render(ComponentToRender, root);
              console.log('[Sandbox] Solid component rendered');
            }
            
            // Signal success
            window.parent.postMessage({ type: 'RENDER_SUCCESS' }, '*');
            
          } catch (error) {
            console.error('[Sandbox] Render error:', error);
            var root = document.getElementById('root');
            root.innerHTML = '<div class="sandbox-error"><h3>Render Error:</h3><pre>' + 
              (error.stack || error.message || error) + '</pre></div>';
            
            // Signal error
            window.parent.postMessage({ 
              type: 'RENDER_ERROR',
              error: error.message || String(error)
            }, '*');
          }
        }
      });
    })();
  </script>
</body>
</html>
    `
  }, [])

  /**
   * Handle messages from iframe
   */
  const handleIframeMessage = useCallback(async (event: MessageEvent) => {
    if (event.source !== iframeRef.current?.contentWindow) return

    const { type } = event.data

    if (type === 'SANDBOX_READY') {
      logger.info('Sandbox ready, starting transpilation')
      isReadyRef.current = true
      setLoadingMessage('Transpiling code...')

      try {
        // Transpile code via IPC
        const result = await window.api.transpileArtifact({
          code: pendingCodeRef.current || code,
          framework: metadata.framework,
          language: metadata.language,
          filename: `component.${metadata.language === 'typescript' ? 'tsx' : 'jsx'}`
        })

        if (result.success) {
          logger.info('Transpilation successful, executing in sandbox')
          setLoadingMessage('Rendering component...')
          
          // Send code to iframe for execution
          iframeRef.current?.contentWindow?.postMessage({
            type: 'EXECUTE_CODE',
            code: result.data.code
          }, '*')
        } else {
          const errorMsg = result.error?.message || 'Transpilation failed'
          logger.error('Transpilation failed:', errorMsg)
          setPreviewError(errorMsg)
          setIsLoading(false)
          onError?.(new Error(errorMsg))
        }
      } catch (error) {
        logger.error('IPC transpilation error:', error as Error)
        setPreviewError((error as Error).message)
        setIsLoading(false)
        onError?.(error as Error)
      }
    } else if (type === 'RENDER_SUCCESS') {
      logger.info('Component rendered successfully')
      setIsLoading(false)
      setPreviewError(null)
      setRetryAttempt(0)
      onSuccess?.()
    } else if (type === 'RENDER_ERROR') {
      logger.error('Component render error:', event.data.error)
      setIsLoading(false)
      setPreviewError(event.data.error)
      onError?.(new Error(event.data.error))
    }
  }, [code, metadata, conversationHistory, onError, onSuccess])

  /**
   * Initialize iframe and message listener
   */
  useEffect(() => {
    window.addEventListener('message', handleIframeMessage)
    return () => window.removeEventListener('message', handleIframeMessage)
  }, [handleIframeMessage])

  /**
   * Initialize sandbox when code changes
   */
  useEffect(() => {
    setIsLoading(true)
    setLoadingMessage('Initializing sandbox...')
    setPreviewError(null)
    isReadyRef.current = false
    pendingCodeRef.current = code

    if (iframeRef.current) {
      const sandboxHTML = generateSandboxHTML(metadata.framework)
      // Use srcdoc instead of blob URL for CSP compliance
      iframeRef.current.srcdoc = sandboxHTML
      // Clear any existing src attribute
      iframeRef.current.removeAttribute('src')
    }
  }, [code, metadata.framework, generateSandboxHTML])

  /**
   * Manual retry handler
   */
  const handleManualRetry = useCallback(() => {
    setRetryAttempt(prev => prev + 1)
    setIsLoading(true)
    setLoadingMessage('Retrying transpilation...')
    setPreviewError(null)

    // Re-initialize sandbox
    if (iframeRef.current) {
      const sandboxHTML = generateSandboxHTML(metadata.framework)
      // Use srcdoc instead of blob URL for CSP compliance
      iframeRef.current.srcdoc = sandboxHTML
      // Clear any existing src attribute
      iframeRef.current.removeAttribute('src')
    }
  }, [metadata.framework, generateSandboxHTML])

  return (
    <Container>
      <Iframe
        ref={iframeRef}
        title={`${metadata.framework} Artifact Sandbox`}
        sandbox="allow-scripts allow-same-origin"
        $isHidden={isLoading || !!previewError}
      />

      {(isLoading || previewError) && (
        <Overlay>
          {isLoading && (
            <LoadingCard>
              <Loader2Icon size={32} className="spin" />
              <LoadingText>{loadingMessage}</LoadingText>
            </LoadingCard>
          )}

          {previewError && (
            <ErrorCard>
              <ErrorHeader>
                <div>
                  <ErrorTitle>Preview Error</ErrorTitle>
                  {retryAttempt > 0 && (
                    <RetryInfo>Retry attempt {retryAttempt}/3</RetryInfo>
                  )}
                </div>
                <RetryButton onClick={handleManualRetry} disabled={retryAttempt >= 3}>
                  <RefreshCwIcon size={14} />
                  <span>{t('code_block.run')}</span>
                </RetryButton>
              </ErrorHeader>
              <ErrorMessage>{previewError}</ErrorMessage>
            </ErrorCard>
          )}
        </Overlay>
      )}
    </Container>
  )
}

// Styled Components

const Container = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  background: white;
`

const Iframe = styled.iframe<{ $isHidden: boolean }>`
  width: 100%;
  height: 100%;
  border: none;
  display: ${props => props.$isHidden ? 'none' : 'block'};
`

const Overlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.95);
  z-index: 10;
`

const LoadingCard = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;

  .spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`

const LoadingText = styled.div`
  font-size: 14px;
  color: var(--color-text-secondary);
`

const ErrorCard = styled.div`
  max-width: 600px;
  width: 90%;
  padding: 20px;
  background: #fff2f0;
  border: 1px solid #ffccc7;
  border-radius: 8px;
  color: #d4380d;
`

const ErrorHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
  gap: 16px;
`

const ErrorTitle = styled.h3`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
`

const RetryInfo = styled.div`
  font-size: 12px;
  color: #ff7875;
  margin-top: 4px;
`

const RetryButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: white;
  border: 1px solid #ffccc7;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  color: #d4380d;

  &:hover:not(:disabled) {
    background: #fff7f5;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

const ErrorMessage = styled.pre`
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--code-font-family, monospace);
  font-size: 12px;
  line-height: 1.5;
  margin: 0;
`

