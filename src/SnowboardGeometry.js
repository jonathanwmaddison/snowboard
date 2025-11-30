import * as THREE from 'three';

/**
 * SnowboardGeometry - Creates realistic snowboard 3D geometry
 *
 * Features:
 * - Sidecut curve (narrower waist, wider nose/tail)
 * - Rounded nose and tail tips
 * - Proper snowboard proportions
 * - Configurable dimensions
 */

/**
 * Default snowboard dimensions (in meters)
 */
export const SNOWBOARD_DEFAULTS = {
  length: 1.62,        // 162cm total length (longer board)
  noseWidth: 0.40,     // 37cm at nose (+15% wider)
  waistWidth: 0.39,    // 30cm at waist (+15% wider)
  tailWidth: 0.40,     // 36cm at tail (+15% wider)
  thickness: 0.03,    // 1.5cm thick (more visible)
  segments: 32,        // Higher detail for smoother curves
  noseRounding: 0.18,  // Longer nose rounding for spatula shape
  tailRounding: 0.10,  // Shorter tail rounding (more square tail)
};

/**
 * Create a realistic snowboard geometry with sidecut, rounded tips, and proper shape
 * @param {Object} options - Snowboard dimensions (uses defaults if not specified)
 * @returns {THREE.BufferGeometry}
 */
