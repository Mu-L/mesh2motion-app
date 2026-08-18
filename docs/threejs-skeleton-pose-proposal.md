# Proposal: `Skeleton.pose()` should divide out non-Bone ancestor transforms

Notes toward a three.js issue / PR. Written against **three.js r185 (0.185.1)**.

## Summary

`Skeleton.pose()` does not restore the bind pose for any skeleton whose root bone has a
transformed non-`Bone` ancestor — the "Armature" node that glTF and FBX exports almost
always produce. For those rigs it writes a **world** matrix into a **local** transform, so
the ancestor's transform ends up applied twice and the entire rig comes out rotated and/or
mis-scaled.

Measured on a stock Mixamo glTF rig with a `-90°` X armature node: the root bone's local
rotation is off by exactly **90°**, and every bone in the skeleton inherits that as a single
rigid rotation.

## The defect

`src/objects/Skeleton.js`:

```js
pose() {

    // recover the bind-time world matrices
    for ( let i = 0, il = this.bones.length; i < il; i ++ ) {
        const bone = this.bones[ i ];
        if ( bone ) {
            bone.matrixWorld.copy( this.boneInverses[ i ] ).invert();
        }
    }

    // compute the local matrices, positions, rotations and scales
    for ( let i = 0, il = this.bones.length; i < il; i ++ ) {
        const bone = this.bones[ i ];
        if ( bone ) {
            if ( bone.parent && bone.parent.isBone ) {
                bone.matrix.copy( bone.parent.matrixWorld ).invert();
                bone.matrix.multiply( bone.matrixWorld );
            } else {
                bone.matrix.copy( bone.matrixWorld );   // <-- here
            }
            bone.matrix.decompose( bone.position, bone.quaternion, bone.scale );
        }
    }

}
```

The marked line assigns a world matrix to `bone.matrix`, which is a **local** matrix.

## Why this is a bug rather than a documented limitation

`pose()` is meant to be the inverse of `calculateInverses()`, and `calculateInverses()`
records **full world** matrices:

```js
calculateInverses() {
    this.boneInverses.length = 0;
    for ( let i = 0, il = this.bones.length; i < il; i ++ ) {
        const inverse = new Matrix4();
        if ( this.bones[ i ] ) {
            inverse.copy( this.bones[ i ].matrixWorld ).invert();   // world space
        }
        this.boneInverses.push( inverse );
    }
}
```

So `boneInverses[i]⁻¹` is `bone.matrixWorld` at bind time, which includes *every* ancestor —
bones and non-bones alike.

The second loop is internally inconsistent about that:

| root bone's parent | what `pose()` computes | correct? |
| --- | --- | --- |
| a `Bone` | `bindParentWorld⁻¹ · bindWorld` | yes — the ancestor chain is divided out |
| anything else (`Object3D`, `Group`) | `bindWorld` | **no** — the ancestor chain is left in |

Writing `A · L₀` into a bone whose parent still contributes `A` yields a rendered world
transform of `A · A · L₀`. The `Bone` branch already establishes that dividing out the
parent is the intended behavior; the `else` branch just skips it.

## Impact

- **`SkinnedMesh.pose()`** (`src/objects/SkinnedMesh.js:254`) delegates straight to this.
- **`SkeletonUtils.retarget()`** (`examples/jsm/utils/SkeletonUtils.js:64`) calls
  `target.skeleton.pose()` to reset the target before retargeting, so three.js's own bundled
  retargeting helper is affected.
- Anyone writing custom retargeting, pose-mixing, or bind-pose-reset code on loaded assets.

The trigger is extremely common in practice:

- Blender's glTF exporter emits an `Armature` node, frequently with a `-90°` X rotation for
  Z-up source scenes.
- FBX rigs authored in centimetres arrive with a `0.01` scale on the root node.
- Any application that positions, rotates, or scales a loaded rig's container before
  `pose()` runs.

Rigs whose armature node happens to be identity are unaffected, which is why this goes
unnoticed — it looks like a per-asset problem rather than a library one.

## Minimal reproduction

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const gltf = await new GLTFLoader().loadAsync( 'mixamo-rig.glb' );
const scene = gltf.scene;

// author the rig the way a Z-up tool exports it
const armature = scene.children.find( ( c ) => c.name.includes( 'Armature' ) );
armature.rotation.x = - Math.PI / 2;
scene.updateMatrixWorld( true );

let skinnedMesh;
scene.traverse( ( c ) => { if ( c.isSkinnedMesh ) skinnedMesh = c; } );
const skeleton = skinnedMesh.skeleton;

// a rig actually authored this way has the armature transform baked into its inverse bind
// matrices, because glTF inverseBindMatrices are expressed in scene space
skeleton.calculateInverses();

