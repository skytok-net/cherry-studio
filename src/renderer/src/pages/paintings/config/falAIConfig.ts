import type { FalAIPainting } from '@renderer/types'
import { uuid } from '@renderer/utils'

export interface FalAIModel {
  id: string
  name: string
  group: string
  description?: string
  // Size configuration - either enum-based or aspect ratio
  usesAspectRatio?: boolean // true for Ultra models
  imageSizes?: Array<{ value: string; label?: string }>
  aspectRatios?: Array<{ value: string; label?: string }>
  // Parameter support flags
  supportsNegativePrompt?: boolean
  supportsSeed?: boolean
  supportsGuidanceScale?: boolean
  supportsNumInferenceSteps?: boolean
  supportsEnhancePrompt?: boolean
  supportsImageInput?: boolean
  supportsImagePromptStrength?: boolean
  supportsRawMode?: boolean
  supportsAcceleration?: boolean
  supportsOutputFormat?: boolean
  supportsSafetyChecker?: boolean
  supportsSafetyTolerance?: boolean
  supportsLoRA?: boolean // For SDXL
  supportsEmbeddings?: boolean // For SDXL
  supportsExpandPrompt?: boolean // For SDXL
  // Default values
  defaultGuidanceScale?: number
  defaultNumInferenceSteps?: number
  defaultImagePromptStrength?: number
  maxImages?: number
}

