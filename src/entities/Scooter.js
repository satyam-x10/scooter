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

  /**
   * @param {number} roadWidth
   * @param {number} accel
   * @param {number} friction
   * @param {number} steerSens
   * @param {object} riderKeys  - { a: bool, d: bool } steering from rider
   * @param {object} pillionKeys - { w: bool, s: bool } throttle from pillion
   * @param {boolean} canDrive
   */
  update(roadWidth, accel, friction, steerSens, riderKeys, pillionKeys, canDrive) {
    if (canDrive) {
      // Pillion controls speed (W/S)
      if (pillionKeys.w) this.speed += accel
      if (pillionKeys.s) this.speed -= accel * 2
      // Rider controls direction (A/D)
      if (riderKeys.a) this.rotation += steerSens
      if (riderKeys.d) this.rotation -= steerSens
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
