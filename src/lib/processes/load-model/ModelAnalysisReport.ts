import { Box3, Vector3, type BufferGeometry, type Material, type Mesh, type Object3D } from 'three'
import { ModalDialog } from '../../ModalDialog.ts'

/**
 * Snapshot of a single mesh-bearing object, taken at a point in time so later
 * processing steps cannot change the numbers we are reporting on.
 */
export interface AnalyzedObject {
  name: string
  type: string
  parent_name: string
  depth: number
  position: Vector3
  rotation_degrees: Vector3
  scale: Vector3
  world_scale: Vector3
  world_size: Vector3
  // parent objects between this mesh and the scene root that carry their own transform
  transformed_ancestors: string[]
  vertex_count: number
  triangle_count: number
  material_summary: string
  has_uvs: boolean
  has_normals: boolean
  has_skin_weights: boolean
  warnings: string[]
}

/** Everything we can say about one scene graph at one moment. */
export interface SceneSnapshot {
  objects: AnalyzedObject[]
  type_counts: Record<string, number>
  mesh_count: number
  skinned_mesh_count: number
  vertex_count: number
  triangle_count: number
  world_size: Vector3
  world_min: Vector3
  world_max: Vector3
}

/**
 * Before/after pair for one import. `imported` is what came out of the file
 * loader and `processed` is the mesh data the rest of the app actually works
 * with, which makes it possible to see what import processing changed.
 */
export interface ModelImportAnalysis {
  source_name: string
  imported: SceneSnapshot
  processed: SceneSnapshot
}

/** A warning message plus the objects it applies to, for grouped display. */
interface GroupedWarning {
  message: string
  object_names: string[]
}

/**
 * Builds a human readable report of what a model file contained and what the
 * import turned it into. Purely diagnostic - nothing here mutates model data
 * beyond lazily computing geometry bounding boxes.
 */
export class ModelAnalysisReport {
  // object transforms this far from identity are treated as intentional
  private static readonly TRANSFORM_EPSILON = 0.0001

  // rotation this far from zero (in degrees) is treated as intentional
  private static readonly ROTATION_EPSILON_DEGREES = 0.01

  /**
   * Walk a scene and record everything worth reporting on.
   * @param scene_object root of the scene graph to inspect
   */
  public static snapshot_scene (scene_object: Object3D): SceneSnapshot {
    // world matrices drive the world scale/size numbers below
    scene_object.updateMatrixWorld(true)

    const objects: AnalyzedObject[] = []
    const type_counts: Record<string, number> = {}
    const scene_box: Box3 = new Box3()

    let vertex_count = 0
    let triangle_count = 0
    let mesh_count = 0
    let skinned_mesh_count = 0

    scene_object.traverse((child: Object3D) => {
      // the root itself isn't part of the file's contents listing
      if (child !== scene_object) {
        type_counts[child.type] = (type_counts[child.type] ?? 0) + 1
      }

      if (child.type !== 'Mesh' && child.type !== 'SkinnedMesh') {
        return
      }

      const analyzed: AnalyzedObject = this.analyze_mesh(child as Mesh, scene_object)
      objects.push(analyzed)

      vertex_count += analyzed.vertex_count
      triangle_count += analyzed.triangle_count
      if (child.type === 'SkinnedMesh') {
        skinned_mesh_count++
      } else {
        mesh_count++
      }

      const mesh_box: Box3 = this.world_box_for_mesh(child as Mesh)
      if (!mesh_box.isEmpty()) {
        scene_box.union(mesh_box)
      }
    })

    return {
      objects,
      type_counts,
      mesh_count,
      skinned_mesh_count,
      vertex_count,
      triangle_count,
      world_size: scene_box.isEmpty() ? new Vector3() : scene_box.getSize(new Vector3()),
      world_min: scene_box.isEmpty() ? new Vector3() : scene_box.min.clone(),
      world_max: scene_box.isEmpty() ? new Vector3() : scene_box.max.clone()
    }
  }

