import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  shell,
  type OpenDialogOptions,
  type WebContents
} from 'electron'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import {
  mkdir,
  open,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
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
const DOWNLOAD_TIMEOUT = 10 * 60 * 1000

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

type InstallPhase =
  | 'checking'
  | 'downloading'
  | 'verifying'
  | 'complete'
  | 'error'

interface MinecraftInstallProgress {
  versionId: string
  phase: InstallPhase
  downloadedBytes: number
  totalBytes: number
  percent: number
  message: string
}

interface MinecraftInstallStatus {
  versionId: string
  installed: boolean
  valid: boolean
  jarPath: string | null
  currentSize: number | null
  expectedSize: number | null
  currentSha1: string | null
  expectedSha1: string | null
  error: string | null
}

interface MinecraftInstallResult {
  success: boolean
  alreadyInstalled: boolean
  versionId: string
  jarPath: string | null
  error: string | null
}

interface FileInspection {
  exists: boolean
  valid: boolean
  size: number | null
  sha1: string | null
  error: string | null
}

interface CacheEntry<T> {
  data: T
  loadedAt: number
}

let manifestCache: CacheEntry<MinecraftVersionManifest> | null = null

const versionMetadataCache = new Map<
  string,
  CacheEntry<MinecraftVersionMetadata>
>()

const versionDetailsCache = new Map<
  string,
  CacheEntry<MinecraftVersionDetails>
>()

const activeInstallations = new Set<string>()

function isCacheFresh(loadedAt: number): boolean {
  return Date.now() - loadedAt < CACHE_TIME
}

function isFileNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  )
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

function getTrustedMinecraftUrl(value: string): string {
  const parsedUrl = new URL(value)
  const hostname = parsedUrl.hostname.toLowerCase()

  const trustedHostname =
    hostname === 'mojang.com' ||
    hostname.endsWith('.mojang.com') ||
    hostname === 'minecraft.net' ||
    hostname.endsWith('.minecraft.net')

  if (parsedUrl.protocol !== 'https:' || !trustedHostname) {
    throw new Error('Serwer pliku Minecraft nie jest zaufany.')
  }

  return parsedUrl.toString()
}

