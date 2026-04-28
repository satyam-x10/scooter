import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { InputManager } from './core/InputManager'
import { NetworkManager } from './core/NetworkManager'
import { LobbyUI } from './core/LobbyUI'
import { Passenger } from './entities/Passenger'
import { Scooter } from './entities/Scooter'
import { Environment } from './world/Environment'

// --- Constants ---
const MAX_SPEED = 0.5
const ACCEL = 0.005
const FRICTION = 0.98
const STEER_SENSITIVITY = 0.04
const RECOVERY_DIST = 1.5
const ROAD_WIDTH = 4.5

// Use localhost for dev, override for production
const WS_URL = `ws://${window.location.hostname || 'localhost'}:8080`

// --- State ---
let gameRunning = false
let myRole = null // 'rider' or 'pillion'
let partnerKeys = { w: false, s: false, a: false, d: false }
let lastSentKeys = null // for change detection

// Three.js objects (initialized on game start)
let scene, camera, renderer, controls
let input, world, scooter, rider, pillion
let uiSpeed, uiInstability, uiDistance, uiWaypoint, uiHeading

// --- Network + Lobby ---
const net = new NetworkManager()
const lobby = new LobbyUI()

// Connect to server immediately
net.connect(WS_URL).then(() => {
  console.log('Connected, player ID:', net.playerId)
}).catch(err => {
  lobby.showError('Cannot connect to server. Is the backend running?')
})

net.onConnectionChange = (connected) => {
  lobby.setConnectionStatus(connected)
}

net.onRoomCreated = (payload) => {
  myRole = payload.role
  const isQuick = payload.roomId.startsWith('Q-')
  lobby.showWaiting(
    'Waiting for partner to join...',
    payload.roomId,
    myRole,
    !isQuick // show start button only for private rooms
  )
  if (payload.room) lobby.updatePlayerList(payload.room.players)
}

net.onRoomJoined = (payload) => {
  myRole = payload.role
  lobby.showWaiting(
    'Joined! Waiting for host to start...',
    payload.roomId,
    myRole,
    false
  )
  if (payload.room) lobby.updatePlayerList(payload.room.players)
}

net.onRoomUpdated = (payload) => {
  if (payload.room) {
    lobby.updatePlayerList(payload.room.players)
    // If we're host and 2 players, enable start
    const isHost = payload.room.players[0]?.id === net.playerId
    const isFull = payload.room.players.length >= 2
    if (isHost && isFull) {
      lobby.showWaiting(
        'Partner joined! Start when ready.',
        payload.room.id,
        myRole,
        true
      )
      lobby.updatePlayerList(payload.room.players)
    }
  }
}

net.onGameStarted = (payload) => {
  console.log('[Game] Starting with seed:', payload.seed)
  startGame(payload.seed)
}

net.onPartnerInput = (payload) => {
  if (payload.keys) {
    partnerKeys = payload.keys
  }
}

net.onPlayerDisconnected = () => {
  document.getElementById('disconnect-overlay').style.display = 'flex'
  gameRunning = false
}

net.onError = (payload) => {
  const msg = payload.message || payload || 'Unknown error'
  lobby.showError(msg)
}

// --- Lobby Callbacks ---
lobby.onCreateRoom = (name) => net.createRoom(name)
lobby.onJoinRoom = (name, code) => net.joinRoom(name, code)
lobby.onQuickPlay = (name) => net.createQuickRoom(name)
lobby.onJoinQuick = (name) => net.joinQuickRoom(name)
lobby.onStartGame = () => net.startGame()