  private static analyze_mesh (mesh: Mesh, scene_root: Object3D): AnalyzedObject {
    const geometry: BufferGeometry = mesh.geometry
    const position_attribute = geometry.getAttribute('position')
    const world_box: Box3 = this.world_box_for_mesh(mesh)

    const analyzed: AnalyzedObject = {
      name: mesh.name === '' ? '(unnamed)' : mesh.name,
      type: mesh.type,
      parent_name: this.parent_label(mesh, scene_root),
      depth: this.depth_in_scene(mesh, scene_root),
      position: mesh.position.clone(),
      rotation_degrees: new Vector3(
        this.radians_to_degrees(mesh.rotation.x),
        this.radians_to_degrees(mesh.rotation.y),
        this.radians_to_degrees(mesh.rotation.z)
      ),
      scale: mesh.scale.clone(),
      world_scale: mesh.getWorldScale(new Vector3()),
      world_size: world_box.isEmpty() ? new Vector3() : world_box.getSize(new Vector3()),
      transformed_ancestors: this.find_transformed_ancestors(mesh, scene_root),
      vertex_count: position_attribute === undefined ? 0 : position_attribute.count,
      triangle_count: this.count_triangles(geometry),
      material_summary: this.describe_material(mesh.material),
      has_uvs: geometry.getAttribute('uv') !== undefined,
      has_normals: geometry.getAttribute('normal') !== undefined,
      has_skin_weights: geometry.getAttribute('skinWeight') !== undefined,
      warnings: []
    }

    analyzed.warnings = this.collect_object_warnings(analyzed)
    return analyzed
  }

  /**
   * Bounding box of just this mesh's own geometry in world space. Deliberately
   * not Box3.setFromObject, which would fold in child meshes as well.
   */
  private static world_box_for_mesh (mesh: Mesh): Box3 {
    const box: Box3 = new Box3()
    const geometry: BufferGeometry = mesh.geometry

    if (geometry.getAttribute('position') === undefined) {
      return box
    }

    if (geometry.boundingBox === null) {
      geometry.computeBoundingBox()
    }

    if (geometry.boundingBox !== null) {
      box.copy(geometry.boundingBox).applyMatrix4(mesh.matrixWorld)
    }

    return box
  }

  private static count_triangles (geometry: BufferGeometry): number {
    const index = geometry.getIndex()
    if (index !== null) {
      return Math.floor(index.count / 3)
    }

    const position_attribute = geometry.getAttribute('position')
    if (position_attribute === undefined) {
      return 0
    }

    return Math.floor(position_attribute.count / 3)
  }

  private static describe_material (material: Material | Material[]): string {
    if (Array.isArray(material)) {
      if (material.length === 0) {
        return 'none'
      }
      return `${material.length} materials: ` + material.map((entry) => this.describe_single_material(entry)).join(', ')
    }

    if (material === undefined || material === null) {
      return 'none'
    }

    return this.describe_single_material(material)
  }

  private static describe_single_material (material: Material): string {
    const parts: string[] = [material.type]

    if (material.name !== '') {
      parts.push(`"${material.name}"`)
    }

    // a missing texture map is a common reason a model imports looking flat/grey
    const has_map: boolean = (material as any).map !== undefined && (material as any).map !== null
    parts.push(has_map ? 'textured' : 'no texture')

    parts.push(this.describe_material_side(material.side))

    return parts.join(' / ')
  }

  private static describe_material_side (side: number): string {
    switch (side) {
      case 1: return 'back faces'
      case 2: return 'double sided'
      default: return 'front faces'
    }
  }

  /**
   * Transforms themselves are no longer a problem, since import bakes them into
   * the vertices. What is left are the transforms that stay visible in the result
   * either way, plus missing geometry data.
   */
  private static collect_object_warnings (analyzed: AnalyzedObject): string[] {
    const warnings: string[] = []

    if (!this.is_uniform_scale(analyzed.scale)) {
      warnings.push('Object scale is non-uniform (different per axis). The mesh is stretched on one axis, which carries through to the skinning.')
    }

    if (analyzed.scale.x < 0 || analyzed.scale.y < 0 || analyzed.scale.z < 0) {
      warnings.push('Object is mirrored (negative scale). Import applies the mirror and reverses the face winding to compensate, so double check this part looks right.')
    }

    if (analyzed.vertex_count === 0) {
      warnings.push('Mesh has no vertex data.')
    }

    if (!analyzed.has_normals) {
      warnings.push('Mesh has no normals, so it will shade incorrectly.')
    }

    if (!analyzed.has_uvs) {
      warnings.push('Mesh has no UV coordinates, so textures cannot be applied.')
    }

    if (analyzed.type === 'SkinnedMesh') {
      warnings.push('Mesh is already rigged. This workflow drops the existing skeleton - use "Use Your Rigged Model" to keep it.')
    }

    return warnings
  }

