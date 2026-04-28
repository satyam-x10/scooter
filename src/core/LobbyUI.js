/**
 * LobbyUI - Creates and manages the lobby screen DOM
 */
export class LobbyUI {
  constructor() {
    this.container = null
    this.onCreateRoom = null
    this.onJoinRoom = null
    this.onQuickPlay = null
    this.onJoinQuick = null
    this.onStartGame = null
    this._build()
  }

  _build() {
    this.container = document.getElementById('lobby')

    this.container.innerHTML = `
      <div class="lobby-card">
        <h1 class="lobby-title">🛵 Scooter Chaos</h1>
        <p class="lobby-subtitle">Co-op Multiplayer</p>

        <div class="lobby-section" id="lobby-name-section">
          <input type="text" id="lobby-name" class="lobby-input" placeholder="Enter your name..." maxlength="16" autocomplete="off" />
        </div>

        <div class="lobby-section" id="lobby-menu" style="display:none;">
          <div class="lobby-buttons">
            <button id="btn-create" class="lobby-btn lobby-btn-primary">
              <span class="btn-icon">🏠</span>
              <span class="btn-label">Create Room</span>
            </button>
            <button id="btn-join" class="lobby-btn lobby-btn-secondary">
              <span class="btn-icon">🔗</span>
              <span class="btn-label">Join Room</span>
            </button>
            <div class="lobby-divider"><span>or</span></div>
            <button id="btn-quick" class="lobby-btn lobby-btn-accent">
              <span class="btn-icon">⚡</span>
              <span class="btn-label">Quick Play</span>
            </button>
            <button id="btn-join-quick" class="lobby-btn lobby-btn-accent-alt">
              <span class="btn-icon">🎯</span>
              <span class="btn-label">Join Quick</span>
            </button>
          </div>
        </div>

        <div class="lobby-section" id="lobby-join-input" style="display:none;">
          <input type="text" id="lobby-room-code" class="lobby-input" placeholder="Enter room code..." maxlength="10" autocomplete="off" style="text-transform:uppercase" />
          <button id="btn-join-submit" class="lobby-btn lobby-btn-primary" style="margin-top:10px;">Join</button>
          <button id="btn-back-menu" class="lobby-btn-link">← Back</button>
        </div>

        <div class="lobby-section" id="lobby-waiting" style="display:none;">
          <div class="waiting-spinner"></div>
          <p class="waiting-text" id="waiting-text">Waiting for partner...</p>
          <div class="room-code-display" id="room-code-display" style="display:none;">
            <span class="room-code-label">Room Code</span>
            <span class="room-code-value" id="room-code-value">------</span>
          </div>
          <div class="role-badge" id="role-badge" style="display:none;">
            <span id="role-text">RIDER</span>
          </div>
          <div id="player-list" class="player-list"></div>
          <button id="btn-start" class="lobby-btn lobby-btn-primary" style="display:none;margin-top:15px;">Start Game</button>
        </div>

        <div class="lobby-section" id="lobby-error" style="display:none;">
          <p class="error-text" id="error-text"></p>
          <button id="btn-error-back" class="lobby-btn-link">← Try Again</button>
        </div>

        <div class="lobby-footer">
          <span class="connection-dot" id="connection-dot"></span>
          <span id="connection-text">Connecting...</span>
        </div>
      </div>
    `

    this._bindEvents()
  }

