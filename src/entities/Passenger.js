import * as THREE from 'three'

export class Passenger {
  constructor(scene, color, offsetZ, recoveryDist, roadWidth) {
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.4, 0.4),
      new THREE.MeshBasicMaterial({ color })
    )
    this.offsetZ = offsetZ
    this.onScooter = true
    this.velocity = new THREE.Vector3()
    this.recoveryDist = recoveryDist
    this.roadWidth = roadWidth
    this.recoveryTimestamp = 0
    this.mesh.position.y = 0.5
    scene.add(this.mesh)
  }

  update(scooterPos, scooterQuat) {
    if (this.onScooter) {
      const offset = new THREE.Vector3(0, 0.4, this.offsetZ).applyQuaternion(scooterQuat)
      this.mesh.position.copy(scooterPos).add(offset)
      this.mesh.quaternion.copy(scooterQuat)
    } else {
      // Physics for flying/falling
      this.velocity.y -= 0.01 // Gravity
      this.mesh.position.add(this.velocity)
      
      // Clamp to road during flight
      this.mesh.position.x = THREE.MathUtils.clamp(this.mesh.position.x, -this.roadWidth, this.roadWidth)

      if (this.mesh.position.y < 0.2) {
        this.mesh.position.y = 0.2
        this.velocity.set(0, 0, 0)
      }
    }
  }

  fall(impactVelocity) {
    if (!this.onScooter) return
    // Immunity check (1 second cooldown after re-mounting)
    if (Date.now() - this.recoveryTimestamp < 1000) return

    this.onScooter = false
    // Dramatic toss
    this.velocity.copy(impactVelocity).multiplyScalar(2.0)
    this.velocity.y = 0.3 + Math.random() * 0.3
    this.velocity.x += (Math.random() - 0.5) * 0.5
  }

  tryRecover(scooterPos) {
    if (this.onScooter) return false
    const dist = this.mesh.position.distanceTo(scooterPos)
    if (dist < this.recoveryDist) {
      this.onScooter = true
      this.mesh.scale.setScalar(1.0)
      this.recoveryTimestamp = Date.now()
      return true
    }
    return false
  }

  showRecoveryRange(scooterPos) {
    if (this.onScooter) return
    const dist = this.mesh.position.distanceTo(scooterPos)
    if (dist < this.recoveryDist) {
      this.mesh.scale.setScalar(1.2 + Math.sin(Date.now() * 0.01) * 0.2)
    } else {
      this.mesh.scale.setScalar(1.0)
    }
  }
}
