import { Euler, type EulerOrder, MathUtils, Matrix4, Vector3 } from 'three'

/** FBX transform pipeline properties used by generateTransform. */
interface FBXTransformData {
    translation?: number[]
    preRotation?: number[]
    rotation?: number[]
    postRotation?: number[]
    scale?: number[]
    scalingOffset?: number[]
    scalingPivot?: number[]
    rotationOffset?: number[]
    rotationPivot?: number[]
    parentMatrix?: Matrix4
    parentMatrixWorld?: Matrix4
    inheritType?: number
    eulerOrder?: EulerOrder
}

/** Describes a per-vertex attribute array as stored in FBX layer elements. */
interface FBXAttributeInfo {
    mappingType: string
    referenceType: string
    buffer: ArrayLike<number>
    indices: number[]
    dataSize: number
}

/** Returns true when the buffer starts with the FBX binary magic string. */
function isFbxFormatBinary (buffer: ArrayBuffer): boolean {

    const CORRECT = 'Kaydara\u0020FBX\u0020Binary\u0020\u0020\0';

    return buffer.byteLength >= CORRECT.length && CORRECT === convertArrayBufferToString(buffer, 0, CORRECT.length);

}

/** How much of a text file to inspect when sniffing for the ASCII FBX header node. */
const ASCII_SNIFF_LENGTH = 64 * 1024;

/**
 * Returns true when the decoded text looks like an ASCII FBX document.
 *
 * This replaces the upstream three.js implementation, which was doubly broken: its
 * `read()` helper advanced by an extra character each iteration, so it sampled the
 * triangular offsets (0, 1, 3, 6, 10, 15, 21, ...) instead of the first 20 characters,
 * and it rejected the file on the *first* matching character rather than requiring the
 * whole magic string. That made false rejections common -- notably, any ASCII FBX
 * written without the leading `; FBX 7.x.x project file` comment block begins with
 * `FBXHeaderExtension`, whose character at offset 6 is `d`, matching the 4th expected
 * character, so such files were always misdetected as binary.
 *
 * Detection is now the single question it should be: a binary FBX is identified by its
 * magic prefix, and anything else that contains an FBX header node is ASCII.
 */
function isFbxFormatASCII (text: string): boolean {

    if (text.startsWith('Kaydara FBX Binary')) return false;

    // The header node sits at the top of the file, so only the start needs inspecting.
    return /FBXHeaderExtension\s*:|FBXVersion\s*:/.test(text.slice(0, ASCII_SNIFF_LENGTH));

}

/**
 * Builds a short, printable description of a file's leading characters so that an
 * unrecognised-format error can say what was actually received (a renamed model, an
 * HTML error page from a failed request, a compressed archive, and so on).
 */
function describeFileHead (text: string): string {

    const printable = text.slice(0, 64).replace(/[^\x20-\x7e]/g, (char) => {

        return '\\x' + char.charCodeAt(0).toString(16).padStart(2, '0');

    });

    return JSON.stringify(printable);

}

/** Extracts the numeric FBX version from the `FBXVersion` header line. Throws if not found. */
function getFbxVersion (text: string): number {

    const versionRegExp = /FBXVersion:\s*(\d+)/;
    const match = text.match(versionRegExp);

    if (match) {

        const version = parseInt(match[1]);
        return version;

    }

    throw new Error('THREE.FBXLoader: Cannot find the version number for the file given.');

}

/** Converts an FBX time value (ticks at 46,186,158,000 per second) to seconds. */
function convertFBXTimeToSeconds (time: number): number {

    return time / 46186158000;

}

/** Module-level scratch buffer reused by `getData` to avoid allocations per vertex. */
const dataArray: number[] = [];

/**
 * Reads one element from an FBX attribute array (normals, UVs, colours, etc.) at the
 * position determined by the attribute's mapping and reference types.
 * FBX stores per-vertex data in several ways (ByPolygonVertex, ByPolygon, ByVertice,
 * AllSame) and this function resolves all of them to a single flat index.
 */
