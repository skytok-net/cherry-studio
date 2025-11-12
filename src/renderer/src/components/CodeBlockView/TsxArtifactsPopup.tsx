import type { CodeEditorHandles } from '@renderer/components/CodeEditor'
import CodeEditor from '@renderer/components/CodeEditor'
import { CopyIcon, FilePngIcon } from '@renderer/components/Icons'
import { isMac } from '@renderer/config/constant'
import { useTemporaryValue } from '@renderer/hooks/useTemporaryValue'
import { classNames } from '@renderer/utils'
import { extractComponentName } from '@renderer/utils/formats'
import { captureScrollableIframeAsBlob, captureScrollableIframeAsDataURL } from '@renderer/utils/image'
import { loggerService } from '@logger'
import store from '@renderer/store'
import { messageBlocksSelectors } from '@renderer/store/messageBlock'
import { selectMessagesForTopic } from '@renderer/store/newMessage'
import { sendMessage } from '@renderer/store/thunk/messageThunk'
import { getUserMessage } from '@renderer/services/MessagesService'
import { Button, Dropdown, Modal, Splitter, Tooltip, Typography } from 'antd'
import { Camera, Check, Code, Copy, Eye, Maximize2, Minimize2, SaveIcon, SquareSplitHorizontal, Wand2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppDispatch } from '@renderer/store'
import styled from 'styled-components'

const logger = loggerService.withContext('TsxArtifactsPopup')

// Lazy load transpilers (only load when needed)
let esbuildWasm: any = null
let BabelStandalone: any = null

const loadEsbuildWasm = async () => {
  if (esbuildWasm) return esbuildWasm
  try {
    // esbuild-wasm exports the browser version from the package root
    const esbuildModule = await import('esbuild-wasm')
    esbuildWasm = esbuildModule.default || esbuildModule
    return esbuildWasm
  } catch (error) {
    logger.warn('Failed to import esbuild-wasm:', error as Error)
    return null
  }
}

const loadBabelStandalone = async () => {
  if (BabelStandalone) return BabelStandalone
  try {
    // @babel/standalone exports Babel as default
    const babelModule = await import('@babel/standalone')
    BabelStandalone = babelModule.default || babelModule
    return BabelStandalone
  } catch (error) {
    logger.warn('Failed to import @babel/standalone:', error as Error)
    return null
  }
}

interface TsxArtifactsPopupProps {
  open: boolean
  title: string
  tsx: string
  onSave?: (tsx: string) => void
  onClose: () => void
  blockId?: string // Message block ID for context
}

type ViewMode = 'split' | 'code' | 'preview'

// Configuration for automatic retry
const MAX_AUTO_RETRY_ATTEMPTS = 4 // 3-5 attempts as requested (0-indexed, so 4 = 5 attempts total)

