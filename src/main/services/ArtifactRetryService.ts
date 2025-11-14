import { loggerService } from '@logger'

import type { TranspileError, TranspileRequest } from './ArtifactTranspilerService'
import { artifactTranspilerService } from './ArtifactTranspilerService'

const logger = loggerService.withContext('ArtifactRetryService')

/**
 * Context for LLM-assisted error fixing
 */
export interface RetryContext {
  originalCode: string
  error: TranspileError
  framework: string
  conversationHistory?: string[] // Recent messages for context
  attemptNumber: number
  maxAttempts: number
}

/**
 * Result of retry attempt
 */
export interface RetryResult {
  success: boolean
  fixedCode?: string
  transpiledCode?: string
  error?: TranspileError
  attempts: number
  fixStrategy?: string
}

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
  maxAttempts: number
  enableLLMFix: boolean
  includeConversationContext: boolean
  promptTemplate?: string
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  enableLLMFix: true,
  includeConversationContext: true
}

/**
 * Service for handling transpilation failures with LLM-assisted auto-fixing
 * 
 * Flow:
 * 1. Initial transpilation fails
 * 2. Extract error details (line, column, message)
 * 3. Send to LLM: "Fix this TypeScript error: [error] in code: [code]"
 * 4. LLM returns corrected code
 * 5. Retry transpilation
 * 6. Repeat up to maxAttempts
 */
