import { loggerService } from '@logger'

// CRITICAL: Initialize logger FIRST before ANY imports that might use it
loggerService.initWindowSource('mainWindow')

// Use dynamic imports to ensure App and dependencies load AFTER logger initialization
async function initializeApp() {
  // Load init.ts first (which initializes services)
  await import('./init')

  // Import styles
  await Promise.all([
    import('./assets/styles/index.css'),
    import('./assets/styles/tailwind.css'),
    import('@ant-design/v5-patch-for-react-19')
  ])

  // Then import React and App
  const { createRoot } = await import('react-dom/client')
  const { default: App } = await import('./App')

  const root = createRoot(document.getElementById('root') as HTMLElement)
  root.render(<App />)
}

initializeApp().catch(console.error)
