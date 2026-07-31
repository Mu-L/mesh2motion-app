import { BufferAttribute, BufferGeometry } from 'three'

type Vertex = [number, number, number]

// A Blender-style octahedral bone shape, built in a unit space that runs from
// y = 0 (the head, sitting on the parent joint) to y = 1 (the tip, sitting on
// the child joint). The widest part is a 4 vertex ring 10% along the bone.
// Callers scale this: x/z by bone thickness, y by bone length.
const RING_HEIGHT = 0.1
const RING_RADIUS = 0.5

// Fake flat shading, baked per facet into vertex colors, so the shape reads as
// 3D without needing any lights. MeshBasicMaterial multiplies material.color by
// the vertex color, so the helper keeps its exact configured color.
// The shape is convex, so only 2 of these 4 quadrants are visible at a time and
// they are always neighbors. That means every *adjacent* pair has to contrast,
// which is why these alternate rather than ramping in one direction.
const QUADRANT_SHADING = [1.0, 0.7, 0.92, 0.62]

// the head cone is darkened relative to the tip cone. This makes the widest
// ring show up as an edge, which is the cue for which end of the bone is which.
const HEAD_SHADING_FALLOFF = 0.85

export function create_octahedral_bone_geometry (): BufferGeometry {
  const geometry = new BufferGeometry()

  const head: Vertex = [0, 0, 0]
  const tip: Vertex = [0, 1, 0]
  const ring: Vertex[] = [
    [RING_RADIUS, RING_HEIGHT, RING_RADIUS],
    [RING_RADIUS, RING_HEIGHT, -RING_RADIUS],
    [-RING_RADIUS, RING_HEIGHT, -RING_RADIUS],
    [-RING_RADIUS, RING_HEIGHT, RING_RADIUS]
  ]

  const vertices: number[] = []
  const colors: number[] = []

  const add_triangle = (a: Vertex, b: Vertex, c: Vertex, shade: number): void => {
    vertices.push(...a, ...b, ...c)
    for (let corner = 0; corner < 3; corner++) {
      colors.push(shade, shade, shade)
    }
  }

  // 8 triangles total: a 4 triangle fan from the ring down to the head,
  // and a 4 triangle fan from the ring up to the tip
  for (let quadrant = 0; quadrant < 4; quadrant++) {
    const current = ring[quadrant]
    const next = ring[(quadrant + 1) % ring.length]
    const shade = QUADRANT_SHADING[quadrant]

    // winding is counter-clockwise seen from outside the shape, so the front
    // faces point outward. The material culls backfaces to get correct
    // self-occlusion without relying on the depth buffer.
    add_triangle(next, current, head, shade * HEAD_SHADING_FALLOFF)
    add_triangle(current, next, tip, shade)
  }

  geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3))
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))
  return geometry
}
