export const DEFAULT_TEMPERATURE = 1.0
export const DEFAULT_CONTEXTCOUNT = 5
export const DEFAULT_MAX_TOKENS = 4096
export const SYSTEM_PROMPT_THRESHOLD = 128
export const DEFAULT_KNOWLEDGE_DOCUMENT_COUNT = 6
export const DEFAULT_KNOWLEDGE_THRESHOLD = 0.0
export const DEFAULT_WEBSEARCH_RAG_DOCUMENT_COUNT = 1

export const platform = window.electron?.process?.platform
export const isMac = platform === 'darwin'
export const isWin = platform === 'win32' || platform === 'win64'
export const isLinux = platform === 'linux'
export const isDev = window.electron?.process?.env?.NODE_ENV === 'development'
export const isProd = window.electron?.process?.env?.NODE_ENV === 'production'

export const SILICON_CLIENT_ID = 'SFaJLLq0y6CAMoyDm81aMu'
export const PPIO_CLIENT_ID = '37d0828c96b34936a600b62c'
export const PPIO_APP_SECRET = import.meta.env.RENDERER_VITE_PPIO_APP_SECRET || ''
export const TOKENFLUX_HOST = 'https://tokenflux.ai'

// Messages loading configuration
export const INITIAL_MESSAGES_COUNT = 20
export const LOAD_MORE_COUNT = 20

export const DEFAULT_COLOR_PRIMARY = '#FF6B35'
export const THEME_COLOR_PRESETS = [
  DEFAULT_COLOR_PRIMARY,
  '#FF5470', // Coral Pink
  '#14B8A6', // Teal
  '#10B981', // Green
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#FF8A5C', // Light Orange
  '#F59E0B', // Amber
  '#6D28D9', // Violet
  '#D2B48C', // Tan/Beige
  '#E55A2B' // Dark Orange
]

export const MAX_CONTEXT_COUNT = 100
export const UNLIMITED_CONTEXT_COUNT = 100000

export const MAX_COLLAPSED_CODE_HEIGHT = 350
