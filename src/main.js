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

// --- State received from host (used by pillion) ---
let receivedState = null

net.onStateSync = (payload) => {
  receivedState = payload
}

// --- Game Loop (Host / Rider) ---
// Host runs the full simulation using local A/D + partner's W/S
function updateAsHost() {
  // Rider's local keys for steering
  const riderKeys = {
    a: input.isDown('KeyA'),
    d: input.isDown('KeyD'),
  }

  // Pillion's keys from network
  const pillionKeys = {
    w: partnerKeys.w || false,
    s: partnerKeys.s || false,
  }

  const bothOn = rider.onScooter && pillion.onScooter

  // Scooter physics
  scooter.update(ROAD_WIDTH, ACCEL, FRICTION, STEER_SENSITIVITY, riderKeys, pillionKeys, bothOn)

  // --- Recovery (host handles both) ---
  const moveSpeed = 0.15

  if (!rider.onScooter) {
    // Rider recovers locally with WASD
    if (input.isDown('KeyW')) rider.mesh.position.z += moveSpeed
    if (input.isDown('KeyS')) rider.mesh.position.z -= moveSpeed
    if (input.isDown('KeyA')) rider.mesh.position.x += moveSpeed
    if (input.isDown('KeyD')) rider.mesh.position.x -= moveSpeed
    rider.showRecoveryRange(scooter.mesh.position)
    if (rider.tryRecover(scooter.mesh.position)) scooter.speed = 0
  }

  if (!pillion.onScooter) {
    // Pillion recovery uses partner's keys (W/S/A/D from pillion player)
    if (partnerKeys.w) pillion.mesh.position.z += moveSpeed
    if (partnerKeys.s) pillion.mesh.position.z -= moveSpeed
    if (partnerKeys.a) pillion.mesh.position.x += moveSpeed
    if (partnerKeys.d) pillion.mesh.position.x -= moveSpeed
    pillion.showRecoveryRange(scooter.mesh.position)
    if (pillion.tryRecover(scooter.mesh.position)) scooter.speed = 0
  }

  // --- Collisions ---
  const forward = scooter.getForward()
  const scooterPos = scooter.mesh.position

  // Curb
  if (Math.abs(scooterPos.x) > ROAD_WIDTH) {
    scooter.speed *= 0.8
    scooter.mesh.position.x = THREE.MathUtils.clamp(scooterPos.x, -(ROAD_WIDTH + 0.1), ROAD_WIDTH + 0.1)
  }

  // Cars
  world.obstacles.forEach(obj => {
    const dx = Math.abs(scooterPos.x - obj.position.x)
    const dz = Math.abs(scooterPos.z - obj.position.z)
    if (dx < 1.5 && dz < 2.5) {
      if (rider.onScooter || pillion.onScooter) {
        rider.fall(forward)
        pillion.fall(forward)
        scooter.speed = -0.1
        scooter.mesh.position.z += Math.sign(scooterPos.z - obj.position.z) * 1.0
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
      if (Math.abs(scooter.speed) > 0.05) {
        if (rider.onScooter || pillion.onScooter) {
          rider.fall(forward)
          pillion.fall(forward)
          scooter.speed = -0.1
          scooter.mesh.position.y += 0.5
          scooter.mesh.position.z -= 1.0
        }
      } else {
        scooter.mesh.position.y = THREE.MathUtils.lerp(scooter.mesh.position.y, Math.sin(dz * 2) * 0.1, 0.2)
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
      obj.velocity.copy(new THREE.Vector3(
        (obj.position.x - scooterPos.x) * 1.5, 0.8, scooter.speed * 4.0
      ))
    }
    if (obj.velocity.lengthSq() > 0.001) {
      obj.position.add(obj.velocity)
      obj.velocity.y -= 0.05
      obj.velocity.multiplyScalar(0.98)
      if (obj.position.y < 0.2) { obj.position.y = 0.2; obj.velocity.set(0, 0, 0) }
      obj.position.x = THREE.MathUtils.clamp(obj.position.x, -ROAD_WIDTH, ROAD_WIDTH)
    }
  })

  rider.update(scooter.mesh.position, scooter.mesh.quaternion)
  pillion.update(scooter.mesh.position, scooter.mesh.quaternion)

  // --- Broadcast state to pillion ---
  net.sendState({
    scooter: {
      px: scooter.mesh.position.x, py: scooter.mesh.position.y, pz: scooter.mesh.position.z,
      ry: scooter.mesh.rotation.y,
      speed: scooter.speed,
      rot: scooter.rotation,
    },
    rider: {
      px: rider.mesh.position.x, py: rider.mesh.position.y, pz: rider.mesh.position.z,
      on: rider.onScooter,
      vx: rider.velocity.x, vy: rider.velocity.y, vz: rider.velocity.z,
    },
    pillion: {
      px: pillion.mesh.position.x, py: pillion.mesh.position.y, pz: pillion.mesh.position.z,
      on: pillion.onScooter,
      vx: pillion.velocity.x, vy: pillion.velocity.y, vz: pillion.velocity.z,
    },
  })
}

// --- Game Loop (Client / Pillion) ---
// Pillion sends inputs and applies the host's state directly
function updateAsClient() {
  // Send my input to host (all keys, host uses W/S for speed + A/D for pillion recovery)
  const localKeys = {
    w: input.isDown('KeyW'),
    s: input.isDown('KeyS'),
    a: input.isDown('KeyA'),
    d: input.isDown('KeyD'),
  }
  const keyStr = `${localKeys.w}${localKeys.s}${localKeys.a}${localKeys.d}`
  if (keyStr !== lastSentKeys) {
    lastSentKeys = keyStr
    net.sendInput(localKeys)
  }

  // Apply host state if available
  if (receivedState) {
    const s = receivedState

    // Scooter
    scooter.mesh.position.set(s.scooter.px, s.scooter.py, s.scooter.pz)
    scooter.mesh.rotation.y = s.scooter.ry
    scooter.speed = s.scooter.speed
    scooter.rotation = s.scooter.rot

    // Rider
    rider.mesh.position.set(s.rider.px, s.rider.py, s.rider.pz)
    rider.onScooter = s.rider.on
    rider.velocity.set(s.rider.vx, s.rider.vy, s.rider.vz)
    if (rider.onScooter) {
      rider.mesh.quaternion.copy(scooter.mesh.quaternion)
    }

    // Pillion
    pillion.mesh.position.set(s.pillion.px, s.pillion.py, s.pillion.pz)
    pillion.onScooter = s.pillion.on
    pillion.velocity.set(s.pillion.vx, s.pillion.vy, s.pillion.vz)
    if (pillion.onScooter) {
      pillion.mesh.quaternion.copy(scooter.mesh.quaternion)
    }

    // Show recovery indicators for pillion's own character
    if (!pillion.onScooter) {
      pillion.showRecoveryRange(scooter.mesh.position)
    }
    if (!rider.onScooter) {
      rider.showRecoveryRange(scooter.mesh.position)
    }
  }
}

// --- Shared: Camera + UI (runs on both host and client) ---
function updateCameraAndUI() {
  const scooterPos = scooter.mesh.position

  let camTarget = new THREE.Vector3()
  let camOffset = new THREE.Vector3(0, 1.5, -3.5)

  if (rider.onScooter && pillion.onScooter) {
    camTarget.copy(scooterPos)
    camOffset.set(0, 1.5, -3.5).applyQuaternion(scooter.mesh.quaternion)
  } else {
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
  camera.position.lerp(camTarget.clone().add(camOffset), 0.05)

  // UI
  const isFinished = scooterPos.z > world.finishLinePos
  uiSpeed.innerText = `Speed: ${(scooter.speed * 100).toFixed(1)} | Rider: ${rider.onScooter ? 'ON' : 'OFF'} | Pillion: ${pillion.onScooter ? 'ON' : 'OFF'}`

  const distToFinish = world.finishLinePos - scooterPos.z
  uiDistance.innerText = `${Math.max(0, distToFinish).toFixed(0)}m`

  const dx = 0 - scooterPos.x
  const dz = world.finishLinePos - scooterPos.z
  uiWaypoint.style.transform = `rotate(${-Math.atan2(dx, dz)}rad)`
  uiHeading.style.transform = `rotate(${-scooter.mesh.rotation.y}rad)`

  if (isFinished) {
    uiSpeed.innerHTML += `<br><span style="color: #00ff00; font-size: 1.5em; font-weight: bold;">🏁 FINISHED! 🏁</span>`
  }
}

function animate() {
  if (!gameRunning) return
  requestAnimationFrame(animate)

  if (myRole === 'rider') {
    updateAsHost()
  } else {
    updateAsClient()
  }
  updateCameraAndUI()

  controls.update()
  renderer.render(scene, camera)
}
