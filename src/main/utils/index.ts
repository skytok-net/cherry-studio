import fs from 'node:fs'
import fsAsync from 'node:fs/promises'
import path from 'node:path'
import { existsSync } from 'node:fs'

import { app } from 'electron'
import { loggerService } from '@logger'

const logger = loggerService.withContext('Utils')

export function getResourcePath() {
  return path.join(app.getAppPath(), 'resources')
}

export function getDataPath() {
  const dataPath = path.join(app.getPath('userData'), 'Data')
  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true })
  }
  return dataPath
}

export function getInstanceName(baseURL: string) {
  try {
    return new URL(baseURL).host.split('.')[0]
  } catch (error) {
    return ''
  }
}

export function debounce(func: (...args: any[]) => void, wait: number, immediate: boolean = false) {
  let timeout: NodeJS.Timeout | null = null
  return function (...args: any[]) {
    if (timeout) clearTimeout(timeout)
    if (immediate) {
      func(...args)
    } else {
      timeout = setTimeout(() => func(...args), wait)
    }
  }
}

// NOTE: It's an unused function. localStorage should not be accessed in main process.
// export function dumpPersistState() {
//   const persistState = JSON.parse(localStorage.getItem('persist:cherry-studio') || '{}')
//   for (const key in persistState) {
//     persistState[key] = JSON.parse(persistState[key])
//   }
//   return JSON.stringify(persistState)
// }

export const runAsyncFunction = async (fn: () => void) => {
  await fn()
}

export function makeSureDirExists(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export async function calculateDirectorySize(directoryPath: string): Promise<number> {
  let totalSize = 0
  const items = await fsAsync.readdir(directoryPath)

  for (const item of items) {
    const itemPath = path.join(directoryPath, item)
    const stats = await fsAsync.stat(itemPath)

    if (stats.isFile()) {
      totalSize += stats.size
    } else if (stats.isDirectory()) {
      totalSize += await calculateDirectorySize(itemPath)
    }
  }
  return totalSize
}

export const removeEnvProxy = (env: Record<string, string>) => {
  delete env.HTTPS_PROXY
  delete env.HTTP_PROXY
  delete env.grpc_proxy
  delete env.http_proxy
  delete env.https_proxy
}

/**
 * Get the preload script path, handling both dev and production environments
 * This function tries multiple possible paths to find the preload script
 */
export function getPreloadPath(): string {
  // Check if app is available and packaged
  if (app && app.isPackaged) {
    // In production, preload is in app.asar
    return path.join(process.resourcesPath, 'app.asar', 'out', 'preload', 'index.js')
  }

  // In development, try multiple possible paths
  // __dirname in main process will be 'out/main' after electron-vite build
  const possiblePaths = [
    path.join(__dirname, '../preload/index.js'), // Standard electron-vite output
    path.join(process.cwd(), 'out', 'preload', 'index.js'), // Absolute from cwd
    path.join(__dirname, '../../out/preload/index.js') // Alternative structure
  ]

  for (const preloadPath of possiblePaths) {
    if (existsSync(preloadPath)) {
      logger.debug(`Using preload path: ${preloadPath}`)
      return preloadPath
    }
  }

  // Fallback to standard path (will error if not found, but that's expected)
  const fallbackPath = path.join(__dirname, '../preload/index.js')
  logger.warn(`Preload script not found in any expected location, using fallback: ${fallbackPath}`)
  return fallbackPath
}
