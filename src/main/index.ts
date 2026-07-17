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
import { release as getOsRelease } from 'node:os'
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import { inflateRawSync } from 'node:zlib'
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

interface MinecraftLibraryArtifact {
  path: string
  sha1: string
  size: number
  url: string
}

interface MinecraftLibraryRule {
  action: 'allow' | 'disallow'
  os?: {
    name?: string
    arch?: string
    version?: string
  }
  features?: Record<string, boolean>
}

interface MinecraftLibrary {
  name: string
  downloads?: {
    artifact?: MinecraftLibraryArtifact
    classifiers?: Record<string, MinecraftLibraryArtifact>
  }
  natives?: Partial<Record<'windows' | 'osx' | 'linux', string>>
  extract?: {
    exclude?: string[]
  }
  rules?: MinecraftLibraryRule[]
}

interface MinecraftAssetObject {
  hash: string
  size: number
}

interface MinecraftAssetIndexFile {
  objects: Record<string, MinecraftAssetObject>
  virtual?: boolean
  map_to_resources?: boolean
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
  libraries?: MinecraftLibrary[]

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
  | 'extracting'
  | 'complete'
  | 'error'

interface MinecraftInstallProgress {
  versionId: string
  phase: InstallPhase
  downloadedBytes: number
  totalBytes: number
  percent: number
  message: string
  currentFile: string | null
  completedFiles: number
  totalFiles: number
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
  clientValid: boolean

  libraryCount: number
  validLibraryCount: number
  missingLibraryCount: number
  invalidLibraryCount: number

  assetIndexValid: boolean
  assetCount: number
  validAssetCount: number
  missingAssetCount: number
  invalidAssetCount: number

  nativeArchiveCount: number
  validNativeArchiveCount: number
  missingNativeArchiveCount: number
  invalidNativeArchiveCount: number
  nativesExtracted: boolean
  nativeFileCount: number

