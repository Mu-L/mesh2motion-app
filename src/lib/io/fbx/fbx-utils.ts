import { Euler, MathUtils, Matrix4, Vector3 } from 'three'

/** Returns true when the buffer starts with the FBX binary magic string. */
function isFbxFormatBinary (buffer: ArrayBuffer) {

    const CORRECT = 'Kaydara\u0020FBX\u0020Binary\u0020\u0020\0';

    return buffer.byteLength >= CORRECT.length && CORRECT === convertArrayBufferToString(buffer, 0, CORRECT.length);

}

/** Returns true when the text does NOT contain the binary magic prefix, indicating ASCII format. */
function isFbxFormatASCII (text: string) {

    const CORRECT = ['K', 'a', 'y', 'd', 'a', 'r', 'a', '\\', 'F', 'B', 'X', '\\', 'B', 'i', 'n', 'a', 'r', 'y', '\\', '\\'];

    let cursor = 0;

    function read (offset: number) {

        const result = text[offset - 1];
        text = text.slice(cursor + offset);
        cursor++;
        return result;

    }

    for (let i = 0; i < CORRECT.length; ++i) {

        const num = read(1);
        if (num === CORRECT[i]) {

            return false;

        }

    }

    return true;

}

/** Extracts the numeric FBX version from the `FBXVersion` header line. Throws if not found. */
function getFbxVersion (text: string) {

    const versionRegExp = /FBXVersion: (\d+)/;
    const match = text.match(versionRegExp);

    if (match) {

        const version = parseInt(match[1]);
        return version;

    }

    throw new Error('THREE.FBXLoader: Cannot find the version number for the file given.');

}

/** Converts an FBX time value (ticks at 46,186,158,000 per second) to seconds. */
function convertFBXTimeToSeconds (time: number) {

    return time / 46186158000;

}

/** Module-level scratch buffer reused by `getData` to avoid allocations per vertex. */
const dataArray: any[] = [];

/**
 * Reads one element from an FBX attribute array (normals, UVs, colours, etc.) at the
 * position determined by the attribute's mapping and reference types.
 * FBX stores per-vertex data in several ways (ByPolygonVertex, ByPolygon, ByVertice,
 * AllSame) and this function resolves all of them to a single flat index.
 */
function getData (polygonVertexIndex: number, polygonIndex: number, vertexIndex: number, infoObject: any) {

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

    if (infoObject.referenceType === 'IndexToDirect') index = infoObject.indices[index];

    const from = index * infoObject.dataSize;
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
function generateTransform (transformData: any) {

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

        const array = transformData.preRotation.map(MathUtils.degToRad);
        array.push(defaultEulerOrder);
        lPreRotationM.makeRotationFromEuler(tempEuler.fromArray(array));

    }

    if (transformData.rotation) {

        const array = transformData.rotation.map(MathUtils.degToRad);
        array.push(transformData.eulerOrder || defaultEulerOrder);
        lRotationM.makeRotationFromEuler(tempEuler.fromArray(array));

    }

    if (transformData.postRotation) {

        const array = transformData.postRotation.map(MathUtils.degToRad);
        array.push(defaultEulerOrder);
        lPostRotationM.makeRotationFromEuler(tempEuler.fromArray(array));
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

        lParentLX.copy(transformData.parentMatrix);
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
function getEulerOrder (order: any) {

    order = order || 0;

    const enums = [
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
function convertArrayBufferToString (buffer: ArrayBuffer, from?: number, to?: number) {

    if (from === undefined) from = 0;
    if (to === undefined) to = buffer.byteLength;

    return new TextDecoder().decode(new Uint8Array(buffer, from, to));

}

/** Appends all elements of `b` onto `a` in-place, avoiding the allocation overhead of `concat`. */
function append (a: any[], b: any[]) {

    for (let i = 0, j = a.length, l = b.length; i < l; i++, j++) {

        a[j] = b[i];

    }

}

/** Copies elements `[from, to)` of array `b` into `a` starting at index 0, reusing the `dataArray` scratch buffer. */
function slice (a: any[], b: any[], from: number, to: number) {

    for (let i = from, j = 0; i < to; i++, j++) {

        a[j] = b[i];

    }

    return a;

}

export {
    isFbxFormatBinary,
    isFbxFormatASCII,
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
