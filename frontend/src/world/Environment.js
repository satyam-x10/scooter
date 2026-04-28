// Seeded PRNG - Mulberry32
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

import * as THREE from 'three'

export class Environment {
  constructor(scene, seed = 12345) {
    this.scene = scene
    this.obstacles = []
    this.bumps = []
    this.fallenScooters = []
    this.fallenPlayers = []
    this.finishLinePos = 480
    this.rng = mulberry32(seed)
    this.createRoad()
    this.createDecorations()
    this.createFinishLine()
  }

  createRoad() {
    // Ground
    const groundGeo = new THREE.PlaneGeometry(1000, 1000)
    const groundMat = new THREE.MeshBasicMaterial({ color: 0x222222 })
    const ground = new THREE.Mesh(groundGeo, groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.01
    this.scene.add(ground)

    // Road
    const roadGeo = new THREE.PlaneGeometry(10, 1000)
    const roadMat = new THREE.MeshBasicMaterial({ color: 0x333333 })
    const road = new THREE.Mesh(roadGeo, roadMat)
    road.rotation.x = -Math.PI / 2
    this.scene.add(road)

    // Road Markers
    for (let i = -500; i < 500; i += 10) {
      const markerGeo = new THREE.PlaneGeometry(0.2, 3)
      const markerMat = new THREE.MeshBasicMaterial({ color: 0xaaaaaa })
      const marker = new THREE.Mesh(markerGeo, markerMat)
      marker.rotation.x = -Math.PI / 2
      marker.position.set(0, 0.01, i)
      this.scene.add(marker)
    }

    // Curbs
    const curbGeo = new THREE.BoxGeometry(0.5, 0.4, 1000)
    const curbMat = new THREE.MeshBasicMaterial({ color: 0x555555 })
    
    const leftCurb = new THREE.Mesh(curbGeo, curbMat)
    leftCurb.position.set(-5.25, 0.2, 0)
    this.scene.add(leftCurb)
    
    const rightCurb = new THREE.Mesh(curbGeo, curbMat)
    rightCurb.position.set(5.25, 0.2, 0)
    this.scene.add(rightCurb)
  }

  createDecorations() {
    const rng = this.rng

    for (let i = -400; i < 400; i += 20) {
      if (Math.abs(i) < 10) continue

      // Trees
      const treeX = (rng() > 0.5 ? 1 : -1) * (7 + rng() * 5)
      const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3, 0.5), new THREE.MeshBasicMaterial({ color: 0x4d2926 }))
      trunk.position.set(treeX, 1.5, i)
      this.scene.add(trunk)
      const leaves = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial({ color: 0x228b22 }))
      leaves.position.set(treeX, 4, i)
      this.scene.add(leaves)

      // Obstacles (Cars)
      if (rng() > 0.7) {
        const carX = (rng() - 0.5) * 6
        const car = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4), new THREE.MeshBasicMaterial({ color: rng() * 0xffffff }))
        car.position.set(carX, 0.5, i + rng() * 10)
        this.scene.add(car)
        this.obstacles.push(car)
      }

      // Bumps
      if (rng() > 0.6) {
        const bumpX = (rng() - 0.5) * 8
        const bump = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 1), new THREE.MeshBasicMaterial({ color: 0x444444 }))
        bump.position.set(bumpX, 0.1, i + rng() * 10)
        this.scene.add(bump)
        this.bumps.push(bump)
      }

      // Mock Fallen Scooters
      if (rng() > 0.8) {
        const fsX = (rng() - 0.5) * 6
        const fs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 1.5), new THREE.MeshStandardMaterial({ color: 0xff8800, emissive: 0x442200 }))
        fs.position.set(fsX, 0.05, i + 5)
        fs.rotation.z = Math.PI / 2 // Fallen on side
        this.scene.add(fs)
        this.fallenScooters.push(fs)
      }

      // Mock Fallen Players
      if (rng() > 0.7) {
        const fpX = (rng() - 0.5) * 7
        const fp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: 0xcc00ff, emissive: 0x220033 }))
        fp.position.set(fpX, 0.2, i - 5)
        fp.velocity = new THREE.Vector3() // For being kicked away
        this.scene.add(fp)
        this.fallenPlayers.push(fp)
      }
    }
  }

  createFinishLine() {
    const archGroup = new THREE.Group()
    
    // Left Pillar
    const pillarL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 8, 0.5), new THREE.MeshStandardMaterial({ color: 0x444444 }))
    pillarL.position.set(-5, 4, this.finishLinePos)
    archGroup.add(pillarL)

    // Right Pillar
    const pillarR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 8, 0.5), new THREE.MeshStandardMaterial({ color: 0x444444 }))
    pillarR.position.set(5, 4, this.finishLinePos)
    archGroup.add(pillarR)

    // Top Beam
    const beam = new THREE.Mesh(new THREE.BoxGeometry(10.5, 1, 0.5), new THREE.MeshStandardMaterial({ color: 0x333333 }))
    beam.position.set(0, 8, this.finishLinePos)
    archGroup.add(beam)

    // "FINISH" Sign
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x004400 }))
    sign.position.set(0, 8, this.finishLinePos + 0.3)
    archGroup.add(sign)

    this.scene.add(archGroup)
  }
}