  totalExpectedSize: number | null
  error: string | null
}

interface MinecraftInstallResult {
  success: boolean
  alreadyInstalled: boolean
  versionId: string
  jarPath: string | null
  libraryCount: number
  assetCount: number
  nativeArchiveCount: number
  extractedNativeFileCount: number
  downloadedFileCount: number
  error: string | null
}

interface FileInspection {
  exists: boolean
  valid: boolean
  size: number | null
  sha1: string | null
  error: string | null
}

type DownloadFileKind =
  | 'client'
  | 'library'
  | 'asset-index'
  | 'asset'
  | 'native'

interface DownloadFile {
  kind: DownloadFileKind
  label: string
  url: string
  sha1: string
  size: number
  targetPath: string
  temporaryPath: string
}

interface NativeArchive {
  file: DownloadFile
  excludes: string[]
}

interface VersionPaths {
  versionDirectory: string
  librariesDirectory: string
  assetsDirectory: string
  assetIndexesDirectory: string
  assetObjectsDirectory: string
  nativesDirectory: string
  nativeMarkerPath: string
  jarPath: string
  jsonPath: string
}

interface MinecraftInstallPlan {
  metadata: MinecraftVersionMetadata
  paths: VersionPaths
  clientFile: DownloadFile
  libraryFiles: DownloadFile[]
  assetIndexFile: DownloadFile
  assetFiles: DownloadFile[]
  nativeArchives: NativeArchive[]
  allFiles: DownloadFile[]
}

interface NativeExtractionMarker {
  versionId: string
  archiveSha1s: string[]
  extractedFileCount: number
}

interface NativeExtractionStatus {
  valid: boolean
  extractedFileCount: number
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

const assetIndexCache = new Map<
  string,
  CacheEntry<MinecraftAssetIndexFile>
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

async function fetchBuffer(
  url: string,
  errorName: string
): Promise<Buffer> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  try {
    const response = await net.fetch(getTrustedMinecraftUrl(url), {
      method: 'GET',
      signal: controller.signal
    })

    if (!response.ok) {
      throw new Error(
        `${errorName}: serwer zwrócił HTTP ${response.status}.`
      )
    }

    return Buffer.from(await response.arrayBuffer())
  } finally {
    clearTimeout(timeout)
  }
}

async function getMinecraftAssetIndex(
  metadata: MinecraftVersionMetadata,
  forceRefresh = false
): Promise<MinecraftAssetIndexFile> {
  const assetIndex = metadata.assetIndex

  if (!assetIndex) {
    throw new Error('Ta wersja nie zawiera indeksu assetów.')
  }

  validateDownloadProperties(
    'Indeks assetów',
    assetIndex.url,
    assetIndex.sha1,
    assetIndex.size
  )

  const cacheKey = `${assetIndex.id}:${assetIndex.sha1}`
  const cachedIndex = assetIndexCache.get(cacheKey)

  if (
    !forceRefresh &&
    cachedIndex &&
    isCacheFresh(cachedIndex.loadedAt)
  ) {
    return cachedIndex.data
  }

  const buffer = await fetchBuffer(
    assetIndex.url,
    `Nie udało się pobrać indeksu assetów ${assetIndex.id}`
  )

  if (buffer.length !== assetIndex.size) {
    throw new Error(
      `Indeks assetów ma rozmiar ${buffer.length} bajtów, oczekiwano ${assetIndex.size}.`
    )
  }

  const sha1 = createHash('sha1').update(buffer).digest('hex')

  if (sha1.toLowerCase() !== assetIndex.sha1.toLowerCase()) {
    throw new Error('Indeks assetów ma nieprawidłową sumę SHA-1.')
  }

  let parsed: MinecraftAssetIndexFile

  try {
    parsed = JSON.parse(buffer.toString('utf8')) as MinecraftAssetIndexFile
  } catch {
    throw new Error('Indeks assetów nie jest prawidłowym plikiem JSON.')
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !parsed.objects ||
    typeof parsed.objects !== 'object'
  ) {
    throw new Error('Indeks assetów ma nieprawidłowy format.')
  }

  assetIndexCache.set(cacheKey, {
    data: parsed,
    loadedAt: Date.now()
  })

  return parsed
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


function getMinecraftOsName(): 'windows' | 'osx' | 'linux' {
  if (process.platform === 'win32') {
    return 'windows'
  }

  if (process.platform === 'darwin') {
    return 'osx'
  }

  return 'linux'
}

function getMinecraftArchitecture(): string {
  if (process.arch === 'ia32') {
    return 'x86'
  }

  if (process.arch === 'x64') {
    return 'x86_64'
  }

  return process.arch
}

function getNativeClassifierArchitecture(): string {
  if (process.arch === 'ia32') {
    return '32'
  }

  if (process.arch === 'x64') {
    return '64'
  }

  return process.arch
}

function matchesRule(rule: MinecraftLibraryRule): boolean {
  if (rule.os?.name && rule.os.name !== getMinecraftOsName()) {
    return false
  }

  if (rule.os?.arch && rule.os.arch !== getMinecraftArchitecture()) {
    return false
  }

  if (rule.os?.version) {
    try {
      if (!new RegExp(rule.os.version).test(getOsRelease())) {
        return false
      }
    } catch {
      return false
    }
  }

  if (rule.features) {
    for (const expectedValue of Object.values(rule.features)) {
      if (expectedValue !== false) {
        return false
      }
    }
  }

  return true
}

function isLibraryAllowed(library: MinecraftLibrary): boolean {
  if (!library.rules || library.rules.length === 0) {
    return true
  }

  let allowed = false

  for (const rule of library.rules) {
    if (matchesRule(rule)) {
      allowed = rule.action === 'allow'
    }
  }

  return allowed
}

function getNativeClassifier(
  library: MinecraftLibrary
): string | null {
  const template = library.natives?.[getMinecraftOsName()]

  if (!template) {
    return null
  }

  return template.replace(
    /\$\{arch\}/g,
    getNativeClassifierArchitecture()
  )
}

function validateDownloadProperties(
  label: string,
  url: string,
  sha1: string,
  size: number
): void {
  getTrustedMinecraftUrl(url)

  if (!/^[a-f0-9]{40}$/i.test(sha1)) {
    throw new Error(`${label} ma nieprawidłową sumę SHA-1.`)
  }

  if (!Number.isSafeInteger(size) || size < 0) {
    throw new Error(`${label} ma nieprawidłowy rozmiar.`)
  }
}

function resolveSafeChildPath(
  baseDirectory: string,
  childPath: string,
  label: string
): string {
  const normalizedPath = childPath.replace(/\\/g, '/')

  if (
    !normalizedPath ||
    normalizedPath.includes('\u0000') ||
    normalizedPath.startsWith('/')
  ) {
    throw new Error(`${label} ma nieprawidłową ścieżkę.`)
  }

  const pathParts = normalizedPath.split('/').filter(Boolean)

  if (
    pathParts.length === 0 ||
    pathParts.some((part) => part === '.' || part === '..')
  ) {
    throw new Error(`${label} ma nieprawidłową ścieżkę.`)
  }

  const targetPath = resolve(baseDirectory, ...pathParts)
  const relativePath = relative(baseDirectory, targetPath)

  if (
    !relativePath ||
    relativePath.startsWith('..') ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`${label} wskazuje ścieżkę poza folderem gry.`)
  }

  return targetPath
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
): VersionPaths {
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
  const assetsDirectory = join(safeGameDirectory, 'assets')
  const nativesDirectory = join(
    versionDirectory,
    `${versionId}-natives`
  )

  return {
    versionDirectory,
    librariesDirectory: join(safeGameDirectory, 'libraries'),
    assetsDirectory,
    assetIndexesDirectory: join(assetsDirectory, 'indexes'),
    assetObjectsDirectory: join(assetsDirectory, 'objects'),
    nativesDirectory,
    nativeMarkerPath: join(nativesDirectory, '.aurora-natives.json'),
    jarPath: join(versionDirectory, `${versionId}.jar`),
    jsonPath: join(versionDirectory, `${versionId}.json`)
  }
}

function getPathKey(filePath: string): string {
  return process.platform === 'win32'
    ? filePath.toLowerCase()
    : filePath
}

function createDownloadFile(
  kind: DownloadFileKind,
  label: string,
  artifact: MinecraftLibraryArtifact | MinecraftDownload,
  targetPath: string
): DownloadFile {
  validateDownloadProperties(
    label,
    artifact.url,
    artifact.sha1,
    artifact.size
  )

  return {
    kind,
    label,
    url: getTrustedMinecraftUrl(artifact.url),
    sha1: artifact.sha1,
    size: artifact.size,
    targetPath,
    temporaryPath: `${targetPath}.part`
  }
}

async function getMinecraftInstallPlan(
  versionId: string,
  gameDirectory: string,
  forceRefresh = false
): Promise<MinecraftInstallPlan> {
  const metadata = await getMinecraftVersionMetadata(
    versionId,
    forceRefresh
  )
  const paths = getVersionPaths(gameDirectory, versionId)
  const client = metadata.downloads?.client

  if (!client) {
    throw new Error('Ta wersja nie zawiera pliku klienta.')
  }

  const clientFile = createDownloadFile(
    'client',
    `Klient Minecraft ${metadata.id}`,
    client,
    paths.jarPath
  )

  const usedPaths = new Set<string>([getPathKey(clientFile.targetPath)])
  const libraryFiles: DownloadFile[] = []
  const nativeArchives: NativeArchive[] = []

  const addUniqueFile = (
    collection: DownloadFile[],
    file: DownloadFile
  ): boolean => {
    const pathKey = getPathKey(file.targetPath)

    if (usedPaths.has(pathKey)) {
      return false
    }

    usedPaths.add(pathKey)
    collection.push(file)
    return true
  }

  for (const library of metadata.libraries ?? []) {
    if (!isLibraryAllowed(library)) {
      continue
    }

    let hasDownload = false
    const artifact = library.downloads?.artifact

    if (artifact) {
      const targetPath = resolveSafeChildPath(
        paths.librariesDirectory,
        artifact.path,
        `Biblioteka ${library.name}`
      )

      const file = createDownloadFile(
        'library',
        library.name,
        artifact,
        targetPath
      )

      addUniqueFile(libraryFiles, file)
      hasDownload = true
    }

    const nativeClassifier = getNativeClassifier(library)

    if (nativeClassifier) {
      const nativeArtifact =
        library.downloads?.classifiers?.[nativeClassifier]

      if (!nativeArtifact) {
        throw new Error(
          `Biblioteka ${library.name} nie zawiera pliku native ${nativeClassifier}.`
        )
      }

      const nativeTargetPath = resolveSafeChildPath(
        paths.librariesDirectory,
        nativeArtifact.path,
        `Plik native ${library.name}`
      )

      const nativeFile = createDownloadFile(
        'native',
        `${library.name} (${nativeClassifier})`,
        nativeArtifact,
        nativeTargetPath
      )

      const nativeFiles: DownloadFile[] = []

      if (addUniqueFile(nativeFiles, nativeFile)) {
        nativeArchives.push({
          file: nativeFile,
          excludes: [
            'META-INF/',
            ...(library.extract?.exclude ?? [])
          ]
        })
      }

      hasDownload = true
    }

    if (!hasDownload) {
      throw new Error(
        `Biblioteka ${library.name} nie zawiera pliku do pobrania.`
      )
    }
  }

  const assetIndexMetadata = metadata.assetIndex

  if (!assetIndexMetadata) {
    throw new Error('Ta wersja nie zawiera indeksu assetów.')
  }

  if (!/^[A-Za-z0-9._-]+$/.test(assetIndexMetadata.id)) {
    throw new Error('Indeks assetów ma nieprawidłowy identyfikator.')
  }

  const assetIndex = await getMinecraftAssetIndex(
    metadata,
    forceRefresh
  )

  const assetIndexFile = createDownloadFile(
    'asset-index',
    `Indeks assetów ${assetIndexMetadata.id}`,
    assetIndexMetadata,
    join(
      paths.assetIndexesDirectory,
      `${assetIndexMetadata.id}.json`
    )
  )

  usedPaths.add(getPathKey(assetIndexFile.targetPath))

  const assetFiles: DownloadFile[] = []

  for (const [assetName, asset] of Object.entries(assetIndex.objects)) {
    if (!asset || typeof asset !== 'object') {
      throw new Error(`Asset ${assetName} ma nieprawidłowe dane.`)
    }

    if (!/^[a-f0-9]{40}$/i.test(asset.hash)) {
      throw new Error(`Asset ${assetName} ma nieprawidłowy hash.`)
    }

    if (!Number.isSafeInteger(asset.size) || asset.size < 0) {
      throw new Error(`Asset ${assetName} ma nieprawidłowy rozmiar.`)
    }

    const hash = asset.hash.toLowerCase()
    const targetPath = resolveSafeChildPath(
      paths.assetObjectsDirectory,
      `${hash.slice(0, 2)}/${hash}`,
      `Asset ${assetName}`
    )

    const assetFile: DownloadFile = {
      kind: 'asset',
      label: `Asset ${assetName}`,
      url: getTrustedMinecraftUrl(
        `https://resources.download.minecraft.net/${hash.slice(0, 2)}/${hash}`
      ),
      sha1: hash,
      size: asset.size,
      targetPath,
      temporaryPath: `${targetPath}.part`
    }

    addUniqueFile(assetFiles, assetFile)
  }

  const nativeFiles = nativeArchives.map((archive) => archive.file)

  return {
    metadata,
    paths,
    clientFile,
    libraryFiles,
    assetIndexFile,
    assetFiles,
    nativeArchives,
    allFiles: [
      clientFile,
      ...libraryFiles,
      ...nativeFiles,
      assetIndexFile,
      ...assetFiles
    ]
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

async function inspectDownloadFile(
  file: DownloadFile,
  verifyHash = true
): Promise<FileInspection> {
  try {
    const fileStats = await stat(file.targetPath)

    if (!fileStats.isFile()) {
      return {
        exists: true,
        valid: false,
        size: null,
        sha1: null,
        error: 'Ścieżka nie wskazuje pliku.'
      }
    }

    if (fileStats.size !== file.size) {
      return {
        exists: true,
        valid: false,
        size: fileStats.size,
        sha1: null,
        error: 'Rozmiar pliku jest nieprawidłowy.'
      }
    }

    if (!verifyHash) {
      return {
        exists: true,
        valid: true,
        size: fileStats.size,
        sha1: null,
        error: null
      }
    }

    const sha1 = await calculateFileSha1(file.targetPath)
    const valid = sha1.toLowerCase() === file.sha1.toLowerCase()

    return {
      exists: true,
      valid,
      size: fileStats.size,
      sha1,
      error: valid ? null : 'Suma SHA-1 pliku jest nieprawidłowa.'
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

async function inspectDownloadFiles(
  files: DownloadFile[],
  shouldVerifyHash: (file: DownloadFile) => boolean,
  onInspected?: (completed: number, total: number, file: DownloadFile) => void
): Promise<FileInspection[]> {
  const results = new Array<FileInspection>(files.length)
  let nextIndex = 0
  let completed = 0
  const workerCount = Math.min(24, Math.max(1, files.length))

  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex
      nextIndex += 1

      if (index >= files.length) {
        return
      }

      const file = files[index]
      results[index] = await inspectDownloadFile(
        file,
        shouldVerifyHash(file)
      )
      completed += 1
      onInspected?.(completed, files.length, file)
    }
  })

  await Promise.all(workers)
  return results
}

function countFileStates(
  inspections: FileInspection[]
): {
  valid: number
  missing: number
  invalid: number
} {
  let valid = 0
  let missing = 0
  let invalid = 0

  for (const inspection of inspections) {
    if (inspection.valid) {
      valid += 1
    } else if (!inspection.exists) {
      missing += 1
    } else {
      invalid += 1
    }
  }

  return {
    valid,
    missing,
    invalid
  }
}

function getExpectedNativeArchiveSha1s(
  plan: MinecraftInstallPlan
): string[] {
  return plan.nativeArchives
    .map((archive) => archive.file.sha1.toLowerCase())
    .sort()
}

async function inspectNativeExtraction(
  plan: MinecraftInstallPlan
): Promise<NativeExtractionStatus> {
  if (plan.nativeArchives.length === 0) {
    return {
      valid: true,
      extractedFileCount: 0,
      error: null
    }
  }

  try {
    const directoryStats = await stat(plan.paths.nativesDirectory)

    if (!directoryStats.isDirectory()) {
      return {
        valid: false,
        extractedFileCount: 0,
        error: 'Ścieżka natives nie jest folderem.'
      }
    }

    const markerText = await readFile(plan.paths.nativeMarkerPath, 'utf8')
    const marker = JSON.parse(markerText) as Partial<NativeExtractionMarker>
    const expectedSha1s = getExpectedNativeArchiveSha1s(plan)
    const markerSha1s = Array.isArray(marker.archiveSha1s)
      ? marker.archiveSha1s
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.toLowerCase())
          .sort()
      : []

    const extractedFileCount =
      typeof marker.extractedFileCount === 'number' &&
      Number.isSafeInteger(marker.extractedFileCount) &&
      marker.extractedFileCount >= 0
        ? marker.extractedFileCount
        : 0

    const valid =
      marker.versionId === plan.metadata.id &&
      extractedFileCount > 0 &&
      markerSha1s.length === expectedSha1s.length &&
      markerSha1s.every((sha1, index) => sha1 === expectedSha1s[index])

    return {
      valid,
      extractedFileCount,
      error: valid ? null : 'Pliki native wymagają ponownego rozpakowania.'
    }
  } catch (error) {
    if (isFileNotFound(error)) {
      return {
        valid: false,
        extractedFileCount: 0,
        error: 'Brakuje rozpakowanych plików native.'
      }
    }

    return {
      valid: false,
      extractedFileCount: 0,
      error: getErrorMessage(error)
    }
  }
}

async function getMinecraftInstallStatus(
  versionId: string,
  gameDirectory: string
): Promise<MinecraftInstallStatus> {
  try {
    const plan = await getMinecraftInstallPlan(versionId, gameDirectory)
    const inspections = await inspectDownloadFiles(
      plan.allFiles,
      (file) => file.kind !== 'asset'
    )
    const inspectionByPath = new Map<string, FileInspection>()

    plan.allFiles.forEach((file, index) => {
      inspectionByPath.set(getPathKey(file.targetPath), inspections[index])
    })

    const getInspection = (file: DownloadFile): FileInspection => {
      const inspection = inspectionByPath.get(getPathKey(file.targetPath))

      if (!inspection) {
        throw new Error(`Brakuje wyniku sprawdzania pliku ${file.label}.`)
      }

      return inspection
    }

    const clientInspection = getInspection(plan.clientFile)
    const libraryInspections = plan.libraryFiles.map(getInspection)
    const assetIndexInspection = getInspection(plan.assetIndexFile)
    const assetInspections = plan.assetFiles.map(getInspection)
    const nativeInspections = plan.nativeArchives.map((archive) =>
      getInspection(archive.file)
    )

    const libraryStates = countFileStates(libraryInspections)
    const assetStates = countFileStates(assetInspections)
    const nativeStates = countFileStates(nativeInspections)
    const nativeExtraction = await inspectNativeExtraction(plan)

    const valid =
      clientInspection.valid &&
      libraryStates.valid === plan.libraryFiles.length &&
      assetIndexInspection.valid &&
      assetStates.valid === plan.assetFiles.length &&
      nativeStates.valid === plan.nativeArchives.length &&
      nativeExtraction.valid

    let error: string | null = null

    if (clientInspection.exists && !clientInspection.valid) {
      error = clientInspection.error ?? 'Plik klienta jest uszkodzony.'
    } else if (!clientInspection.exists) {
      error = 'Brakuje pliku klienta.'
    } else if (libraryStates.invalid > 0) {
      error = `Uszkodzone biblioteki: ${libraryStates.invalid}.`
    } else if (libraryStates.missing > 0) {
      error = `Brakuje bibliotek: ${libraryStates.missing}.`
    } else if (!assetIndexInspection.valid) {
      error = assetIndexInspection.exists
        ? 'Indeks assetów jest uszkodzony.'
        : 'Brakuje indeksu assetów.'
    } else if (assetStates.invalid > 0) {
      error = `Uszkodzone assety: ${assetStates.invalid}.`
    } else if (assetStates.missing > 0) {
      error = `Brakuje assetów: ${assetStates.missing}.`
    } else if (nativeStates.invalid > 0) {
      error = `Uszkodzone archiwa native: ${nativeStates.invalid}.`
    } else if (nativeStates.missing > 0) {
      error = `Brakuje archiwów native: ${nativeStates.missing}.`
    } else if (!nativeExtraction.valid) {
      error = nativeExtraction.error
    }

    return {
      versionId,
      installed:
        inspections.some((inspection) => inspection.exists) ||
        nativeExtraction.extractedFileCount > 0,
      valid,
      jarPath: plan.clientFile.targetPath,
      currentSize: clientInspection.size,
      expectedSize: plan.clientFile.size,
      currentSha1: clientInspection.sha1,
      expectedSha1: plan.clientFile.sha1,
      clientValid: clientInspection.valid,

      libraryCount: plan.libraryFiles.length,
      validLibraryCount: libraryStates.valid,
      missingLibraryCount: libraryStates.missing,
      invalidLibraryCount: libraryStates.invalid,

      assetIndexValid: assetIndexInspection.valid,
      assetCount: plan.assetFiles.length,
      validAssetCount: assetStates.valid,
      missingAssetCount: assetStates.missing,
      invalidAssetCount: assetStates.invalid,

      nativeArchiveCount: plan.nativeArchives.length,
      validNativeArchiveCount: nativeStates.valid,
      missingNativeArchiveCount: nativeStates.missing,
      invalidNativeArchiveCount: nativeStates.invalid,
      nativesExtracted: nativeExtraction.valid,
      nativeFileCount: nativeExtraction.extractedFileCount,

      totalExpectedSize: plan.allFiles.reduce(
        (sum, file) => sum + file.size,
        0
      ),
      error
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
      clientValid: false,

      libraryCount: 0,
      validLibraryCount: 0,
      missingLibraryCount: 0,
      invalidLibraryCount: 0,

      assetIndexValid: false,
      assetCount: 0,
      validAssetCount: 0,
      missingAssetCount: 0,
      invalidAssetCount: 0,

      nativeArchiveCount: 0,
      validNativeArchiveCount: 0,
      missingNativeArchiveCount: 0,
      invalidNativeArchiveCount: 0,
      nativesExtracted: false,
      nativeFileCount: 0,

      totalExpectedSize: null,
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
  message: string,
  currentFile: string | null,
  completedFiles: number,
  totalFiles: number
): MinecraftInstallProgress {
  const percent =
    totalBytes > 0
      ? Math.min(
          100,
          Math.max(0, Math.floor((downloadedBytes / totalBytes) * 100))
        )
      : phase === 'complete'
        ? 100
        : 0

  return {
    versionId,
    phase,
    downloadedBytes,
    totalBytes,
    percent,
    message,
    currentFile,
    completedFiles,
    totalFiles
  }
}

function shortenFileLabel(label: string): string {
  return label.length > 64 ? `${label.slice(0, 61)}...` : label
}

type DownloadProgressCallback = (
  currentFileBytes: number,
  phase: 'downloading' | 'verifying'
) => void

async function downloadAndVerifyFile(
  file: DownloadFile,
  onProgress: DownloadProgressCallback
): Promise<void> {
  await mkdir(dirname(file.targetPath), {
    recursive: true
  })

  await rm(file.temporaryPath, {
    force: true
  })

  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    DOWNLOAD_TIMEOUT
  )

  try {
    const response = await net.fetch(file.url, {
      method: 'GET',
      signal: controller.signal
    })

    if (!response.ok) {
      throw new Error(
        `Pobieranie ${file.label} zakończyło się błędem HTTP ${response.status}.`
      )
    }

    if (!response.body) {
      throw new Error(`${file.label}: serwer nie zwrócił danych pliku.`)
    }

    const reader = response.body.getReader()
    const fileHandle = await open(file.temporaryPath, 'w')
    const hash = createHash('sha1')
    let currentFileBytes = 0
    let lastProgressUpdate = 0

    onProgress(0, 'downloading')

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
        currentFileBytes += buffer.length

        const now = Date.now()

        if (
          now - lastProgressUpdate >= 100 ||
          currentFileBytes >= file.size
        ) {
          lastProgressUpdate = now
          onProgress(currentFileBytes, 'downloading')
        }
      }
    } finally {
      reader.releaseLock()
      await fileHandle.close()
    }

    onProgress(currentFileBytes, 'verifying')

    const downloadedSha1 = hash.digest('hex')

    if (currentFileBytes !== file.size) {
      throw new Error(
        `${file.label}: pobrano ${currentFileBytes} bajtów, oczekiwano ${file.size}.`
      )
    }

    if (downloadedSha1.toLowerCase() !== file.sha1.toLowerCase()) {
      throw new Error(`${file.label}: nieprawidłowa suma SHA-1.`)
    }

    await rm(file.targetPath, {
      force: true
    })

    await rename(file.temporaryPath, file.targetPath)
  } catch (error) {
    await rm(file.temporaryPath, {
      force: true
    }).catch(() => undefined)

    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function downloadFilesConcurrently(
  sender: WebContents,
  versionId: string,
  files: DownloadFile[]
): Promise<number> {
  if (files.length === 0) {
    return 0
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
  const activeBytes = new Map<number, number>()
  let nextIndex = 0
  let completedBytes = 0
  let completedFiles = 0
  let firstError: unknown = null
  let lastProgressUpdate = 0

  const emitProgress = (
    _index: number,
    file: DownloadFile,
    phase: 'downloading' | 'verifying',
    force = false
  ): void => {
    const now = Date.now()

    if (!force && now - lastProgressUpdate < 100) {
      return
    }

    lastProgressUpdate = now

    const activeDownloadedBytes = Array.from(activeBytes.values()).reduce(
      (sum, value) => sum + value,
      0
    )
    const downloadedBytes = Math.min(
      totalBytes,
      completedBytes + activeDownloadedBytes
    )
    const shortLabel = shortenFileLabel(file.label)

    sendInstallProgress(
      sender,
      createProgress(
        versionId,
        phase,
        downloadedBytes,
        totalBytes,
        phase === 'verifying'
          ? `Sprawdzanie: ${shortLabel}`
          : `Pobieranie: ${shortLabel}`,
        shortLabel,
        completedFiles,
        files.length
      )
    )
  }

  const workerCount = Math.min(10, files.length)

  const workers = Array.from({ length: workerCount }, async () => {
    while (!firstError) {
      const index = nextIndex
      nextIndex += 1

      if (index >= files.length) {
        return
      }

      const file = files[index]
      activeBytes.set(index, 0)

      try {
        await downloadAndVerifyFile(
          file,
          (currentFileBytes, phase) => {
            activeBytes.set(index, currentFileBytes)
            emitProgress(index, file, phase)
          }
        )

        activeBytes.delete(index)
        completedBytes += file.size
        completedFiles += 1
        emitProgress(index, file, 'verifying', true)
      } catch (error) {
        activeBytes.delete(index)
        firstError = error
        return
      }
    }
  })

  await Promise.all(workers)

  if (firstError) {
    throw firstError
  }

  return completedFiles
}

function assertZipRange(
  buffer: Buffer,
  offset: number,
  length: number,
  label: string
): void {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset + length > buffer.length
  ) {
    throw new Error(`${label}: uszkodzona struktura archiwum ZIP.`)
  }
}

function findZipEndOfCentralDirectory(buffer: Buffer): number {
  const signature = 0x06054b50
  const minimumOffset = Math.max(0, buffer.length - 65557)

  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === signature) {
      return offset
    }
  }

  throw new Error('Nie znaleziono końca archiwum ZIP.')
}

function isExcludedNativeEntry(
  entryName: string,
  excludes: string[]
): boolean {
  const normalizedName = entryName.replace(/\\/g, '/').toLowerCase()

  return excludes.some((exclude) => {
    const normalizedExclude = exclude
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .toLowerCase()

    return normalizedExclude.length > 0 &&
      normalizedName.startsWith(normalizedExclude)
  })
}

async function extractNativeArchive(
  archive: NativeArchive,
  nativesDirectory: string,
  extractedPaths: Set<string>
): Promise<void> {
  const buffer = await readFile(archive.file.targetPath)
  const endOffset = findZipEndOfCentralDirectory(buffer)

  assertZipRange(buffer, endOffset, 22, archive.file.label)

  const entryCount = buffer.readUInt16LE(endOffset + 10)
  const centralDirectorySize = buffer.readUInt32LE(endOffset + 12)
  const centralDirectoryOffset = buffer.readUInt32LE(endOffset + 16)

  assertZipRange(
    buffer,
    centralDirectoryOffset,
    centralDirectorySize,
    archive.file.label
  )

  let offset = centralDirectoryOffset
  let totalExtractedBytes = 0

  for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
    assertZipRange(buffer, offset, 46, archive.file.label)

    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`${archive.file.label}: uszkodzony katalog ZIP.`)
    }

    const flags = buffer.readUInt16LE(offset + 8)
    const compressionMethod = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const uncompressedSize = buffer.readUInt32LE(offset + 24)
    const fileNameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const externalAttributes = buffer.readUInt32LE(offset + 38)
    const localHeaderOffset = buffer.readUInt32LE(offset + 42)
    const completeEntryLength =
      46 + fileNameLength + extraLength + commentLength

    assertZipRange(
      buffer,
      offset,
      completeEntryLength,
      archive.file.label
    )

    const entryName = buffer
      .subarray(offset + 46, offset + 46 + fileNameLength)
      .toString('utf8')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')

    offset += completeEntryLength

    if (
      !entryName ||
      entryName.endsWith('/') ||
      isExcludedNativeEntry(entryName, archive.excludes)
    ) {
      continue
    }

    if ((flags & 0x0001) !== 0) {
      throw new Error(`${archive.file.label}: zaszyfrowany wpis ZIP.`)
    }

    const unixMode = (externalAttributes >>> 16) & 0xffff

    if ((unixMode & 0xf000) === 0xa000) {
      throw new Error(`${archive.file.label}: niedozwolony link symboliczny.`)
    }

    if (uncompressedSize > 128 * 1024 * 1024) {
      throw new Error(`${archive.file.label}: zbyt duży wpis ZIP.`)
    }

    totalExtractedBytes += uncompressedSize

    if (totalExtractedBytes > 512 * 1024 * 1024) {
      throw new Error(`${archive.file.label}: archiwum ZIP jest zbyt duże.`)
    }

    assertZipRange(buffer, localHeaderOffset, 30, archive.file.label)

    if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new Error(`${archive.file.label}: uszkodzony nagłówek ZIP.`)
    }

    const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28)
    const dataOffset =
      localHeaderOffset + 30 + localFileNameLength + localExtraLength

    assertZipRange(
      buffer,
      dataOffset,
      compressedSize,
      archive.file.label
    )

    const compressedData = buffer.subarray(
      dataOffset,
      dataOffset + compressedSize
    )

    let extractedData: Buffer

    if (compressionMethod === 0) {
      extractedData = Buffer.from(compressedData)
    } else if (compressionMethod === 8) {
      extractedData = inflateRawSync(compressedData)
    } else {
      throw new Error(
        `${archive.file.label}: nieobsługiwana kompresja ZIP ${compressionMethod}.`
      )
    }

    if (extractedData.length !== uncompressedSize) {
      throw new Error(
        `${archive.file.label}: nieprawidłowy rozmiar rozpakowanego pliku.`
      )
    }

    const targetPath = resolveSafeChildPath(
      nativesDirectory,
      entryName,
      `Plik native ${entryName}`
    )

    await mkdir(dirname(targetPath), {
      recursive: true
    })

    await writeFile(targetPath, extractedData)
    extractedPaths.add(getPathKey(targetPath))
  }
}

