import { IpcChannel } from '@shared/IpcChannel'
import { ThemeMode } from '@types'
import { BrowserWindow, nativeTheme } from 'electron'

import { titleBarOverlayDark, titleBarOverlayLight } from '../config'
import { configManager } from './ConfigManager'

class ThemeService {
  private theme: ThemeMode = ThemeMode.system
  private isInitialized: boolean = false

  constructor() {
    this.theme = configManager.getTheme()

    // Apply theme safely - defer if nativeTheme not available
    this.safelyApplyTheme()
  }

  /**
   * Safely apply theme - handles case when nativeTheme is not yet available
   */
  private safelyApplyTheme() {
    // Check if nativeTheme is available
    if (!nativeTheme || typeof nativeTheme.themeSource === 'undefined') {
      return
    }

    if (this.theme === ThemeMode.dark || this.theme === ThemeMode.light || this.theme === ThemeMode.system) {
      nativeTheme.themeSource = this.theme
    } else {
      // 兼容旧版本
      configManager.setTheme(ThemeMode.system)
      nativeTheme.themeSource = ThemeMode.system
    }

    // Only register listener once when nativeTheme is available
    if (!this.isInitialized) {
      nativeTheme.on('updated', this.themeUpdatadHandler.bind(this))
      this.isInitialized = true
    }
  }

  themeUpdatadHandler() {
    // Guard against nativeTheme being undefined
    if (!nativeTheme || typeof nativeTheme.shouldUseDarkColors === 'undefined') {
      return
    }

    BrowserWindow.getAllWindows().forEach((win) => {
      if (win && !win.isDestroyed() && win.setTitleBarOverlay) {
        try {
          win.setTitleBarOverlay(nativeTheme.shouldUseDarkColors ? titleBarOverlayDark : titleBarOverlayLight)
        } catch (error) {
          // don't throw error if setTitleBarOverlay failed
          // Because it may be called with some windows have some title bar
        }
      }
      win.webContents.send(IpcChannel.ThemeUpdated, nativeTheme.shouldUseDarkColors ? ThemeMode.dark : ThemeMode.light)
    })
  }

  /**
   * Initialize theme service after Electron is ready
   * This should be called from main process after app is ready
   */
  public initialize() {
    this.safelyApplyTheme()
  }

  setTheme(theme: ThemeMode) {
    if (theme === this.theme) {
      return
    }

    this.theme = theme

    // Safely apply theme
    if (nativeTheme && typeof nativeTheme.themeSource !== 'undefined') {
      nativeTheme.themeSource = theme
    }

    configManager.setTheme(theme)
  }
}

export const themeService = new ThemeService()