export function createSnowboardGeometry(options = {}) {
  const {
    length = SNOWBOARD_DEFAULTS.length,
    noseWidth = SNOWBOARD_DEFAULTS.noseWidth,
    waistWidth = SNOWBOARD_DEFAULTS.waistWidth,
    tailWidth = SNOWBOARD_DEFAULTS.tailWidth,
    thickness = SNOWBOARD_DEFAULTS.thickness,
    segments = SNOWBOARD_DEFAULTS.segments,
    noseRounding = SNOWBOARD_DEFAULTS.noseRounding,
    tailRounding = SNOWBOARD_DEFAULTS.tailRounding,
  } = options;

  const halfLength = length / 2;

  // Create the 2D profile points (top-down view)
  const profilePoints = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;  // 0 to 1 along the board
    const z = -halfLength + t * length;  // Position along length

    // Sidecut curve - narrowest at middle, wider at ends
    // Use a parabolic curve for more realistic sidecut
    // The sidecut is deepest at center (t=0.5)
    const distFromCenter = Math.abs(t - 0.5) * 2;  // 0 at center, 1 at ends
    const sidecutDepth = distFromCenter * distFromCenter;  // Parabolic curve

    // Blend between nose and tail widths based on position
    const endWidth = t < 0.5 ? noseWidth : tailWidth;
    let width = waistWidth + (endWidth - waistWidth) * sidecutDepth;

    // Round the nose and tail with different amounts
    const distFromNose = t * length;
    const distFromTail = (1 - t) * length;

    if (distFromNose < noseRounding) {
      // Smooth nose rounding with ease-out curve
      const roundT = distFromNose / noseRounding;
      const roundFactor = 1 - Math.pow(1 - roundT, 2);
      width *= roundFactor;
    } else if (distFromTail < tailRounding) {
      // Slightly sharper tail rounding
      const roundT = distFromTail / tailRounding;
      const roundFactor = Math.sin(roundT * Math.PI / 2);
      width *= roundFactor;
    }

    profilePoints.push({ z, width: width / 2 });  // Store half-width for each side
  }

  // Build the geometry
  const vertices = [];
  const indices = [];
  const normals = [];
  const uvs = [];

  // Create top and bottom faces
  for (let i = 0; i <= segments; i++) {
    const { z, width } = profilePoints[i];
    const u = i / segments;

    // Top surface vertices (left and right edges)
    vertices.push(-width, thickness / 2, z);  // Top left
    vertices.push(width, thickness / 2, z);   // Top right

    normals.push(0, 1, 0);  // Up
    normals.push(0, 1, 0);

    uvs.push(0, u);
    uvs.push(1, u);
  }

  // Bottom surface vertices
  const bottomOffset = (segments + 1) * 2;
  for (let i = 0; i <= segments; i++) {
    const { z, width } = profilePoints[i];
    const u = i / segments;

    vertices.push(-width, -thickness / 2, z);  // Bottom left
    vertices.push(width, -thickness / 2, z);   // Bottom right

    normals.push(0, -1, 0);  // Down
    normals.push(0, -1, 0);

    uvs.push(0, u);
    uvs.push(1, u);
  }

  // Create top face triangles
  for (let i = 0; i < segments; i++) {
    const tl = i * 2;
    const tr = i * 2 + 1;
    const bl = (i + 1) * 2;
    const br = (i + 1) * 2 + 1;

    indices.push(tl, bl, tr);
    indices.push(tr, bl, br);
  }

  // Create bottom face triangles (reversed winding)
  for (let i = 0; i < segments; i++) {
    const tl = bottomOffset + i * 2;
    const tr = bottomOffset + i * 2 + 1;
    const bl = bottomOffset + (i + 1) * 2;
    const br = bottomOffset + (i + 1) * 2 + 1;

    indices.push(tl, tr, bl);
    indices.push(tr, br, bl);
  }

  // Side edges (left and right)
  const sideOffset = vertices.length / 3;
  for (let i = 0; i <= segments; i++) {
    const { z, width } = profilePoints[i];
    const u = i / segments;

    // Left edge
    vertices.push(-width, thickness / 2, z);   // Top
    vertices.push(-width, -thickness / 2, z);  // Bottom

    // Calculate normal (perpendicular to edge)
    if (i > 0 && i < segments) {
      const prevWidth = profilePoints[i - 1].width;
      const nextWidth = profilePoints[i + 1].width;
      const dz = profilePoints[i + 1].z - profilePoints[i - 1].z;
      const dw = nextWidth - prevWidth;
      const len = Math.sqrt(dz * dz + dw * dw);
      const nx = -dz / len;
      const nz = -dw / len;
      normals.push(nx, 0, nz);
      normals.push(nx, 0, nz);
    } else {
      normals.push(-1, 0, 0);
      normals.push(-1, 0, 0);
    }

    uvs.push(0, u);
    uvs.push(0.1, u);
  }

  const rightSideOffset = vertices.length / 3;
  for (let i = 0; i <= segments; i++) {
    const { z, width } = profilePoints[i];
    const u = i / segments;

    // Right edge
    vertices.push(width, thickness / 2, z);   // Top
    vertices.push(width, -thickness / 2, z);  // Bottom

    // Calculate normal
    if (i > 0 && i < segments) {
      const prevWidth = profilePoints[i - 1].width;
      const nextWidth = profilePoints[i + 1].width;
      const dz = profilePoints[i + 1].z - profilePoints[i - 1].z;
      const dw = nextWidth - prevWidth;
      const len = Math.sqrt(dz * dz + dw * dw);
      const nx = dz / len;
      const nz = dw / len;
      normals.push(nx, 0, nz);
      normals.push(nx, 0, nz);
    } else {
      normals.push(1, 0, 0);
      normals.push(1, 0, 0);
    }

    uvs.push(0.9, u);
    uvs.push(1, u);
  }

  // Left side triangles
  for (let i = 0; i < segments; i++) {
    const t1 = sideOffset + i * 2;
    const b1 = sideOffset + i * 2 + 1;
    const t2 = sideOffset + (i + 1) * 2;
    const b2 = sideOffset + (i + 1) * 2 + 1;

    indices.push(t1, t2, b1);
    indices.push(b1, t2, b2);
  }

  // Right side triangles
  for (let i = 0; i < segments; i++) {
    const t1 = rightSideOffset + i * 2;
    const b1 = rightSideOffset + i * 2 + 1;
    const t2 = rightSideOffset + (i + 1) * 2;
    const b2 = rightSideOffset + (i + 1) * 2 + 1;

    indices.push(t1, b1, t2);
    indices.push(b1, b2, t2);
  }

  // Nose cap (rounded front)
  const noseCapOffset = vertices.length / 3;
  const noseZ = profilePoints[0].z;
  vertices.push(0, 0, noseZ - 0.02);  // Center point slightly forward
  normals.push(0, 0, -1);
  uvs.push(0.5, 0);

  const firstWidth = profilePoints[0].width;
  vertices.push(-firstWidth, thickness / 2, noseZ);
  vertices.push(-firstWidth, -thickness / 2, noseZ);
  vertices.push(firstWidth, thickness / 2, noseZ);
  vertices.push(firstWidth, -thickness / 2, noseZ);
  normals.push(0, 0, -1);
  normals.push(0, 0, -1);
  normals.push(0, 0, -1);
  normals.push(0, 0, -1);
  uvs.push(0, 0);
  uvs.push(0, 0);
  uvs.push(1, 0);
  uvs.push(1, 0);

  // Nose triangles
  indices.push(noseCapOffset, noseCapOffset + 1, noseCapOffset + 3);  // Top
  indices.push(noseCapOffset, noseCapOffset + 4, noseCapOffset + 2);  // Bottom
  indices.push(noseCapOffset, noseCapOffset + 3, noseCapOffset + 4);  // Right
  indices.push(noseCapOffset, noseCapOffset + 2, noseCapOffset + 1);  // Left

  // Tail cap (rounded back)
  const tailCapOffset = vertices.length / 3;
  const tailZ = profilePoints[segments].z;
  vertices.push(0, 0, tailZ + 0.02);  // Center point slightly back
  normals.push(0, 0, 1);
  uvs.push(0.5, 1);

  const lastWidth = profilePoints[segments].width;
  vertices.push(-lastWidth, thickness / 2, tailZ);
  vertices.push(-lastWidth, -thickness / 2, tailZ);
  vertices.push(lastWidth, thickness / 2, tailZ);
  vertices.push(lastWidth, -thickness / 2, tailZ);
  normals.push(0, 0, 1);
  normals.push(0, 0, 1);
  normals.push(0, 0, 1);
  normals.push(0, 0, 1);
  uvs.push(0, 1);
  uvs.push(0, 1);
  uvs.push(1, 1);
  uvs.push(1, 1);

  // Tail triangles
  indices.push(tailCapOffset, tailCapOffset + 3, tailCapOffset + 1);  // Top
  indices.push(tailCapOffset, tailCapOffset + 2, tailCapOffset + 4);  // Bottom
  indices.push(tailCapOffset, tailCapOffset + 4, tailCapOffset + 3);  // Right
  indices.push(tailCapOffset, tailCapOffset + 1, tailCapOffset + 2);  // Left

  // Create the geometry
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);

  geometry.computeVertexNormals();  // Smooth out the normals

  return geometry;
}

/**
 * Create snowboard material with top graphic and base colors
 * @param {Object} options - Material options
 * @returns {THREE.MeshStandardMaterial}
 */
export function createSnowboardMaterial(options = {}) {
  const {
    color = 0x1a1a2e,
    roughness = 0.4,
    metalness = 0.2,
  } = options;

  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
  });
}

/**
 * Create a complete snowboard mesh
 * @param {Object} geometryOptions - Options for geometry
 * @param {Object} materialOptions - Options for material
 * @returns {THREE.Mesh}
 */
export function createSnowboardMesh(geometryOptions = {}, materialOptions = {}) {
  const geometry = createSnowboardGeometry(geometryOptions);
  const material = createSnowboardMaterial(materialOptions);
  return new THREE.Mesh(geometry, material);
}