// --- Game Initialization ---
function startGame(seed) {
  // Hide lobby, show game UI
  lobby.hide()
  document.getElementById('ui').style.display = 'block'
  document.getElementById('compass').style.display = 'flex'

  // Role HUD
  const roleHud = document.getElementById('role-hud')
  roleHud.style.display = 'flex'
  const roleValue = document.getElementById('role-hud-value')
  roleValue.textContent = myRole.toUpperCase()
  roleValue.className = `role-hud-value ${myRole}`
  document.getElementById('role-hud-keys').textContent =
    myRole === 'rider' ? '[A / D] Steer' : '[W / S] Speed'

  // Three.js Setup
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1a1a)
  scene.fog = new THREE.Fog(0x1a1a1a, 50, 150)

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
  camera.position.set(0, 3, -6)

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.shadowMap.enabled = true
  document.body.appendChild(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.05
  controls.minDistance = 2
  controls.maxDistance = 8
  controls.maxPolarAngle = Math.PI / 2.1

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
  scene.add(ambientLight)

  const sunLight = new THREE.DirectionalLight(0xffffff, 0.8)
  sunLight.position.set(10, 30, 10)
  sunLight.castShadow = true
  scene.add(sunLight)

  input = new InputManager()
  world = new Environment(scene, seed)
  scooter = new Scooter(scene)
  rider = new Passenger(scene, 0x3366ff, 0.3, RECOVERY_DIST, ROAD_WIDTH)
  pillion = new Passenger(scene, 0xff3333, -0.3, RECOVERY_DIST, ROAD_WIDTH)

  uiSpeed = document.getElementById('speed')
  uiInstability = document.getElementById('instability')
  uiDistance = document.getElementById('distance')
  uiWaypoint = document.getElementById('waypoint-arrow')
  uiHeading = document.getElementById('heading-arrow')

  window.addEventListener('resize', onResize)

  gameRunning = true
  animate()
}

function onResize() {
  if (!camera || !renderer) return
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
}

// --- Build combined key objects from local input + partner ---
function getKeys() {
  // Local keys (what this player actually presses)
  const localKeys = {
    w: input.isDown('KeyW'),
    s: input.isDown('KeyS'),
    a: input.isDown('KeyA'),
    d: input.isDown('KeyD'),
  }

  let riderKeys, pillionKeys

  if (myRole === 'rider') {
    // I am rider: my A/D steer, partner's W/S control speed
    riderKeys = { a: localKeys.a, d: localKeys.d }
    pillionKeys = { w: partnerKeys.w, s: partnerKeys.s }

  } else {
    // I am pillion: my W/S control speed, partner's A/D steer
    riderKeys = { a: partnerKeys.a, d: partnerKeys.d }
    pillionKeys = { w: localKeys.w, s: localKeys.s }
  }

  // Only send if keys changed (avoid spamming)
  const keyStr = `${localKeys.w}${localKeys.s}${localKeys.a}${localKeys.d}`
  if (keyStr !== lastSentKeys) {
    lastSentKeys = keyStr
    net.sendInput({ keys: localKeys })
  }

  return { riderKeys, pillionKeys, localKeys }
}

