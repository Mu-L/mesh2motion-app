import { type Object3D } from 'three'

export const PROP_USER_DATA_KEY = 'is_mesh2motion_prop'

export class PropsExportFilter {
  /**
   * Detaches every prop found under the given roots.
   * @returns a function that puts each prop back on its original parent
   */
  public static detach_props (roots: Object3D[]): () => void {
    const detached: Array<{ prop: Object3D, parent: Object3D }> = []

    roots.forEach((root) => {
      root.traverse((scene_object) => {
        if (scene_object.userData[PROP_USER_DATA_KEY] === true && scene_object.parent !== null) {
          detached.push({ prop: scene_object, parent: scene_object.parent })
        }
      })
    })

    // removed after traversal so the traversal does not skip siblings
    detached.forEach(({ prop, parent }) => { parent.remove(prop) })

    return () => {
      detached.forEach(({ prop, parent }) => { parent.add(prop) })
    }
  }
}
