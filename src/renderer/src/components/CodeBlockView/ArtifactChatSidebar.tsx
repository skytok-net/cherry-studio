import { loggerService } from '@logger'
import { Input, Spin } from 'antd'
import { MessageSquare, Send, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

const logger = loggerService.withContext('ArtifactChatSidebar')

interface ArtifactChatSidebarProps {
  isOpen: boolean
  onClose: () => void
  artifactCode: string
  onCodeUpdate: (newCode: string) => void
  conversationHistory: Array<{
    role: 'user' | 'assistant'
    content: string
    timestamp?: number
  }>
  onSendMessage: (message: string) => Promise<void>
}

/**
 * Artifact Chat Sidebar
 * 
 * A slide-out sidebar for interacting with an AI assistant to edit artifacts.
 * Features:
 * - Shows conversation history (without artifact code blocks)
 * - Allows requesting edits to the artifact
 * - Messages go into main conversation but focused on artifact editing
 */
export function ArtifactChatSidebar({
  isOpen,
  onClose,
  artifactCode: _artifactCode, // Reserved for future use
  onCodeUpdate: _onCodeUpdate, // Reserved for future use
  conversationHistory,
  onSendMessage
}: ArtifactChatSidebarProps) {
  const { t } = useTranslation()
  const [inputValue, setInputValue] = useState('')
  const [isSending, setIsSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [conversationHistory, isOpen])

  // Focus input when sidebar opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      const timer = setTimeout(() => {
        inputRef.current?.focus()
      }, 300) // Wait for slide-in animation
      return () => clearTimeout(timer)
    }
    return undefined
  }, [isOpen])

  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isSending) return

    const message = inputValue.trim()
    setInputValue('')
    setIsSending(true)

    try {
      await onSendMessage(message)
    } catch (error) {
      logger.error('Failed to send message:', error as Error)
    } finally {
      setIsSending(false)
    }
  }, [inputValue, isSending, onSendMessage])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  /**
   * Strip artifact code blocks from message content
   * Replaces tsx/jsx/svelte/vue/solid/preact code blocks with a reference message
   */
  const stripArtifactCodeBlocks = useCallback((content: string): string => {
    const artifactLanguages = ['tsx', 'jsx', 'svelte', 'vue', 'solid', 'preact']
    const pattern = new RegExp(
      `\`\`\`(${artifactLanguages.join('|')})\\n[\\s\\S]*?\`\`\``,
      'g'
    )
    
    return content.replace(pattern, (_match, lang) => {
      return `\n\n*[${lang.toUpperCase()} Component Code - See Preview]*\n\n`
    })
  }, [])

  return (
    <SidebarContainer $isOpen={isOpen}>
      <SidebarHeader>
        <HeaderTitle>
          <MessageSquare size={18} />
          <span>{t('code_block.ai_assistant.title')}</span>
        </HeaderTitle>
        <CloseButton onClick={onClose}>
          <X size={18} />
        </CloseButton>
      </SidebarHeader>

      <MessagesContainer>
        {conversationHistory.length === 0 ? (
          <EmptyState>
            <MessageSquare size={48} opacity={0.3} />
            <p>Start a conversation to edit this artifact</p>
            <p className="hint">
              Ask for specific changes, improvements, or fixes
            </p>
          </EmptyState>
        ) : (
          <>
            {conversationHistory.map((msg, index) => {
              const strippedContent = stripArtifactCodeBlocks(msg.content)
              
              return (
                <MessageBubble key={index} $role={msg.role}>
                  <MessageRole>
                    {msg.role === 'user' ? 'You' : 'Assistant'}
                  </MessageRole>
                  <MessageContent>
                    {strippedContent}
                  </MessageContent>
                  {msg.timestamp && (
                    <MessageTimestamp>
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </MessageTimestamp>
                  )}
                </MessageBubble>
              )
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </MessagesContainer>

      <InputContainer>
        <InputWrapper>
          <StyledTextArea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('code_block.ai_assistant.placeholder')}
            disabled={isSending}
            rows={3}
            maxLength={2000}
          />
          {isSending && (
            <LoadingOverlay>
              <Spin size="small" />
              <span>{t('code_block.ai_assistant.thinking')}</span>
            </LoadingOverlay>
          )}
        </InputWrapper>
        <SendButton onClick={handleSend} disabled={!inputValue.trim() || isSending}>
          <Send size={18} />
          <span>{t('code_block.ai_assistant.send')}</span>
        </SendButton>
      </InputContainer>
    </SidebarContainer>
  )
}

// Styled Components

const SidebarContainer = styled.div<{ $isOpen: boolean }>`
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 380px;
  background: var(--color-background);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  transform: ${(props) => (props.$isOpen ? 'translateX(0)' : 'translateX(-100%)')};
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 100;
  box-shadow: ${(props) =>
    props.$isOpen ? '2px 0 8px rgba(0, 0, 0, 0.1)' : 'none'};
`

const SidebarHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-background-soft);
`

const HeaderTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
  color: var(--color-text);

  svg {
    color: var(--color-primary);
  }
`

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  color: var(--color-text-secondary);
  transition: all 0.2s;

  &:hover {
    background: var(--color-background-mute);
    color: var(--color-text);
  }
`

const MessagesContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: var(--color-text-secondary);
  gap: 12px;

  p {
    margin: 0;
    font-size: 14px;
  }

  .hint {
    font-size: 12px;
    opacity: 0.7;
  }
`

const MessageBubble = styled.div<{ $role: 'user' | 'assistant' }>`
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-self: ${(props) => (props.$role === 'user' ? 'flex-end' : 'flex-start')};
  max-width: 85%;
  padding: 10px 12px;
  border-radius: 12px;
  background: ${(props) =>
    props.$role === 'user'
      ? 'var(--color-primary)'
      : 'var(--color-background-soft)'};
  color: ${(props) =>
    props.$role === 'user' ? 'white' : 'var(--color-text)'};
`

const MessageRole = styled.div`
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  opacity: 0.8;
  margin-bottom: 2px;
`

const MessageContent = styled.div`
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
`

const MessageTimestamp = styled.div`
  font-size: 10px;
  opacity: 0.6;
  margin-top: 4px;
`

const InputContainer = styled.div`
  padding: 16px;
  border-top: 1px solid var(--color-border);
  background: var(--color-background-soft);
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const InputWrapper = styled.div`
  position: relative;
`

const StyledTextArea = styled(Input.TextArea)`
  resize: none;
  font-size: 13px;

  &:disabled {
    opacity: 0.6;
  }
`

const LoadingOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 12px;
  color: var(--color-text-secondary);
  border-radius: 4px;
`

const SendButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

