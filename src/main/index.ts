import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  shell,
  type OpenDialogOptions
} from 'electron'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

const execFileAsync = promisify(execFile)

const VERSION_MANIFEST_URL =
  'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'

const SUPPORTED_VERSIONS = new Set([
  '1.21.11',
  '1.21.4',
  '1.20.1'
])

const MANIFEST_CACHE_TIME = 5 * 60 * 1000

interface JavaInfo {
  installed: boolean
  version: string | null
  fullVersion: string | null
  vendor: string | null
  path: string | null
  architecture: string
  error: string | null
}

interface MinecraftManifestVersion {
  id: string
  type: string
  url: string
  time: string
  releaseTime: string
  sha1: string
  complianceLevel?: number
}

interface MinecraftVersionManifest {
  latest?: {
    release?: string
    snapshot?: string
  }
  versions: MinecraftManifestVersion[]
}

interface MinecraftVersionInfo {
  available: boolean
  id: string
  type: string | null
  releaseTime: string | null
  metadataUrl: string | null
  latestRelease: string | null
  error: string | null
}

interface ManifestCache {
  data: MinecraftVersionManifest
  loadedAt: number
}

let manifestCache: ManifestCache | null = null

function getArchitectureName(): string {
  if (process.arch === 'x64') {
    return '64-bit'
  }

  if (process.arch === 'ia32') {
    return '32-bit'
  }

  if (process.arch === 'arm64') {
    return 'ARM64'
  }

  return process.arch
}

function detectJavaVendor(output: string): string {
  const normalizedOutput = output.toLowerCase()

  if (normalizedOutput.includes('temurin')) {
    return 'Eclipse Temurin'
  }

  if (normalizedOutput.includes('oracle')) {
    return 'Oracle Java'
  }

  if (normalizedOutput.includes('openjdk')) {
    return 'OpenJDK'
  }

  return 'Java'
}

async function findJavaPath(): Promise<string | null> {
  try {
    const locatorCommand =
      process.platform === 'win32' ? 'where.exe' : 'which'

    const { stdout } = await execFileAsync(
      locatorCommand,
      ['java'],
      {
        windowsHide: true
      }
    )

    const paths = stdout
      .split(/\r?\n/)
      .map((path) => path.trim())
      .filter(Boolean)

    return paths[0] ?? null
  } catch {
    return null
  }
}

async function detectJava(): Promise<JavaInfo> {
  try {
    const { stdout, stderr } = await execFileAsync(
      'java',
      ['-version'],
      {
        windowsHide: true,
        timeout: 10000
      }
    )

    const output = `${stdout}\n${stderr}`.trim()

    const firstLine =
      output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean) ?? ''

    const versionMatch =
      firstLine.match(/version\s+"([^"]+)"/i)

    const version = versionMatch?.[1] ?? null
    const javaPath = await findJavaPath()

    return {
      installed: true,
      version,
      fullVersion: output,
      vendor: detectJavaVendor(output),
      path: javaPath,
      architecture: getArchitectureName(),
      error: null
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Nieznany błąd podczas sprawdzania Javy.'

    return {
      installed: false,
      version: null,
      fullVersion: null,
      vendor: null,
      path: null,
      architecture: getArchitectureName(),
      error: message
    }
  }
}

async function getMinecraftManifest(
  forceRefresh = false
): Promise<MinecraftVersionManifest> {
  const currentTime = Date.now()

  if (
    !forceRefresh &&
    manifestCache &&
    currentTime - manifestCache.loadedAt <
      MANIFEST_CACHE_TIME
  ) {
    return manifestCache.data
  }

  const controller = new AbortController()

  const timeout = setTimeout(() => {
    controller.abort()
  }, 15000)

  try {
    const response = await net.fetch(
      VERSION_MANIFEST_URL,
      {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'application/json'
        }
      }
    )

    if (!response.ok) {
      throw new Error(
        `Serwer Mojang zwrócił błąd HTTP ${response.status}.`
      )
    }

    const data =
      (await response.json()) as MinecraftVersionManifest

    if (!data || !Array.isArray(data.versions)) {
      throw new Error(
        'Manifest Mojang ma nieprawidłowy format.'
      )
    }

    manifestCache = {
      data,
      loadedAt: Date.now()
    }

    return data
  } finally {
    clearTimeout(timeout)
  }
}