const TsxArtifactsPopup: React.FC<TsxArtifactsPopupProps> = ({ open, title, tsx, onSave, onClose, blockId }) => {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [saved, setSaved] = useTemporaryValue(false, 2000)
  const [copied, setCopied] = useTemporaryValue(false, 2000)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [isTranspiling, setIsTranspiling] = useState(false)
  const [retryAttempt, setRetryAttempt] = useState(0)
  const [isFixing, setIsFixing] = useState(false)
  const codeEditorRef = useRef<CodeEditorHandles>(null)
  const previewFrameRef = useRef<HTMLIFrameElement>(null)
  const esbuildLoadedRef = useRef(false)
  const babelLoadedRef = useRef(false)
  const transpilerTypeRef = useRef<'esbuild' | 'babel' | null>(null)
  const lastErrorRef = useRef<string | null>(null)
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Load transpilers from bundled npm packages (more reliable than CDN)
  useEffect(() => {
    if (!open) return

    const loadTranspilers = async () => {
      // Try esbuild-wasm first (faster)
      if (!esbuildLoadedRef.current) {
        try {
          const esbuild = await loadEsbuildWasm()
          if (esbuild && esbuild.initialize) {
            // Initialize esbuild with WASM file
            // For Electron/Vite, we need to get the WASM file from node_modules
            // Try multiple approaches to find the WASM file
            try {
              // Approach 1: Try using import.meta.url (works in Vite)
              const wasmPath = new URL('esbuild-wasm/esbuild.wasm', import.meta.url).href
              await esbuild.initialize({ wasmURL: wasmPath })
              esbuildLoadedRef.current = true
              transpilerTypeRef.current = 'esbuild'
              logger.info('esbuild-wasm loaded successfully')
            } catch (wasmError1) {
              try {
                // Approach 2: Try relative path from node_modules
                // In Electron, we might need to use window.api to get the path
                const wasmPath2 = '/node_modules/esbuild-wasm/esbuild.wasm'
                await esbuild.initialize({ wasmURL: wasmPath2 })
                esbuildLoadedRef.current = true
                transpilerTypeRef.current = 'esbuild'
                logger.info('esbuild-wasm loaded successfully (fallback path)')
              } catch (wasmError2) {
                logger.warn('Failed to initialize esbuild WASM with both paths:', wasmError2 as Error)
                // Will fall through to Babel
              }
            }
          }
        } catch (error) {
          logger.warn('Failed to load esbuild-wasm, will try Babel:', error as Error)
        }
      }

      // Fallback to Babel if esbuild failed or not available
      if (!babelLoadedRef.current && !esbuildLoadedRef.current) {
        try {
          const babel = await loadBabelStandalone()
          if (babel) {
            babelLoadedRef.current = true
            if (!transpilerTypeRef.current) {
              transpilerTypeRef.current = 'babel'
            }
            logger.info('@babel/standalone loaded successfully')
          }
        } catch (error) {
          logger.error('Failed to load both transpilers:', error as Error)
          setPreviewError('Failed to load transpiler. Please ensure dependencies are installed (run: yarn install).')
        }
      }
    }

    loadTranspilers()
  }, [open])

  // Prevent body scroll when fullscreen
  useEffect(() => {
    if (!open || !isFullscreen) return

    const body = document.body
    const originalOverflow = body.style.overflow
    body.style.overflow = 'hidden'

    return () => {
      body.style.overflow = originalOverflow
    }
  }, [isFullscreen, open])

  const handleSave = () => {
    codeEditorRef.current?.save?.()
    setSaved(true)
  }

  const handleCopy = async () => {
    try {
      const codeToCopy = codeEditorRef.current?.getValue() || tsx
      await navigator.clipboard.writeText(codeToCopy)
      setCopied(true)
      window.toast.success(t('message.copy.success'))
    } catch (error) {
      logger.error('Failed to copy code:', error as Error)
      window.toast.error(t('message.copy.failed') || 'Failed to copy code')
    }
  }

  const transpileAndRender = useCallback(async () => {
    if (!tsx.trim() || !previewFrameRef.current) return

    setIsTranspiling(true)
    setPreviewError(null)

    try {
      // Check which transpiler is available and use it
      // Load transpilers if not already loaded
      if (!esbuildWasm && !esbuildLoadedRef.current) {
        esbuildWasm = await loadEsbuildWasm()
      }
      if (!BabelStandalone && !babelLoadedRef.current) {
        BabelStandalone = await loadBabelStandalone()
      }
      
      const esbuild = esbuildWasm
      const Babel = BabelStandalone
      
      if (!esbuild && !Babel) {
        throw new Error('No transpiler loaded. Please ensure dependencies are installed (run: yarn install).')
      }

      // Transpile TSX to JS with module resolution for common libraries
      // First, transform imports to use global variables
      // Supported libraries:
      // - react, react-dom (React 18)
      // - @xyflow/react (React Flow for node-based diagrams)
      // - @radix-ui/* (Radix UI primitives for shadcn-ui components)
      // - lucide-react (Icons)
      // - clsx, tailwind-merge, class-variance-authority (shadcn-ui utilities)
      // - Web APIs (fetch, localStorage, etc.) are available by default
      let processedTsx = tsx
      const importMap: Record<string, string> = {
        'react': 'React',
        'react-dom': 'ReactDOM',
        '@xyflow/react': 'ReactFlow',
        '@radix-ui/react-dialog': 'RadixUIDialog',
        '@radix-ui/react-dropdown-menu': 'RadixUIDropdownMenu',
        '@radix-ui/react-select': 'RadixUISelect',
        '@radix-ui/react-slot': 'RadixUISlot',
        '@radix-ui/react-popover': 'RadixUIPopover',
        '@radix-ui/react-tooltip': 'RadixUITooltip',
        '@radix-ui/react-accordion': 'RadixUIAccordion',
        '@radix-ui/react-tabs': 'RadixUITabs',
        '@radix-ui/react-checkbox': 'RadixUICheckbox',
        '@radix-ui/react-label': 'RadixUILabel',
        '@radix-ui/react-separator': 'RadixUISeparator',
        '@radix-ui/react-switch': 'RadixUISwitch',
        '@radix-ui/react-toast': 'RadixUIToast',
        'class-variance-authority': 'classVarianceAuthority',
        'clsx': 'clsx',
        'tailwind-merge': 'tailwindMerge',
        'lucide-react': 'LucideReact'
      }

      // Replace import statements with global variable assignments
      Object.entries(importMap).forEach(([module, globalVar]) => {
        // Match: import X from 'module' or import { X, Y } from 'module'
        const importRegex = new RegExp(
          `import\\s+(?:([\\w*]+)\\s+from\\s+['"]${module.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]|{([^}]+)}\\s+from\\s+['"]${module.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"])`,
          'g'
        )
        
        processedTsx = processedTsx.replace(importRegex, (match, defaultImport, namedImports) => {
          if (defaultImport) {
            return `const ${defaultImport} = window.${globalVar};`
          } else if (namedImports) {
            const imports = namedImports.split(',').map((imp: string) => {
              const trimmed = imp.trim()
              const [name, alias] = trimmed.split(/\s+as\s+/)
              const finalName = alias || name
              return `const ${finalName} = window.${globalVar}.${name};`
            })
            return imports.join('\n')
          }
          return match
        })
      })

      // Remove remaining unknown imports (they'll need to be provided or will error)
      processedTsx = processedTsx.replace(/import\s+.*?from\s+['"][^'"]+['"];?\n?/g, '')

      let transpiledCode: string

      if (esbuild) {
        // Use esbuild (faster, modern) - preferred method
        // esbuild-wasm exports transform directly
        const transformResult = await esbuild.transform(processedTsx, {
          loader: 'tsx',
          format: 'iife', // Immediately Invoked Function Expression - wraps code in (function() { ... })()
          target: 'es2020',
          jsx: 'transform', // Transform JSX to React.createElement calls
          jsxFactory: 'React.createElement',
          jsxFragment: 'React.Fragment',
          globalName: 'window' // Make exports available on window
        })
        transpiledCode = transformResult.code || ''
      } else if (Babel) {
        // Fallback to Babel if esbuild is not available
        // @babel/standalone exports Babel.transform directly
        transpiledCode = Babel.transform(processedTsx, {
          presets: ['react', 'typescript'],
          filename: 'component.tsx'
        }).code
      } else {
        throw new Error('Transpiler not available')
      }

      // Create HTML content with React runtime and libraries
      const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>React Component Preview</title>
  
  <!-- React Runtime -->
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  
  <!-- Tailwind CSS (for shadcn-ui) -->
  <script src="https://cdn.tailwindcss.com"></script>
  
  <!-- xyflow/react -->
  <script crossorigin src="https://unpkg.com/@xyflow/react@1.30.0/dist/index.umd.js"></script>
  <link rel="stylesheet" href="https://unpkg.com/@xyflow/react@1.30.0/dist/style.css">
  
  <!-- Utility libraries -->
  <script src="https://unpkg.com/clsx@2.1.0/dist/clsx.umd.js"></script>
  <script src="https://unpkg.com/class-variance-authority@0.7.0/dist/index.umd.js"></script>
  <script src="https://unpkg.com/tailwind-merge@2.2.1/dist/index.umd.js"></script>
  
  <!-- Lucide React Icons -->
  <script crossorigin src="https://unpkg.com/lucide-react@latest/dist/umd/lucide-react.js"></script>
  
  <!-- Radix UI Primitives (for shadcn-ui components) -->
  <script crossorigin src="https://unpkg.com/@radix-ui/react-dialog@latest/dist/index.umd.js"></script>
  <script crossorigin src="https://unpkg.com/@radix-ui/react-dropdown-menu@latest/dist/index.umd.js"></script>
  <script crossorigin src="https://unpkg.com/@radix-ui/react-select@latest/dist/index.umd.js"></script>
  <script crossorigin src="https://unpkg.com/@radix-ui/react-slot@latest/dist/index.umd.js"></script>
  <script crossorigin src="https://unpkg.com/@radix-ui/react-popover@latest/dist/index.umd.js"></script>
  <script crossorigin src="https://unpkg.com/@radix-ui/react-tooltip@latest/dist/index.umd.js"></script>
  <script crossorigin src="https://unpkg.com/@radix-ui/react-accordion@latest/dist/index.umd.js"></script>
  <script crossorigin src="https://unpkg.com/@radix-ui/react-tabs@latest/dist/index.umd.js"></script>
  <script crossorigin src="https://unpkg.com/@radix-ui/react-checkbox@latest/dist/index.umd.js"></script>
  <script crossorigin src="https://unpkg.com/@radix-ui/react-label@latest/dist/index.umd.js"></script>
  <script crossorigin src="https://unpkg.com/@radix-ui/react-separator@latest/dist/index.umd.js"></script>
  <script crossorigin src="https://unpkg.com/@radix-ui/react-switch@latest/dist/index.umd.js"></script>
  <script crossorigin src="https://unpkg.com/@radix-ui/react-toast@latest/dist/index.umd.js"></script>
  
  <!-- Radix UI CSS -->
  <link rel="stylesheet" href="https://unpkg.com/@radix-ui/themes@latest/dist/styles.css">
  
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    :root {
      --background: 0 0% 100%;
      --foreground: 222.2 84% 4.9%;
      --card: 0 0% 100%;
      --card-foreground: 222.2 84% 4.9%;
      --popover: 0 0% 100%;
      --popover-foreground: 222.2 84% 4.9%;
      --primary: 222.2 47.4% 11.2%;
      --primary-foreground: 210 40% 98%;
      --secondary: 210 40% 96.1%;
      --secondary-foreground: 222.2 47.4% 11.2%;
      --muted: 210 40% 96.1%;
      --muted-foreground: 215.4 16.3% 46.9%;
      --accent: 210 40% 96.1%;
      --accent-foreground: 222.2 47.4% 11.2%;
      --destructive: 0 84.2% 60.2%;
      --destructive-foreground: 210 40% 98%;
      --border: 214.3 31.8% 91.4%;
      --input: 214.3 31.8% 91.4%;
      --ring: 222.2 84% 4.9%;
      --radius: 0.5rem;
    }
    
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif; 
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
    .error pre { margin-top: 10px; white-space: pre-wrap; word-break: break-word; }
    
    /* shadcn-ui base styles */
    button {
      border-radius: calc(var(--radius) - 2px);
    }
  </style>
  <script>
    // Network API injection for TSX artifacts
    (function() {
      try {
        // Check if we're in an iframe with access to parent window
        if (window.parent && window.parent !== window && window.parent.networkApi) {
          // Inject network API from parent window
          window.networkApi = window.parent.networkApi;

          console.log('Network API successfully injected into TSX artifact');

          // Dispatch ready event
          window.dispatchEvent(new CustomEvent('networkApiReady', {
            detail: { available: true, source: 'parent' }
          }));
        } else {
          console.warn('Network API not available - parent window access restricted');

          // Provide fallback API that shows helpful errors
          window.networkApi = {
            makeRequest: () => Promise.reject(new Error('Network API not available in this context')),
            cancelRequest: () => Promise.resolve(false),
            checkDomain: () => Promise.reject(new Error('Network API not available in this context')),
            getSettings: () => Promise.reject(new Error('Network API not available in this context')),
            updateSettings: () => Promise.reject(new Error('Network API not available in this context')),
            overrideBlock: () => Promise.reject(new Error('Network API not available in this context')),
            clearCache: () => Promise.reject(new Error('Network API not available in this context')),
            getStats: () => Promise.reject(new Error('Network API not available in this context'))
          };

          window.dispatchEvent(new CustomEvent('networkApiReady', {
            detail: { available: false, reason: 'parent_access_restricted' }
          }));
        }
      } catch (error) {
        console.error('Failed to inject network API:', error);

        // Provide error fallback
        window.networkApi = {
          makeRequest: () => Promise.reject(error),
          cancelRequest: () => Promise.resolve(false),
          checkDomain: () => Promise.reject(error),
          getSettings: () => Promise.reject(error),
          updateSettings: () => Promise.reject(error),
          overrideBlock: () => Promise.reject(error),
          clearCache: () => Promise.reject(error),
          getStats: () => Promise.reject(error)
        };

        window.dispatchEvent(new CustomEvent('networkApiReady', {
          detail: { available: false, reason: 'injection_error', error: error.message }
        }));
      }
    })();
  </script>
</head>
<body>
  <div id="root"></div>
  <script>
    // Setup global variables for libraries
    window.clsx = window.clsx || function() { return Array.from(arguments).filter(Boolean).join(' '); };
    window.tailwindMerge = window.tailwindMerge || window.clsx;
    window.classVarianceAuthority = window.classVarianceAuthority || function() { return function() { return ''; }; };
    
    // Setup ReactFlow global (xyflow/react)
    if (typeof window.ReactFlow !== 'undefined') {
      // ReactFlow is already available
    } else if (typeof window['@xyflow/react'] !== 'undefined') {
      window.ReactFlow = window['@xyflow/react'];
    }
    
    // Setup Lucide React icons
    if (window.LucideReact) {
      // Icons are available as window.LucideReact.IconName
      // Example: const Button = () => React.createElement(window.LucideReact.Button, {});
    }
    
    // Helper function to merge class names (for shadcn-ui)
    function cn(...inputs) {
      if (window.tailwindMerge && typeof window.tailwindMerge === 'function') {
        return window.tailwindMerge(inputs);
      }
      return inputs.filter(Boolean).join(' ');
    }
    window.cn = cn;
    
    // Helper for ReactFlow - make it easier to use
    if (window.ReactFlow) {
      const ReactFlow = window.ReactFlow;
      // Export commonly used components
      window.ReactFlowProvider = ReactFlow.ReactFlowProvider || ReactFlow;
      window.ReactFlowCanvas = ReactFlow.ReactFlowCanvas || ReactFlow;
    }
    
    try {
      ${transpiledCode}
      
      // Try to find and render the component using React 18 createRoot
      const rootElement = document.getElementById('root');
      let ComponentToRender = null;
      
      // Check for common component names
      if (typeof App !== 'undefined') {
        ComponentToRender = App;
      } else if (typeof Component !== 'undefined') {
        ComponentToRender = Component;
      } else {
        // Try to find any exported component (function starting with uppercase)
        const componentNames = Object.keys(window).filter(key => 
          typeof window[key] === 'function' && 
          /^[A-Z]/.test(key) &&
          key !== 'React' &&
          key !== 'ReactDOM' &&
          key !== 'cn'
        );
        if (componentNames.length > 0) {
          ComponentToRender = window[componentNames[0]];
        }
      }
      
      if (ComponentToRender) {
        // Use React 18 createRoot if available, fallback to render
        if (ReactDOM.createRoot) {
          const root = ReactDOM.createRoot(rootElement);
          root.render(React.createElement(ComponentToRender));
        } else {
          // Fallback for older React versions
          ReactDOM.render(React.createElement(ComponentToRender), rootElement);
        }
      } else {
        throw new Error('No React component found. Make sure to export a component (e.g., export default function App() { ... } or const App = () => { ... }).');
      }
    } catch (error) {
      const rootElement = document.getElementById('root');
      rootElement.innerHTML = '<div class="error"><h3>Rendering Error:</h3><pre>' + 
        error.toString() + '\\n\\n' + (error.stack || '') + '</pre></div>';
    }
  </script>
</body>
</html>
      `

      // Update iframe content
      const iframe = previewFrameRef.current
      if (iframe.contentDocument) {
        iframe.contentDocument.open()
        iframe.contentDocument.write(htmlContent)
        iframe.contentDocument.close()
      } else if (iframe.contentWindow) {
        iframe.contentWindow.document.open()
        iframe.contentWindow.document.write(htmlContent)
        iframe.contentWindow.document.close()
      }
    } catch (error) {
      logger.error('Failed to transpile TSX:', error as Error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to transpile TSX code'
      setPreviewError(errorMessage)
      lastErrorRef.current = errorMessage
      
      // Trigger automatic retry if we haven't exceeded max attempts
      if (retryAttempt < MAX_AUTO_RETRY_ATTEMPTS && blockId) {
        handleAutoRetry()
      }
    } finally {
      setIsTranspiling(false)
    }
  }, [tsx, retryAttempt, blockId])

  // Listen for errors from the iframe
  useEffect(() => {
    if (!open || !previewFrameRef.current) return

    const iframe = previewFrameRef.current
    const handleIframeError = () => {
      // Check if iframe has error content
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
        if (iframeDoc) {
          const errorElement = iframeDoc.querySelector('.error')
          if (errorElement) {
            const errorText = errorElement.textContent || 'Rendering error occurred'
            setPreviewError(errorText)
            lastErrorRef.current = errorText
            
            // Trigger automatic retry if we haven't exceeded max attempts
            if (retryAttempt < MAX_AUTO_RETRY_ATTEMPTS && blockId) {
              handleAutoRetry()
            }
          }
        }
      } catch (e) {
        // Cross-origin or other iframe access issues - ignore
      }
    }

    // Check for errors after a delay to allow rendering
    const checkTimeout = setTimeout(() => {
      handleIframeError()
    }, 1000)

    return () => {
      clearTimeout(checkTimeout)
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
      }
    }
  }, [open, retryAttempt, blockId])

  // Transpile and render when TSX content changes
  useEffect(() => {
    if (open && viewMode !== 'code' && tsx.trim()) {
      handleTranspileAndRender()
    }
  }, [open, tsx, viewMode])

  // Reset retry attempt when TSX content changes (new code received)
  useEffect(() => {
    if (tsx.trim()) {
      setRetryAttempt(0)
      setPreviewError(null)
      lastErrorRef.current = null
    }
  }, [tsx])

  // Get message context from blockId
  const getMessageContext = useCallback(() => {
    if (!blockId) return null

    try {
      const block = messageBlocksSelectors.selectById(store.getState(), blockId)
      if (!block || !block.messageId) return null

      // Get all assistants to find the one containing the message
      const state = store.getState()
      const assistants = state.assistants.assistants
      
      // Find the message across all topics
      for (const assistant of assistants) {
        for (const topic of assistant.topics) {
          const messages = selectMessagesForTopic(state, topic.id)
          const message = messages.find((m) => m.id === block.messageId)
          if (message) {
            return { message, assistant, topic }
          }
        }
      }
      
      return null
    } catch (error) {
      logger.error('Failed to get message context:', error as Error)
      return null
    }
  }, [blockId])

  // Send fix request to LLM
  const handleFixCode = useCallback(async () => {
    if (!blockId || !lastErrorRef.current) return

    setIsFixing(true)
    try {
      const context = getMessageContext()
      if (!context) {
        window.toast.error(t('tsx_artifacts.fix.error.no_context', 'Unable to get message context'))
        return
      }

      const { assistant, topic } = context

      // Create a fix request message
      const fixPrompt = `The following React/TSX code has a compilation or rendering error. Please fix it:

\`\`\`tsx
${tsx}
\`\`\`

Error: ${lastErrorRef.current}

Please provide the corrected code in a \`\`\`tsx code block.`

      const { message: userMessage, blocks } = getUserMessage({
        content: fixPrompt,
        assistant,
        topic
      })

      // Send the fix request
      await dispatch(sendMessage(userMessage, blocks, assistant, topic.id))
      
      window.toast.success(t('tsx_artifacts.fix.requested', 'Fix request sent to AI'))
    } catch (error) {
      logger.error('Failed to send fix request:', error as Error)
      window.toast.error(t('tsx_artifacts.fix.error.send_failed', 'Failed to send fix request'))
    } finally {
      setIsFixing(false)
    }
  }, [blockId, tsx, dispatch, t, getMessageContext])

  // Automatic retry with LLM fix
  const handleAutoRetry = useCallback(
    () => {
      if (retryAttempt >= MAX_AUTO_RETRY_ATTEMPTS) {
        logger.info(`Max retry attempts (${MAX_AUTO_RETRY_ATTEMPTS + 1}) reached for TSX artifact`)
        return
      }

      logger.info(`Auto-retry attempt ${retryAttempt + 1}/${MAX_AUTO_RETRY_ATTEMPTS + 1} for TSX artifact`)

      // Delay before retry to avoid rapid requests
      retryTimeoutRef.current = setTimeout(async () => {
        const newAttempt = retryAttempt + 1
        setRetryAttempt(newAttempt)

        // Send fix request
        if (blockId && lastErrorRef.current) {
          setIsFixing(true)
          try {
            const context = getMessageContext()
            if (context) {
              const { assistant, topic } = context
              const fixPrompt = `The following React/TSX code has a compilation or rendering error. Please fix it:

\`\`\`tsx
${tsx}
\`\`\`

Error: ${lastErrorRef.current}

Please provide the corrected code in a \`\`\`tsx code block.`

              const { message: userMessage, blocks } = getUserMessage({
                content: fixPrompt,
                assistant,
                topic
              })

              await dispatch(sendMessage(userMessage, blocks, assistant, topic.id))
              logger.info(`Auto-fix request sent (attempt ${newAttempt})`)
            }
          } catch (error) {
            logger.error('Failed to send auto-fix request:', error as Error)
          } finally {
            setIsFixing(false)
          }
        }
      }, 2000 * (retryAttempt + 1)) // Exponential backoff: 2s, 4s, 6s, 8s
    },
    [retryAttempt, blockId, tsx, dispatch, getMessageContext]
  )

  const handleTranspileAndRender = useCallback(() => {
    // Small delay to ensure iframe is ready
    setTimeout(() => {
      transpileAndRender()
    }, 100)
  }, [transpileAndRender])

  const handleCapture = useCallback(
    async (to: 'file' | 'clipboard') => {
      const fileName = extractComponentName(tsx) || 'tsx-artifact'

      if (to === 'file') {
        const dataUrl = await captureScrollableIframeAsDataURL(previewFrameRef)
        if (dataUrl) {
          window.api.file.saveImage(fileName, dataUrl)
        }
      }
      if (to === 'clipboard') {
        await captureScrollableIframeAsBlob(previewFrameRef, async (blob) => {
          if (blob) {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
            window.toast.success(t('message.copy.success'))
          }
        })
      }
    },
    [tsx, t]
  )

  const renderHeader = () => (
    <ModalHeader onDoubleClick={() => setIsFullscreen(!isFullscreen)} className={classNames({ drag: isFullscreen })}>
      <HeaderLeft $isFullscreen={isFullscreen}>
        <TitleText ellipsis={{ tooltip: true }}>{title}</TitleText>
      </HeaderLeft>

      <HeaderCenter>
        <ViewControls onDoubleClick={(e) => e.stopPropagation()}>
          <ViewButton
            size="small"
            type={viewMode === 'split' ? 'primary' : 'default'}
            icon={<SquareSplitHorizontal size={14} />}
            onClick={() => setViewMode('split')}>
            {t('tsx_artifacts.split', 'Split')}
          </ViewButton>
          <ViewButton
            size="small"
            type={viewMode === 'code' ? 'primary' : 'default'}
            icon={<Code size={14} />}
            onClick={() => setViewMode('code')}>
            {t('tsx_artifacts.code', 'Code')}
          </ViewButton>
          <ViewButton
            size="small"
            type={viewMode === 'preview' ? 'primary' : 'default'}
            icon={<Eye size={14} />}
            onClick={() => setViewMode('preview')}>
            {t('tsx_artifacts.preview', 'Preview')}
          </ViewButton>
        </ViewControls>
      </HeaderCenter>

      <HeaderRight onDoubleClick={(e) => e.stopPropagation()}>
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              {
                label: t('tsx_artifacts.capture.to_file', 'Save as Image'),
                key: 'capture_to_file',
                icon: <FilePngIcon size={14} className="lucide-custom" />,
                onClick: () => handleCapture('file')
              },
              {
                label: t('tsx_artifacts.capture.to_clipboard', 'Copy to Clipboard'),
                key: 'capture_to_clipboard',
                icon: <CopyIcon size={14} className="lucide-custom" />,
                onClick: () => handleCapture('clipboard')
              }
            ]
          }}>
          <Tooltip title={t('tsx_artifacts.capture.label', 'Capture Preview')} mouseLeaveDelay={0}>
            <Button type="text" icon={<Camera size={16} />} className="nodrag" />
          </Tooltip>
        </Dropdown>
        <Button
          onClick={() => setIsFullscreen(!isFullscreen)}
          type="text"
          icon={isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          className="nodrag"
        />
        <Button onClick={onClose} type="text" icon={<X size={16} />} className="nodrag" />
      </HeaderRight>
    </ModalHeader>
  )

  const renderContent = () => {
    const codePanel = (
      <CodeSection>
        <CodeEditor
          ref={codeEditorRef}
          value={tsx}
          language="tsx"
          editable={true}
          onSave={onSave}
          height="100%"
          expanded={false}
          wrapped
          style={{ minHeight: 0 }}
          options={{
            stream: true,
            lineNumbers: true,
            keymap: true
          }}
        />
        <ToolbarWrapper>
          <Tooltip title={t('code_block.edit.copy.label')} mouseLeaveDelay={0}>
            <ToolbarButton
              shape="circle"
              size="large"
              icon={
                copied ? (
                  <Check size={16} color="var(--color-status-success)" />
                ) : (
                  <Copy size={16} className="custom-lucide" />
                )
              }
              onClick={handleCopy}
            />
          </Tooltip>
          <Tooltip title={t('code_block.edit.save.label')} mouseLeaveDelay={0}>
            <ToolbarButton
              shape="circle"
              size="large"
              icon={
                saved ? (
                  <Check size={16} color="var(--color-status-success)" />
                ) : (
                  <SaveIcon size={16} className="custom-lucide" />
                )
              }
              onClick={handleSave}
            />
          </Tooltip>
        </ToolbarWrapper>
      </CodeSection>
    )

    const previewPanel = (
      <PreviewSection>
        {isTranspiling ? (
          <LoadingPreview>
            <p>{t('tsx_artifacts.transpiling', 'Transpiling and rendering...')}</p>
          </LoadingPreview>
        ) : previewError ? (
          <ErrorPreview>
            <ErrorHeader>
              <div>
                <h3>{t('tsx_artifacts.error.title', 'Preview Error')}</h3>
                {retryAttempt > 0 && (
                  <RetryInfo>
                    {t('tsx_artifacts.retry.attempt', 'Auto-retry attempt {{attempt}}/{{max}}', {
                      attempt: retryAttempt,
                      max: MAX_AUTO_RETRY_ATTEMPTS + 1
                    })}
                  </RetryInfo>
                )}
              </div>
              {blockId && (
                <FixButtonContainer>
                  <Button
                    type="primary"
                    icon={<Wand2 size={16} />}
                    loading={isFixing}
                    onClick={handleFixCode}
                    disabled={isFixing || retryAttempt >= MAX_AUTO_RETRY_ATTEMPTS}>
                    {isFixing
                      ? t('tsx_artifacts.fix.requesting', 'Requesting fix...')
                      : t('tsx_artifacts.fix.button', 'Fix Code')}
                  </Button>
                </FixButtonContainer>
              )}
            </ErrorHeader>
            <pre>{previewError}</pre>
            {retryAttempt >= MAX_AUTO_RETRY_ATTEMPTS && (
              <MaxRetriesMessage>
                {t('tsx_artifacts.retry.max_reached', 'Maximum retry attempts reached. Please fix manually or request a fix.')}
              </MaxRetriesMessage>
            )}
          </ErrorPreview>
        ) : tsx.trim() ? (
          <PreviewFrame
            ref={previewFrameRef}
            key={tsx}
            title="TSX Preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-presentation"
          />
        ) : (
          <EmptyPreview>
            <p>{t('tsx_artifacts.empty_preview', 'No content to preview')}</p>
          </EmptyPreview>
        )}
      </PreviewSection>
    )

    switch (viewMode) {
      case 'split':
        return (
          <Splitter>
            <Splitter.Panel defaultSize="50%" min="25%">
              {codePanel}
            </Splitter.Panel>
            <Splitter.Panel defaultSize="50%" min="25%">
              {previewPanel}
            </Splitter.Panel>
          </Splitter>
        )
      case 'code':
        return codePanel
      case 'preview':
        return previewPanel
      default:
        return null
    }
  }

  return (
    <StyledModal
      $isFullscreen={isFullscreen}
      title={renderHeader()}
      open={open}
      afterClose={onClose}
      centered={!isFullscreen}
      destroyOnHidden
      mask={!isFullscreen}
      maskClosable={false}
      width={isFullscreen ? '100vw' : '90vw'}
      style={{
        maxWidth: isFullscreen ? '100vw' : '1400px',
        height: isFullscreen ? '100vh' : 'auto'
      }}
      zIndex={isFullscreen ? 10000 : 1000}
      footer={null}
      closable={false}>
      <Container>{renderContent()}</Container>
    </StyledModal>
  )
}

