import { describe, it, expect } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Scene } from 'three'
import { ModelAnalysisReport, type SceneSnapshot } from './ModelAnalysisReport'

/** A 1x1x1 box mesh with a name, so snapshots have something real to measure. */
function make_mesh (name: string): Mesh {
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())
  mesh.name = name
  return mesh
}

describe('ModelAnalysisReport.snapshot_scene', () => {
  it('counts meshes, vertices, and triangles', () => {
    const scene = new Scene()
    scene.add(make_mesh('body'))
    scene.add(make_mesh('head'))

    const snapshot: SceneSnapshot = ModelAnalysisReport.snapshot_scene(scene)

    expect(snapshot.mesh_count).toBe(2)
    expect(snapshot.skinned_mesh_count).toBe(0)
    expect(snapshot.objects.map((entry) => entry.name)).toEqual(['body', 'head'])
    // BoxGeometry is indexed: 36 indices -> 12 triangles per box
    expect(snapshot.triangle_count).toBe(24)
    expect(snapshot.vertex_count).toBe(48)
  })

  it('reports the union of mesh bounds in world space', () => {
    const scene = new Scene()
    const first = make_mesh('left')
    first.position.set(-2, 0, 0)
    const second = make_mesh('right')
    second.position.set(2, 0, 0)
    scene.add(first, second)

    const snapshot: SceneSnapshot = ModelAnalysisReport.snapshot_scene(scene)

    // -2.5 to 2.5 across X, single unit box on the other axes
    expect(snapshot.world_size.x).toBeCloseTo(5)
    expect(snapshot.world_size.y).toBeCloseTo(1)
    expect(snapshot.world_min.x).toBeCloseTo(-2.5)
  })

  it('includes scale inherited from parent groups in world scale', () => {
    const scene = new Scene()
    const group = new Group()
    group.name = 'rig_root'
    group.scale.set(2, 2, 2)
    const mesh = make_mesh('body')
    mesh.scale.set(3, 3, 3)
    group.add(mesh)
    scene.add(group)

    const snapshot: SceneSnapshot = ModelAnalysisReport.snapshot_scene(scene)
    const analyzed = snapshot.objects[0]

    expect(analyzed.scale.x).toBeCloseTo(3)
    expect(analyzed.world_scale.x).toBeCloseTo(6)
    expect(analyzed.parent_name).toBe('rig_root')
    expect(analyzed.depth).toBe(1)
    expect(snapshot.type_counts.Group).toBe(1)
    expect(snapshot.type_counts.Mesh).toBe(1)
  })

  it('reports transforms without treating position and rotation as problems', () => {
    const scene = new Scene()
    const mesh = make_mesh('arm')
    mesh.position.set(0, 3, 0)
    mesh.rotation.set(Math.PI / 2, 0, 0)
    scene.add(mesh)

    const analyzed = ModelAnalysisReport.snapshot_scene(scene).objects[0]

    // import bakes these in now, so they are information rather than warnings
    expect(analyzed.rotation_degrees.x).toBeCloseTo(90)
    expect(analyzed.position.y).toBeCloseTo(3)
    expect(analyzed.warnings).toEqual([])
  })

  it('still flags a non-uniform scale, which survives baking', () => {
    const scene = new Scene()
    const mesh = make_mesh('arm')
    mesh.scale.set(1, 2, 1)
    scene.add(mesh)

    const analyzed = ModelAnalysisReport.snapshot_scene(scene).objects[0]

    expect(analyzed.warnings.some((entry) => entry.includes('non-uniform'))).toBe(true)
  })

  it('treats a straight mirror as mirrored rather than non-uniform', () => {
    const scene = new Scene()
    const mesh = make_mesh('sword')
    mesh.scale.set(-1, 1, 1)
    scene.add(mesh)

    const analyzed = ModelAnalysisReport.snapshot_scene(scene).objects[0]

    expect(analyzed.warnings).toEqual([
      'Object is mirrored (negative scale). Import applies the mirror and reverses the face winding to compensate, so double check this part looks right.'
    ])
  })

  it('records which parents a mesh inherits a transform from', () => {
    const scene = new Scene()
    const group = new Group()
    group.name = 'Armature'
    group.scale.set(100, 100, 100)
    group.add(make_mesh('body'))
    scene.add(group)

    const analyzed = ModelAnalysisReport.snapshot_scene(scene).objects[0]

    expect(analyzed.transformed_ancestors).toEqual(['Armature'])
    expect(analyzed.warnings).toEqual([])
  })

  it('does not flag a mesh that is already baked at the origin', () => {
    const scene = new Scene()
    scene.add(make_mesh('body'))

    const analyzed = ModelAnalysisReport.snapshot_scene(scene).objects[0]

    // BoxGeometry supplies uvs and normals, so nothing should be reported
    expect(analyzed.warnings).toEqual([])
  })
})

describe('ModelAnalysisReport.build_html', () => {
  it('escapes object names so model files cannot inject markup', () => {
    const scene = new Scene()
    scene.add(make_mesh('<img src=x onerror="alert(1)">'))
    const snapshot: SceneSnapshot = ModelAnalysisReport.snapshot_scene(scene)

    const html: string = ModalAnalysisHtml(snapshot)

    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x')
  })
})

/** Small helper so the escaping test reads clearly. */
function ModalAnalysisHtml (snapshot: SceneSnapshot): string {
  return ModelAnalysisReport.build_html({
    source_name: 'test.glb',
    imported: snapshot,
    processed: snapshot
  })
}

describe('ModelAnalysisReport.format_number', () => {
  it('keeps ordinary numbers short and readable', () => {
    expect(ModelAnalysisReport.format_number(1)).toBe('1')
    expect(ModelAnalysisReport.format_number(1.23456)).toBe('1.235')
    expect(ModelAnalysisReport.format_number(0)).toBe('0')
  })

  it('falls back to exponents for extreme values instead of rounding them away', () => {
    expect(ModelAnalysisReport.format_number(0.0004)).toBe('4.00e-4')
    expect(ModelAnalysisReport.format_number(1234567)).toBe('1.23e+6')
  })

  it('treats floating point noise as zero', () => {
    expect(ModelAnalysisReport.format_number(0.0000004)).toBe('0')
  })
})