const before = skeleton.bones.map( ( b ) => b.quaternion.clone() );

skeleton.pose();   // should be a no-op: the rig is already in its bind pose

skeleton.bones.forEach( ( bone, i ) => {
    const delta = before[ i ].clone().invert().multiply( bone.quaternion );
    const deg = 2 * Math.acos( Math.min( 1, Math.abs( delta.w ) ) ) * 180 / Math.PI;
    if ( deg > 0.5 ) console.log( bone.name, deg.toFixed( 2 ), 'deg' );
} );
// -> mixamorigHips 90.00 deg
```

`pose()` on a skeleton already in its bind pose must be a no-op. It is not.

## Measured results

Stock Mixamo glTF rig, 65 bones. "off by" is the largest deviation from the true bind pose
across all bones, after calling `pose()` on a skeleton that was already in its bind pose:

| armature node transform | shipped `pose()` | proposed `pose()` |
| --- | --- | --- |
| `rotation.x = -90°` | **90.000° / 1.4748 units** | 0.030° / 0.0000 units |
| `scale = 0.01` | 0.030° / **1.0324 units** | 0.030° / 0.0000 units |
| identity (control) | 0.030° / 0.0000 units | 0.030° / 0.0000 units |

Two things worth noting:

- The `0.030°` floor appears in **every** row including the control, so it is float32
  quantization in the asset plus `Matrix4.decompose` round-tripping — not attributable to
  either implementation.
- The scale case corrupts **position only**, leaving rotation clean. That is the familiar
  "model renders at 1/100th the size its bounding box reports" symptom, which suggests some
  existing scale-related bug reports may share this root cause.

## Proposed fix

Divide out the non-`Bone` parent, mirroring what the `Bone` branch already does:

```diff
             } else {
 
                 bone.matrix.copy( bone.matrixWorld );
 
+                if ( bone.parent !== null ) {
+
+                    // bone.matrixWorld is a world matrix, so any non-Bone ancestor chain
+                    // (an Armature node, a scaled container) has to be divided out too
+                    _offsetMatrix.copy( bone.parent.matrixWorld ).invert();
+                    bone.matrix.premultiply( _offsetMatrix );
+
+                }
+
             }
```

`_offsetMatrix` is already declared at module scope (`Skeleton.js:11`) so no new allocation
is needed — it is otherwise only used by `update()`, which never interleaves with `pose()`.
Do not reuse `_identityMatrix` on line 12; it is a shared constant. Verified against the
table above.

### Backward compatibility

When the non-`Bone` ancestor chain is identity, `parent.matrixWorld⁻¹` is the identity
matrix and the added line is a no-op — see the control row. Behavior changes **only** for
rigs that are currently broken.

### Caveat a maintainer will want to weigh

The `Bone` branch divides by the **bind-time** parent world (loop 1 overwrote
`parent.matrixWorld` with it). The patch above divides by the ancestor's **current** world
matrix, because the bind-time transform of a non-`Bone` ancestor is not stored anywhere on
`Skeleton`.

These coincide whenever the armature has not moved since bind time, which covers essentially
all real usage — a loaded asset gets `pose()` called on it in the same place it was bound.
They diverge only if the armature is transformed *between* binding and `pose()`, and in that
case the patch preserves the bind-time **world** pose while the ideal would preserve the
bind-time **local** pose. Both are defensible; today's behavior is neither.

If that divergence matters, the fully correct alternative is to have `calculateInverses()`
record the root's bind-time ancestor transform in a new field (analogous to how
`SkinnedMesh` already stores `bindMatrix` / `bindMatrixInverse` for exactly this reason) and
have `pose()` divide by that instead. It is more correct but adds API surface and a
serialization concern, so it is probably a follow-up rather than the first PR.

### Also worth fixing while in here

`pose()` reads `bone.parent.matrixWorld` without updating it, so it inherits the same
undocumented precondition as `calculateInverses()`: the caller must have run
`updateMatrixWorld()` first. Worth stating in the docstring either way, and it becomes
load-bearing once the patch above starts reading the parent's matrix.

## Workaround for anyone hitting this today

Restore the rest pose from a snapshot captured at load time rather than calling `pose()`, or
post-process the root bones:

```js
const inverse = new Matrix4();
skeleton.pose();
for ( const bone of skeleton.bones ) {
    if ( bone.parent && ! bone.parent.isBone ) {
        bone.matrix.premultiply( inverse.copy( bone.parent.matrixWorld ).invert() );
        bone.matrix.decompose( bone.position, bone.quaternion, bone.scale );
    }
}
```

Note that recovering the rest pose from `boneInverses` this way divides by the ancestor's
*current* world matrix, so it will also divide out any scale or rotation the application
applied to the container after load. If that applies, prefer the snapshot approach.