  _bindEvents() {
    const nameInput = document.getElementById('lobby-name')
    const menuSection = document.getElementById('lobby-menu')

    // Show menu once name is entered
    nameInput.addEventListener('input', () => {
      const hasName = nameInput.value.trim().length > 0
      menuSection.style.display = hasName ? 'block' : 'none'
    })

    // Create Room
    document.getElementById('btn-create').addEventListener('click', () => {
      if (this.onCreateRoom) this.onCreateRoom(this._getName())
    })

    // Join Room - show input
    document.getElementById('btn-join').addEventListener('click', () => {
      this._showSection('lobby-join-input')
      document.getElementById('lobby-room-code').focus()
    })

    // Join Room - submit
    document.getElementById('btn-join-submit').addEventListener('click', () => {
      const code = document.getElementById('lobby-room-code').value.trim()
      if (code && this.onJoinRoom) this.onJoinRoom(this._getName(), code)
    })

    // Enter key on room code
    document.getElementById('lobby-room-code').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('btn-join-submit').click()
      }
    })

    // Back to menu
    document.getElementById('btn-back-menu').addEventListener('click', () => {
      this._showSection('lobby-menu')
    })

    // Quick Play
    document.getElementById('btn-quick').addEventListener('click', () => {
      if (this.onQuickPlay) this.onQuickPlay(this._getName())
    })

    // Join Quick
    document.getElementById('btn-join-quick').addEventListener('click', () => {
      if (this.onJoinQuick) this.onJoinQuick(this._getName())
    })

    // Start Game (host only)
    document.getElementById('btn-start').addEventListener('click', () => {
      if (this.onStartGame) this.onStartGame()
    })

    // Error back
    document.getElementById('btn-error-back').addEventListener('click', () => {
      this._showSection('lobby-menu')
    })
  }

  _getName() {
    return document.getElementById('lobby-name').value.trim() || 'Player'
  }

  _showSection(id) {
    const sections = ['lobby-name-section', 'lobby-menu', 'lobby-join-input', 'lobby-waiting', 'lobby-error']
    sections.forEach(s => {
      const el = document.getElementById(s)
      if (s === 'lobby-name-section') {
        // Always show name section unless waiting
        el.style.display = (id === 'lobby-waiting' || id === 'lobby-error') ? 'none' : 'block'
      } else {
        el.style.display = s === id ? 'block' : 'none'
      }
    })
  }

  showWaiting(text, roomCode = null, role = null, isHost = false) {
    this._showSection('lobby-waiting')
    document.getElementById('waiting-text').textContent = text

    const codeDisplay = document.getElementById('room-code-display')
    if (roomCode) {
      codeDisplay.style.display = 'flex'
      document.getElementById('room-code-value').textContent = roomCode
    } else {
      codeDisplay.style.display = 'none'
    }

    const roleBadge = document.getElementById('role-badge')
    if (role) {
      roleBadge.style.display = 'inline-block'
      const roleText = document.getElementById('role-text')
      roleText.textContent = role.toUpperCase()
      roleBadge.className = `role-badge role-${role}`
    } else {
      roleBadge.style.display = 'none'
    }

    document.getElementById('btn-start').style.display = isHost ? 'block' : 'none'
  }

  updatePlayerList(players) {
    const list = document.getElementById('player-list')
    list.innerHTML = players.map(p =>
      `<div class="player-item">
        <span class="player-role-dot ${p.role || 'unknown'}"></span>
        <span class="player-name">${p.name}</span>
        <span class="player-role-label">${p.role ? p.role.toUpperCase() : '...'}</span>
      </div>`
    ).join('')
  }

  enableStartButton(enabled) {
    const btn = document.getElementById('btn-start')
    if (btn) {
      btn.style.display = enabled ? 'block' : 'none'
    }
  }

  showError(message) {
    this._showSection('lobby-error')
    document.getElementById('error-text').textContent = message
  }

  setConnectionStatus(connected) {
    const dot = document.getElementById('connection-dot')
    const text = document.getElementById('connection-text')
    if (connected) {
      dot.classList.add('online')
      dot.classList.remove('offline')
      text.textContent = 'Connected'
    } else {
      dot.classList.remove('online')
      dot.classList.add('offline')
      text.textContent = 'Disconnected'
    }
  }

  show() {
    this.container.style.display = 'flex'
  }

  hide() {
    this.container.style.display = 'none'
  }
}