  /** Scene wide observations that no single object can tell us. */
  private static collect_scene_warnings (analysis: ModelImportAnalysis): string[] {
    const warnings: string[] = []
    const imported: SceneSnapshot = analysis.imported
    const processed: SceneSnapshot = analysis.processed

    if (imported.objects.length === 0) {
      warnings.push('No meshes were found in the file.')
      return warnings
    }

    const imported_size: Vector3 = imported.world_size
    const largest_dimension: number = Math.max(imported_size.x, imported_size.y, imported_size.z)

    if (largest_dimension <= 0.5 || largest_dimension >= 20) {
      warnings.push(`Model came in at ${this.format_number(largest_dimension)} units across, so import auto-scaled it to a workable size.`)
    }

    if (imported_size.z > imported_size.y * 1.25) {
      warnings.push('Model is deeper than it is tall, which usually means it is Z-up or lying down. Use the rotate buttons to stand it up.')
    }

    // baking transforms means the model keeps its authored placement, which is
    // correct but can leave it sitting away from the origin where the skeleton loads
    const offset_from_origin: number = Math.max(
      Math.abs(processed.world_min.x + processed.world_max.x) / 2,
      Math.abs(processed.world_min.z + processed.world_max.z) / 2
    )
    const model_height: number = Math.max(processed.world_size.y, 0.001)

    if (offset_from_origin > model_height) {
      warnings.push(`Model sits about ${this.format_number(offset_from_origin)} units away from the origin, which is where the skeleton loads. Use "Reset position" or the move gizmo to bring it back.`)
    }

    const imported_mesh_total: number = imported.mesh_count + imported.skinned_mesh_count
    if (processed.mesh_count !== imported_mesh_total) {
      warnings.push(`File contained ${imported_mesh_total} meshes but ${processed.mesh_count} made it through import.`)
    }

    return warnings
  }

  /**
   * Show the report in a dialog.
   * @param analysis report data, or null when nothing has been imported yet
   */
  public static show_dialog (analysis: ModelImportAnalysis | null): void {
    const content: string = analysis === null
      ? '<p>No model has been imported yet.</p>'
      : this.build_html(analysis)

    new ModalDialog('Model Analysis', content, { customClass: 'model-analysis-dialog' }).show()
  }

  public static build_html (analysis: ModelImportAnalysis): string {
    return `
      <div class="model-analysis">
        <p class="model-analysis-source">Source: <strong>${this.escape_html(analysis.source_name)}</strong></p>
        ${this.build_warnings_html(analysis)}
        ${this.build_summary_html(analysis)}
        ${this.build_mesh_table_html(analysis.imported)}
        ${this.build_contents_html(analysis.imported)}
      </div>
    `
  }

  private static build_warnings_html (analysis: ModelImportAnalysis): string {
    const scene_warnings: string[] = this.collect_scene_warnings(analysis)
    const grouped_warnings: GroupedWarning[] = this.group_object_warnings(analysis.imported)

    if (scene_warnings.length === 0 && grouped_warnings.length === 0) {
      return '<p class="model-analysis-clean">Nothing unusual found. The model imported cleanly.</p>'
    }

    const scene_items: string = scene_warnings
      .map((message) => `<li>${this.escape_html(message)}</li>`)
      .join('')

    const object_items: string = grouped_warnings
      .map((warning) => `
        <li>
          ${this.escape_html(warning.message)}
          <span class="model-analysis-affected">${this.escape_html(warning.object_names.join(', '))}</span>
        </li>
      `)
      .join('')

    return `
      <h3>Things to check</h3>
      <ul class="model-analysis-warnings">${scene_items}${object_items}</ul>
    `
  }

  /** Collapse identical per-object warnings into one row listing the objects. */
  private static group_object_warnings (snapshot: SceneSnapshot): GroupedWarning[] {
    const grouped = new Map<string, GroupedWarning>()

    snapshot.objects.forEach((analyzed) => {
      analyzed.warnings.forEach((message) => {
        const existing: GroupedWarning | undefined = grouped.get(message)
        if (existing === undefined) {
          grouped.set(message, { message, object_names: [analyzed.name] })
        } else {
          existing.object_names.push(analyzed.name)
        }
      })
    })

    return Array.from(grouped.values())
  }

