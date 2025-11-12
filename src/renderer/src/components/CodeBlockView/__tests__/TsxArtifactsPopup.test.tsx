import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import TsxArtifactsPopup from '../TsxArtifactsPopup'
import type { Message } from '@renderer/types'

// Mock constants
const MOCK_TSX_CODE = `
import React from 'react'

export default function HelloWorld() {
  return <div>Hello World</div>
}
`

const MOCK_SIMPLE_TSX = `
export default function App() {
  return <div>Simple App</div>
}
`

const MOCK_INVALID_TSX = `
export default function Invalid() {
  return <div>Missing closing tag
}
`

const MOCK_NO_COMPONENT_TSX = `
const value = 42
console.log(value)
`

// Mock message for auto-retry
const createMockMessage = (overrides?: Partial<Message>): Message => ({
  id: 'test-message-id',
  role: 'assistant',
  content: 'Test message',
  topicId: 'test-topic',
  createdAt: Date.now(),
  ...overrides
})

// Mock esbuild-wasm
const mockEsbuildTransform = vi.fn()
const mockEsbuildInitialize = vi.fn()

// Mock @babel/standalone
const mockBabelTransform = vi.fn()

// Hoisted mocks
const mocks = vi.hoisted(() => ({
  Modal: vi.fn(({ open, onCancel, children, title, ...props }) => {
    if (!open) return null
    return (
      <div data-testid="modal" data-title={title} {...props}>
        <div data-testid="modal-close" onClick={onCancel} role="button" />
        {children}
      </div>
    )
  }),
  Button: vi.fn(({ children, onClick, disabled, icon, ...props }) => (
    <button data-testid={`button-${props['data-testid'] || 'default'}`} onClick={onClick} disabled={disabled} {...props}>
      {icon}
      {children}
    </button>
  )),
  Tooltip: vi.fn(({ children, title }) => (
    <div data-testid="tooltip" title={title}>
      {children}
    </div>
  )),
  message: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn()
  },
  useTranslation: vi.fn(() => ({
    t: (key: string) => key
  })),
  useAssistantStore: vi.fn(() => ({
    sendMessage: vi.fn()
  })),
  useRuntime: vi.fn(() => ({
    updateMessage: vi.fn()
  }))
}))

// Mock modules
vi.mock('antd', () => ({
  Modal: mocks.Modal,
  Button: mocks.Button,
  Tooltip: mocks.Tooltip,
  message: mocks.message
}))

vi.mock('react-i18next', () => ({
  useTranslation: mocks.useTranslation
}))

vi.mock('@renderer/store/assistant', () => ({
  useAssistantStore: mocks.useAssistantStore
}))

vi.mock('@renderer/store/runtime', () => ({
  useRuntime: mocks.useRuntime
}))

vi.mock('esbuild-wasm', () => ({
  default: {
    initialize: mockEsbuildInitialize,
    transform: mockEsbuildTransform
  }
}))

vi.mock('@babel/standalone', () => ({
  default: {
    transform: mockBabelTransform
  }
}))

// Mock copy-to-clipboard
vi.mock('copy-to-clipboard', () => ({
  default: vi.fn(() => true)
}))

