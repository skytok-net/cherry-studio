import { type ProviderConfig, registerMultipleProviderConfigs } from '@cherrystudio/ai-core/provider'
import { loggerService } from '@logger'

const logger = loggerService.withContext('ProviderConfigs')

// Track initialization state to prevent duplicate registrations
let providersInitialized = false

/**
 * 新Provider配置定义
 * 定义了需要动态注册的AI Providers
 */
export const NEW_PROVIDER_CONFIGS: ProviderConfig[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    import: () => import('@openrouter/ai-sdk-provider'),
    creatorFunctionName: 'createOpenRouter',
    supportsImageGeneration: true,
    aliases: ['openrouter'] as string[]
  },
  {
    id: 'google-vertex',
    name: 'Google Vertex AI',
    import: () => import('@ai-sdk/google-vertex/edge'),
    creatorFunctionName: 'createVertex',
    supportsImageGeneration: true,
    aliases: ['vertexai'] as string[]
  },
  {
    id: 'google-vertex-anthropic',
    name: 'Google Vertex AI Anthropic',
    import: () => import('@ai-sdk/google-vertex/anthropic/edge'),
    creatorFunctionName: 'createVertexAnthropic',
    supportsImageGeneration: true,
    aliases: ['vertexai-anthropic'] as string[]
  },
  {
    id: 'github-copilot-openai-compatible',
    name: 'GitHub Copilot OpenAI Compatible',
    import: () => import('@opeoginni/github-copilot-openai-compatible'),
    creatorFunctionName: 'createGitHubCopilotOpenAICompatible',
    supportsImageGeneration: false,
    aliases: ['copilot', 'github-copilot'] as string[]
  },
  {
    id: 'bedrock',
    name: 'Amazon Bedrock',
    import: () => import('@ai-sdk/amazon-bedrock'),
    creatorFunctionName: 'createAmazonBedrock',
    supportsImageGeneration: true,
    aliases: ['aws-bedrock'] as string[]
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    import: () => import('@ai-sdk/perplexity'),
    creatorFunctionName: 'createPerplexity',
    supportsImageGeneration: false,
    aliases: ['perplexity'] as string[]
  },
  {
    id: 'mistral',
    name: 'Mistral',
    import: () => import('@ai-sdk/mistral'),
    creatorFunctionName: 'createMistral',
    supportsImageGeneration: false,
    aliases: ['mistral'] as string[]
  },
  {
    id: 'huggingface',
    name: 'HuggingFace',
    import: () => import('@ai-sdk/huggingface'),
    creatorFunctionName: 'createHuggingFace',
    supportsImageGeneration: true,
    aliases: ['hf', 'hugging-face']
  },
  {
    id: 'ai-gateway',
    name: 'AI Gateway',
    import: () => import('@ai-sdk/gateway'),
    creatorFunctionName: 'createGateway',
    supportsImageGeneration: true,
    aliases: ['gateway']
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    import: () => import('@ai-sdk/cerebras'),
    creatorFunctionName: 'createCerebras',
    supportsImageGeneration: false
  }
]

/**
 * 初始化新的Providers
 * 使用aiCore的动态注册功能
 */
export async function initializeNewProviders(): Promise<void> {
  if (providersInitialized) {
    logger.debug('Providers already initialized, skipping registration to prevent duplicates')
    return
  }

  try {
    logger.info(`Attempting to register ${NEW_PROVIDER_CONFIGS.length} provider configs`)
    NEW_PROVIDER_CONFIGS.forEach((config) => {
      logger.info(`Registering provider: ${config.id} (${config.name})`)
    })

    const successCount = registerMultipleProviderConfigs(NEW_PROVIDER_CONFIGS)
    logger.info(`Successfully registered ${successCount}/${NEW_PROVIDER_CONFIGS.length} providers`)

    if (successCount < NEW_PROVIDER_CONFIGS.length) {
      logger.warn(`Some providers failed to register: ${NEW_PROVIDER_CONFIGS.length - successCount} failed`)
    }

    // Mark as initialized to prevent future duplicate registrations
    providersInitialized = true
    logger.info('Provider initialization completed and marked as done')
  } catch (error) {
    logger.error('Failed to initialize new providers:', error as Error)
    // Don't mark as initialized on failure, allow retry
  }
}

/**
 * Reset initialization state (for testing or manual reset)
 */
export function resetProviderInitialization(): void {
  providersInitialized = false
  logger.info('Provider initialization state reset')
}