  private static build_summary_html (analysis: ModelImportAnalysis): string {
    const imported: SceneSnapshot = analysis.imported
    const processed: SceneSnapshot = analysis.processed

    const rows: string = [
      ['Meshes', String(imported.mesh_count), String(processed.mesh_count)],
      ['Rigged meshes', String(imported.skinned_mesh_count), String(processed.skinned_mesh_count)],
      ['Vertices', imported.vertex_count.toLocaleString(), processed.vertex_count.toLocaleString()],
      ['Triangles', imported.triangle_count.toLocaleString(), processed.triangle_count.toLocaleString()],
      ['Size (X x Y x Z)', this.format_vector(imported.world_size, ' x '), this.format_vector(processed.world_size, ' x ')],
      ['Lowest point (Y)', this.format_number(imported.world_min.y), this.format_number(processed.world_min.y)]
    ]
      .map(([label, imported_value, processed_value]) => `
        <tr>
          <th scope="row">${this.escape_html(label)}</th>
          <td>${this.escape_html(imported_value)}</td>
          <td>${this.escape_html(processed_value)}</td>
        </tr>
      `)
      .join('')

    return `
      <h3>Summary</h3>
      <div class="model-analysis-table-scroll">
        <table class="model-analysis-table">
          <thead>
            <tr>
              <th scope="col"></th>
              <th scope="col">In the file</th>
              <th scope="col">After import</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `
  }

  private static build_mesh_table_html (snapshot: SceneSnapshot): string {
    if (snapshot.objects.length === 0) {
      return ''
    }

    const rows: string = snapshot.objects
      .map((analyzed) => `
        <tr${analyzed.warnings.length > 0 ? ' class="model-analysis-row-flagged"' : ''}>
          <td>
            <span class="model-analysis-name" style="padding-left: ${analyzed.depth * 0.75}rem">${this.escape_html(analyzed.name)}</span>
            <span class="model-analysis-parent">${this.escape_html(this.describe_parentage(analyzed))}</span>
          </td>
          <td>${this.escape_html(analyzed.type)}</td>
          <td>${this.escape_html(this.format_vector(analyzed.position))}</td>
          <td>${this.escape_html(this.format_vector(analyzed.rotation_degrees))}</td>
          <td>${this.escape_html(this.format_vector(analyzed.scale))}</td>
          <td>${this.escape_html(this.format_vector(analyzed.world_scale))}</td>
          <td>${this.escape_html(this.format_vector(analyzed.world_size, ' x '))}</td>
          <td>${analyzed.vertex_count.toLocaleString()}</td>
          <td>${analyzed.triangle_count.toLocaleString()}</td>
          <td>${this.escape_html(analyzed.material_summary)}</td>
        </tr>
      `)
      .join('')

    return `
      <h3>Meshes in the file (${snapshot.objects.length})</h3>
      <p class="model-analysis-note">Transforms below are as authored in the file, and are baked into the vertices on import so the model keeps this orientation, placement, and scale. Rotation is in degrees. World scale includes any scale inherited from parent objects.</p>
      <div class="model-analysis-table-scroll">
        <table class="model-analysis-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Type</th>
              <th scope="col">Position</th>
              <th scope="col">Rotation</th>
              <th scope="col">Scale</th>
              <th scope="col">World scale</th>
              <th scope="col">Size</th>
              <th scope="col">Verts</th>
              <th scope="col">Tris</th>
              <th scope="col">Material</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `
  }

  private static build_contents_html (snapshot: SceneSnapshot): string {
    const type_names: string[] = Object.keys(snapshot.type_counts).sort()

    if (type_names.length === 0) {
      return ''
    }

    const chips: string = type_names
      .map((type_name) => `<span class="model-analysis-chip">${this.escape_html(type_name)} x ${snapshot.type_counts[type_name]}</span>`)
      .join('')

    return `
      <h3>Everything in the file</h3>
      <div class="model-analysis-chips">${chips}</div>
    `
  }