export class ArtifactRetryService {
  private config: RetryConfig

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config }
  }

  /**
   * Generate LLM prompt for fixing transpilation errors
   */
  private generateFixPrompt(context: RetryContext): string {
    const { originalCode, error, framework, conversationHistory, attemptNumber } = context

    let prompt = `You are a ${framework} code expert. Fix this transpilation error:\n\n`

    // Add error details
    prompt += `ERROR: ${error.message}\n`
    if (error.location) {
      prompt += `Location: Line ${error.location.line}, Column ${error.location.column}\n`
      prompt += `Context: ${error.location.lineText}\n`
      if (error.location.suggestion) {
        prompt += `Suggestion: ${error.location.suggestion}\n`
      }
    }

    prompt += `\n`

    // Add original code
    prompt += `ORIGINAL CODE:\n\`\`\`${framework === 'react' ? 'tsx' : framework}\n${originalCode}\n\`\`\`\n\n`

    // Add conversation context if available
    if (conversationHistory && conversationHistory.length > 0) {
      prompt += `RECENT CONVERSATION CONTEXT:\n`
      conversationHistory.slice(-3).forEach((msg, i) => {
        prompt += `${i + 1}. ${msg}\n`
      })
      prompt += `\n`
    }

    // Add attempt info
    if (attemptNumber > 1) {
      prompt += `This is attempt ${attemptNumber} of ${context.maxAttempts}.\n\n`
    }

    // Add instructions
    prompt += `INSTRUCTIONS:\n`
    prompt += `1. Identify the exact cause of the error\n`
    prompt += `2. Fix ONLY the error - don't add features or change behavior\n`
    prompt += `3. Preserve all imports and exports\n`
    prompt += `4. Return ONLY the corrected code, no explanations\n`
    prompt += `5. Ensure the code is valid ${framework === 'react' ? 'TypeScript/JSX' : framework}\n\n`

    prompt += `CORRECTED CODE:\n`

    return prompt
  }

  /**
   * Call LLM to fix code via IPC (calls renderer's messaging system)
   */
  private async callLLMToFixCode(prompt: string): Promise<string | null> {
    try {
      // The actual LLM call needs to happen in the renderer process
      // because it has access to the Redux store, assistants, and topics
      // We'll communicate via IPC
      
      // For now, log the prompt for debugging
      logger.info('LLM fix prompt generated', { promptLength: prompt.length })
      logger.debug('LLM fix prompt', { prompt })
      
      // TODO: Implement IPC call to renderer to send LLM fix request
      // The renderer will:
      // 1. Get current assistant and topic from Redux
      // 2. Send the fix prompt as a user message
      // 3. Wait for the assistant's response
      // 4. Extract and return the fixed code
      
      // For now, return null to indicate LLM is not yet fully integrated
      // The system will fall back to common pattern fixes
      logger.warn('LLM auto-fix requires renderer integration (pending)')
      return null
      
      /*
      // Future implementation (once IPC is set up):
      const response = await mainWindow.webContents.executeJavaScript(`
        (async () => {
          const { store } = window;
          const state = store.getState();
          const assistant = state.assistants.currentAssistant;
          const topic = state.topics.currentTopic;
          
          // Send fix request
          const result = await window.api.sendMessageAndWait({
            assistant,
            topic,
            message: ${JSON.stringify(prompt)}
          });
          
          // Extract code from response
          const codeMatch = result.match(/\`\`\`(?:tsx|ts|jsx|js)\\n([\\s\\S]*?)\\n\`\`\`/);
          return codeMatch ? codeMatch[1] : null;
        })()
      `);
      
      return response;
      */
    } catch (error) {
      logger.error('Failed to call LLM for code fix:', error as Error)
      return null
    }
  }

  /**
   * Attempt to fix and retry transpilation
   */
  async retryWithFix(request: TranspileRequest, error: TranspileError, context: Partial<RetryContext> = {}): Promise<RetryResult> {
    const fullContext: RetryContext = {
      originalCode: request.code,
      error,
      framework: request.framework,
      conversationHistory: context.conversationHistory || [],
      attemptNumber: context.attemptNumber || 1,
      maxAttempts: this.config.maxAttempts
    }

    const result: RetryResult = {
      success: false,
      attempts: 0,
      error
    }

    logger.info(`Starting retry attempt ${fullContext.attemptNumber}/${fullContext.maxAttempts} for ${request.framework} artifact`)

    // Attempt to fix with LLM if enabled
    if (this.config.enableLLMFix) {
      const prompt = this.generateFixPrompt(fullContext)
      const fixedCode = await this.callLLMToFixCode(prompt)

      if (fixedCode) {
        result.fixedCode = fixedCode
        result.fixStrategy = 'llm-assisted'

        // Retry transpilation with fixed code
        try {
          const transpileResult = await artifactTranspilerService.transpile({
            ...request,
            code: fixedCode
          })

          result.success = true
          result.transpiledCode = transpileResult.code
          result.attempts = fullContext.attemptNumber

          logger.info(`Successfully fixed and transpiled artifact after ${fullContext.attemptNumber} attempt(s)`)
          return result
        } catch (retryError) {
          logger.warn(`LLM fix attempt ${fullContext.attemptNumber} failed:`, retryError as Error)
          
          // If we have more attempts, recurse
          if (fullContext.attemptNumber < fullContext.maxAttempts) {
            return this.retryWithFix(
              { ...request, code: fixedCode },
              retryError as TranspileError,
              {
                ...context,
                attemptNumber: fullContext.attemptNumber + 1
              }
            )
          }

          // Out of attempts
          result.error = retryError as TranspileError
          result.attempts = fullContext.attemptNumber
        }
      } else {
        logger.info('LLM fix not available, skipping auto-retry')
        result.fixStrategy = 'llm-unavailable'
      }
    }

    // Fallback: Try common fixes without LLM
    if (!result.success && fullContext.attemptNumber === 1) {
      const commonFixes = this.attemptCommonFixes(request.code, error)
      if (commonFixes) {
        result.fixedCode = commonFixes
        result.fixStrategy = 'common-patterns'

        try {
          const transpileResult = await artifactTranspilerService.transpile({
            ...request,
            code: commonFixes
          })

          result.success = true
          result.transpiledCode = transpileResult.code
          result.attempts = 1

          logger.info('Successfully fixed artifact using common patterns')
          return result
        } catch (retryError) {
          logger.warn('Common pattern fix failed:', retryError as Error)
          result.error = retryError as TranspileError
        }
      }
    }

    result.attempts = fullContext.attemptNumber
    return result
  }

  /**
   * Attempt common fixes without LLM (fast fallback)
   */
  private attemptCommonFixes(code: string, error: TranspileError): string | null {
    let fixedCode = code

    // Common fix 1: Add missing React import
    if (error.message.includes('React') && !code.includes('import React')) {
      fixedCode = `import React from 'react'\n${fixedCode}`
      logger.debug('Applied common fix: Added React import')
      return fixedCode
    }

    // Common fix 2: Fix incorrect export syntax
    if (error.message.includes('export') && code.includes('export const default')) {
      fixedCode = code.replace(/export const default/g, 'export default')
      logger.debug('Applied common fix: Corrected export syntax')
      return fixedCode
    }

    // Common fix 3: Add missing JSX pragma for fragments
    if (error.message.includes('Fragment') && !code.includes('Fragment')) {
      fixedCode = code.replace(/import React from 'react'/, "import React, { Fragment } from 'react'")
      logger.debug('Applied common fix: Added Fragment import')
      return fixedCode
    }

    // Common fix 4: Fix self-closing tag syntax
    if (error.message.includes('self-closing') || error.message.includes('/>')) {
      fixedCode = code.replace(/<(\w+)([^>]*)>\s*<\/\1>/g, '<$1$2 />')
      logger.debug('Applied common fix: Converted to self-closing tags')
      return fixedCode
    }

    // No common fix found
    return null
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Get current configuration
   */
  getConfig(): RetryConfig {
    return { ...this.config }
  }
}

// Export singleton instance
export const artifactRetryService = new ArtifactRetryService()

