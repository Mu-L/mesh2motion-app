/**
 * Holds the parsed FBX document as a plain object tree.
 * Produced by either `TextParser` (ASCII format) or `BinaryParser` (binary format)
 * and consumed by `FBXTreeParser` to build the Three.js scene graph.
 */
class FBXTree {
    [key: string]: any

    add (key: string, val: any) {

        this[key] = val;

    }

}

export { FBXTree }