  /**
   * One line describing where a mesh sits and whether anything above it is
   * contributing a transform, which is what makes the world scale column differ
   * from the plain scale column.
   */
  private static describe_parentage (analyzed: AnalyzedObject): string {
    if (analyzed.transformed_ancestors.length === 0) {
      return `in ${analyzed.parent_name}`
    }

    // the parent line already names it, so avoid saying the same thing twice
    if (analyzed.transformed_ancestors.length === 1 && analyzed.transformed_ancestors[0] === analyzed.parent_name) {
      return `in ${analyzed.parent_name} (transformed)`
    }

    return `in ${analyzed.parent_name}, transformed by ${analyzed.transformed_ancestors.join(', ')}`
  }

  private static parent_label (object_3d: Object3D, scene_root: Object3D): string {
    const parent: Object3D | null = object_3d.parent

    if (parent === null || parent === scene_root) {
      return 'scene root'
    }

    return parent.name === '' ? `(unnamed ${parent.type})` : parent.name
  }

  /**
   * Names of the parent objects a mesh inherits a transform from. Import flattens
   * the hierarchy, so a mesh can be positioned entirely by its parents and still
   * look perfectly fine on its own row of the report.
   */
  private static find_transformed_ancestors (object_3d: Object3D, scene_root: Object3D): string[] {
    const ancestors: string[] = []
    let current: Object3D | null = object_3d.parent

    while (current !== null && current !== scene_root) {
      const has_transform: boolean = !this.is_zero_vector(current.position) ||
        !this.is_unit_vector(current.scale) ||
        !this.is_zero_rotation(new Vector3(
          this.radians_to_degrees(current.rotation.x),
          this.radians_to_degrees(current.rotation.y),
          this.radians_to_degrees(current.rotation.z)
        ))

      if (has_transform) {
        ancestors.push(current.name === '' ? `(unnamed ${current.type})` : current.name)
      }

      current = current.parent
    }

    return ancestors
  }

  private static depth_in_scene (object_3d: Object3D, scene_root: Object3D): number {
    let depth = 0
    let current: Object3D | null = object_3d.parent

    while (current !== null && current !== scene_root) {
      depth++
      current = current.parent
    }

    return depth
  }

  private static is_zero_vector (vector: Vector3): boolean {
    return Math.abs(vector.x) < this.TRANSFORM_EPSILON &&
      Math.abs(vector.y) < this.TRANSFORM_EPSILON &&
      Math.abs(vector.z) < this.TRANSFORM_EPSILON
  }

  private static is_unit_vector (vector: Vector3): boolean {
    return Math.abs(vector.x - 1) < this.TRANSFORM_EPSILON &&
      Math.abs(vector.y - 1) < this.TRANSFORM_EPSILON &&
      Math.abs(vector.z - 1) < this.TRANSFORM_EPSILON
  }

  /**
   * Compares magnitudes so a straight mirror (-1, 1, 1) counts as uniform and
   * only gets reported once, by the negative scale check.
   */
  private static is_uniform_scale (vector: Vector3): boolean {
    return Math.abs(Math.abs(vector.x) - Math.abs(vector.y)) < this.TRANSFORM_EPSILON &&
      Math.abs(Math.abs(vector.y) - Math.abs(vector.z)) < this.TRANSFORM_EPSILON
  }

  private static is_zero_rotation (rotation_degrees: Vector3): boolean {
    return Math.abs(rotation_degrees.x) < this.ROTATION_EPSILON_DEGREES &&
      Math.abs(rotation_degrees.y) < this.ROTATION_EPSILON_DEGREES &&
      Math.abs(rotation_degrees.z) < this.ROTATION_EPSILON_DEGREES
  }

  private static radians_to_degrees (radians: number): number {
    return radians * 180 / Math.PI
  }

  private static format_vector (vector: Vector3, separator: string = ', '): string {
    return [vector.x, vector.y, vector.z].map((value) => this.format_number(value)).join(separator)
  }

  /**
   * Keep numbers short enough to scan while still showing tiny/huge values. A
   * scale of 0.0001 is exactly the kind of thing we want visible, so anything
   * that would round away to zero switches to exponent form instead. Only
   * floating point noise is reported as a flat zero.
   */
  public static format_number (value: number, digits: number = 3): string {
    if (!isFinite(value)) {
      return '-'
    }

    const magnitude: number = Math.abs(value)

    if (magnitude < 0.000001) {
      return '0'
    }

    if (magnitude >= 100000 || magnitude < 0.001) {
      return value.toExponential(2)
    }

    return String(Number(value.toFixed(digits)))
  }

  private static escape_html (value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }
}