const StyledModal = styled(Modal)<{ $isFullscreen?: boolean }>`
  ${(props) =>
    props.$isFullscreen
      ? `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    z-index: 10000 !important;

    .ant-modal-wrap {
      padding: 0 !important;
      position: fixed !important;
      inset: 0 !important;
    }

    .ant-modal {
      margin: 0 !important;
      padding: 0 !important;
      max-width: none !important;
      position: fixed !important;
      inset: 0 !important;
    }

    .ant-modal-body {
      height: calc(100vh - 45px) !important;
    }
  `
      : `
    .ant-modal-body {
      height: 80vh !important;
    }
  `}

  .ant-modal-body {
    padding: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    max-height: initial !important;
  }

  .ant-modal-content {
    border-radius: ${(props) => (props.$isFullscreen ? '0px' : '12px')};
    overflow: hidden;
    height: ${(props) => (props.$isFullscreen ? '100vh' : 'auto')};
    padding: 0 !important;
  }

  .ant-modal-header {
    padding: 10px !important;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-background);
    margin-bottom: 0 !important;
    border-radius: 0 !important;
  }

  ::-webkit-scrollbar {
    width: 8px;
  }
`

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  position: relative;
`

const HeaderLeft = styled.div<{ $isFullscreen?: boolean }>`
  flex: 1;
  min-width: 0;
  padding-left: ${(props) => (props.$isFullscreen && isMac ? '65px' : '12px')};
