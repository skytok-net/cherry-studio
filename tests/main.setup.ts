import { vi } from 'vitest'

// Mock LoggerService globally for main process tests
vi.mock('@logger', async () => {
  const { MockMainLoggerService, mockMainLoggerService } = await import('./__mocks__/MainLoggerService')
  return {
    LoggerService: MockMainLoggerService,
    loggerService: mockMainLoggerService
  }
})

// Mock electron modules that are commonly used in main process
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((key: string) => {
      switch (key) {
        case 'userData':
          return '/mock/userData'
        case 'temp':
          return '/mock/temp'
        case 'logs':
          return '/mock/logs'
        default:
          return '/mock/unknown'
      }
    }),
    getAppPath: vi.fn(() => '/mock/app'),
    getVersion: vi.fn(() => '1.0.0'),
    isPackaged: true
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    removeHandler: vi.fn(),
    removeAllListeners: vi.fn()
  },
  BrowserWindow: vi.fn(),
  dialog: {
    showErrorBox: vi.fn(),
    showMessageBox: vi.fn(),
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn()
  },
  shell: {
    openExternal: vi.fn(),
    showItemInFolder: vi.fn()
  },
  session: {
    defaultSession: {
      clearCache: vi.fn(),
      clearStorageData: vi.fn()
    }
  },
  webContents: {
    getAllWebContents: vi.fn(() => [])
  },
  systemPreferences: {
    getMediaAccessStatus: vi.fn(),
    askForMediaAccess: vi.fn()
  },
  screen: {
    getPrimaryDisplay: vi.fn(),
    getAllDisplays: vi.fn()
  },
  Notification: vi.fn()
}))

// Mock Winston for LoggerService dependencies
vi.mock('winston', () => ({
  createLogger: vi.fn(() => ({
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    level: 'info',
    on: vi.fn(),
    end: vi.fn()
  })),
  format: {
    combine: vi.fn(),
    splat: vi.fn(),
    timestamp: vi.fn(),
    errors: vi.fn(),
    json: vi.fn()
  },
  transports: {
    Console: vi.fn(),
    File: vi.fn()
  }
}))

// Mock winston-daily-rotate-file
vi.mock('winston-daily-rotate-file', () => {
  return vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    log: vi.fn()
  }))
})

// Mock Node.js modules
vi.mock('node:os', () => ({
  platform: vi.fn(() => 'darwin'),
  arch: vi.fn(() => 'x64'),
  version: vi.fn(() => '20.0.0'),
  cpus: vi.fn(() => [{ model: 'Mock CPU' }]),
  totalmem: vi.fn(() => 8 * 1024 * 1024 * 1024) // 8GB
}))

vi.mock('node:path', async () => {
  const actual = await vi.importActual('node:path')
  return {
    ...actual,
    join: vi.fn((...args: string[]) => args.join('/')),
    resolve: vi.fn((...args: string[]) => args.join('/'))
  }
})

vi.mock('node:fs', () => ({
  promises: {
    access: vi.fn().mockResolvedValue(undefined), // File exists and is accessible
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn().mockResolvedValue({
      isFile: () => true,
      mode: 0o755 // Executable permissions
    }),
    unlink: vi.fn(),
    rmdir: vi.fn()
  },
  existsSync: vi.fn().mockReturnValue(true),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn().mockReturnValue({
    isFile: () => true,
    mode: 0o755 // Executable permissions
  }),
  unlinkSync: vi.fn(),
  rmdirSync: vi.fn(),
  createReadStream: vi.fn(),
  createWriteStream: vi.fn(),
  constants: {
    F_OK: 0,
    R_OK: 4,
    W_OK: 2,
    X_OK: 1
  }
}))

// Mock child_process for binary verification
vi.mock('node:child_process', () => ({
  exec: vi.fn((cmd: string, callback: Function) => {
    // Mock esbuild --version output
    if (cmd.includes('--version')) {
      callback(null, { stdout: '0.19.0', stderr: '' });
    } else {
      callback(null, { stdout: 'mock output', stderr: '' });
    }
  }),
  execSync: vi.fn((cmd: string) => {
    if (cmd.includes('--version')) {
      return '0.19.0';
    }
    return 'mock output';
  }),
  spawn: vi.fn()
}))
