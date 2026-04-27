import './style.css'
import * as THREE from 'three'

// --- Scene Setup ---
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x1a1a1a)
scene.fog = new THREE.Fog(0x1a1a1a, 20, 100)

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
document.body.appendChild(renderer.domElement)

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
scene.add(ambientLight)

const sunLight = new THREE.DirectionalLight(0xffffff, 0.8)
sunLight.position.set(10, 20, 10)
sunLight.castShadow = true
scene.add(sunLight)

// --- Ground ---
const groundGeo = new THREE.PlaneGeometry(200, 200)
const groundMat = new THREE.MeshBasicMaterial({ color: 0x333333 })
const ground = new THREE.Mesh(groundGeo, groundMat)
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
scene.add(ground)

// Add a grid helper for sense of movement
const gridHelper = new THREE.GridHelper(200, 50, 0x444444, 0x222222)
scene.add(gridHelper)

// --- Scooter Creation ---
const scooterGroup = new THREE.Group()

// Body (long cube)
const bodyGeo = new THREE.BoxGeometry(0.4, 0.1, 1.2)
const bodyMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 })
const body = new THREE.Mesh(bodyGeo, bodyMat)
body.position.y = 0.1
body.castShadow = true
scooterGroup.add(body)

// Front marker (small cube)
const frontGeo = new THREE.BoxGeometry(0.3, 0.4, 0.1)
const frontMat = new THREE.MeshBasicMaterial({ color: 0x3366ff })
const frontMarker = new THREE.Mesh(frontGeo, frontMat)
frontMarker.position.set(0, 0.3, 0.5)
frontMarker.castShadow = true
scooterGroup.add(frontMarker)

// Back marker (small cube)
const backGeo = new THREE.BoxGeometry(0.3, 0.2, 0.1)
const backMat = new THREE.MeshBasicMaterial({ color: 0xff3333 })
const backMarker = new THREE.Mesh(backGeo, backMat)
backMarker.position.set(0, 0.2, -0.5)
backMarker.castShadow = true
scooterGroup.add(backMarker)

scene.add(scooterGroup)

// --- Control State ---
const keys = {
  w: false,
  s: false,
  a: false,
  d: false
}

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase()
  if (keys.hasOwnProperty(key)) keys[key] = true
})

window.addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase()
  if (keys.hasOwnProperty(key)) keys[key] = false
})

// --- Movement Variables ---
let speed = 0
let rotation = 0
let driftFactor = 0
const maxSpeed = 0.4
const acceleration = 0.005
const friction = 0.98
const steeringSensitivity = 0.04

// UI Elements
const speedEl = document.getElementById('speed')
const instabilityEl = document.getElementById('instability')

// --- Main Loop ---
function animate() {
  requestAnimationFrame(animate)

  // 1. Acceleration / Braking (Player 2)
  if (keys.w) speed += acceleration
  if (keys.s) speed -= acceleration * 1.5 // Braking is stronger
  
  speed *= friction // Constant air/ground resistance
  if (Math.abs(speed) < 0.001) speed = 0

  // 2. Steering (Player 1)
  // Steering effectiveness decreases slightly at extreme speeds
  const steeringEffect = steeringSensitivity * (1 - Math.abs(speed) / (maxSpeed * 2))
  
  if (keys.a) rotation += steeringEffect
  if (keys.d) rotation -= steeringEffect

  // 3. Instability / Drift (VERY IMPORTANT)
  // At high speeds, the scooter "slides" more
  const speedRatio = Math.abs(speed) / maxSpeed
  const instability = Math.pow(speedRatio, 2) // Non-linear increase
  
  // Drift: a side-ways component to movement when turning at speed
  // If we are turning (keys.a or keys.d), we apply drift
  let targetDrift = 0
  if (keys.a) targetDrift = -instability * 0.05
  if (keys.d) targetDrift = instability * 0.05
  
  // Smooth drift factor transitions
  driftFactor = THREE.MathUtils.lerp(driftFactor, targetDrift, 0.1)

  // 4. Update Position
  // Forward movement based on speed
  scooterGroup.translateZ(speed)
  // Apply rotation
  scooterGroup.rotation.y = rotation
  // Apply drift (side-ways movement)
  scooterGroup.translateX(driftFactor)

  // Subtle tilt and wobble based on steering and speed
  const wobble = Math.sin(Date.now() * 0.02) * instability * 0.1
  scooterGroup.rotation.z = THREE.MathUtils.lerp(scooterGroup.rotation.z, (-driftFactor * 5) + wobble, 0.1)

  // 5. Camera Follow (Smooth lerp)
  const cameraTargetPos = new THREE.Vector3()
  // Dynamic camera distance based on speed
  const camDist = 5 + speedRatio * 2
  const camHeight = 2 + speedRatio * 0.5
  const offset = new THREE.Vector3(0, camHeight, -camDist)
  offset.applyQuaternion(scooterGroup.quaternion)
  cameraTargetPos.addVectors(scooterGroup.position, offset)
  
  camera.position.lerp(cameraTargetPos, 0.1)
  camera.lookAt(scooterGroup.position.clone().add(new THREE.Vector3(0, 0.5, 0)))

  // 6. Update UI
  speedEl.innerText = `Speed: ${(speed * 100).toFixed(1)}`
  instabilityEl.innerText = `Instability: ${(instability * 100).toFixed(0)}%`

  renderer.render(scene, camera)
}

// Handle Window Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

animate()
