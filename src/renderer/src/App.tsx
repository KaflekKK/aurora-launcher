import { useState } from 'react'

type Page = 'home' | 'profiles' | 'settings'

function App(): React.JSX.Element {
  const [page, setPage] = useState<Page>('home')
  const [minecraftVersion, setMinecraftVersion] = useState('1.21.11')
  const [ram, setRam] = useState(4)

  function playMinecraft(): void {
    alert(
      `Aurora Client\nMinecraft ${minecraftVersion}\nRAM: ${ram} GB\n\nUruchamianie gry dodamy później.`
    )
  }

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
            className={page === 'profiles' ? 'menu-button active' : 'menu-button'}
            onClick={() => setPage('profiles')}
          >
            <span className="menu-icon">▦</span>
            Profile
          </button>

          <button
            type="button"
            className={page === 'settings' ? 'menu-button active' : 'menu-button'}
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

          <span className="app-version">Aurora Launcher v0.1.0</span>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="status">
            <span className="status-dot" />
            Launcher gotowy
          </div>

          <button
            type="button"
            className="login-button"
            onClick={() =>
              alert('Logowanie Microsoft dodamy w późniejszym etapie.')
            }
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
                Nowoczesny, szybki i lekki launcher Minecraft. Wszystkie profile,
                ustawienia i mody w jednym miejscu.
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
                  onChange={(event) => setMinecraftVersion(event.target.value)}
                >
                  <option value="1.21.11">Minecraft 1.21.11</option>
                  <option value="1.21.4">Minecraft 1.21.4</option>
                  <option value="1.20.1">Minecraft 1.20.1</option>
                </select>
              </div>

              <button
                type="button"
                className="play-button"
                onClick={playMinecraft}
              >
                <span>▶</span>
                GRAJ
              </button>
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

                <span className="active-badge">AKTYWNY</span>
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
                    <h2>Folder gry</h2>
                    <p>Miejsce przechowywania plików Aurora Client.</p>
                  </div>
                </div>

                <div className="folder-row">
                  <code>%APPDATA%\AuroraLauncher</code>

                  <button
                    type="button"
                    className="small-button"
                    onClick={() => alert('Wybieranie folderu dodamy później.')}
                  >
                    Zmień
                  </button>
                </div>
              </article>

              <article className="settings-card">
                <div className="setting-top">
                  <div>
                    <h2>Zachowanie launchera</h2>
                    <p>Wybierz, co ma się wydarzyć po uruchomieniu gry.</p>
                  </div>
                </div>

                <label className="check-row">
                  <input type="checkbox" defaultChecked />
                  <span>Minimalizuj launcher po uruchomieniu gry</span>
                </label>

                <label className="check-row">
                  <input type="checkbox" />
                  <span>Zamknij launcher po uruchomieniu gry</span>
                </label>
              </article>
            </div>

            <button
              type="button"
              className="save-button"
              onClick={() => alert(`Zapisano ustawienia.\nRAM: ${ram} GB`)}
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