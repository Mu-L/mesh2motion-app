import { CylinderGeometry, Group, Mesh, MeshStandardMaterial } from 'three'

export class ProceduralPropBuilder {
  // sized in meters for a rig at skeleton scale 1.0
  public static create_pole (): Group {
    return this.create_rod('pole', true)
  }

  public static create_staff (): Group {
    return this.create_rod('staff', false)
  }

  private static create_rod (name: string, origin_at_base: boolean): Group {
    const pole_group = new Group()

    const geometry = new CylinderGeometry(0.018, 0.018, 1.7, 12)
    const material = new MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.8, metalness: 0.0 })
    const pole_mesh = new Mesh(geometry, material)
    pole_mesh.name = `prop_${name}_mesh`
    pole_mesh.castShadow = true
    if (origin_at_base) {
      pole_mesh.position.y = 0.75
    }

    pole_group.add(pole_mesh)
    return pole_group
  }
}
