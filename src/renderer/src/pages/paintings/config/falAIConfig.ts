import type { FalAIPainting } from '@renderer/types'
import { uuid } from '@renderer/utils'

export interface FalAIModel {
  id: string
  name: string
  group: string
  imageSizes: Array<{ value: string }>
  supportsNegativePrompt?: boolean
  supportsSeed?: boolean
  supportsGuidanceScale?: boolean
  defaultGuidanceScale?: number
  defaultNumInferenceSteps?: number
  maxImages?: number
}

export const FAL_AI_MODELS: FalAIModel[] = [
  {
    id: 'fal-ai/flux-pro/v1.1-ultra',
    name: 'FLUX 1.1 Pro Ultra',
    group: 'FLUX',
    imageSizes: [
      { value: '1024x1024' },
      { value: '1280x768' },
      { value: '768x1280' },
      { value: '1344x768' },
      { value: '768x1344' }
    ],
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsGuidanceScale: true,
    defaultGuidanceScale: 3.5,
    defaultNumInferenceSteps: 28,
    maxImages: 4
  },
  {
    id: 'fal-ai/flux-pro/v1.1',
    name: 'FLUX 1.1 Pro',
    group: 'FLUX',
    imageSizes: [
      { value: '1024x1024' },
      { value: '1280x768' },
      { value: '768x1280' },
      { value: '1344x768' },
      { value: '768x1344' }
    ],
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsGuidanceScale: true,
    defaultGuidanceScale: 3.5,
    defaultNumInferenceSteps: 28,
    maxImages: 4
  }
]

export const DEFAULT_FAL_AI_PAINTING: FalAIPainting = {
  id: uuid(),
  urls: [],
  files: [],
  model: 'fal-ai/flux-pro/v1.1-ultra',
  prompt: '',
  negativePrompt: '',
  imageSize: '1024x1024',
  numImages: 1,
  seed: undefined,
  guidanceScale: 3.5,
  numInferenceSteps: 28,
  status: 'starting'
}