export const FAL_AI_MODELS: FalAIModel[] = [
  // FLUX 1.1 Pro Ultra - The flagship model
  {
    id: 'fal-ai/flux-pro/v1.1-ultra',
    name: 'FLUX 1.1 Pro Ultra',
    group: 'FLUX Pro',
    description: '4K ultra-high resolution with 10x speed, best quality',
    usesAspectRatio: true,
    aspectRatios: [
      { value: '21:9', label: '21:9 (Ultra Wide)' },
      { value: '16:9', label: '16:9 (Wide)' },
      { value: '4:3', label: '4:3 (Standard)' },
      { value: '3:2', label: '3:2 (Photo)' },
      { value: '1:1', label: '1:1 (Square)' },
      { value: '2:3', label: '2:3 (Portrait Photo)' },
      { value: '3:4', label: '3:4 (Portrait)' },
      { value: '9:16', label: '9:16 (Vertical)' },
      { value: '9:21', label: '9:21 (Ultra Vertical)' }
    ],
    supportsSeed: true,
    supportsEnhancePrompt: true,
    supportsImageInput: true,
    supportsImagePromptStrength: true,
    supportsRawMode: true,
    supportsOutputFormat: true,
    supportsSafetyChecker: true,
    supportsSafetyTolerance: true,
    defaultImagePromptStrength: 0.1,
    maxImages: 4
  },
  // FLUX 1.1 Pro - Fast and high quality
  {
    id: 'fal-ai/flux-pro/v1.1',
    name: 'FLUX 1.1 Pro',
    group: 'FLUX Pro',
    description: '10x accelerated speed, excellent quality',
    imageSizes: [
      { value: 'square_hd', label: 'Square HD (1024x1024)' },
      { value: 'square', label: 'Square (512x512)' },
      { value: 'portrait_4_3', label: 'Portrait 4:3' },
      { value: 'portrait_16_9', label: 'Portrait 16:9' },
      { value: 'landscape_4_3', label: 'Landscape 4:3' },
      { value: 'landscape_16_9', label: 'Landscape 16:9' }
    ],
    supportsSeed: true,
    supportsEnhancePrompt: true,
    supportsOutputFormat: true,
    supportsSafetyChecker: true,
    supportsSafetyTolerance: true,
    maxImages: 4
  },
  // FLUX Pro (original) - With guidance and steps
  {
    id: 'fal-ai/flux-pro',
    name: 'FLUX Pro',
    group: 'FLUX Pro',
    description: 'Professional quality with full control',
    imageSizes: [
      { value: 'square_hd', label: 'Square HD (1024x1024)' },
      { value: 'square', label: 'Square (512x512)' },
      { value: 'portrait_4_3', label: 'Portrait 4:3' },
      { value: 'portrait_16_9', label: 'Portrait 16:9' },
      { value: 'landscape_4_3', label: 'Landscape 4:3' },
      { value: 'landscape_16_9', label: 'Landscape 16:9' }
    ],
    supportsSeed: true,
    supportsGuidanceScale: true,
    supportsNumInferenceSteps: true,
    supportsEnhancePrompt: true,
    supportsOutputFormat: true,
    supportsSafetyTolerance: true,
    defaultGuidanceScale: 3.5,
    defaultNumInferenceSteps: 28,
    maxImages: 4
  },
  // FLUX Dev - Open for development
  {
    id: 'fal-ai/flux/dev',
    name: 'FLUX Dev',
    group: 'FLUX Open',
    description: 'Development model with full control and acceleration options',
    imageSizes: [
      { value: 'square_hd', label: 'Square HD (1024x1024)' },
      { value: 'square', label: 'Square (512x512)' },
      { value: 'portrait_4_3', label: 'Portrait 4:3' },
      { value: 'portrait_16_9', label: 'Portrait 16:9' },
      { value: 'landscape_4_3', label: 'Landscape 4:3' },
      { value: 'landscape_16_9', label: 'Landscape 16:9' }
    ],
    supportsSeed: true,
    supportsGuidanceScale: true,
    supportsNumInferenceSteps: true,
    supportsAcceleration: true,
    supportsOutputFormat: true,
    supportsSafetyChecker: true,
    defaultGuidanceScale: 3.5,
    defaultNumInferenceSteps: 28,
    maxImages: 4
  },
  // FLUX Schnell - Super fast turbo mode
  {
    id: 'fal-ai/flux/schnell',
    name: 'FLUX Schnell (Turbo)',
    group: 'FLUX Open',
    description: 'Ultra-fast generation in 4 steps',
    imageSizes: [
      { value: 'square_hd', label: 'Square HD (1024x1024)' },
      { value: 'square', label: 'Square (512x512)' },
      { value: 'portrait_4_3', label: 'Portrait 4:3' },
      { value: 'portrait_16_9', label: 'Portrait 16:9' },
      { value: 'landscape_4_3', label: 'Landscape 4:3' },
      { value: 'landscape_16_9', label: 'Landscape 16:9' }
    ],
    supportsSeed: true,
    supportsGuidanceScale: true,
    supportsNumInferenceSteps: true,
    supportsAcceleration: true,
    supportsOutputFormat: true,
    supportsSafetyChecker: true,
    defaultGuidanceScale: 3.5,
    defaultNumInferenceSteps: 4, // Much faster
    maxImages: 4
  },
  // Fast SDXL - Stable Diffusion XL
  {
    id: 'fal-ai/fast-sdxl',
    name: 'Fast SDXL',
    group: 'Stable Diffusion',
    description: 'Fast Stable Diffusion XL with LoRA support',
    imageSizes: [
      { value: 'square_hd', label: 'Square HD (1024x1024)' },
      { value: 'square', label: 'Square (512x512)' },
      { value: 'portrait_4_3', label: 'Portrait 4:3' },
      { value: 'portrait_16_9', label: 'Portrait 16:9' },
      { value: 'landscape_4_3', label: 'Landscape 4:3' },
      { value: 'landscape_16_9', label: 'Landscape 16:9' }
    ],
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsGuidanceScale: true,
    supportsNumInferenceSteps: true,
    supportsLoRA: true,
    supportsEmbeddings: true,
    supportsExpandPrompt: true,
    supportsOutputFormat: true,
    supportsSafetyChecker: true,
    defaultGuidanceScale: 7.5,
    defaultNumInferenceSteps: 25,
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
  imageSize: undefined,
  aspectRatio: '16:9', // For Ultra
  numImages: 1,
  seed: undefined,
  guidanceScale: undefined,
  numInferenceSteps: undefined,
  enhancePrompt: false,
  rawMode: false,
  acceleration: 'none',
  outputFormat: 'jpeg',
  enableSafetyChecker: true,
  safetyTolerance: 2,
  status: 'starting'
}
