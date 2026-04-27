import * as THREE from 'three'

export class Scooter {
  constructor(scene) {
    this.mesh = new THREE.Group()
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.1, 1.5),
      new THREE.MeshBasicMaterial({ color: 0xffcc00 })
    )
    body.position.y = 0.1
    this.mesh.add(body)
    scene.add(this.mesh)
    
    this.speed = 0
    this.rotation = 0
  }

  update(roadWidth, accel, friction, steerSens, keys, canDrive) {
    if (canDrive) {
      if (keys.isDown('KeyW')) this.speed += accel
      if (keys.isDown('KeyS')) this.speed -= accel * 2
      if (keys.isDown('KeyA')) this.rotation += steerSens
      if (keys.isDown('KeyD')) this.rotation -= steerSens
    } else {
      this.speed *= 0.95
    }

    this.speed *= friction
    if (Math.abs(this.speed) < 0.001) this.speed = 0

    this.mesh.translateZ(this.speed)
    this.mesh.rotation.y = this.rotation
  }

  getForward() {
    return new THREE.Vector3(0, 0, 1).applyQuaternion(this.mesh.quaternion).multiplyScalar(this.speed)
  }
}