`

const HeaderCenter = styled.div`
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
`

const HeaderRight = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding-right: 12px;
`

const TitleText = styled(Typography.Text)`
  font-size: 16px;
  font-weight: bold;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  width: 50%;
`

const ViewControls = styled.div`
  display: flex;
  gap: 8px;
  padding: 4px;
  background: var(--color-background-mute);
  border-radius: 8px;
  border: 1px solid var(--color-border);
  -webkit-app-region: no-drag;
`

const ViewButton = styled(Button)`
  border: none;
  box-shadow: none;

  &.ant-btn-primary {
    background: var(--color-primary);
    color: white;
  }

  &.ant-btn-default {
    background: transparent;
    color: var(--color-text-secondary);

    &:hover {
      background: var(--color-background);
      color: var(--color-text);
    }
  }
`

const Container = styled.div`
  display: flex;
  height: 100%;
  width: 100%;
  flex: 1;
  background: var(--color-background);
  overflow: hidden;

  .ant-splitter {
    width: 100%;
    height: 100%;
    border: none;

    .ant-splitter-pane {
      overflow: hidden;
    }
  }
`

const CodeSection = styled.div`
  height: 100%;
  width: 100%;
  overflow: hidden;
  position: relative;
  display: grid;
  grid-template-rows: 1fr auto;
`