// --- Game Loop ---
function update() {
  const { riderKeys, pillionKeys, localKeys } = getKeys()
  const bothOn = rider.onScooter && pillion.onScooter

  // Scooter Update
  scooter.update(ROAD_WIDTH, ACCEL, FRICTION, STEER_SENSITIVITY, riderKeys, pillionKeys, bothOn)

  // Recovery Controls — rider uses WASD, pillion uses arrows
  const moveSpeed = 0.15

  if (!rider.onScooter) {
    if (myRole === 'rider') {
      // Rider recovers with WASD
      if (input.isDown('KeyW')) rider.mesh.position.z += moveSpeed
      if (input.isDown('KeyS')) rider.mesh.position.z -= moveSpeed
      if (input.isDown('KeyA')) rider.mesh.position.x += moveSpeed
      if (input.isDown('KeyD')) rider.mesh.position.x -= moveSpeed
    } else {
      // Pillion sees rider recovery from partner input
      if (partnerKeys.a) rider.mesh.position.x += moveSpeed
      if (partnerKeys.d) rider.mesh.position.x -= moveSpeed
      // Partner sends W/S as forward/back for recovery too
      if (partnerKeys.w) rider.mesh.position.z += moveSpeed
      if (partnerKeys.s) rider.mesh.position.z -= moveSpeed
    }
    rider.showRecoveryRange(scooter.mesh.position)
    if (rider.tryRecover(scooter.mesh.position)) scooter.speed = 0
  }

  if (!pillion.onScooter) {
    if (myRole === 'pillion') {
      // Pillion recovers with WASD (remapped: W/S/A/D for walk)
      if (input.isDown('KeyW')) pillion.mesh.position.z += moveSpeed
      if (input.isDown('KeyS')) pillion.mesh.position.z -= moveSpeed
      if (input.isDown('KeyA')) pillion.mesh.position.x += moveSpeed
      if (input.isDown('KeyD')) pillion.mesh.position.x -= moveSpeed
    } else {
      // Rider sees pillion recovery from partner input
      if (partnerKeys.w) pillion.mesh.position.z += moveSpeed
      if (partnerKeys.s) pillion.mesh.position.z -= moveSpeed
      if (partnerKeys.a) pillion.mesh.position.x += moveSpeed
      if (partnerKeys.d) pillion.mesh.position.x -= moveSpeed
    }
    pillion.showRecoveryRange(scooter.mesh.position)
    if (pillion.tryRecover(scooter.mesh.position)) scooter.speed = 0
  }

  // --- Collisions ---
  const forward = scooter.getForward()
  const scooterPos = scooter.mesh.position

  // CURB COLLISION
  const isOffRoad = Math.abs(scooterPos.x) > ROAD_WIDTH
  if (isOffRoad) {
    scooter.speed *= 0.8
    scooter.mesh.position.x = THREE.MathUtils.clamp(scooterPos.x, -(ROAD_WIDTH + 0.1), ROAD_WIDTH + 0.1)
  }

  // Obstacles (Cars)
  world.obstacles.forEach(obj => {
    const dx = Math.abs(scooterPos.x - obj.position.x)
    const dz = Math.abs(scooterPos.z - obj.position.z)
    if (dx < 1.5 && dz < 2.5) {
      if (rider.onScooter || pillion.onScooter) {
        rider.fall(forward)
        pillion.fall(forward)
        scooter.speed = -0.1
        const dir = Math.sign(scooterPos.z - obj.position.z)
        scooter.mesh.position.z += dir * 1.0
      }
    }
  })

  // Bumps
  let onAnyBump = false
  world.bumps.forEach(bump => {
    const dx = Math.abs(scooterPos.x - bump.position.x)
    const dz = Math.abs(scooterPos.z - bump.position.z)
    if (dx < 2.2 && dz < 0.7) {
      onAnyBump = true
      const currentSpeed = Math.abs(scooter.speed)
      if (currentSpeed > 0.05) {
        if (rider.onScooter || pillion.onScooter) {
          rider.fall(forward)
          pillion.fall(forward)
          scooter.speed = -0.1
          scooter.mesh.position.y += 0.5
          scooter.mesh.position.z -= 1.0
        }
      } else {
        const bumpY = Math.sin(dz * 2) * 0.1
        scooter.mesh.position.y = THREE.MathUtils.lerp(scooter.mesh.position.y, bumpY, 0.2)
      }
    }
  })
  if (!onAnyBump) {
    scooter.mesh.position.y = THREE.MathUtils.lerp(scooter.mesh.position.y, 0, 0.1)
  }

  // Fallen Scooters
  world.fallenScooters.forEach(obj => {
    const dx = Math.abs(scooterPos.x - obj.position.x)
    const dz = Math.abs(scooterPos.z - obj.position.z)
    if (dx < 1.0 && dz < 1.5) {
      if (rider.onScooter || pillion.onScooter) {
        rider.fall(forward)
        pillion.fall(forward)
        scooter.speed = -0.1
        scooter.mesh.position.z -= 0.5
      }
    }
  })

  // Fallen Mock Players
  world.fallenPlayers.forEach(obj => {
    const dx = Math.abs(scooterPos.x - obj.position.x)
    const dz = Math.abs(scooterPos.z - obj.position.z)
    if (dx < 0.8 && dz < 0.8 && scooter.speed > 0.05) {
      const kickDir = new THREE.Vector3(
        (obj.position.x - scooterPos.x) * 1.5,
        0.8,
        scooter.speed * 4.0
      )
      obj.velocity.copy(kickDir)
    }
    if (obj.velocity.lengthSq() > 0.001) {
      obj.position.add(obj.velocity)
      obj.velocity.y -= 0.05
      obj.velocity.multiplyScalar(0.98)
      if (obj.position.y < 0.2) {
        obj.position.y = 0.2
        obj.velocity.set(0, 0, 0)
      }
      obj.position.x = THREE.MathUtils.clamp(obj.position.x, -ROAD_WIDTH, ROAD_WIDTH)
    }
  })

  rider.update(scooter.mesh.position, scooter.mesh.quaternion)
  pillion.update(scooter.mesh.position, scooter.mesh.quaternion)

  // --- Camera ---
  let camTarget = new THREE.Vector3()
  let camOffset = new THREE.Vector3(0, 1.5, -3.5)

  if (rider.onScooter && pillion.onScooter) {
    camTarget.copy(scooter.mesh.position)
    camOffset.set(0, 1.5, -3.5).applyQuaternion(scooter.mesh.quaternion)
  } else if (!rider.onScooter || !pillion.onScooter) {
    const activeRider = !rider.onScooter
    const activePillion = !pillion.onScooter

    if (activeRider && activePillion) {
      camTarget.addVectors(rider.mesh.position, pillion.mesh.position).multiplyScalar(0.5)
    } else if (activeRider) {
      camTarget.copy(rider.mesh.position)
    } else {
      camTarget.copy(pillion.mesh.position)
    }

    let moveDir = new THREE.Vector3()
    // Camera follows current player's input
    if (input.isDown('KeyW')) moveDir.z += 1
    if (input.isDown('KeyS')) moveDir.z -= 1
    if (input.isDown('KeyA')) moveDir.x += 1
    if (input.isDown('KeyD')) moveDir.x -= 1

    if (moveDir.length() > 0) {
      moveDir.normalize()
      camOffset.set(-moveDir.x * 4, 1.5, -moveDir.z * 4)
    } else {
      camOffset.set(0, 1.5, -4)
    }
  }

  controls.target.lerp(camTarget, 0.1)
  const desiredCamPos = camTarget.clone().add(camOffset)
  camera.position.lerp(desiredCamPos, 0.05)

  // --- UI Update ---
  const isFinished = scooterPos.z > world.finishLinePos
  uiSpeed.innerText = `Speed: ${(scooter.speed * 100).toFixed(1)} | Rider: ${rider.onScooter ? 'ON' : 'OFF'} | Pillion: ${pillion.onScooter ? 'ON' : 'OFF'}`

  const distToFinish = world.finishLinePos - scooterPos.z
  uiDistance.innerText = `${Math.max(0, distToFinish).toFixed(0)}m`

  const dx = 0 - scooterPos.x
  const dz = world.finishLinePos - scooterPos.z
  const targetAngle = -Math.atan2(dx, dz)
  uiWaypoint.style.transform = `rotate(${targetAngle}rad)`
  const currentHeading = -scooter.mesh.rotation.y
  uiHeading.style.transform = `rotate(${currentHeading}rad)`

  if (isFinished) {
    uiSpeed.innerHTML += `<br><span style="color: #00ff00; font-size: 1.5em; font-weight: bold;">🏁 FINISHED! 🏁</span>`
  }
}

function animate() {
  if (!gameRunning) return
  requestAnimationFrame(animate)
  update()
  controls.update()
  renderer.render(scene, camera)
}