async function extractNativeArchives(
  sender: WebContents,
  plan: MinecraftInstallPlan,
  downloadedBytes: number,
  totalBytes: number
): Promise<number> {
  if (plan.nativeArchives.length === 0) {
    return 0
  }

  await rm(plan.paths.nativesDirectory, {
    recursive: true,
    force: true
  })

  await mkdir(plan.paths.nativesDirectory, {
    recursive: true
  })

  const extractedPaths = new Set<string>()

  for (let index = 0; index < plan.nativeArchives.length; index += 1) {
    const archive = plan.nativeArchives[index]
    const shortLabel = shortenFileLabel(archive.file.label)

    sendInstallProgress(
      sender,
      createProgress(
        plan.metadata.id,
        'extracting',
        downloadedBytes,
        totalBytes,
        `Rozpakowywanie native ${index + 1}/${plan.nativeArchives.length}: ${shortLabel}`,
        shortLabel,
        index,
        plan.nativeArchives.length
      )
    )

    await extractNativeArchive(
      archive,
      plan.paths.nativesDirectory,
      extractedPaths
    )
  }

  const marker: NativeExtractionMarker = {
    versionId: plan.metadata.id,
    archiveSha1s: getExpectedNativeArchiveSha1s(plan),
    extractedFileCount: extractedPaths.size
  }

  await writeFile(
    plan.paths.nativeMarkerPath,
    JSON.stringify(marker, null, 2),
    'utf8'
  )

  return extractedPaths.size
}

