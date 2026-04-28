/**
 * NetworkManager - WebSocket wrapper for co-op multiplayer
 */
export class NetworkManager {
  constructor() {
    this.ws = null
    this.playerId = null
    this.roomId = null
    this.role = null      // 'rider' or 'pillion'
    this.seed = null
    this.connected = false

    // Callbacks
    this.onWelcome = null
    this.onRoomCreated = null
    this.onRoomJoined = null
    this.onRoomUpdated = null
    this.onGameStarted = null
    this.onPartnerInput = null
    this.onPlayerDisconnected = null
    this.onError = null
    this.onConnectionChange = null
  }

  connect(serverUrl) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(serverUrl)

      this.ws.onopen = () => {
        this.connected = true
        if (this.onConnectionChange) this.onConnectionChange(true)
        console.log('[Net] Connected to server')
      }

      this.ws.onclose = () => {
        this.connected = false
        if (this.onConnectionChange) this.onConnectionChange(false)
        console.log('[Net] Disconnected from server')
      }

      this.ws.onerror = (err) => {
        console.error('[Net] WebSocket error', err)
        reject(err)
      }

      this.ws.onmessage = (event) => {
        try {
          const { type, payload } = JSON.parse(event.data)
          this._handleMessage(type, payload, resolve)
        } catch (e) {
          console.error('[Net] Bad message', e)
        }
      }
    })
  }

  _handleMessage(type, payload, resolveConnect) {
    switch (type) {
      case 'WELCOME':
        this.playerId = payload.id
        if (resolveConnect) resolveConnect(this.playerId)
        if (this.onWelcome) this.onWelcome(payload)
        break

      case 'ROOM_CREATED':
        this.roomId = payload.roomId
        this.role = payload.role
        this.seed = payload.seed
        if (this.onRoomCreated) this.onRoomCreated(payload)
        break

      case 'ROOM_JOINED':
        this.roomId = payload.roomId
        this.role = payload.role
        this.seed = payload.seed
        if (this.onRoomJoined) this.onRoomJoined(payload)
        break

      case 'ROOM_UPDATED':
        if (this.onRoomUpdated) this.onRoomUpdated(payload)
        break

      case 'GAME_STARTED':
        this.seed = payload.seed
        if (this.onGameStarted) this.onGameStarted(payload)
        break

      case 'PARTNER_INPUT':
        if (this.onPartnerInput) this.onPartnerInput(payload)
        break

      case 'PLAYER_DISCONNECTED':
        if (this.onPlayerDisconnected) this.onPlayerDisconnected(payload)
        break

      case 'ERROR':
        console.error('[Net] Server error:', payload.message || payload)
        if (this.onError) this.onError(payload)
        break
    }
  }

  send(type, payload = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }))
    }
  }

  createRoom(name) {
    this.send('CREATE_ROOM', { name })
  }

  joinRoom(name, roomId) {
    this.send('JOIN_ROOM', { name, roomId })
  }

  createQuickRoom(name) {
    this.send('CREATE_QUICK_ROOM', { name })
  }

  joinQuickRoom(name) {
    this.send('JOIN_QUICK_ROOM', { name })
  }

  startGame() {
    this.send('START_GAME')
  }

  sendInput(keys) {
    this.send('INPUT', { keys })
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
}
