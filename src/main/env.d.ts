/// <reference types="vite/client" />

// Asset imports for vite-plugin-electron
declare module '*?asset' {
  const content: string
  export default content
}

interface ImportMetaEnv {
  VITE_MAIN_BUNDLE_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