function getData (polygonVertexIndex: number, polygonIndex: number, vertexIndex: number, infoObject: FBXAttributeInfo): number[] {

    let index;

    switch (infoObject.mappingType) {

        case 'ByPolygonVertex':
            index = polygonVertexIndex;
            break;
        case 'ByPolygon':
            index = polygonIndex;
            break;
        case 'ByVertice':
            index = vertexIndex;
            break;
        case 'AllSame':
            index = infoObject.indices[0];
            break;
        default:
            console.warn('THREE.FBXLoader: unknown attribute mapping type ' + infoObject.mappingType);

    }

    if (infoObject.referenceType === 'IndexToDirect') index = infoObject.indices[index!];

    const from = (index ?? 0) * infoObject.dataSize;
    const to = from + infoObject.dataSize;

    return slice(dataArray, infoObject.buffer, from, to);

}

const tempEuler = new Euler();
const tempVec = new Vector3();

/**
 * Builds a local transform `Matrix4` from FBX transform properties.
 * FBX stores transforms as a pipeline of translation, pre/post rotations, scaling
 * pivots and offsets that must be composed in a specific order; this mirrors the
 * algorithm described in the FBX SDK documentation.
 * @see https://help.autodesk.com/view/FBX/2017/ENU/?guid=__files_GUID_10CDD63C_79C1_4F2D_BB28_AD2BE65A02ED_htm
 */
function generateTransform (transformData: FBXTransformData): Matrix4 {

    const lTranslationM = new Matrix4();
    const lPreRotationM = new Matrix4();
    const lRotationM = new Matrix4();
    const lPostRotationM = new Matrix4();

    const lScalingM = new Matrix4();
    const lScalingPivotM = new Matrix4();
    const lScalingOffsetM = new Matrix4();
    const lRotationOffsetM = new Matrix4();
    const lRotationPivotM = new Matrix4();

    const lParentGX = new Matrix4();
    const lParentLX = new Matrix4();
    const lGlobalT = new Matrix4();

    const inheritType = (transformData.inheritType) ? transformData.inheritType : 0;

    if (transformData.translation) lTranslationM.setPosition(tempVec.fromArray(transformData.translation));

    // For Maya models using "Joint Orient", Euler order only applies to rotation, not pre/post-rotations
    const defaultEulerOrder = getEulerOrder(0);

    if (transformData.preRotation) {

        const r = transformData.preRotation.map(MathUtils.degToRad);
        lPreRotationM.makeRotationFromEuler(tempEuler.set(r[0], r[1], r[2], defaultEulerOrder));

    }

    if (transformData.rotation) {

        const r = transformData.rotation.map(MathUtils.degToRad);
        lRotationM.makeRotationFromEuler(tempEuler.set(r[0], r[1], r[2], transformData.eulerOrder || defaultEulerOrder));

    }

    if (transformData.postRotation) {

        const r = transformData.postRotation.map(MathUtils.degToRad);
        lPostRotationM.makeRotationFromEuler(tempEuler.set(r[0], r[1], r[2], defaultEulerOrder));
        lPostRotationM.invert();

    }

    if (transformData.scale) lScalingM.scale(tempVec.fromArray(transformData.scale));

    // Pivots and offsets
    if (transformData.scalingOffset) lScalingOffsetM.setPosition(tempVec.fromArray(transformData.scalingOffset));
    if (transformData.scalingPivot) lScalingPivotM.setPosition(tempVec.fromArray(transformData.scalingPivot));
    if (transformData.rotationOffset) lRotationOffsetM.setPosition(tempVec.fromArray(transformData.rotationOffset));
    if (transformData.rotationPivot) lRotationPivotM.setPosition(tempVec.fromArray(transformData.rotationPivot));

    // parent transform
    if (transformData.parentMatrixWorld) {

        lParentLX.copy(transformData.parentMatrix!);
        lParentGX.copy(transformData.parentMatrixWorld);

    }

    const lLRM = lPreRotationM.clone().multiply(lRotationM).multiply(lPostRotationM);
    // Global Rotation
    const lParentGRM = new Matrix4();
    lParentGRM.extractRotation(lParentGX);

    // Global Shear*Scaling
    const lParentTM = new Matrix4();
    lParentTM.copyPosition(lParentGX);

    const lParentGRSM = lParentTM.clone().invert().multiply(lParentGX);
    const lParentGSM = lParentGRM.clone().invert().multiply(lParentGRSM);
    const lLSM = lScalingM;

    const lGlobalRS = new Matrix4();

    if (inheritType === 0) {

        lGlobalRS.copy(lParentGRM).multiply(lLRM).multiply(lParentGSM).multiply(lLSM);

    } else if (inheritType === 1) {

        lGlobalRS.copy(lParentGRM).multiply(lParentGSM).multiply(lLRM).multiply(lLSM);

    } else {

        const lParentLSM = new Matrix4().scale(new Vector3().setFromMatrixScale(lParentLX));
        const lParentLSM_inv = lParentLSM.clone().invert();
        const lParentGSM_noLocal = lParentGSM.clone().multiply(lParentLSM_inv);

        lGlobalRS.copy(lParentGRM).multiply(lLRM).multiply(lParentGSM_noLocal).multiply(lLSM);

    }

    const lRotationPivotM_inv = lRotationPivotM.clone().invert();
    const lScalingPivotM_inv = lScalingPivotM.clone().invert();
    // Calculate the local transform matrix
    let lTransform = lTranslationM.clone().multiply(lRotationOffsetM).multiply(lRotationPivotM).multiply(lPreRotationM).multiply(lRotationM).multiply(lPostRotationM).multiply(lRotationPivotM_inv).multiply(lScalingOffsetM).multiply(lScalingPivotM).multiply(lScalingM).multiply(lScalingPivotM_inv);

    const lLocalTWithAllPivotAndOffsetInfo = new Matrix4().copyPosition(lTransform);

    const lGlobalTranslation = lParentGX.clone().multiply(lLocalTWithAllPivotAndOffsetInfo);
    lGlobalT.copyPosition(lGlobalTranslation);

    lTransform = lGlobalT.clone().multiply(lGlobalRS);

    // from global to local
    lTransform.premultiply(lParentGX.invert());

    return lTransform;

}

