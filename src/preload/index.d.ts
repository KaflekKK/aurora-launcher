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

const CACHE_TIME = 5 * 60 * 1000

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

interface MinecraftDownload {
  sha1: string
  size: number
  url: string
}

interface MinecraftAssetIndex {
  id: string
  sha1: string
  size: number
  totalSize: number
  url: string
}

interface MinecraftVersionMetadata {
  id: string
  type: string
  time: string
  releaseTime: string
  mainClass: string
  minimumLauncherVersion?: number

  javaVersion?: {
    component?: string
    majorVersion?: number
  }

  downloads?: {
    client?: MinecraftDownload
    server?: MinecraftDownload
  }

  assetIndex?: MinecraftAssetIndex

  libraries?: unknown[]

  arguments?: {
    game?: unknown[]
    jvm?: unknown[]
  }
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

interface MinecraftVersionDetails {
  available: boolean
  id: string
  type: string | null
  releaseTime: string | null

  javaMajorVersion: number | null
  javaComponent: string | null

  mainClass: string | null
  minimumLauncherVersion: number | null

  clientUrl: string | null
  clientSha1: string | null
  clientSize: number | null

  assetIndexId: string | null
  assetIndexUrl: string | null
  assetIndexSha1: string | null
  assetIndexSize: number | null
  assetTotalSize: number | null

  libraryCount: number
  gameArgumentCount: number
  jvmArgumentCount: number

  error: string | null
}

interface CacheEntry<T> {
  data: T
  loadedAt: number
}

let manifestCache: CacheEntry<MinecraftVersionManifest> | null = null

const versionDetailsCache = new Map<
  string,
  CacheEntry<MinecraftVersionDetails>
>()

function isCacheFresh(loadedAt: number): boolean {
  return Date.now() - loadedAt < CACHE_TIME
}

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

    const { stdout } = await execFileAsync(locatorCommand, ['java'], {
      windowsHide: true
    })

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
    const { stdout, stderr } = await execFileAsync('java', ['-version'], {
      windowsHide: true,
      timeout: 10000
    })

    const output = `${stdout}\n${stderr}`.trim()

    const firstLine =
      output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean) ?? ''

    const versionMatch = firstLine.match(/version\s+"([^"]+)"/i)

    return {
      installed: true,
      version: versionMatch?.[1] ?? null,
      fullVersion: output,
      vendor: detectJavaVendor(output),
      path: await findJavaPath(),
      architecture: getArchitectureName(),
      error: null
    }
  } catch (error) {
    return {
      installed: false,
      version: null,
      fullVersion: null,
      vendor: null,
      path: null,
      architecture: getArchitectureName(),
      error:
        error instanceof Error
          ? error.message
          : 'Nieznany błąd podczas sprawdzania Javy.'
    }
  }
}

async function fetchJson<T>(
  url: string,
  errorName: string
): Promise<T> {
  const controller = new AbortController()

  const timeout = setTimeout(() => {
    controller.abort()
  }, 15000)

  try {
    const response = await net.fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(
        `${errorName}: serwer zwrócił HTTP ${response.status}.`
      )
    }

    return (await response.json()) as T
  } finally {
    clearTimeout(timeout)
  }
}

async function getMinecraftManifest(
  forceRefresh = false
): Promise<MinecraftVersionManifest> {
  if (
    !forceRefresh &&
    manifestCache &&
    isCacheFresh(manifestCache.loadedAt)
  ) {
    return manifestCache.data
  }

  const data = await fetchJson<MinecraftVersionManifest>(
    VERSION_MANIFEST_URL,
    'Nie udało się pobrać manifestu Mojang'
  )

  if (!data || !Array.isArray(data.versions)) {
    throw new Error('Manifest Mojang ma nieprawidłowy format.')
  }

  manifestCache = {
    data,
    loadedAt: Date.now()
  }

  return data
}

function getUnavailableVersionInfo(
  versionId: string,
  error: string
): MinecraftVersionInfo {
  return {
    available: false,
    id: versionId,
    type: null,
    releaseTime: null,
    metadataUrl: null,
    latestRelease: null,
    error
  }
}

function getUnavailableVersionDetails(
  versionId: string,
  error: string
): MinecraftVersionDetails {
  return {
    available: false,
    id: versionId,
    type: null,
    releaseTime: null,

    javaMajorVersion: null,
    javaComponent: null,

    mainClass: null,
    minimumLauncherVersion: null,

    clientUrl: null,
    clientSha1: null,
    clientSize: null,

    assetIndexId: null,
    assetIndexUrl: null,
    assetIndexSha1: null,
    assetIndexSize: null,
    assetTotalSize: null,

    libraryCount: 0,
    gameArgumentCount: 0,
    jvmArgumentCount: 0,

    error
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return 'Przekroczono czas oczekiwania na serwer Mojang.'
    }

    return error.message
  }

  return 'Nie udało się połączyć z serwerem Mojang.'
}

