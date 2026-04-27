import * as THREE from 'three'

export class Environment {
  constructor(scene) {
    this.scene = scene
    this.obstacles = []
    this.bumps = []
    this.createRoad()
    this.createDecorations()
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
    for (let i = -400; i < 400; i += 20) {
      if (Math.abs(i) < 10) continue

      // Trees
      const treeX = (Math.random() > 0.5 ? 1 : -1) * (7 + Math.random() * 5)
      const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3, 0.5), new THREE.MeshBasicMaterial({ color: 0x4d2926 }))
      trunk.position.set(treeX, 1.5, i)
      this.scene.add(trunk)
      const leaves = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial({ color: 0x228b22 }))
      leaves.position.set(treeX, 4, i)
      this.scene.add(leaves)

      // Obstacles (Cars)
      if (Math.random() > 0.7) {
        const carX = (Math.random() - 0.5) * 6
        const car = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4), new THREE.MeshBasicMaterial({ color: Math.random() * 0xffffff }))
        car.position.set(carX, 0.5, i + Math.random() * 10)
        this.scene.add(car)
        this.obstacles.push(car)
      }

      // Bumps
      if (Math.random() > 0.6) {
        const bumpX = (Math.random() - 0.5) * 8
        const bump = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 1), new THREE.MeshBasicMaterial({ color: 0x444444 }))
        bump.position.set(bumpX, 0.1, i + Math.random() * 10)
        this.scene.add(bump)
        this.bumps.push(bump)
      }
    }
  }
}
