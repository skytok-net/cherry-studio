import type { BaseEmbeddings } from '@cherrystudio/embedjs-interfaces'
import { OllamaEmbeddings } from '@cherrystudio/embedjs-ollama'
import { OpenAiEmbeddings } from '@cherrystudio/embedjs-openai'
import { loggerService } from '@logger'
import type { ApiClient } from '@types'
import { net } from 'electron'

import { MistralEmbeddings } from './MistralEmbeddings'
import { VoyageEmbeddings } from './VoyageEmbeddings'

const logger = loggerService.withContext('EmbeddingsFactory')

export default class EmbeddingsFactory {
  static create({ embedApiClient, dimensions }: { embedApiClient: ApiClient; dimensions?: number }): BaseEmbeddings {
    const batchSize = 10
    const { model, provider, apiKey, baseURL } = embedApiClient

    logger.info(
      `Creating embeddings for provider: ${provider}, model: ${model}, baseURL: ${baseURL}, dimensions: ${dimensions}`
    )
    if (provider === 'voyageai') {
      return new VoyageEmbeddings({
        modelName: model,
        apiKey,
        outputDimension: dimensions,
        batchSize: 8
      })
    }

    if (provider === 'mistral') {
      logger.info(`Using MistralEmbeddings for provider: ${provider}`)
      return new MistralEmbeddings({
        model,
        apiKey,
        baseURL,
        dimensions,
        batchSize: 32 // Mistral supports larger batches
      })
    }
    if (provider === 'ollama') {
      if (baseURL.includes('v1/')) {
        return new OllamaEmbeddings({
          model: model,
          baseUrl: baseURL.replace('v1/', ''),
          requestOptions: {
            // @ts-ignore expected
            'encoding-format': 'float'
          }
        })
      }
      return new OllamaEmbeddings({
        model: model,
        baseUrl: baseURL,
        requestOptions: {
          // @ts-ignore expected
          'encoding-format': 'float'
        }
      })
    }
    // NOTE: Azure OpenAI 也走 OpenAIEmbeddings, baseURL是https://xxxx.openai.azure.com/openai/v1
    return new OpenAiEmbeddings({
      model,
      apiKey,
      dimensions,
      batchSize,
      configuration: { baseURL, fetch: net.fetch as typeof fetch }
    })
  }
}