async function checkMinecraftVersion(
  versionId: string,
  forceRefresh = false
): Promise<MinecraftVersionInfo> {
  if (!SUPPORTED_VERSIONS.has(versionId)) {
    return {
      available: false,
      id: versionId,
      type: null,
      releaseTime: null,
      metadataUrl: null,
      latestRelease: null,
      error:
        'Ta wersja nie jest obsługiwana przez Aurora Launcher.'
    }
  }

  try {
    const manifest =
      await getMinecraftManifest(forceRefresh)

    const version = manifest.versions.find(
      (entry) => entry.id === versionId
    )

    if (!version) {
      return {
        available: false,
        id: versionId,
        type: null,
        releaseTime: null,
        metadataUrl: null,
        latestRelease:
          manifest.latest?.release ?? null,
        error:
          `Minecraft ${versionId} nie występuje w manifeście Mojang.`
      }
    }

    return {
      available: true,
      id: version.id,
      type: version.type,
      releaseTime: version.releaseTime,
      metadataUrl: version.url,
      latestRelease:
        manifest.latest?.release ?? null,
      error: null
    }
  } catch (error) {
    let message =
      'Nie udało się połączyć z serwerem Mojang.'

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        message =
          'Przekroczono czas oczekiwania na odpowiedź Mojang.'
      } else {
        message = error.message
      }
    }

    return {
      available: false,
      id: versionId,
      type: null,
      releaseTime: null,
      metadataUrl: null,
      latestRelease: null,
      error: message
    }
  }
}

function getDefaultGameDirectory(): string {
  return join(
    app.getPath('appData'),
    'AuroraLauncher'
  )
}

async function chooseGameDirectory(
  parentWindow: BrowserWindow | null,
  currentPath: string | null
): Promise<string | null> {
  const defaultPath =
    currentPath &&
    isAbsolute(currentPath) &&
    existsSync(currentPath)
      ? currentPath
      : app.getPath('appData')

  const options: OpenDialogOptions = {
    title: 'Wybierz folder gry Aurora Client',
    buttonLabel: 'Wybierz folder',
    defaultPath,
    properties: ['openDirectory']
  }

  const result = parentWindow
    ? await dialog.showOpenDialog(
        parentWindow,
        options
      )
    : await dialog.showOpenDialog(options)

  if (result.canceled) {
    return null
  }

  return result.filePaths[0] ?? null
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'Aurora Launcher',

    ...(process.platform === 'linux'
      ? { icon }
      : {}),

    webPreferences: {
      preload: join(
        __dirname,
        '../preload/index.js'
      ),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler(
    (details) => {
      void shell.openExternal(details.url)

      return {
        action: 'deny'
      }
    }
  )

  if (
    is.dev &&
    process.env['ELECTRON_RENDERER_URL']
  ) {
    void mainWindow.loadURL(
      process.env['ELECTRON_RENDERER_URL']
    )
  } else {
    void mainWindow.loadFile(
      join(
        __dirname,
        '../renderer/index.html'
      )
    )
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId(
    'com.aurora.launcher'
  )

  app.on(
    'browser-window-created',
    (_, window) => {
      optimizer.watchWindowShortcuts(window)
    }
  )

  ipcMain.handle('java:get-info', async () => {
    return detectJava()
  })

  ipcMain.handle(
    'minecraft:check-version',
    async (
      _event,
      versionId: unknown,
      forceRefresh: unknown
    ) => {
      if (typeof versionId !== 'string') {
        return {
          available: false,
          id: '',
          type: null,
          releaseTime: null,
          metadataUrl: null,
          latestRelease: null,
          error:
            'Nieprawidłowy identyfikator wersji.'
        } satisfies MinecraftVersionInfo
      }

      return checkMinecraftVersion(
        versionId,
        forceRefresh === true
      )
    }
  )

  ipcMain.handle(
    'folder:get-default-game-directory',
    () => {
      return getDefaultGameDirectory()
    }
  )

  ipcMain.handle(
    'folder:choose-game-directory',
    async (
      event,
      currentPath: unknown
    ) => {
      const parentWindow =
        BrowserWindow.fromWebContents(
          event.sender
        )

      const safeCurrentPath =
        typeof currentPath === 'string'
          ? currentPath
          : null

      return chooseGameDirectory(
        parentWindow,
        safeCurrentPath
      )
    }
  )

  createWindow()

  app.on('activate', () => {
    if (
      BrowserWindow.getAllWindows()
        .length === 0
    ) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})