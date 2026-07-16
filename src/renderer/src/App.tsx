import {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react'

type Page = 'home' | 'profiles' | 'settings'
type MinecraftVersion = '1.21.11' | '1.21.4' | '1.20.1'

type InstallPhase =
  | 'checking'
  | 'downloading'
  | 'verifying'
  | 'complete'
  | 'error'

interface LauncherSettings {
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

interface DetailItemProps {
  label: string
  value: string
}

const SETTINGS_KEY = 'aurora-launcher-settings'

const DEFAULT_SETTINGS: LauncherSettings = {
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

function loadSettings(): LauncherSettings {
  try {
    const savedSettings = window.localStorage.getItem(SETTINGS_KEY)

    if (!savedSettings) {
      return DEFAULT_SETTINGS
    }

    const parsed = JSON.parse(
      savedSettings
    ) as Partial<LauncherSettings>

    return {
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
          error: 'Nie udało się sprawdzić pliku klienta.'
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

  async function installMinecraftClient(): Promise<void> {
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
      totalBytes: versionDetails.clientSize ?? 0,
      percent: 0,
      message: 'Przygotowywanie instalacji...'
    })

    try {
      const result = await window.api.installMinecraftClient(
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
          ? `Minecraft ${minecraftVersion} jest już poprawnie zainstalowany.`
          : `Pobrano i sprawdzono plik klienta Minecraft ${minecraftVersion}.\n\n` +
              `Plik: ${result.jarPath ?? 'brak ścieżki'}`
      )
    } catch (error) {
      console.error('Nie udało się zainstalować klienta:', error)
      alert('Nie udało się rozpocząć instalacji klienta.')
    } finally {
      setInstalling(false)
    }
  }

  function saveSettings(): void {
    const settings: LauncherSettings = {
      minecraftVersion,
      ram,
      gameDirectory,
      minimizeOnLaunch,
      closeOnLaunch
    }

    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))

      alert(
        `Ustawienia zapisane.\n\n` +
          `Wersja: Minecraft ${minecraftVersion}\n` +
          `RAM: ${ram} GB\n` +
          `Folder: ${gameDirectory}`
      )
    } catch (error) {
      console.error('Nie udało się zapisać ustawień:', error)
      alert('Nie udało się zapisać ustawień.')
    }
  }

  function playMinecraft(): void {
    if (!installStatus?.valid) {
      void installMinecraftClient()
      return
    }

    if (!javaInfo?.installed) {
      alert('Nie wykryto Javy. Sprawdź ustawienia.')
      setPage('settings')
      return
    }

    alert(
      `Aurora Client\n` +
        `Minecraft ${minecraftVersion}\n` +
        `RAM: ${ram} GB\n` +
        `Java: ${javaInfo.version ?? 'nieznana'}\n` +
        `Plik klienta: poprawny\n\n` +
        `Biblioteki, assety, logowanie i prawdziwe uruchamianie dodamy w kolejnych etapach.`
    )
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
      return 'Sprawdzanie pliku klienta...'
    }

    if (installStatus?.valid) {
      return `Zainstalowana · ${formatBytes(installStatus.currentSize)}`
    }

    if (installStatus?.installed) {
      return installStatus.error ?? 'Plik klienta wymaga naprawy.'
    }

    if (installStatus?.error) {
      return installStatus.error
    }

    return 'Wymaga instalacji'
  }

  const versionReady =
    !minecraftLoading &&
    versionInfo?.available === true &&
    versionDetails?.available === true

  const clientInstalled = installStatus?.valid === true

  const mainActionDisabled =
    installing ||
    minecraftLoading ||
    installStatusLoading ||
    !versionReady ||
    !gameDirectory

  const mainActionText = installing
    ? `${installProgress?.percent ?? 0}%`
    : clientInstalled
      ? 'GRAJ'
      : 'ZAINSTALUJ'

  const topStatusText = installing
    ? 'Instalowanie klienta'
    : minecraftLoading
      ? 'Pobieranie danych wersji'
      : installStatusLoading
        ? 'Sprawdzanie instalacji'
        : clientInstalled
          ? 'Launcher gotowy'
          : 'Wymaga instalacji'

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
          <div className="account">
            <div className="avatar">?</div>

            <div className="account-text">
              <strong>Nie zalogowano</strong>
              <span>Konto Microsoft</span>
            </div>
          </div>

          <span className="app-version">Aurora Launcher v0.7.0</span>
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
            onClick={() => alert('Logowanie Microsoft dodamy później.')}
          >
            Zaloguj się
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
                  <strong>Bezpieczny</strong>
                  <span>Logowanie przez Microsoft</span>
                </div>

                <div className="feature">
                  <strong>Nowoczesny</strong>
                  <span>Własny klient i mody</span>
                </div>
              </div>
            </div>

            <div className="play-panel">
              <div className="selected-profile">
                <div className="profile-logo">A</div>

                <div>
                  <span className="small-label">WYBRANY PROFIL</span>
                  <h2>Aurora Client</h2>
                  <p>Minecraft Java Edition</p>
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
                    color: clientInstalled ? '#c084fc' : '#a89bad',
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
                onClick={clientInstalled ? playMinecraft : () => void installMinecraftClient()}
                style={{
                  opacity: mainActionDisabled ? 0.5 : 1,
                  cursor: mainActionDisabled ? 'not-allowed' : 'pointer'
                }}
              >
                <span>{clientInstalled ? '▶' : '↓'}</span>
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
                      {formatBytes(installProgress?.downloadedBytes ?? 0)} /{' '}
                      {formatBytes(
                        installProgress?.totalBytes ??
                          versionDetails?.clientSize ??
                          null
                      )}
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
              <article className="profile-card selected-card">
                <div className="card-logo">A</div>

                <div className="card-text">
                  <h2>Aurora Client</h2>
                  <p>Minecraft {minecraftVersion} · Profil domyślny</p>
                </div>

                <span className="active-badge">
                  {installing
                    ? `${installProgress?.percent ?? 0}%`
                    : clientInstalled
                      ? 'ZAINSTALOWANY'
                      : 'DO INSTALACJI'}
                </span>
              </article>

              <article className="profile-card">
                <div className="card-logo dark-logo">V</div>

                <div className="card-text">
                  <h2>Vanilla</h2>
                  <p>Czysty Minecraft bez dodatkowych modyfikacji</p>
                </div>

                <button
                  type="button"
                  className="small-button"
                  onClick={() => alert('Wybrano profil Vanilla.')}
                >
                  Wybierz
                </button>
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
                    <h2>Instalacja klienta</h2>
                    <p>
                      Oficjalny plik klienta wybranej wersji Minecrafta.
                    </p>
                  </div>

                  <strong>
                    {installing
                      ? `${installProgress?.percent ?? 0}%`
                      : installStatusLoading
                        ? '...'
                        : clientInstalled
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
                    onClick={() => void installMinecraftClient()}
                  >
                    {installing
                      ? 'Instalowanie...'
                      : clientInstalled
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
    </div>
  )
}

export default App