/**
 * Maps an FBX extrinsic Euler order integer (0–5) to the equivalent Three.js
 * intrinsic order string. Needed because FBX and Three.js use opposite conventions.
 * @see http://help.autodesk.com/view/FBX/2017/ENU/?guid=__cpp_ref_class_fbx_euler_html
 */
function getEulerOrder (order: number): EulerOrder {

    order = order || 0;

    const enums: EulerOrder[] = [
        'ZYX', // -> XYZ extrinsic
        'YZX', // -> XZY extrinsic
        'XZY', // -> YZX extrinsic
        'ZXY', // -> YXZ extrinsic
        'YXZ', // -> ZXY extrinsic
        'XYZ', // -> ZYX extrinsic
        //'SphericXYZ', // not possible to support
    ];

    if (order === 6) {

        console.warn('THREE.FBXLoader: unsupported Euler Order: Spherical XYZ. Animations and rotations may be incorrect.');
        return enums[0];

    }

    return enums[order];

}

/** Splits a comma-separated string of numbers into a `number[]`. Used by `TextParser` to decode FBX array properties. */
function parseNumberArray (value: string): number[] {

    const array = value.split(',').map(function (val) {

        return parseFloat(val);

    });

    return array;

}

/** Decodes a byte range of an `ArrayBuffer` to a UTF-8 string. Used to read the FBX ASCII header and magic bytes. */
function convertArrayBufferToString (buffer: ArrayBuffer, from?: number, to?: number): string {

    if (from === undefined) from = 0;
    if (to === undefined) to = buffer.byteLength;

    return new TextDecoder().decode(new Uint8Array(buffer, from, to));

}

/** Appends all elements of `b` onto `a` in-place, avoiding the allocation overhead of `concat`. */
function append (a: unknown[], b: unknown[]): void {

    for (let i = 0, j = a.length, l = b.length; i < l; i++, j++) {

        a[j] = b[i];

    }

}

/** Copies elements `[from, to)` of array `b` into `a` starting at index 0, reusing the `dataArray` scratch buffer. */
function slice (a: number[], b: ArrayLike<number>, from: number, to: number): number[] {

    for (let i = from, j = 0; i < to; i++, j++) {

        a[j] = b[i];

    }

    return a;

}

export {
    type FBXTransformData,
    type FBXAttributeInfo,
    isFbxFormatBinary,
    isFbxFormatASCII,
    describeFileHead,
    getFbxVersion,
    convertFBXTimeToSeconds,
    dataArray,
    getData,
    generateTransform,
    getEulerOrder,
    parseNumberArray,
    convertArrayBufferToString,
    append,
    slice
}
