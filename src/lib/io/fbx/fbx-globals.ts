// Shared mutable parse state passed implicitly between FBX parser classes
const fbxGlobals: {
    fbxTree: any,
    connections: any,
    sceneGraph: any
} = {
    fbxTree: undefined,
    connections: undefined,
    sceneGraph: undefined
}

export { fbxGlobals }
