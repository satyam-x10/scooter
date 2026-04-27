import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { InputManager } from './core/InputManager'
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

// --- Initialization ---
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x1a1a1a)
scene.fog = new THREE.Fog(0x1a1a1a, 50, 150)

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
camera.position.set(0, 3, -6)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
document.body.appendChild(renderer.domElement)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.05
controls.minDistance = 3
controls.maxDistance = 12
controls.maxPolarAngle = Math.PI / 2.1

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
scene.add(ambientLight)

const sunLight = new THREE.DirectionalLight(0xffffff, 0.8)
sunLight.position.set(10, 30, 10)
sunLight.castShadow = true
scene.add(sunLight)

const input = new InputManager()
const world = new Environment(scene)
const scooter = new Scooter(scene)
const rider = new Passenger(scene, 0x3366ff, 0.3, RECOVERY_DIST, ROAD_WIDTH)
const pillion = new Passenger(scene, 0xff3333, -0.3, RECOVERY_DIST, ROAD_WIDTH)

const uiSpeed = document.getElementById('speed')
const uiInstability = document.getElementById('instability')

// --- Game Logic ---
function update() {
  const bothOn = rider.onScooter && pillion.onScooter
  
  // Scooter Update
  scooter.update(ROAD_WIDTH, ACCEL, FRICTION, STEER_SENSITIVITY, input, bothOn)

  // Recovery Controls
  const moveSpeed = 0.15
  if (!rider.onScooter) {
    if (input.isDown('KeyW')) rider.mesh.position.z += moveSpeed
    if (input.isDown('KeyS')) rider.mesh.position.z -= moveSpeed
    if (input.isDown('KeyA')) rider.mesh.position.x += moveSpeed
    if (input.isDown('KeyD')) rider.mesh.position.x -= moveSpeed
    rider.showRecoveryRange(scooter.mesh.position)
    if (rider.tryRecover(scooter.mesh.position)) scooter.speed = 0
  }
  
  if (!pillion.onScooter) {
    if (input.isDown('ArrowUp')) pillion.mesh.position.z += moveSpeed
    if (input.isDown('ArrowDown')) pillion.mesh.position.z -= moveSpeed
    if (input.isDown('ArrowLeft')) pillion.mesh.position.x += moveSpeed
    if (input.isDown('ArrowRight')) pillion.mesh.position.x -= moveSpeed
    pillion.showRecoveryRange(scooter.mesh.position)
    if (pillion.tryRecover(scooter.mesh.position)) scooter.speed = 0
  }

  // Collisions
  const forward = scooter.getForward()
  const scooterPos = scooter.mesh.position

  // CURB COLLISION (Slowing only)
  const isOffRoad = Math.abs(scooterPos.x) > ROAD_WIDTH
  if (isOffRoad) {
    scooter.speed *= 0.8 // Slow down on curb
    // Keep within reasonable bounds but don't throw off
    scooter.mesh.position.x = THREE.MathUtils.clamp(scooterPos.x, -(ROAD_WIDTH + 0.1), ROAD_WIDTH + 0.1)
  }

  // Obstacles (Cars) - Refined collision
  world.obstacles.forEach(obj => {
    const dx = Math.abs(scooterPos.x - obj.position.x)
    const dz = Math.abs(scooterPos.z - obj.position.z)
    
    // AABB-like check for cars (width: 2, depth: 4)
    if (dx < 1.5 && dz < 2.5) {
      if (rider.onScooter || pillion.onScooter) {
        rider.fall(forward)
        pillion.fall(forward)
        // Hard bounce back and stop
        scooter.speed = -0.1 
        // Explicitly move OUT of the car to prevent tunneling
        const dir = Math.sign(scooterPos.z - obj.position.z)
        scooter.mesh.position.z += dir * 1.0 
      }
    }
  })

  // Bumps (Refined: Speed-sensitive)
  world.bumps.forEach(bump => {
    const dx = Math.abs(scooterPos.x - bump.position.x)
    const dz = Math.abs(scooterPos.z - bump.position.z)
    
    if (dx < 2.5 && dz < 0.8) {
      const currentSpeed = Math.abs(scooter.speed)
      if (currentSpeed > 0.15) { // High speed threshold
        if (rider.onScooter || pillion.onScooter) {
          rider.fall(forward)
          pillion.fall(forward)
          scooter.speed = -0.05
          scooter.mesh.position.y += 0.5
          scooter.mesh.position.z -= 0.5
        }
      } else {
        // Slow speed: Just pass over normally with a small bump animation
        const bumpY = Math.sin(dz * 2) * 0.1
        scooter.mesh.position.y = THREE.MathUtils.lerp(scooter.mesh.position.y, bumpY, 0.2)
      }
    } else {
      scooter.mesh.position.y = THREE.MathUtils.lerp(scooter.mesh.position.y, 0, 0.1)
    }
  })

  rider.update(scooter.mesh.position, scooter.mesh.quaternion)
  pillion.update(scooter.mesh.position, scooter.mesh.quaternion)

  // Camera Target
  let camTarget = scooter.mesh.position.clone()
  if (!rider.onScooter && !pillion.onScooter) {
    camTarget.addVectors(rider.mesh.position, pillion.mesh.position).multiplyScalar(0.5)
  } else if (!rider.onScooter) {
    camTarget.copy(rider.mesh.position)
  } else if (!pillion.onScooter) {
    camTarget.copy(pillion.mesh.position)
  }
  controls.target.lerp(camTarget, 0.1)
  
  // UI Update
  uiSpeed.innerText = `Speed: ${(scooter.speed * 100).toFixed(1)} | Rider: ${rider.onScooter ? 'ON' : 'OFF'} | Pillion: ${pillion.onScooter ? 'ON' : 'OFF'}`
}

function animate() {
  requestAnimationFrame(animate)
  update()
  controls.update()
  renderer.render(scene, camera)
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

animate()