async function fetchJson<T>(
  url: string,
  errorName: string
): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const response = await net.fetch(getTrustedMinecraftUrl(url), {
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

async function getMinecraftVersionMetadata(
  versionId: string,
  forceRefresh = false
): Promise<MinecraftVersionMetadata> {
  if (!SUPPORTED_VERSIONS.has(versionId)) {
    throw new Error(
      'Ta wersja nie jest obsługiwana przez Aurora Launcher.'
    )
  }

  const cachedMetadata = versionMetadataCache.get(versionId)

  if (
    !forceRefresh &&
    cachedMetadata &&
    isCacheFresh(cachedMetadata.loadedAt)
  ) {
    return cachedMetadata.data
  }

  const manifest = await getMinecraftManifest(forceRefresh)
  const manifestVersion = manifest.versions.find(
    (entry) => entry.id === versionId
  )

  if (!manifestVersion) {
    throw new Error(
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

  versionMetadataCache.set(versionId, {
    data: metadata,
    loadedAt: Date.now()
  })

  return metadata
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
    const metadata = await getMinecraftVersionMetadata(
      versionId,
      forceRefresh
    )

    const details: MinecraftVersionDetails = {
      available: true,
      id: metadata.id,
      type: metadata.type ?? null,
      releaseTime: metadata.releaseTime ?? null,
      javaMajorVersion:
        metadata.javaVersion?.majorVersion ?? null,
      javaComponent: metadata.javaVersion?.component ?? null,
      mainClass: metadata.mainClass ?? null,
      minimumLauncherVersion:
        metadata.minimumLauncherVersion ?? null,
      clientUrl: metadata.downloads?.client?.url ?? null,
      clientSha1: metadata.downloads?.client?.sha1 ?? null,
      clientSize: metadata.downloads?.client?.size ?? null,
      assetIndexId: metadata.assetIndex?.id ?? null,
      assetIndexUrl: metadata.assetIndex?.url ?? null,
      assetIndexSha1: metadata.assetIndex?.sha1 ?? null,
      assetIndexSize: metadata.assetIndex?.size ?? null,
      assetTotalSize: metadata.assetIndex?.totalSize ?? null,
      libraryCount: metadata.libraries?.length ?? 0,
      gameArgumentCount: metadata.arguments?.game?.length ?? 0,
      jvmArgumentCount: metadata.arguments?.jvm?.length ?? 0,
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

function validateGameDirectory(gameDirectory: string): string {
  const trimmedDirectory = gameDirectory.trim()

  if (!trimmedDirectory || !isAbsolute(trimmedDirectory)) {
    throw new Error('Folder gry musi być pełną ścieżką.')
  }

  return resolve(trimmedDirectory)
}

function getVersionPaths(
  gameDirectory: string,
  versionId: string
): {
  versionDirectory: string
  jarPath: string
  jsonPath: string
  temporaryPath: string
} {
  if (!SUPPORTED_VERSIONS.has(versionId)) {
    throw new Error(
      'Ta wersja nie jest obsługiwana przez Aurora Launcher.'
    )
  }

  const safeGameDirectory = validateGameDirectory(gameDirectory)
  const versionDirectory = join(
    safeGameDirectory,
    'versions',
    versionId
  )

  return {
    versionDirectory,
    jarPath: join(versionDirectory, `${versionId}.jar`),
    jsonPath: join(versionDirectory, `${versionId}.json`),
    temporaryPath: join(versionDirectory, `${versionId}.jar.part`)
  }
}

async function calculateFileSha1(filePath: string): Promise<string> {
  const hash = createHash('sha1')
  const stream = createReadStream(filePath)

  for await (const chunk of stream) {
    hash.update(chunk)
  }

  return hash.digest('hex')
}

async function inspectClientFile(
  filePath: string,
  expectedSize: number,
  expectedSha1: string
): Promise<FileInspection> {
  try {
    const fileStats = await stat(filePath)

    if (!fileStats.isFile()) {
      return {
        exists: true,
        valid: false,
        size: null,
        sha1: null,
        error: 'Ścieżka klienta nie wskazuje pliku.'
      }
    }

    if (fileStats.size !== expectedSize) {
      return {
        exists: true,
        valid: false,
        size: fileStats.size,
        sha1: null,
        error: 'Rozmiar pliku klienta jest nieprawidłowy.'
      }
    }

    const sha1 = await calculateFileSha1(filePath)
    const valid = sha1.toLowerCase() === expectedSha1.toLowerCase()

    return {
      exists: true,
      valid,
      size: fileStats.size,
      sha1,
      error: valid ? null : 'Suma SHA-1 pliku klienta jest nieprawidłowa.'
    }
  } catch (error) {
    if (isFileNotFound(error)) {
      return {
        exists: false,
        valid: false,
        size: null,
        sha1: null,
        error: null
      }
    }

    return {
      exists: false,
      valid: false,
      size: null,
      sha1: null,
      error: getErrorMessage(error)
    }
  }
}

async function getMinecraftInstallStatus(
  versionId: string,
  gameDirectory: string
): Promise<MinecraftInstallStatus> {
  try {
    const metadata = await getMinecraftVersionMetadata(versionId)
    const client = metadata.downloads?.client

    if (!client) {
      throw new Error('Ta wersja nie zawiera pliku klienta.')
    }

    const { jarPath } = getVersionPaths(gameDirectory, versionId)
    const inspection = await inspectClientFile(
      jarPath,
      client.size,
      client.sha1
    )

    return {
      versionId,
      installed: inspection.exists,
      valid: inspection.valid,
      jarPath,
      currentSize: inspection.size,
      expectedSize: client.size,
      currentSha1: inspection.sha1,
      expectedSha1: client.sha1,
      error: inspection.error
    }
  } catch (error) {
    return {
      versionId,
      installed: false,
      valid: false,
      jarPath: null,
      currentSize: null,
      expectedSize: null,
      currentSha1: null,
      expectedSha1: null,
      error: getErrorMessage(error)
    }
  }
}

function sendInstallProgress(
  sender: WebContents,
  progress: MinecraftInstallProgress
): void {
  if (!sender.isDestroyed()) {
    sender.send('minecraft:install-progress', progress)
  }
}

function createProgress(
  versionId: string,
  phase: InstallPhase,
  downloadedBytes: number,
  totalBytes: number,
  message: string
): MinecraftInstallProgress {
  const percent =
    totalBytes > 0
      ? Math.min(
          100,
          Math.max(0, Math.floor((downloadedBytes / totalBytes) * 100))
        )
      : 0

  return {
    versionId,
    phase,
    downloadedBytes,
    totalBytes,
    percent,
    message
  }
}

async function installMinecraftClient(
  sender: WebContents,
  versionId: string,
  gameDirectory: string
): Promise<MinecraftInstallResult> {
  let temporaryPath: string | null = null
  let installationKey: string | null = null

  try {
    const safeGameDirectory = validateGameDirectory(gameDirectory)
    installationKey = `${safeGameDirectory}\u0000${versionId}`

    if (activeInstallations.has(installationKey)) {
      return {
        success: false,
        alreadyInstalled: false,
        versionId,
        jarPath: null,
        error: 'Instalacja tej wersji już trwa.'
      }
    }

    activeInstallations.add(installationKey)

    sendInstallProgress(
      sender,
      createProgress(
        versionId,
        'checking',
        0,
        0,
        'Sprawdzanie pliku klienta...'
      )
    )

    const metadata = await getMinecraftVersionMetadata(versionId)
    const client = metadata.downloads?.client

    if (!client) {
      throw new Error('Ta wersja nie zawiera pliku klienta.')
    }

    const trustedClientUrl = getTrustedMinecraftUrl(client.url)
    const paths = getVersionPaths(safeGameDirectory, versionId)
    temporaryPath = paths.temporaryPath

    await mkdir(paths.versionDirectory, {
      recursive: true
    })

    await writeFile(
      paths.jsonPath,
      JSON.stringify(metadata, null, 2),
      'utf8'
    )

    const existingFile = await inspectClientFile(
      paths.jarPath,
      client.size,
      client.sha1
    )

    if (existingFile.valid) {
      sendInstallProgress(
        sender,
        createProgress(
          versionId,
          'complete',
          client.size,
          client.size,
          'Plik klienta jest już poprawnie zainstalowany.'
        )
      )

      return {
        success: true,
        alreadyInstalled: true,
        versionId,
        jarPath: paths.jarPath,
        error: null
      }
    }

    await rm(paths.temporaryPath, {
      force: true
    })

    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(),
      DOWNLOAD_TIMEOUT
    )

    try {
      const response = await net.fetch(trustedClientUrl, {
        method: 'GET',
        signal: controller.signal
      })

      if (!response.ok) {
        throw new Error(
          `Pobieranie klienta zakończyło się błędem HTTP ${response.status}.`
        )
      }

      if (!response.body) {
        throw new Error('Serwer nie zwrócił danych pliku klienta.')
      }

      const reader = response.body.getReader()
      const fileHandle = await open(paths.temporaryPath, 'w')
      const hash = createHash('sha1')
      let downloadedBytes = 0
      let lastProgressUpdate = 0

      sendInstallProgress(
        sender,
        createProgress(
          versionId,
          'downloading',
          0,
          client.size,
          'Pobieranie pliku klienta...'
        )
      )

      try {
        while (true) {
          const { done, value } = await reader.read()

          if (done) {
            break
          }

          if (!value || value.byteLength === 0) {
            continue
          }

          const buffer = Buffer.from(value)
          let offset = 0

          while (offset < buffer.length) {
            const { bytesWritten } = await fileHandle.write(
              buffer,
              offset,
              buffer.length - offset
            )

            if (bytesWritten <= 0) {
              throw new Error('Nie udało się zapisać pobieranego pliku.')
            }

            offset += bytesWritten
          }

          hash.update(buffer)
          downloadedBytes += buffer.length

          const now = Date.now()

          if (
            now - lastProgressUpdate >= 100 ||
            downloadedBytes >= client.size
          ) {
            lastProgressUpdate = now

            sendInstallProgress(
              sender,
              createProgress(
                versionId,
                'downloading',
                downloadedBytes,
                client.size,
                'Pobieranie pliku klienta...'
              )
            )
          }
        }
      } finally {
        reader.releaseLock()
        await fileHandle.close()
      }

      sendInstallProgress(
        sender,
        createProgress(
          versionId,
          'verifying',
          downloadedBytes,
          client.size,
          'Sprawdzanie rozmiaru i sumy SHA-1...'
        )
      )

      const downloadedSha1 = hash.digest('hex')

      if (downloadedBytes !== client.size) {
        throw new Error(
          `Pobrano ${downloadedBytes} bajtów, oczekiwano ${client.size}.`
        )
      }

      if (downloadedSha1.toLowerCase() !== client.sha1.toLowerCase()) {
        throw new Error('Pobrany plik ma nieprawidłową sumę SHA-1.')
      }

      await rm(paths.jarPath, {
        force: true
      })

      await rename(paths.temporaryPath, paths.jarPath)
      temporaryPath = null

      sendInstallProgress(
        sender,
        createProgress(
          versionId,
          'complete',
          client.size,
          client.size,
          'Plik klienta został poprawnie zainstalowany.'
        )
      )

      return {
        success: true,
        alreadyInstalled: false,
        versionId,
        jarPath: paths.jarPath,
        error: null
      }
    } finally {
      clearTimeout(timeout)
    }
  } catch (error) {
    const message = getErrorMessage(error)

    sendInstallProgress(
      sender,
      createProgress(
        versionId,
        'error',
        0,
        0,
        message
      )
    )

    return {
      success: false,
      alreadyInstalled: false,
      versionId,
      jarPath: null,
      error: message
    }
  } finally {
    if (temporaryPath) {
      await rm(temporaryPath, {
        force: true
      }).catch(() => undefined)
    }

    if (installationKey) {
      activeInstallations.delete(installationKey)
    }
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

  ipcMain.handle(
    'minecraft:get-install-status',
    async (_event, versionId: unknown, gameDirectory: unknown) => {
      if (
        typeof versionId !== 'string' ||
        typeof gameDirectory !== 'string'
      ) {
        return {
          versionId: '',
          installed: false,
          valid: false,
          jarPath: null,
          currentSize: null,
          expectedSize: null,
          currentSha1: null,
          expectedSha1: null,
          error: 'Nieprawidłowe dane sprawdzania instalacji.'
        } satisfies MinecraftInstallStatus
      }

      return getMinecraftInstallStatus(versionId, gameDirectory)
    }
  )

  ipcMain.handle(
    'minecraft:install-client',
    async (event, versionId: unknown, gameDirectory: unknown) => {
      if (
        typeof versionId !== 'string' ||
        typeof gameDirectory !== 'string'
      ) {
        return {
          success: false,
          alreadyInstalled: false,
          versionId: '',
          jarPath: null,
          error: 'Nieprawidłowe dane instalacji.'
        } satisfies MinecraftInstallResult
      }

      return installMinecraftClient(
        event.sender,
        versionId,
        gameDirectory
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
