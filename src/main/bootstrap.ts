import { occupiedDirs } from '@shared/config/constant'
import { app } from 'electron'
import fs from 'fs'
import path from 'path'

import { initAppDataDir } from './utils/init'

// Initialize app data directory when app is ready
export function initializeAppDataDir() {
  try {
    if (app && app.isPackaged !== undefined && app.isPackaged) {
      initAppDataDir()
    }
  } catch (error) {
    console.error('Failed to initialize app data directory:', error)
  }
}

// 在主进程中复制 appData 中某些一直被占用的文件
// 在renderer进程还没有启动时，主进程可以复制这些文件到新的appData中
export function copyOccupiedDirsInMainProcess() {
  const newAppDataPath = process.argv
    .slice(1)
    .find((arg) => arg.startsWith('--new-data-path='))
    ?.split('--new-data-path=')[1]
  if (!newAppDataPath) {
    return
  }

  if (process.platform === 'win32') {
    try {
      if (app && app.getPath && typeof app.getPath === 'function') {
        const appDataPath = app.getPath('userData')
        occupiedDirs.forEach((dir) => {
          const dirPath = path.join(appDataPath, dir)
          const newDirPath = path.join(newAppDataPath, dir)
          if (fs.existsSync(dirPath)) {
            fs.cpSync(dirPath, newDirPath, { recursive: true })
          }
        })
      }
    } catch (error) {
      console.error('Failed to copy occupied directories:', error)
    }
  }
}
