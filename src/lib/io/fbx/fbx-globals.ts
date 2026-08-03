import { Group } from 'three'
import { FBXTree } from './FBXTree'

// Parent/child relationship entry stored in the FBX connections map
interface FBXConnectionEntry {
    parents: Array<{ ID: number; relationship: string | undefined }>
    children: Array<{ ID: number; relationship: string | undefined }>
}

// Shared mutable parse state passed implicitly between FBX parser classes
const fbxGlobals = {
    fbxTree: undefined as unknown as FBXTree,
    connections: undefined as unknown as Map<number, FBXConnectionEntry>,
    sceneGraph: undefined as unknown as Group
}

export { fbxGlobals, type FBXConnectionEntry }