async function checkMinecraftVersion(
  versionId: string,
  forceRefresh = false
): Promise<MinecraftVersionInfo> {
  if (!SUPPORTED_VERSIONS.has(versionId)) {
    return getUnavailableVersionInfo(
      versionId,
      'Ta wersja nie jest obsługiwana przez Aurora Launcher.'
    )
  }

  try {
    const manifest = await getMinecraftManifest(forceRefresh)

    const version = manifest.versions.find(
      (entry) => entry.id === versionId
    )

    if (!version) {
      return getUnavailableVersionInfo(
        versionId,
        `Minecraft ${versionId} nie występuje w manifeście Mojang.`
      )
    }

    return {
      available: true,
      id: version.id,
      type: version.type,
      releaseTime: version.releaseTime,
      metadataUrl: version.url,
      latestRelease: manifest.latest?.release ?? null,
      error: null
    }
  } catch (error) {
    return getUnavailableVersionInfo(
      versionId,
      getErrorMessage(error)
    )
  }
}

async function getMinecraftVersionDetails(
  versionId: string,
  forceRefresh = false
): Promise<MinecraftVersionDetails> {
  if (!SUPPORTED_VERSIONS.has(versionId)) {
    return getUnavailableVersionDetails(
      versionId,
      'Ta wersja nie jest obsługiwana przez Aurora Launcher.'
    )
  }

  const cachedDetails = versionDetailsCache.get(versionId)

  if (
    !forceRefresh &&
    cachedDetails &&
    isCacheFresh(cachedDetails.loadedAt)
  ) {
    return cachedDetails.data
  }

  try {
    const manifest = await getMinecraftManifest(forceRefresh)

    const manifestVersion = manifest.versions.find(
      (entry) => entry.id === versionId
    )

    if (!manifestVersion) {
      return getUnavailableVersionDetails(
        versionId,
        `Minecraft ${versionId} nie występuje w manifeście Mojang.`
      )
    }

    const metadata = await fetchJson<MinecraftVersionMetadata>(
      manifestVersion.url,
      `Nie udało się pobrać danych Minecraft ${versionId}`
    )

    if (!metadata || metadata.id !== versionId) {
      throw new Error(
        'Plik szczegółów wersji ma nieprawidłowy format.'
      )
    }

    const details: MinecraftVersionDetails = {
      available: true,
      id: metadata.id,
      type: metadata.type ?? manifestVersion.type,
      releaseTime:
        metadata.releaseTime ?? manifestVersion.releaseTime,

      javaMajorVersion:
        metadata.javaVersion?.majorVersion ?? null,

      javaComponent:
        metadata.javaVersion?.component ?? null,

      mainClass: metadata.mainClass ?? null,

      minimumLauncherVersion:
        metadata.minimumLauncherVersion ?? null,

      clientUrl:
        metadata.downloads?.client?.url ?? null,

      clientSha1:
        metadata.downloads?.client?.sha1 ?? null,

      clientSize:
        metadata.downloads?.client?.size ?? null,

      assetIndexId:
        metadata.assetIndex?.id ?? null,

      assetIndexUrl:
        metadata.assetIndex?.url ?? null,

      assetIndexSha1:
        metadata.assetIndex?.sha1 ?? null,

      assetIndexSize:
        metadata.assetIndex?.size ?? null,

      assetTotalSize:
        metadata.assetIndex?.totalSize ?? null,

      libraryCount:
        metadata.libraries?.length ?? 0,

      gameArgumentCount:
        metadata.arguments?.game?.length ?? 0,

      jvmArgumentCount:
        metadata.arguments?.jvm?.length ?? 0,

      error: null
    }

    versionDetailsCache.set(versionId, {
      data: details,
      loadedAt: Date.now()
    })

    return details
  } catch (error) {
    return getUnavailableVersionDetails(
      versionId,
      getErrorMessage(error)
    )
  }
}

function getDefaultGameDirectory(): string {
  return join(app.getPath('appData'), 'AuroraLauncher')
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
    ? await dialog.showOpenDialog(parentWindow, options)
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

    ...(process.platform === 'linux' ? { icon } : {}),

    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)

    return {
      action: 'deny'
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(
      process.env['ELECTRON_RENDERER_URL']
    )
  } else {
    void mainWindow.loadFile(
      join(__dirname, '../renderer/index.html')
    )
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.aurora.launcher')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle('java:get-info', async () => {
    return detectJava()
  })

  ipcMain.handle(
    'minecraft:check-version',
    async (_event, versionId: unknown, forceRefresh: unknown) => {
      if (typeof versionId !== 'string') {
        return getUnavailableVersionInfo(
          '',
          'Nieprawidłowy identyfikator wersji.'
        )
      }

      return checkMinecraftVersion(
        versionId,
        forceRefresh === true
      )
    }
  )

  ipcMain.handle(
    'minecraft:get-version-details',
    async (_event, versionId: unknown, forceRefresh: unknown) => {
      if (typeof versionId !== 'string') {
        return getUnavailableVersionDetails(
          '',
          'Nieprawidłowy identyfikator wersji.'
        )
      }

      return getMinecraftVersionDetails(
        versionId,
        forceRefresh === true
      )
    }
  )

  ipcMain.handle('folder:get-default-game-directory', () => {
    return getDefaultGameDirectory()
  })

  ipcMain.handle(
    'folder:choose-game-directory',
    async (event, currentPath: unknown) => {
      const parentWindow = BrowserWindow.fromWebContents(
        event.sender
      )

      return chooseGameDirectory(
        parentWindow,
        typeof currentPath === 'string' ? currentPath : null
      )
    }
  )

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})