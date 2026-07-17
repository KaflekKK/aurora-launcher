import {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react'

type Page = 'home' | 'profiles' | 'settings'
type MinecraftVersion = '1.21.11' | '1.21.4' | '1.20.1'
type GameProfile = 'aurora' | 'vanilla'
type AccountType = 'local' | 'microsoft'

type InstallPhase =
  | 'checking'
  | 'downloading'
  | 'verifying'
  | 'complete'
  | 'error'

interface LauncherAccount {
  id: string
  type: AccountType
  username: string
}

interface LauncherSettings {
  selectedProfile: GameProfile
  accounts: LauncherAccount[]
  selectedAccountId: string | null
  minecraftVersion: MinecraftVersion
  ram: number
  gameDirectory: string
  minimizeOnLaunch: boolean
  closeOnLaunch: boolean
}

interface JavaInfo {
  installed: boolean
  version: string | null
  fullVersion: string | null
  vendor: string | null
  path: string | null
  architecture: string
  error: string | null
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
  totalExpectedSize: number | null
  error: string | null
}

interface DetailItemProps {
  label: string
  value: string
}

const SETTINGS_KEY = 'aurora-launcher-settings'

const DEFAULT_SETTINGS: LauncherSettings = {
  selectedProfile: 'aurora',
  accounts: [],
  selectedAccountId: null,
  minecraftVersion: '1.21.11',
  ram: 4,
  gameDirectory: '',
  minimizeOnLaunch: true,
  closeOnLaunch: false
}

function isMinecraftVersion(value: unknown): value is MinecraftVersion {
  return (
    value === '1.21.11' ||
    value === '1.21.4' ||
    value === '1.20.1'
  )
}

function isGameProfile(value: unknown): value is GameProfile {
  return value === 'aurora' || value === 'vanilla'
}

function isLauncherAccount(value: unknown): value is LauncherAccount {
  if (!value || typeof value !== 'object') {
    return false
  }

  const account = value as Partial<LauncherAccount>

  return (
    typeof account.id === 'string' &&
    account.id.length > 0 &&
    (account.type === 'local' || account.type === 'microsoft') &&
    typeof account.username === 'string' &&
    account.username.length > 0
  )
}

function createAccountId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function loadSettings(): LauncherSettings {
  try {
    const savedSettings = window.localStorage.getItem(SETTINGS_KEY)

    if (!savedSettings) {
      return DEFAULT_SETTINGS
    }

    const parsed = JSON.parse(
      savedSettings
    ) as Partial<LauncherSettings>

    const accounts = Array.isArray(parsed.accounts)
      ? parsed.accounts.filter(isLauncherAccount)
      : DEFAULT_SETTINGS.accounts

    const selectedAccountId =
      typeof parsed.selectedAccountId === 'string' &&
      accounts.some((account) => account.id === parsed.selectedAccountId)
        ? parsed.selectedAccountId
        : accounts[0]?.id ?? null

    return {
      selectedProfile: isGameProfile(parsed.selectedProfile)
        ? parsed.selectedProfile
        : DEFAULT_SETTINGS.selectedProfile,

      accounts,
      selectedAccountId,

      minecraftVersion: isMinecraftVersion(parsed.minecraftVersion)
        ? parsed.minecraftVersion
        : DEFAULT_SETTINGS.minecraftVersion,

      ram:
        typeof parsed.ram === 'number' &&
        parsed.ram >= 2 &&
        parsed.ram <= 16
          ? Math.round(parsed.ram)
          : DEFAULT_SETTINGS.ram,

      gameDirectory:
        typeof parsed.gameDirectory === 'string'
          ? parsed.gameDirectory
          : DEFAULT_SETTINGS.gameDirectory,

      minimizeOnLaunch:
        typeof parsed.minimizeOnLaunch === 'boolean'
          ? parsed.minimizeOnLaunch
          : DEFAULT_SETTINGS.minimizeOnLaunch,

      closeOnLaunch:
        typeof parsed.closeOnLaunch === 'boolean'
          ? parsed.closeOnLaunch
          : DEFAULT_SETTINGS.closeOnLaunch
    }
  } catch (error) {
    console.error('Nie udało się odczytać ustawień:', error)
    return DEFAULT_SETTINGS
  }
}

function formatDate(value: string | null): string | null {
  if (!value) {
    return null
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return new Intl.DateTimeFormat('pl-PL', {
    dateStyle: 'medium'
  }).format(date)
}

function formatBytes(value: number | null): string {
  if (value === null || value < 0) {
    return 'Brak danych'
  }

  if (value < 1024) {
    return `${value} B`
  }

  const kilobytes = value / 1024

  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(1)} KB`
  }

  const megabytes = kilobytes / 1024

  if (megabytes < 1024) {
    return `${megabytes.toFixed(1)} MB`
  }

  return `${(megabytes / 1024).toFixed(2)} GB`
}

function DetailItem({ label, value }: DetailItemProps): React.JSX.Element {
  return (
    <div
      style={{
        padding: '12px',
        background: 'rgba(5, 4, 7, 0.42)',
        border: '1px solid rgba(192, 132, 252, 0.09)',
        borderRadius: '10px'
      }}
    >
      <span
        style={{
          display: 'block',
          marginBottom: '6px',
          color: '#756a7c',
          fontSize: '9px',
          fontWeight: 700,
          letterSpacing: '0.8px',
          textTransform: 'uppercase'
        }}
      >
        {label}
      </span>

      <strong
        title={value}
        style={{
          display: 'block',
          overflow: 'hidden',
          color: '#e8e1ec',
          fontSize: '11px',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}
      >
        {value}
      </strong>
    </div>
  )
}

function App(): React.JSX.Element {
  const [initialSettings] = useState<LauncherSettings>(() => loadSettings())

  const [page, setPage] = useState<Page>('home')
  const [selectedProfile, setSelectedProfile] = useState<GameProfile>(
    initialSettings.selectedProfile
  )
  const [accounts, setAccounts] = useState<LauncherAccount[]>(
    initialSettings.accounts
  )
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    initialSettings.selectedAccountId
  )
  const [accountPanelOpen, setAccountPanelOpen] = useState(false)
  const [newNickname, setNewNickname] = useState('')
  const [accountError, setAccountError] = useState<string | null>(null)
  const [minecraftVersion, setMinecraftVersion] =
    useState<MinecraftVersion>(initialSettings.minecraftVersion)
  const [ram, setRam] = useState(initialSettings.ram)
  const [gameDirectory, setGameDirectory] = useState(
    initialSettings.gameDirectory
  )
  const [minimizeOnLaunch, setMinimizeOnLaunch] = useState(
    initialSettings.minimizeOnLaunch
  )
  const [closeOnLaunch, setCloseOnLaunch] = useState(
    initialSettings.closeOnLaunch
  )

  const [javaInfo, setJavaInfo] = useState<JavaInfo | null>(null)
  const [javaLoading, setJavaLoading] = useState(true)

  const [versionInfo, setVersionInfo] =
    useState<MinecraftVersionInfo | null>(null)
  const [versionDetails, setVersionDetails] =
    useState<MinecraftVersionDetails | null>(null)
  const [minecraftLoading, setMinecraftLoading] = useState(true)

  const [installStatus, setInstallStatus] =
    useState<MinecraftInstallStatus | null>(null)
  const [installStatusLoading, setInstallStatusLoading] = useState(true)
  const [installProgress, setInstallProgress] =
    useState<MinecraftInstallProgress | null>(null)
  const [installing, setInstalling] = useState(false)

  const [folderChoosing, setFolderChoosing] = useState(false)

  const minecraftRequestId = useRef(0)
  const installStatusRequestId = useRef(0)

  const refreshJavaInfo = useCallback(async (): Promise<void> => {
    setJavaLoading(true)

    try {
      const result = await window.api.getJavaInfo()
      setJavaInfo(result)
    } catch (error) {
      console.error('Nie udało się sprawdzić Javy:', error)

      setJavaInfo({
        installed: false,
        version: null,
        fullVersion: null,
        vendor: null,
        path: null,
        architecture: 'Nieznana',
        error: 'Nie udało się połączyć z procesem Electron.'
      })
    } finally {
      setJavaLoading(false)
    }
  }, [])

  const refreshMinecraftData = useCallback(
    async (
      version: MinecraftVersion,
      forceRefresh = false
    ): Promise<void> => {
      const requestId = ++minecraftRequestId.current
      setMinecraftLoading(true)

      try {
        const [info, details] = await Promise.all([
          window.api.checkMinecraftVersion(version, forceRefresh),
          window.api.getMinecraftVersionDetails(version, forceRefresh)
        ])

        if (requestId !== minecraftRequestId.current) {
          return
        }

        setVersionInfo(info)
        setVersionDetails(details)
      } catch (error) {
        if (requestId !== minecraftRequestId.current) {
          return
        }

        console.error('Nie udało się sprawdzić wersji Minecraft:', error)

        setVersionInfo({
          available: false,
          id: version,
          type: null,
          releaseTime: null,
          metadataUrl: null,
          latestRelease: null,
          error: 'Nie udało się połączyć z procesem Electron.'
        })

        setVersionDetails(null)
      } finally {
        if (requestId === minecraftRequestId.current) {
          setMinecraftLoading(false)
        }
      }
    },
    []
  )

  const refreshInstallStatus = useCallback(
    async (
      version: MinecraftVersion,
      directory: string
    ): Promise<void> => {
      const requestId = ++installStatusRequestId.current

      if (!directory) {
        setInstallStatus(null)
        setInstallStatusLoading(false)
        return
      }

      setInstallStatusLoading(true)

      try {
        const result = await window.api.getMinecraftInstallStatus(
          version,
          directory
        )

        if (requestId !== installStatusRequestId.current) {
          return
        }

        setInstallStatus(result)
      } catch (error) {
        if (requestId !== installStatusRequestId.current) {
          return
        }

        console.error('Nie udało się sprawdzić instalacji:', error)

        setInstallStatus({
          versionId: version,
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
          totalExpectedSize: null,
          error: 'Nie udało się sprawdzić klienta i bibliotek.'
        })
      } finally {
        if (requestId === installStatusRequestId.current) {
          setInstallStatusLoading(false)
        }
      }
    },
    []
  )

  useEffect(() => {
    void refreshJavaInfo()

    if (!initialSettings.gameDirectory) {
      void window.api
        .getDefaultGameDirectory()
        .then((defaultDirectory) => {
          setGameDirectory(defaultDirectory)
        })
        .catch((error: unknown) => {
          console.error('Nie udało się pobrać folderu gry:', error)
        })
    }
  }, [initialSettings.gameDirectory, refreshJavaInfo])

  useEffect(() => {
    setInstallProgress(null)
    void refreshMinecraftData(minecraftVersion)
  }, [minecraftVersion, refreshMinecraftData])

  useEffect(() => {
    void refreshInstallStatus(minecraftVersion, gameDirectory)
  }, [minecraftVersion, gameDirectory, refreshInstallStatus])

  useEffect(() => {
    window.api.onInstallProgress((progress) => {
      if (progress.versionId === minecraftVersion) {
        setInstallProgress(progress)
      }
    })

    return () => {
      window.api.removeInstallProgressListener()
    }
  }, [minecraftVersion])

  function persistSettings(
    overrides: Partial<LauncherSettings> = {}
  ): boolean {
    const settings: LauncherSettings = {
      selectedProfile,
      accounts,
      selectedAccountId,
      minecraftVersion,
      ram,
      gameDirectory,
      minimizeOnLaunch,
      closeOnLaunch,
      ...overrides
    }

    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
      return true
    } catch (error) {
      console.error('Nie udało się zapisać ustawień:', error)
      return false
    }
  }

  function openAccountPanel(): void {
    setAccountError(null)
    setAccountPanelOpen(true)
  }

  function addLocalAccount(): void {
    const username = newNickname.trim()

    if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) {
      setAccountError(
        'Nick musi mieć od 3 do 16 znaków i może zawierać litery, cyfry oraz znak _.'
      )
      return
    }

    if (
      accounts.some(
        (account) => account.username.toLowerCase() === username.toLowerCase()
      )
    ) {
      setAccountError('Profil z takim nickiem już istnieje.')
      return
    }

    const account: LauncherAccount = {
      id: createAccountId(),
      type: 'local',
      username
    }

    const updatedAccounts = [...accounts, account]

    setAccounts(updatedAccounts)
    setSelectedAccountId(account.id)
    setNewNickname('')
    setAccountError(null)
    persistSettings({
      accounts: updatedAccounts,
      selectedAccountId: account.id
    })
  }

  function selectAccount(accountId: string): void {
    setSelectedAccountId(accountId)
    setAccountError(null)
    persistSettings({ selectedAccountId: accountId })
  }

  function deleteAccount(accountId: string): void {
    const account = accounts.find((item) => item.id === accountId)

    if (!account || account.type !== 'local') {
      return
    }

    const shouldDelete = window.confirm(
      `Usunąć lokalny profil gracza ${account.username}?`
    )

    if (!shouldDelete) {
      return
    }

    const updatedAccounts = accounts.filter((item) => item.id !== accountId)
    const nextSelectedAccountId =
      selectedAccountId === accountId
        ? updatedAccounts[0]?.id ?? null
        : selectedAccountId

    setAccounts(updatedAccounts)
    setSelectedAccountId(nextSelectedAccountId)
    persistSettings({
      accounts: updatedAccounts,
      selectedAccountId: nextSelectedAccountId
    })
  }

  function showMicrosoftLoginInfo(): void {
    alert(
      'Dodawanie konta Microsoft będzie następnym etapem.\n\n' +
        'Logowanie otworzy oficjalną stronę Microsoft w przeglądarce. Aurora nie będzie prosić o hasło.'
    )
  }

  async function chooseGameDirectory(): Promise<void> {
    setFolderChoosing(true)

    try {
      const selectedDirectory = await window.api.chooseGameDirectory(
        gameDirectory || null
      )

      if (selectedDirectory) {
        setGameDirectory(selectedDirectory)
      }
    } catch (error) {
      console.error('Nie udało się wybrać folderu:', error)
      alert('Nie udało się otworzyć okna wyboru folderu.')
    } finally {
      setFolderChoosing(false)
    }
  }

  async function installMinecraftVersion(): Promise<void> {
    if (!gameDirectory) {
      alert('Najpierw wybierz folder gry w ustawieniach.')
      setPage('settings')
      return
    }

    if (!versionDetails?.available) {
      alert('Dane wybranej wersji Minecrafta nie są gotowe.')
      return
    }

    setInstalling(true)
    setInstallProgress({
      versionId: minecraftVersion,
      phase: 'checking',
      downloadedBytes: 0,
      totalBytes: 0,
      percent: 0,
      message: 'Przygotowywanie instalacji...',
      currentFile: null,
      completedFiles: 0,
      totalFiles: 0
    })

    try {
      const result = await window.api.installMinecraftVersion(
        minecraftVersion,
        gameDirectory
      )

      await refreshInstallStatus(minecraftVersion, gameDirectory)

      if (!result.success) {
        alert(
          `Nie udało się zainstalować Minecraft ${minecraftVersion}.\n\n` +
            `${result.error ?? 'Nieznany błąd.'}`
        )
        return
      }

      alert(
        result.alreadyInstalled
          ? `Minecraft ${minecraftVersion} oraz biblioteki są już poprawnie zainstalowane.`
          : `Pobrano i sprawdzono pliki Minecraft ${minecraftVersion}.\n\n` +
              `Klient: ${result.jarPath ?? 'brak ścieżki'}\n` +
              `Biblioteki: ${result.libraryCount}\n` +
              `Pobrane pliki: ${result.downloadedFileCount}`
      )
    } catch (error) {
      console.error('Nie udało się zainstalować plików gry:', error)
      alert('Nie udało się rozpocząć instalacji plików gry.')
    } finally {
      setInstalling(false)
    }
  }

  function saveSettings(): void {
    if (!persistSettings()) {
      alert('Nie udało się zapisać ustawień.')
      return
    }

    const selectedAccount = accounts.find(
      (account) => account.id === selectedAccountId
    )

    alert(
      `Ustawienia zapisane.\n\n` +
        `Profil gry: ${selectedProfile === 'vanilla' ? 'Vanilla' : 'Aurora Client'}\n` +
        `Gracz: ${selectedAccount?.username ?? 'nie wybrano'}\n` +
        `Wersja: Minecraft ${minecraftVersion}\n` +
        `RAM: ${ram} GB\n` +
        `Folder: ${gameDirectory}`
    )
  }

  function playMinecraft(): void {
    const selectedAccount = accounts.find(
      (account) => account.id === selectedAccountId
    )

    if (!selectedAccount) {
      alert('Najpierw wybierz lub dodaj profil gracza.')
      openAccountPanel()
      return
    }

    if (!installStatus?.valid) {
      void installMinecraftVersion()
      return
    }

    if (!javaInfo?.installed) {
      alert('Nie wykryto Javy. Sprawdź ustawienia.')
      setPage('settings')
      return
    }

    alert(
      `${selectedProfile === 'vanilla' ? 'Vanilla' : 'Aurora Client'}\n` +
        `Gracz: ${selectedAccount.username} (${
          selectedAccount.type === 'local' ? 'profil lokalny' : 'Microsoft'
        })\n` +
        `Minecraft ${minecraftVersion}\n` +
        `RAM: ${ram} GB\n` +
        `Java: ${javaInfo.version ?? 'nieznana'}\n` +
        `Plik klienta: poprawny\n` +
        `Biblioteki: ${installStatus.validLibraryCount}/${installStatus.libraryCount}\n\n` +
        `Assety, pliki native i prawdziwe uruchamianie dodamy w kolejnych etapach.`
    )
  }

  function selectProfile(profile: GameProfile): void {
    setSelectedProfile(profile)

    persistSettings({ selectedProfile: profile })
  }

  function getJavaDescription(): string {
    if (javaLoading) {
      return 'Sprawdzanie zainstalowanej Javy...'
    }

    if (!javaInfo?.installed) {
      return javaInfo?.error ?? 'Nie znaleziono Javy.'
    }

    return (
      `${javaInfo.vendor ?? 'Java'} ` +
      `${javaInfo.version ?? ''} · ${javaInfo.architecture}`
    )
  }

  function getVersionStatusText(): string {
    if (minecraftLoading) {
      return 'Pobieranie danych wersji z Mojang...'
    }

    if (!versionInfo?.available) {
      return versionInfo?.error ?? 'Wersja jest niedostępna.'
    }

    const releaseDate = formatDate(versionInfo.releaseTime)
    const versionType =
      versionInfo.type === 'release'
        ? 'wydanie stabilne'
        : versionInfo.type ?? 'nieznany typ'

    return releaseDate
      ? `Dostępna · ${versionType} · ${releaseDate}`
      : `Dostępna · ${versionType}`
  }

  function getInstallStatusText(): string {
    if (installing && installProgress) {
      return installProgress.message
    }

    if (installStatusLoading) {
      return 'Sprawdzanie klienta i bibliotek...'
    }

    if (installStatus?.valid) {
      return (
        `Zainstalowana · klient + ` +
        `${installStatus.validLibraryCount}/${installStatus.libraryCount} bibliotek`
      )
    }

    if (installStatus?.error) {
      return installStatus.error
    }

    if (installStatus && installStatus.missingLibraryCount > 0) {
      return `Brakuje bibliotek: ${installStatus.missingLibraryCount}`
    }

    return 'Wymaga instalacji'
  }

  const versionReady =
    !minecraftLoading &&
    versionInfo?.available === true &&
    versionDetails?.available === true

  const baseFilesInstalled = installStatus?.valid === true

  const mainActionDisabled =
    installing ||
    minecraftLoading ||
    installStatusLoading ||
    !versionReady ||
    !gameDirectory

  const mainActionText = installing
    ? `${installProgress?.percent ?? 0}%`
    : baseFilesInstalled
      ? 'GRAJ'
      : 'ZAINSTALUJ'

  const topStatusText = installing
    ? 'Instalowanie plików gry'
    : minecraftLoading
      ? 'Pobieranie danych wersji'
      : installStatusLoading
        ? 'Sprawdzanie instalacji'
        : baseFilesInstalled
          ? 'Launcher gotowy'
          : 'Wymaga instalacji'

  const selectedProfileName =
    selectedProfile === 'vanilla' ? 'Vanilla' : 'Aurora Client'

  const selectedProfileLogo = selectedProfile === 'vanilla' ? 'V' : 'A'

  const selectedProfileDescription =
    selectedProfile === 'vanilla'
      ? 'Czysty Minecraft Java Edition'
      : 'Minecraft Java Edition'

  const selectedAccount = accounts.find(
    (account) => account.id === selectedAccountId
  )

  const selectedAccountInitial =
    selectedAccount?.username.charAt(0).toUpperCase() ?? '?'

  return (
    <div className="launcher">
      <aside className="sidebar">
        <div className="logo-area">
          <div className="logo">A</div>

          <div className="logo-name">
            <strong>Aurora</strong>
            <span>LAUNCHER</span>
          </div>
        </div>

        <p className="menu-label">MENU</p>

        <nav className="menu">
          <button
            type="button"
            className={page === 'home' ? 'menu-button active' : 'menu-button'}
            onClick={() => setPage('home')}
          >
            <span className="menu-icon">⌂</span>
            Strona główna
          </button>

          <button
            type="button"
            className={
              page === 'profiles' ? 'menu-button active' : 'menu-button'
            }
            onClick={() => setPage('profiles')}
          >
            <span className="menu-icon">▦</span>
            Profile
          </button>

          <button
            type="button"
            className={
              page === 'settings' ? 'menu-button active' : 'menu-button'
            }
            onClick={() => setPage('settings')}
          >
            <span className="menu-icon">⚙</span>
            Ustawienia
          </button>
        </nav>

        <div className="sidebar-bottom">
          <button
            type="button"
            className="account"
            onClick={openAccountPanel}
            style={{
              width: '100%',
              padding: 0,
              color: 'inherit',
              textAlign: 'left',
              background: 'transparent',
              border: 0,
              cursor: 'pointer'
            }}
          >
            <div className="avatar">{selectedAccountInitial}</div>

            <div className="account-text">
              <strong>{selectedAccount?.username ?? 'Wybierz gracza'}</strong>
              <span>
                {selectedAccount
                  ? selectedAccount.type === 'local'
                    ? 'Profil lokalny'
                    : 'Konto Microsoft'
                  : 'Kliknij, aby dodać nick'}
              </span>
            </div>
          </button>

          <span className="app-version">Aurora Launcher v0.9.0</span>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="status">
            <span className="status-dot" />
            {topStatusText}
          </div>

          <button
            type="button"
            className="login-button"
            onClick={openAccountPanel}
          >
            {selectedAccount?.username ?? 'Wybierz gracza'}
          </button>
        </header>

        {page === 'home' && (
          <section className="home-page">
            <div className="hero">
              <div className="hero-tag">
                <span />
                AURORA CLIENT
              </div>

              <h1>
                Zagraj po
                <br />
                <strong>swojemu.</strong>
              </h1>

              <p>
                Nowoczesny, szybki i lekki launcher Minecraft. Wszystkie
                profile, ustawienia i mody w jednym miejscu.
              </p>

              <div className="features">
                <div className="feature">
                  <strong>Szybki</strong>
                  <span>Proste uruchamianie gry</span>
                </div>

                <div className="feature">
                  <strong>Elastyczny</strong>
                  <span>Profil lokalny lub Microsoft</span>
                </div>

                <div className="feature">
                  <strong>Nowoczesny</strong>
                  <span>Własny klient i mody</span>
                </div>
              </div>
            </div>

            <div className="play-panel">
              <div className="selected-profile">
                <div className="profile-logo">{selectedProfileLogo}</div>

                <div>
                  <span className="small-label">WYBRANY PROFIL</span>
                  <h2>{selectedProfileName}</h2>
                  <p>{selectedProfileDescription}</p>
                </div>
              </div>

              <div className="version-control">
                <label htmlFor="minecraft-version">Wersja gry</label>

                <select
                  id="minecraft-version"
                  value={minecraftVersion}
                  disabled={installing}
                  onChange={(event) =>
                    setMinecraftVersion(
                      event.target.value as MinecraftVersion
                    )
                  }
                >
                  <option value="1.21.11">Minecraft 1.21.11</option>
                  <option value="1.21.4">Minecraft 1.21.4</option>
                  <option value="1.20.1">Minecraft 1.20.1</option>
                </select>

                <span
                  style={{
                    color: baseFilesInstalled ? '#c084fc' : '#a89bad',
                    fontSize: '9px',
                    lineHeight: 1.35
                  }}
                >
                  {getInstallStatusText()}
                </span>
              </div>

              <button
                type="button"
                className="play-button"
                disabled={mainActionDisabled}
                onClick={baseFilesInstalled ? playMinecraft : () => void installMinecraftVersion()}
                style={{
                  opacity: mainActionDisabled ? 0.5 : 1,
                  cursor: mainActionDisabled ? 'not-allowed' : 'pointer'
                }}
              >
                <span>{baseFilesInstalled ? '▶' : '↓'}</span>
                {mainActionText}
              </button>

              {(installing || installProgress) && (
                <div
                  style={{
                    gridColumn: '1 / -1',
                    display: 'grid',
                    gap: '8px'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '12px',
                      color:
                        installProgress?.phase === 'error'
                          ? '#ff8faf'
                          : '#a99db0',
                      fontSize: '9px'
                    }}
                  >
                    <span>
                      {installProgress?.message ?? 'Przygotowywanie...'}
                    </span>

                    <span>
                      {installProgress?.totalFiles
                        ? `Plik ${Math.min(
                            installProgress.completedFiles + 1,
                            installProgress.totalFiles
                          )}/${installProgress.totalFiles} · `
                        : ''}
                      {formatBytes(installProgress?.downloadedBytes ?? 0)} /{' '}
                      {formatBytes(installProgress?.totalBytes ?? null)}
                    </span>
                  </div>

                  <div
                    style={{
                      height: '6px',
                      overflow: 'hidden',
                      background: 'rgba(255, 255, 255, 0.055)',
                      border: '1px solid rgba(192, 132, 252, 0.12)',
                      borderRadius: '20px'
                    }}
                  >
                    <div
                      style={{
                        width: `${installProgress?.percent ?? 0}%`,
                        height: '100%',
                        background:
                          'linear-gradient(90deg, #7c3aed, #a855f7)',
                        boxShadow: '0 0 14px rgba(168, 85, 247, 0.55)',
                        transition: 'width 120ms ease'
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {page === 'profiles' && (
          <section className="normal-page">
            <div className="page-header">
              <div>
                <span className="small-label">ZARZĄDZANIE</span>
                <h1>Profile gry</h1>
                <p>Wybierz wersję Minecrafta oraz zestaw modyfikacji.</p>
              </div>

              <button
                type="button"
                className="secondary-button"
                onClick={() => alert('Tworzenie profili dodamy później.')}
              >
                + Nowy profil
              </button>
            </div>

            <div className="profiles">
              <article
                className={
                  selectedProfile === 'aurora'
                    ? 'profile-card selected-card'
                    : 'profile-card'
                }
              >
                <div className="card-logo">A</div>

                <div className="card-text">
                  <h2>Aurora Client</h2>
                  <p>Minecraft {minecraftVersion} · Profil Aurora</p>
                </div>

                {selectedProfile === 'aurora' ? (
                  <span className="active-badge">AKTYWNY</span>
                ) : (
                  <button
                    type="button"
                    className="small-button"
                    onClick={() => selectProfile('aurora')}
                  >
                    Wybierz
                  </button>
                )}
              </article>

              <article
                className={
                  selectedProfile === 'vanilla'
                    ? 'profile-card selected-card'
                    : 'profile-card'
                }
              >
                <div className="card-logo dark-logo">V</div>

                <div className="card-text">
                  <h2>Vanilla</h2>
                  <p>Czysty Minecraft bez dodatkowych modyfikacji</p>
                </div>

                {selectedProfile === 'vanilla' ? (
                  <span className="active-badge">AKTYWNY</span>
                ) : (
                  <button
                    type="button"
                    className="small-button"
                    onClick={() => selectProfile('vanilla')}
                  >
                    Wybierz
                  </button>
                )}
              </article>

              <article className="profile-card unavailable">
                <div className="card-logo dark-logo">F</div>

                <div className="card-text">
                  <h2>Fabric</h2>
                  <p>Profil przygotowany do obsługi modów</p>
                </div>

                <span className="soon-badge">WKRÓTCE</span>
              </article>
            </div>
          </section>
        )}

        {page === 'settings' && (
          <section className="normal-page">
            <div className="page-header">
              <div>
                <span className="small-label">KONFIGURACJA</span>
                <h1>Ustawienia</h1>
                <p>Dostosuj działanie Minecrafta i launchera.</p>
              </div>
            </div>

            <div className="settings-list">
              <article className="settings-card">
                <div className="setting-top">
                  <div>
                    <h2>Instalacja gry</h2>
                    <p>
                      Oficjalny klient oraz biblioteki wybranej wersji Minecrafta.
                    </p>
                  </div>

                  <strong>
                    {installing
                      ? `${installProgress?.percent ?? 0}%`
                      : installStatusLoading
                        ? '...'
                        : baseFilesInstalled
                          ? 'Gotowa'
                          : 'Brak'}
                  </strong>
                </div>

                <div className="folder-row">
                  <code title={installStatus?.jarPath ?? ''}>
                    {getInstallStatusText()}
                  </code>

                  <button
                    type="button"
                    className="small-button"
                    disabled={installing || !versionReady || !gameDirectory}
                    onClick={() => void installMinecraftVersion()}
                  >
                    {installing
                      ? 'Instalowanie...'
                      : baseFilesInstalled
                        ? 'Sprawdź / napraw'
                        : 'Zainstaluj'}
                  </button>
                </div>

                {installStatus?.jarPath && (
                  <div className="folder-row">
                    <code title={installStatus.jarPath}>
                      {installStatus.jarPath}
                    </code>
                  </div>
                )}

                {installStatus && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                      gap: '10px',
                      marginTop: '14px'
                    }}
                  >
                    <DetailItem
                      label="Poprawne biblioteki"
                      value={`${installStatus.validLibraryCount}/${installStatus.libraryCount}`}
                    />
                    <DetailItem
                      label="Brakujące"
                      value={`${installStatus.missingLibraryCount}`}
                    />
                    <DetailItem
                      label="Uszkodzone"
                      value={`${installStatus.invalidLibraryCount}`}
                    />
                  </div>
                )}

                {(installing || installProgress) && (
                  <div style={{ marginTop: '16px' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: '7px',
                        color:
                          installProgress?.phase === 'error'
                            ? '#ff8faf'
                            : '#a99db0',
                        fontSize: '9px'
                      }}
                    >
                      <span>
                        {installProgress?.message ?? 'Przygotowywanie...'}
                      </span>
                      <span>{installProgress?.percent ?? 0}%</span>
                    </div>

                    <div
                      style={{
                        height: '6px',
                        overflow: 'hidden',
                        background: 'rgba(255, 255, 255, 0.055)',
                        borderRadius: '20px'
                      }}
                    >
                      <div
                        style={{
                          width: `${installProgress?.percent ?? 0}%`,
                          height: '100%',
                          background:
                            'linear-gradient(90deg, #7c3aed, #a855f7)',
                          transition: 'width 120ms ease'
                        }}
                      />
                    </div>
                  </div>
                )}
              </article>

              <article className="settings-card">
                <div className="setting-top">
                  <div>
                    <h2>Wersja Minecraft</h2>
                    <p>Dane pobierane z oficjalnego manifestu wersji.</p>
                  </div>

                  <strong>
                    {minecraftLoading
                      ? '...'
                      : versionReady
                        ? 'Gotowa'
                        : 'Błąd'}
                  </strong>
                </div>

                <div className="folder-row">
                  <code>{getVersionStatusText()}</code>

                  <button
                    type="button"
                    className="small-button"
                    disabled={minecraftLoading || installing}
                    onClick={() =>
                      void refreshMinecraftData(minecraftVersion, true)
                    }
                  >
                    {minecraftLoading ? 'Sprawdzanie' : 'Odśwież dane'}
                  </button>
                </div>
              </article>

              <article className="settings-card">
                <div className="setting-top">
                  <div>
                    <h2>Szczegóły wersji</h2>
                    <p>Dane potrzebne do pobrania i uruchomienia gry.</p>
                  </div>

                  <strong>
                    {versionDetails?.available ? minecraftVersion : 'Brak'}
                  </strong>
                </div>

                {minecraftLoading ? (
                  <div className="folder-row">
                    <code>Pobieranie szczegółowych danych...</code>
                  </div>
                ) : versionDetails?.available ? (
                  <>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                        gap: '10px',
                        marginTop: '18px'
                      }}
                    >
                      <DetailItem
                        label="Wymagana Java"
                        value={
                          versionDetails.javaMajorVersion
                            ? `Java ${versionDetails.javaMajorVersion}`
                            : 'Brak danych'
                        }
                      />

                      <DetailItem
                        label="Plik klienta"
                        value={formatBytes(versionDetails.clientSize)}
                      />

                      <DetailItem
                        label="Biblioteki"
                        value={`${versionDetails.libraryCount}`}
                      />

                      <DetailItem
                        label="Assety"
                        value={
                          versionDetails.assetIndexId
                            ? `${versionDetails.assetIndexId} · ${formatBytes(
                                versionDetails.assetTotalSize
                              )}`
                            : 'Brak danych'
                        }
                      />

                      <DetailItem
                        label="Argumenty gry"
                        value={`${versionDetails.gameArgumentCount}`}
                      />

                      <DetailItem
                        label="Argumenty JVM"
                        value={`${versionDetails.jvmArgumentCount}`}
                      />
                    </div>

                    <div className="folder-row">
                      <code title={versionDetails.mainClass ?? ''}>
                        Klasa startowa:{' '}
                        {versionDetails.mainClass ?? 'Brak danych'}
                      </code>
                    </div>

                    <div className="folder-row">
                      <code title={versionDetails.clientSha1 ?? ''}>
                        SHA-1 klienta:{' '}
                        {versionDetails.clientSha1 ?? 'Brak danych'}
                      </code>
                    </div>
                  </>
                ) : (
                  <div className="folder-row">
                    <code>
                      {versionDetails?.error ??
                        'Nie udało się pobrać szczegółów.'}
                    </code>
                  </div>
                )}
              </article>

              <article className="settings-card">
                <div className="setting-top">
                  <div>
                    <h2>Pamięć RAM</h2>
                    <p>Ilość pamięci przydzielonej dla Minecrafta.</p>
                  </div>

                  <strong>{ram} GB</strong>
                </div>

                <input
                  className="ram-slider"
                  type="range"
                  min="2"
                  max="16"
                  step="1"
                  value={ram}
                  onChange={(event) => setRam(Number(event.target.value))}
                />

                <div className="ram-values">
                  <span>2 GB</span>
                  <span>16 GB</span>
                </div>
              </article>

              <article className="settings-card">
                <div className="setting-top">
                  <div>
                    <h2>Java</h2>
                    <p>Java używana do uruchamiania Minecrafta.</p>
                  </div>

                  <strong>
                    {javaLoading
                      ? '...'
                      : javaInfo?.installed
                        ? 'Wykryta'
                        : 'Brak'}
                  </strong>
                </div>

                <div className="folder-row">
                  <code>{getJavaDescription()}</code>

                  <button
                    type="button"
                    className="small-button"
                    disabled={javaLoading}
                    onClick={() => void refreshJavaInfo()}
                  >
                    {javaLoading ? 'Sprawdzanie' : 'Sprawdź ponownie'}
                  </button>
                </div>

                {javaInfo?.path && (
                  <div className="folder-row">
                    <code>{javaInfo.path}</code>
                  </div>
                )}
              </article>

              <article className="settings-card">
                <div className="setting-top">
                  <div>
                    <h2>Folder gry</h2>
                    <p>Miejsce przechowywania plików Aurora Client.</p>
                  </div>
                </div>

                <div className="folder-row">
                  <code title={gameDirectory}>
                    {gameDirectory || 'Ładowanie domyślnego folderu...'}
                  </code>

                  <button
                    type="button"
                    className="small-button"
                    disabled={folderChoosing || installing}
                    onClick={() => void chooseGameDirectory()}
                  >
                    {folderChoosing ? 'Otwieranie...' : 'Zmień'}
                  </button>
                </div>
              </article>

              <article className="settings-card">
                <div className="setting-top">
                  <div>
                    <h2>Zachowanie launchera</h2>
                    <p>Wybierz zachowanie po uruchomieniu gry.</p>
                  </div>
                </div>

                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={minimizeOnLaunch}
                    onChange={(event) =>
                      setMinimizeOnLaunch(event.target.checked)
                    }
                  />
                  <span>Minimalizuj launcher po uruchomieniu gry</span>
                </label>

                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={closeOnLaunch}
                    onChange={(event) =>
                      setCloseOnLaunch(event.target.checked)
                    }
                  />
                  <span>Zamknij launcher po uruchomieniu gry</span>
                </label>
              </article>
            </div>

            <button
              type="button"
              className="save-button"
              onClick={saveSettings}
            >
              Zapisz ustawienia
            </button>
          </section>
        )}
      </main>

      {accountPanelOpen && (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setAccountPanelOpen(false)
            }
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'grid',
            placeItems: 'center',
            padding: '24px',
            background: 'rgba(3, 2, 5, 0.78)',
            backdropFilter: 'blur(12px)'
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-dialog-title"
            style={{
              width: 'min(520px, 100%)',
              maxHeight: 'calc(100vh - 48px)',
              overflowY: 'auto',
              padding: '24px',
              background:
                'linear-gradient(145deg, rgba(27, 18, 34, 0.98), rgba(10, 8, 13, 0.98))',
              border: '1px solid rgba(192, 132, 252, 0.22)',
              borderRadius: '18px',
              boxShadow: '0 24px 80px rgba(0, 0, 0, 0.58)'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '16px',
                marginBottom: '20px'
              }}
            >
              <div>
                <span className="small-label">PROFILE GRACZA</span>
                <h2
                  id="account-dialog-title"
                  style={{ margin: '6px 0 5px', color: '#f3edf6' }}
                >
                  Wybierz nick
                </h2>
                <p
                  style={{
                    margin: 0,
                    color: '#8d8195',
                    fontSize: '11px',
                    lineHeight: 1.55
                  }}
                >
                  Profil lokalny zapisuje nick tylko na tym komputerze. Konto
                  Microsoft będzie można dodać opcjonalnie.
                </p>
              </div>

              <button
                type="button"
                className="small-button"
                onClick={() => setAccountPanelOpen(false)}
                aria-label="Zamknij wybór gracza"
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gap: '9px', marginBottom: '18px' }}>
              {accounts.length === 0 ? (
                <div
                  style={{
                    padding: '17px',
                    color: '#8d8195',
                    fontSize: '11px',
                    textAlign: 'center',
                    background: 'rgba(5, 4, 7, 0.42)',
                    border: '1px dashed rgba(192, 132, 252, 0.2)',
                    borderRadius: '12px'
                  }}
                >
                  Nie masz jeszcze żadnego profilu gracza.
                </div>
              ) : (
                accounts.map((account) => {
                  const isSelected = account.id === selectedAccountId

                  return (
                    <div
                      key={account.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '42px minmax(0, 1fr) auto',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '11px',
                        background: isSelected
                          ? 'rgba(126, 34, 206, 0.2)'
                          : 'rgba(5, 4, 7, 0.42)',
                        border: isSelected
                          ? '1px solid rgba(192, 132, 252, 0.38)'
                          : '1px solid rgba(192, 132, 252, 0.1)',
                        borderRadius: '12px'
                      }}
                    >
                      <div
                        className="avatar"
                        style={{ width: '42px', height: '42px' }}
                      >
                        {account.username.charAt(0).toUpperCase()}
                      </div>

                      <div style={{ minWidth: 0 }}>
                        <strong
                          style={{
                            display: 'block',
                            overflow: 'hidden',
                            color: '#eee7f2',
                            fontSize: '12px',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {account.username}
                        </strong>
                        <span style={{ color: '#756a7c', fontSize: '9px' }}>
                          {account.type === 'local'
                            ? 'Profil lokalny'
                            : 'Konto Microsoft'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: '7px' }}>
                        {isSelected ? (
                          <span className="active-badge">AKTYWNY</span>
                        ) : (
                          <button
                            type="button"
                            className="small-button"
                            onClick={() => selectAccount(account.id)}
                          >
                            Wybierz
                          </button>
                        )}

                        {account.type === 'local' && (
                          <button
                            type="button"
                            className="small-button"
                            onClick={() => deleteAccount(account.id)}
                            title="Usuń profil lokalny"
                          >
                            Usuń
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <div
              style={{
                padding: '16px',
                background: 'rgba(5, 4, 7, 0.42)',
                border: '1px solid rgba(192, 132, 252, 0.1)',
                borderRadius: '12px'
              }}
            >
              <label
                htmlFor="local-nickname"
                style={{
                  display: 'block',
                  marginBottom: '8px',
                  color: '#b9aec0',
                  fontSize: '10px',
                  fontWeight: 700
                }}
              >
                Dodaj profil lokalny
              </label>

              <div style={{ display: 'flex', gap: '9px' }}>
                <input
                  id="local-nickname"
                  value={newNickname}
                  maxLength={16}
                  autoFocus
                  placeholder="Wpisz nick, np. Kaflek"
                  onChange={(event) => {
                    setNewNickname(event.target.value)
                    setAccountError(null)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      addLocalAccount()
                    }
                  }}
                  style={{
                    minWidth: 0,
                    flex: 1,
                    padding: '11px 12px',
                    color: '#f1eaf4',
                    background: '#0b090e',
                    border: '1px solid rgba(192, 132, 252, 0.2)',
                    borderRadius: '9px',
                    outline: 'none'
                  }}
                />

                <button
                  type="button"
                  className="secondary-button"
                  onClick={addLocalAccount}
                >
                  Dodaj
                </button>
              </div>

              {accountError && (
                <p
                  style={{
                    margin: '9px 0 0',
                    color: '#ff8faf',
                    fontSize: '9px',
                    lineHeight: 1.45
                  }}
                >
                  {accountError}
                </p>
              )}
            </div>

            <button
              type="button"
              className="save-button"
              onClick={showMicrosoftLoginInfo}
              style={{ width: '100%', marginTop: '12px' }}
            >
              + Dodaj konto Microsoft
            </button>
          </section>
        </div>
      )}
    </div>
  )
}

export default App