async function installMinecraftVersion(
  sender: WebContents,
  versionId: string,
  gameDirectory: string
): Promise<MinecraftInstallResult> {
  let installationKey: string | null = null
  let libraryCount = 0
  let assetCount = 0
  let nativeArchiveCount = 0
  let extractedNativeFileCount = 0
  let downloadedFileCount = 0

  try {
    const safeGameDirectory = validateGameDirectory(gameDirectory)
    installationKey = `${safeGameDirectory}\u0000${versionId}`

    if (activeInstallations.has(installationKey)) {
      return {
        success: false,
        alreadyInstalled: false,
        versionId,
        jarPath: null,
        libraryCount: 0,
        assetCount: 0,
        nativeArchiveCount: 0,
        extractedNativeFileCount: 0,
        downloadedFileCount: 0,
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
        'Przygotowywanie klienta, bibliotek, assetów i natives...',
        null,
        0,
        0
      )
    )

    const plan = await getMinecraftInstallPlan(
      versionId,
      safeGameDirectory
    )

    libraryCount = plan.libraryFiles.length
    assetCount = plan.assetFiles.length
    nativeArchiveCount = plan.nativeArchives.length

    await Promise.all([
      mkdir(plan.paths.versionDirectory, { recursive: true }),
      mkdir(plan.paths.librariesDirectory, { recursive: true }),
      mkdir(plan.paths.assetIndexesDirectory, { recursive: true }),
      mkdir(plan.paths.assetObjectsDirectory, { recursive: true })
    ])

    await writeFile(
      plan.paths.jsonPath,
      JSON.stringify(plan.metadata, null, 2),
      'utf8'
    )

    let lastCheckUpdate = 0

    const inspections = await inspectDownloadFiles(
      plan.allFiles,
      (file) => file.kind !== 'asset',
      (completed, total, file) => {
        const now = Date.now()

        if (now - lastCheckUpdate < 100 && completed < total) {
          return
        }

        lastCheckUpdate = now

        sendInstallProgress(
          sender,
          createProgress(
            versionId,
            'checking',
            0,
            0,
            `Sprawdzanie plików ${completed}/${total}...`,
            shortenFileLabel(file.label),
            completed,
            total
          )
        )
      }
    )

    const filesToDownload = plan.allFiles.filter(
      (_file, index) => !inspections[index].valid
    )
    const nativeExtractionBefore = await inspectNativeExtraction(plan)

    if (filesToDownload.length === 0 && nativeExtractionBefore.valid) {
      sendInstallProgress(
        sender,
        createProgress(
          versionId,
          'complete',
          0,
          0,
          'Wszystkie pliki gry są już poprawnie zainstalowane.',
          null,
          plan.allFiles.length,
          plan.allFiles.length
        )
      )

      return {
        success: true,
        alreadyInstalled: true,
        versionId,
        jarPath: plan.paths.jarPath,
        libraryCount,
        assetCount,
        nativeArchiveCount,
        extractedNativeFileCount:
          nativeExtractionBefore.extractedFileCount,
        downloadedFileCount: 0,
        error: null
      }
    }

    const downloadTotalBytes = filesToDownload.reduce(
      (sum, file) => sum + file.size,
      0
    )

    downloadedFileCount = await downloadFilesConcurrently(
      sender,
      versionId,
      filesToDownload
    )

    const shouldExtractNatives =
      plan.nativeArchives.length > 0 &&
      (!nativeExtractionBefore.valid ||
        filesToDownload.some((file) => file.kind === 'native'))

    extractedNativeFileCount = shouldExtractNatives
      ? await extractNativeArchives(
          sender,
          plan,
          downloadTotalBytes,
          downloadTotalBytes
        )
      : nativeExtractionBefore.extractedFileCount

    sendInstallProgress(
      sender,
      createProgress(
        versionId,
        'complete',
        downloadTotalBytes,
        downloadTotalBytes,
        `Zainstalowano klienta, ${libraryCount} bibliotek, ${assetCount} assetów i pliki native.`,
        null,
        filesToDownload.length,
        filesToDownload.length
      )
    )

    return {
      success: true,
      alreadyInstalled: false,
      versionId,
      jarPath: plan.paths.jarPath,
      libraryCount,
      assetCount,
      nativeArchiveCount,
      extractedNativeFileCount,
      downloadedFileCount,
      error: null
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
        message,
        null,
        downloadedFileCount,
        downloadedFileCount
      )
    )

    return {
      success: false,
      alreadyInstalled: false,
      versionId,
      jarPath: null,
      libraryCount,
      assetCount,
      nativeArchiveCount,
      extractedNativeFileCount,
      downloadedFileCount,
      error: message
    }
  } finally {
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
          clientValid: false,
          libraryCount: 0,
          validLibraryCount: 0,
          missingLibraryCount: 0,
          invalidLibraryCount: 0,
          assetIndexValid: false,
          assetCount: 0,
          validAssetCount: 0,
          missingAssetCount: 0,
          invalidAssetCount: 0,
          nativeArchiveCount: 0,
          validNativeArchiveCount: 0,
          missingNativeArchiveCount: 0,
          invalidNativeArchiveCount: 0,
          nativesExtracted: false,
          nativeFileCount: 0,
          totalExpectedSize: null,
          error: 'Nieprawidłowe dane sprawdzania instalacji.'
        } satisfies MinecraftInstallStatus
      }

      return getMinecraftInstallStatus(versionId, gameDirectory)
    }
  )

  ipcMain.handle(
    'minecraft:install-version',
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
          libraryCount: 0,
          assetCount: 0,
          nativeArchiveCount: 0,
          extractedNativeFileCount: 0,
          downloadedFileCount: 0,
          error: 'Nieprawidłowe dane instalacji.'
        } satisfies MinecraftInstallResult
      }

      return installMinecraftVersion(
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