const PreviewSection = styled.div`
  height: 100%;
  width: 100%;
  background: white;
  overflow: hidden;
`

const PreviewFrame = styled.iframe`
  width: 100%;
  height: 100%;
  border: none;
  background: white;
`

const EmptyPreview = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--color-background-soft);
  color: var(--color-text-secondary);
  font-size: 14px;
`

const LoadingPreview = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--color-background-soft);
  color: var(--color-text-secondary);
  font-size: 14px;
`

const ErrorPreview = styled.div`
  width: 100%;
  height: 100%;
  padding: 20px;
  background: #fff2f0;
  color: #ff4d4f;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;

  h3 {
    margin-bottom: 0;
    font-size: 16px;
  }

  pre {
    white-space: pre-wrap;
    word-break: break-word;
    font-family: var(--code-font-family);
    font-size: 12px;
    line-height: 1.5;
    flex: 1;
    margin: 0;
  }
`

const ErrorHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 8px;
`

const RetryInfo = styled.div`
  font-size: 12px;
  color: #ff7875;
  margin-top: 4px;
  font-weight: normal;
`

const FixButtonContainer = styled.div`
  flex-shrink: 0;
`

const MaxRetriesMessage = styled.div`
  padding: 12px;
  background: #fff7e6;
  border: 1px solid #ffd591;
  border-radius: 4px;
  color: #d46b08;
  font-size: 13px;
  margin-top: 8px;
`

const ToolbarWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  position: absolute;
  gap: 8px;
  right: 1rem;
  bottom: 1rem;
  z-index: 1;
`

const ToolbarButton = styled(Button)`
  border: none;
  box-shadow:
    0 6px 16px 0 rgba(0, 0, 0, 0.08),
    0 3px 6px -4px rgba(0, 0, 0, 0.12),
    0 9px 28px 8px rgba(0, 0, 0, 0.05);
`

export default TsxArtifactsPopup