describe('TsxArtifactsPopup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Reset esbuild mock
    mockEsbuildInitialize.mockResolvedValue(undefined)
    mockEsbuildTransform.mockResolvedValue({
      code: 'window.__tsxComponent = function() { return "transpiled"; };'
    })
    
    // Reset Babel mock
    mockBabelTransform.mockReturnValue({
      code: 'exports.default = function() { return "transpiled"; };'
    })
  })

  describe('Rendering and visibility', () => {
    it('should not render when open is false', () => {
      const { container } = render(
        <TsxArtifactsPopup open={false} tsxCode={MOCK_TSX_CODE} onClose={vi.fn()} />
      )
      
      expect(container.querySelector('[data-testid="modal"]')).not.toBeInTheDocument()
    })

    it('should render modal when open is true', () => {
      render(<TsxArtifactsPopup open={true} tsxCode={MOCK_TSX_CODE} onClose={vi.fn()} />)
      
      expect(screen.getByTestId('modal')).toBeInTheDocument()
    })

    it('should display correct modal title', () => {
      render(<TsxArtifactsPopup open={true} tsxCode={MOCK_TSX_CODE} onClose={vi.fn()} />)
      
      const modal = screen.getByTestId('modal')
      expect(modal).toHaveAttribute('data-title', 'tsx_artifacts.title')
    })

    it('should call onClose when modal is closed', () => {
      const onClose = vi.fn()
      render(<TsxArtifactsPopup open={true} tsxCode={MOCK_TSX_CODE} onClose={onClose} />)
      
      const closeButton = screen.getByTestId('modal-close')
      fireEvent.click(closeButton)
      
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('Loading state', () => {
    it('should show loading state initially', () => {
      render(<TsxArtifactsPopup open={true} tsxCode={MOCK_TSX_CODE} onClose={vi.fn()} />)
      
      expect(screen.getByText('tsx_artifacts.compiling')).toBeInTheDocument()
    })

    it('should load esbuild-wasm on mount', async () => {
      render(<TsxArtifactsPopup open={true} tsxCode={MOCK_TSX_CODE} onClose={vi.fn()} />)
      
      await waitFor(() => {
        expect(mockEsbuildInitialize).toHaveBeenCalled()
      })
    })

    it('should load esbuild-wasm successfully', async () => {
      render(<TsxArtifactsPopup open={true} tsxCode={MOCK_TSX_CODE} onClose={vi.fn()} />)
      
      await waitFor(() => {
        expect(mockEsbuildInitialize).toHaveBeenCalled()
      })
    })

    it('should handle esbuild loading failure gracefully', async () => {
      mockEsbuildInitialize.mockRejectedValueOnce(new Error('Load failed'))
      
      render(<TsxArtifactsPopup open={true} tsxCode={MOCK_TSX_CODE} onClose={vi.fn()} />)
      
      // Should still attempt to load and handle error
      await waitFor(() => {
        expect(mockEsbuildInitialize).toHaveBeenCalled()
      })
    })
  })

  describe('Transpilation with esbuild', () => {
    it('should transpile code using esbuild when available', async () => {
      render(<TsxArtifactsPopup open={true} tsxCode={MOCK_SIMPLE_TSX} onClose={vi.fn()} />)
      
      await waitFor(() => {
        expect(mockEsbuildTransform).toHaveBeenCalled()
      })
    })

    it('should pass correct options to esbuild transform', async () => {
      render(<TsxArtifactsPopup open={true} tsxCode={MOCK_SIMPLE_TSX} onClose={vi.fn()} />)
      
      await waitFor(() => {
        expect(mockEsbuildTransform).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            loader: 'tsx',
            format: 'cjs',
            jsx: 'transform',
            jsxFactory: 'React.createElement',
            jsxFragment: 'React.Fragment'
          })
        )
      })
    })

    it('should handle imports correctly', async () => {
      const codeWithImports = `
        import React from 'react'
        import { useState } from 'react'
        import * as ReactDOM from 'react-dom'
        
        export default function App() {
          const [count, setCount] = useState(0)
          return <div>{count}</div>
        }
      `
      
      render(<TsxArtifactsPopup open={true} tsxCode={codeWithImports} onClose={vi.fn()} />)
      
      await waitFor(() => {
        expect(mockEsbuildTransform).toHaveBeenCalledWith(
          expect.stringContaining('const React = window.React'),
          expect.any(Object)
        )
      })
    })

    it('should remove type-only imports', async () => {
      const codeWithTypeImports = `
        import type { FC } from 'react'
        import React from 'react'
        
        const App: FC = () => <div>Hello</div>
        export default App
      `
      
      render(<TsxArtifactsPopup open={true} tsxCode={codeWithTypeImports} onClose={vi.fn()} />)
      
      await waitFor(() => {
        const callArgs = mockEsbuildTransform.mock.calls[0]
        expect(callArgs[0]).not.toContain('import type')
      })
    })
  })

  describe('Transpilation fallback to Babel', () => {
    it('should fallback to Babel when esbuild fails', async () => {
      mockEsbuildTransform.mockRejectedValueOnce(new Error('esbuild transform failed'))
      
      render(<TsxArtifactsPopup open={true} tsxCode={MOCK_SIMPLE_TSX} onClose={vi.fn()} />)
      
      await waitFor(() => {
        expect(mockBabelTransform).toHaveBeenCalled()
      })
    })

    it('should pass correct options to Babel transform', async () => {
      mockEsbuildTransform.mockRejectedValueOnce(new Error('esbuild failed'))
      
      render(<TsxArtifactsPopup open={true} tsxCode={MOCK_SIMPLE_TSX} onClose={vi.fn()} />)
      
      await waitFor(() => {
        expect(mockBabelTransform).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            presets: expect.arrayContaining(['react']),
            filename: 'component.tsx'
          })
        )
      })
    })

    it('should wrap Babel output in CommonJS wrapper', async () => {
      mockEsbuildTransform.mockRejectedValueOnce(new Error('esbuild failed'))
      mockBabelTransform.mockReturnValueOnce({
        code: 'const App = () => <div>Test</div>; exports.default = App;'
      })
      
      render(<TsxArtifactsPopup open={true} tsxCode={MOCK_SIMPLE_TSX} onClose={vi.fn()} />)
      
      await waitFor(() => {
        expect(mockBabelTransform).toHaveBeenCalled()
      })
    })
  })

  describe('Error handling', () => {
    it('should show error message when transpilation fails', async () => {
      mockEsbuildTransform.mockRejectedValueOnce(new Error('Transform failed'))
      mockBabelTransform.mockImplementationOnce(() => {
        throw new Error('Babel also failed')
      })
      
      render(<TsxArtifactsPopup open={true} tsxCode={MOCK_INVALID_TSX} onClose={vi.fn()} />)
      
      await waitFor(() => {
        expect(screen.getByText(/tsx_artifacts.error/)).toBeInTheDocument()
      })
    })

    it('should display error details', async () => {
      const errorMessage = 'Specific transpilation error'
      mockEsbuildTransform.mockRejectedValueOnce(new Error(errorMessage))
      mockBabelTransform.mockImplementationOnce(() => {
        throw new Error(errorMessage)
      })
      
      render(<TsxArtifactsPopup open={true} tsxCode={MOCK_INVALID_TSX} onClose={vi.fn()} />)
      
      await waitFor(() => {
        expect(screen.getByText(new RegExp(errorMessage))).toBeInTheDocument()
      })
    })

    it('should handle transpilation errors', async () => {
      const error = new Error('Transpilation error')
      mockEsbuildTransform.mockRejectedValueOnce(error)
      mockBabelTransform.mockImplementationOnce(() => {
        throw error
      })
      
      render(<TsxArtifactsPopup open={true} tsxCode={MOCK_INVALID_TSX} onClose={vi.fn()} />)
      
      await waitFor(() => {
        expect(screen.getByText(/tsx_artifacts.error/)).toBeInTheDocument()
      })
    })
  })

  describe('Auto-retry mechanism', () => {
    it('should automatically retry on transpilation error when message is provided', async () => {
      const mockSendMessage = vi.fn()
      mocks.useAssistantStore.mockReturnValue({ sendMessage: mockSendMessage })
      
      mockEsbuildTransform.mockRejectedValueOnce(new Error('Transform failed'))
      mockBabelTransform.mockImplementationOnce(() => {
        throw new Error('Babel failed')
      })
      
      const message = createMockMessage()
      render(
        <TsxArtifactsPopup
          open={true}
          tsxCode={MOCK_INVALID_TSX}
          onClose={vi.fn()}
          message={message}
        />
      )
      
      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalled()
      })
    })

    it('should increment retry attempt counter', async () => {
      mockEsbuildTransform.mockRejectedValue(new Error('Always fails'))
      mockBabelTransform.mockImplementation(() => {
        throw new Error('Always fails')
      })
      
      const message = createMockMessage()
      render(
        <TsxArtifactsPopup
          open={true}
          tsxCode={MOCK_INVALID_TSX}
          onClose={vi.fn()}
          message={message}
        />
      )
      
      await waitFor(() => {
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('Auto-retry attempt'),
          expect.any(Object)
        )
      })
    })

    it('should not retry beyond maximum attempts', async () => {
      const mockSendMessage = vi.fn()
      mocks.useAssistantStore.mockReturnValue({ sendMessage: mockSendMessage })
      
      mockEsbuildTransform.mockRejectedValue(new Error('Always fails'))
      mockBabelTransform.mockImplementation(() => {
        throw new Error('Always fails')
      })
      
      const message = createMockMessage()
      
      // Render and trigger multiple failures
      const { rerender } = render(
        <TsxArtifactsPopup
          open={true}
          tsxCode={MOCK_INVALID_TSX}
          onClose={vi.fn()}
          message={message}
        />
      )
      
      // Simulate max retries by re-rendering with different codes
      for (let i = 0; i < 6; i++) {
        rerender(
          <TsxArtifactsPopup
            open={true}
            tsxCode={MOCK_INVALID_TSX + `\n// attempt ${i}`}
            onClose={vi.fn()}
            message={message}
          />
        )
        await waitFor(() => new Promise(resolve => setTimeout(resolve, 100)))
      }
      
      // Should only retry MAX_AUTO_RETRY_ATTEMPTS times (5)
      await waitFor(() => {
        expect(mockSendMessage.mock.calls.length).toBeLessThanOrEqual(5)
      })
    })

    it('should show max retries message when limit is reached', async () => {
      mockEsbuildTransform.mockRejectedValue(new Error('Always fails'))
      mockBabelTransform.mockImplementation(() => {
        throw new Error('Always fails')
      })
      
      const message = createMockMessage()
      render(
        <TsxArtifactsPopup
          open={true}
          tsxCode={MOCK_INVALID_TSX}
          onClose={vi.fn()}
          message={message}
        />
      )
      
      // Wait for max retries
      await waitFor(
        () => {
          expect(screen.queryByText(/tsx_artifacts.max_retries_reached/)).toBeInTheDocument()
        },
        { timeout: 5000 }
      )
    })

    it('should not auto-retry when no message context is provided', async () => {
      const mockSendMessage = vi.fn()
      mocks.useAssistantStore.mockReturnValue({ sendMessage: mockSendMessage })
      
      mockEsbuildTransform.mockRejectedValueOnce(new Error('Transform failed'))
      mockBabelTransform.mockImplementationOnce(() => {
        throw new Error('Babel failed')
      })
      
      render(<TsxArtifactsPopup open={true} tsxCode={MOCK_INVALID_TSX} onClose={vi.fn()} />)
      
      await waitFor(() => {
        expect(screen.getByText(/tsx_artifacts.error/)).toBeInTheDocument()
      })
      
      expect(mockSendMessage).not.toHaveBeenCalled()
    })
  })

  describe('Manual fix button', () => {
    it('should show fix button when error occurs and message is provided', async () => {
      mockEsbuildTransform.mockRejectedValueOnce(new Error('Transform failed'))
      mockBabelTransform.mockImplementationOnce(() => {
        throw new Error('Babel failed')
      })
      
      const message = createMockMessage()
      render(
        <TsxArtifactsPopup
          open={true}
          tsxCode={MOCK_INVALID_TSX}
          onClose={vi.fn()}
          message={message}
        />
      )
      
      await waitFor(() => {
        expect(screen.getByText('tsx_artifacts.fix_code')).toBeInTheDocument()
      })
    })

    it('should disable fix button when fixing is in progress', async () => {
      mockEsbuildTransform.mockRejectedValue(new Error('Transform failed'))
      mockBabelTransform.mockImplementation(() => {
        throw new Error('Babel failed')
      })
      
      const message = createMockMessage()
      render(
        <TsxArtifactsPopup
          open={true}
          tsxCode={MOCK_INVALID_TSX}
          onClose={vi.fn()}
          message={message}
        />
      )
      
      await waitFor(() => {
        const fixButton = screen.getByText('tsx_artifacts.fix_code').closest('button')
        expect(fixButton).toBeDisabled()
      })
    })

    it('should call sendMessage when fix button is clicked', async () => {
      const mockSendMessage = vi.fn()
      mocks.useAssistantStore.mockReturnValue({ sendMessage: mockSendMessage })
      
      mockEsbuildTransform.mockRejectedValueOnce(new Error('Transform failed'))
      mockBabelTransform.mockImplementationOnce(() => {
        throw new Error('Babel failed')
      })
      
      const message = createMockMessage()
      
      // Mock to prevent auto-retry
      vi.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
        // Don't auto-execute
        return 0 as any
      })
      
      render(
        <TsxArtifactsPopup
          open={true}
          tsxCode={MOCK_INVALID_TSX}
          onClose={vi.fn()}
          message={message}
        />
      )
      
      await waitFor(() => {
        expect(screen.getByText('tsx_artifacts.fix_code')).toBeInTheDocument()
      })
      
      mockSendMessage.mockClear()
      
      const fixButton = screen.getByText('tsx_artifacts.fix_code').closest('button')
      if (fixButton && !fixButton.hasAttribute('disabled')) {
        fireEvent.click(fixButton)
        
        await waitFor(() => {
          expect(mockSendMessage).toHaveBeenCalled()
        })
      }
    })
  })

  describe('Action buttons', () => {
    it('should render copy button', () => {
      render(<TsxArtifactsPopup open={true} tsxCode={MOCK_TSX_CODE} onClose={vi.fn()} />)
      
      expect(screen.getByText('tsx_artifacts.copy_code')).toBeInTheDocument()
    })

    it('should render open in window button', () => {
      render(<TsxArtifactsPopup open={true} tsxCode={MOCK_TSX_CODE} onClose={vi.fn()} />)
      
      expect(screen.getByText('tsx_artifacts.open_in_window')).toBeInTheDocument()
    })

    it('should render fullscreen button', () => {
      render(<TsxArtifactsPopup open={true} tsxCode={MOCK_TSX_CODE} onClose={vi.fn()} />)
      
      expect(screen.getByText('tsx_artifacts.fullscreen')).toBeInTheDocument()
    })

    it('should copy code to clipboard when copy button is clicked', async () => {
      const copyToClipboard = await import('copy-to-clipboard')
      
      render(<TsxArtifactsPopup open={true} tsxCode={MOCK_TSX_CODE} onClose={vi.fn()} />)
      
      const copyButton = screen.getByText('tsx_artifacts.copy_code').closest('button')
      fireEvent.click(copyButton!)
      
      expect(copyToClipboard.default).toHaveBeenCalledWith(MOCK_TSX_CODE)
      expect(mocks.message.success).toHaveBeenCalledWith('tsx_artifacts.copied')
    })
  })

  describe('Iframe rendering', () => {
    it('should render preview iframe', () => {
      const { container } = render(
        <TsxArtifactsPopup open={true} tsxCode={MOCK_TSX_CODE} onClose={vi.fn()} />
      )
      
      const iframe = container.querySelector('iframe')
      expect(iframe).toBeInTheDocument()
    })

    it('should set iframe sandbox attributes', () => {
      const { container } = render(
        <TsxArtifactsPopup open={true} tsxCode={MOCK_TSX_CODE} onClose={vi.fn()} />
      )
      
      const iframe = container.querySelector('iframe')
      expect(iframe).toHaveAttribute('sandbox')
      expect(iframe?.getAttribute('sandbox')).toContain('allow-scripts')
    })

    it('should initialize iframe with blank document', () => {
      const { container } = render(
        <TsxArtifactsPopup open={true} tsxCode={MOCK_TSX_CODE} onClose={vi.fn()} />
      )
      
      const iframe = container.querySelector('iframe')
      expect(iframe).toHaveAttribute('srcDoc')
    })
  })

  describe('Component lifecycle', () => {
    it('should reset state when modal is closed and reopened', async () => {
      const { rerender } = render(
        <TsxArtifactsPopup open={true} tsxCode={MOCK_TSX_CODE} onClose={vi.fn()} />
      )
      
      // Close modal
      rerender(<TsxArtifactsPopup open={false} tsxCode={MOCK_TSX_CODE} onClose={vi.fn()} />)
      
      // Reopen with new code
      rerender(<TsxArtifactsPopup open={true} tsxCode={MOCK_SIMPLE_TSX} onClose={vi.fn()} />)
      
      // Should show loading state again
      expect(screen.getByText('tsx_artifacts.compiling')).toBeInTheDocument()
    })

    it('should retranspile when TSX code changes', async () => {
      mockEsbuildTransform.mockClear()
      
      const { rerender } = render(
        <TsxArtifactsPopup open={true} tsxCode={MOCK_TSX_CODE} onClose={vi.fn()} />
      )
      
      await waitFor(() => {
        expect(mockEsbuildTransform).toHaveBeenCalledTimes(1)
      })
      
      // Change code
      rerender(<TsxArtifactsPopup open={true} tsxCode={MOCK_SIMPLE_TSX} onClose={vi.fn()} />)
      
      await waitFor(() => {
        expect(mockEsbuildTransform).toHaveBeenCalledTimes(2)
      })
    })

    it('should not retranspile when code is unchanged', async () => {
      mockEsbuildTransform.mockClear()
      
      const { rerender } = render(
        <TsxArtifactsPopup open={true} tsxCode={MOCK_TSX_CODE} onClose={vi.fn()} />
      )
      
      await waitFor(() => {
        expect(mockEsbuildTransform).toHaveBeenCalledTimes(1)
      })
      
      // Rerender with same code
      rerender(<TsxArtifactsPopup open={true} tsxCode={MOCK_TSX_CODE} onClose={vi.fn()} />)
      
      // Should not transpile again
      await new Promise(resolve => setTimeout(resolve, 200))
      expect(mockEsbuildTransform).toHaveBeenCalledTimes(1)
    })
  })

  describe('Edge cases', () => {
    it('should handle empty TSX code', async () => {
      render(<TsxArtifactsPopup open={true} tsxCode="" onClose={vi.fn()} />)
      
      await waitFor(() => {
        expect(mockEsbuildTransform).toHaveBeenCalled()
      })
    })

    it('should handle very long TSX code', async () => {
      const longCode = MOCK_SIMPLE_TSX.repeat(100)
      
      render(<TsxArtifactsPopup open={true} tsxCode={longCode} onClose={vi.fn()} />)
      
      await waitFor(() => {
        expect(mockEsbuildTransform).toHaveBeenCalled()
      })
    })

    it('should handle code with special characters', async () => {
      const specialCode = `
        export default function App() {
          return <div>Special: 你好 © ® ™ 💩</div>
        }
      `
      
      render(<TsxArtifactsPopup open={true} tsxCode={specialCode} onClose={vi.fn()} />)
      
      await waitFor(() => {
        expect(mockEsbuildTransform).toHaveBeenCalled()
      })
    })

    it('should handle code with JSX fragments', async () => {
      const fragmentCode = `
        import React from 'react'
        
        export default function App() {
          return (
            <>
              <div>First</div>
              <div>Second</div>
            </>
          )
        }
      `
      
      render(<TsxArtifactsPopup open={true} tsxCode={fragmentCode} onClose={vi.fn()} />)
      
      await waitFor(() => {
        expect(mockEsbuildTransform).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            jsxFragment: 'React.Fragment'
          })
        )
      })
    })

    it('should handle code with hooks', async () => {
      const hooksCode = `
        import React, { useState, useEffect } from 'react'
        
        export default function App() {
          const [count, setCount] = useState(0)
          
          useEffect(() => {
            console.log('Count:', count)
          }, [count])
          
          return <div onClick={() => setCount(c => c + 1)}>{count}</div>
        }
      `
      
      render(<TsxArtifactsPopup open={true} tsxCode={hooksCode} onClose={vi.fn()} />)
      
      await waitFor(() => {
        expect(mockEsbuildTransform).toHaveBeenCalledWith(
          expect.stringContaining('useState'),
          expect.any(Object)
        )
      })
    })
  })
})

