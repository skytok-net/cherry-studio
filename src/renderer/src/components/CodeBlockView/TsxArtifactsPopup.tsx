import { loggerService } from '@logger'
import type { CodeEditorHandles } from '@renderer/components/CodeEditor'
import CodeEditor from '@renderer/components/CodeEditor'
import { CopyIcon, FilePngIcon } from '@renderer/components/Icons'
import { isMac } from '@renderer/config/constant'
import { useTemporaryValue } from '@renderer/hooks/useTemporaryValue'
import store from '@renderer/store'
import { messageBlocksSelectors } from '@renderer/store/messageBlock'
import { selectMessagesForTopic } from '@renderer/store/newMessage'
import { classNames } from '@renderer/utils'
import { extractComponentName } from '@renderer/utils/formats'
import { captureScrollableIframeAsBlob, captureScrollableIframeAsDataURL } from '@renderer/utils/image'
import { Button, Dropdown, Modal, Splitter, Tooltip, Typography } from 'antd'
import {
  Camera,
  Check,
  Code,
  Copy,
  Eye,
  Maximize2,
  MessageSquare,
  Minimize2,
  SaveIcon,
  SquareSplitHorizontal,
  Wand2,
  X
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

import { ArtifactChatSidebar } from './ArtifactChatSidebar'
import type { ArtifactFramework, ArtifactMetadata } from './UniversalArtifactViewer'
import { UniversalArtifactViewer } from './UniversalArtifactViewer'

const logger = loggerService.withContext('TsxArtifactsPopup')

interface TsxArtifactsPopupProps {
  open: boolean
  title: string
  tsx: string
  onSave?: (tsx: string) => void
  onClose: () => void
  blockId?: string // Message block ID for context
  language?: string // Code block language (tsx, jsx, svelte, vue, etc.)
}

type ViewMode = 'split' | 'code' | 'preview'

/**
 * TSX Artifacts Popup - Universal Multi-Framework Component Preview
 * 
 * Migrated to use UniversalArtifactViewer for:
 * - React / Preact
 * - Svelte / SvelteKit
 * - Vue / Nuxt
 * - Solid.js / SolidStart
 * 
 * Features:
 * - Server-side native transpilation (esbuild via IPC)
 * - Auto-retry with LLM fix on errors
 * - All supported libraries (ReactFlow, Lucide, Tailwind, etc.)
 * - Network APIs enabled (fetch)
 */
const TsxArtifactsPopup: React.FC<TsxArtifactsPopupProps> = ({ 
  open, 
  title, 
  tsx, 
  onSave, 
  onClose, 
  blockId,
  language = 'tsx'
}) => {
  const { t } = useTranslation()
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [saved, setSaved] = useTemporaryValue(false, 2000)
  const [copied, setCopied] = useTemporaryValue(false, 2000)
  
  const codeEditorRef = useRef<CodeEditorHandles>(null)
  const previewFrameRef = useRef<HTMLIFrameElement>(null)

  /**
   * Detect framework from language/code
   */
  const artifactMetadata = useMemo((): ArtifactMetadata => {
    // Map code block language to framework
    const languageMap: Record<string, ArtifactFramework> = {
      'tsx': 'react',
      'jsx': 'react',
      'svelte': 'svelte',
      'vue': 'vue',
      'solid': 'solid',
      'preact': 'preact'
    }

    const detectedFramework = languageMap[language.toLowerCase()] || 'react'
    const isTypeScript = language.toLowerCase().includes('ts') || language === 'tsx'

    return {
      framework: detectedFramework,
      language: isTypeScript ? 'typescript' : 'javascript',
      title: title || `${detectedFramework} Artifact`,
      description: `Interactive ${detectedFramework} component`
    }
  }, [language, title])

  /**
   * Get conversation history for LLM context
   */
  const conversationHistory = useMemo(() => {
    if (!blockId) return []

    try {
      const block = messageBlocksSelectors.selectById(store.getState(), blockId)
      if (!block || !block.messageId) return []

      const state = store.getState()
      const assistants = state.assistants.assistants

      // Find the message across all topics
      for (const assistant of assistants) {
        for (const topic of assistant.topics) {
          const messages = selectMessagesForTopic(state, topic.id)
          const foundMessage = messages.find((m) => m.id === block.messageId)
          if (foundMessage) {
            // Get last 5 messages for context
            const messageIndex = messages.indexOf(foundMessage)
            const recentMessages = messages.slice(Math.max(0, messageIndex - 4), messageIndex + 1)
            return recentMessages.map((m) => {
              // Get content from message blocks
              const blockContents = m.blocks?.map((blockId) => {
                const block = messageBlocksSelectors.selectById(state, blockId)
                // Only MainTextMessageBlock and some other types have content
                if (block && 'content' in block) {
                  return (block as any).content || ''
                }
                return ''
              }).filter(Boolean) || []
              const content = blockContents.join('\n')
              return `${m.role}: ${content.substring(0, 500)}` // Limit length
            })
          }
        }
      }

      return []
    } catch (error) {
      logger.error('Failed to get conversation history:', error as Error)
      return []
    }
  }, [blockId])

  /**
   * Get conversation history for sidebar (structured format)
   */
  const sidebarConversationHistory = useMemo(() => {
    if (!blockId) return []

    try {
      const block = messageBlocksSelectors.selectById(store.getState(), blockId)
      if (!block || !block.messageId) return []

      const state = store.getState()
      const assistants = state.assistants.assistants

      // Find the message across all topics
      for (const assistant of assistants) {
        for (const topic of assistant.topics) {
          const messages = selectMessagesForTopic(state, topic.id)
          const foundMessage = messages.find((m) => m.id === block.messageId)
          if (foundMessage) {
            // Get recent messages for sidebar (last 10)
            const messageIndex = messages.indexOf(foundMessage)
            const recentMessages = messages.slice(Math.max(0, messageIndex - 9), messageIndex + 1)
            return recentMessages.map((m) => {
              const blockContents = m.blocks?.map((blockId) => {
                const block = messageBlocksSelectors.selectById(state, blockId)
                if (block && 'content' in block) {
                  return (block as any).content || ''
                }
                return ''
              }).filter(Boolean) || []
              const content = blockContents.join('\n')
              return {
                role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
                content,
                timestamp: typeof m.createdAt === 'string' ? new Date(m.createdAt).getTime() : m.createdAt
              }
            })
          }
        }
      }

      return []
    } catch (error) {
      logger.error('Failed to get sidebar conversation history:', error as Error)
      return []
    }
  }, [blockId])

  /**
   * Handle sending message from sidebar
   * TODO: Implement actual message sending through the messaging system
   */
  const handleSidebarSendMessage = useCallback(async (message: string) => {
    logger.info('Sidebar message', { message })
    // TODO: Integrate with actual messaging system
    // This should send the message through the same system as the main chat
    window.toast.info('Message sending integration pending')
  }, [])

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

  const handleCapture = useCallback(
    async (to: 'file' | 'clipboard') => {
      const fileName = extractComponentName(tsx) || `${artifactMetadata.framework}-artifact`

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
    [tsx, artifactMetadata.framework, t]
  )

  const handleError = useCallback((error: Error) => {
    logger.error('Artifact render error:', error)
  }, [])

  const handleSuccess = useCallback(() => {
    logger.info('Artifact rendered successfully')
  }, [])

  const renderHeader = () => (
    <ModalHeader onDoubleClick={() => setIsFullscreen(!isFullscreen)} className={classNames({ drag: isFullscreen })}>
      <HeaderLeft $isFullscreen={isFullscreen}>
        <TitleText ellipsis={{ tooltip: true }}>{title}</TitleText>
        {artifactMetadata.framework !== 'react' && (
          <FrameworkBadge $framework={artifactMetadata.framework}>
            {artifactMetadata.framework}
          </FrameworkBadge>
        )}
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
        <Tooltip title={t('code_block.ai_assistant.toggle', 'AI Assistant')} mouseLeaveDelay={0}>
          <Button
            type={isSidebarOpen ? 'primary' : 'text'}
            icon={<MessageSquare size={16} />}
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="nodrag"
          />
        </Tooltip>
        <Tooltip title={t('code_block.ai_wizard.tooltip', 'Request AI to automatically fix errors or improve the code')} mouseLeaveDelay={0}>
          <Button
            type="text"
            icon={<Wand2 size={16} />}
            onClick={() => window.toast.info('AI Wizard integration pending')}
            className="nodrag"
          />
        </Tooltip>
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
          language={language}
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
        <UniversalArtifactViewer
          code={tsx}
          metadata={artifactMetadata}
          blockId={blockId}
          conversationHistory={conversationHistory}
          onError={handleError}
          onSuccess={handleSuccess}
        />
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
      <Container>
        <ArtifactChatSidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          artifactCode={tsx}
          onCodeUpdate={(newCode) => {
            // Update code via parent's onSave callback
            // The CodeEditor is controlled by the value prop, so updating parent state will re-render it
            onSave?.(newCode)
          }}
          conversationHistory={sidebarConversationHistory}
          onSendMessage={handleSidebarSendMessage}
        />
        {renderContent()}
      </Container>
    </StyledModal>
  )
}

// Styled Components (same as before)

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
  display: flex;
  align-items: center;
  gap: 12px;
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

const FrameworkBadge = styled.span<{ $framework: string }>`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  background: ${(props) => {
    const colors = {
      react: '#61dafb20',
      svelte: '#ff3e0020',
      vue: '#42b88320',
      solid: '#446b9e20',
      preact: '#673ab720'
    }
    return colors[props.$framework as keyof typeof colors] || '#666'
  }};
  color: ${(props) => {
    const colors = {
      react: '#61dafb',
      svelte: '#ff3e00',
      vue: '#42b883',
      solid: '#446b9e',
      preact: '#673ab7'
    }
    return colors[props.$framework as keyof typeof colors] || '#fff'
  }};
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
  position: relative; /* For absolute-positioned sidebar */
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

