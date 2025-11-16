import { isDev, isWin } from '@main/constant'
import { app } from 'electron'

import { getDataPath } from './utils'

// Initialize app configuration after Electron app is ready
export function initializeAppConfig() {
  if (isDev && app && app.setPath && app.getPath) {
    try {
      app.setPath('userData', app.getPath('userData') + 'Dev')
    } catch (error) {
      console.error('Failed to set development userData path:', error)
    }
  }
}

// DATA_PATH will be set after app is ready
export let DATA_PATH: string = ''

export function setDataPath() {
  DATA_PATH = getDataPath()
}

export const titleBarOverlayDark = {
  height: 42,
  color: isWin ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0)',
  symbolColor: '#fff'
}

export const titleBarOverlayLight = {
  height: 42,
  color: 'rgba(255,255,255,0)',
  symbolColor: '#000'
}

global.CHERRYAI_CLIENT_SECRET = import.meta.env.MAIN_VITE_CHERRYAI_CLIENT_SECRET
