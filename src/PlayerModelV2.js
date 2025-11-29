import * as THREE from 'three';

/**
 * PlayerModelV2 - Realistic Snowboarder Model
 *
 * Features:
 * - Anatomically correct proportions
 * - PBR materials with roughness/metalness
 * - Detailed clothing geometry (jacket, pants, boots)
 * - Realistic helmet and goggles
 * - Articulated fingers
 * - Detailed snowboard with bindings and graphics
 */
export class PlayerModelV2 {
  constructor() {
    // Body measurement constants (in meters, ~1.75m tall rider)
    this.bodyScale = 1.0;

    // Segment lengths (anatomically proportioned)
    this.footLength = 0.26;
    this.bootHeight = 0.18;
    this.shinLength = 0.42;
    this.thighLength = 0.44;
    this.pelvisHeight = 0.15;
    this.torsoLength = 0.45;
    this.neckLength = 0.08;
    this.headHeight = 0.24;
    this.upperArmLength = 0.30;
    this.forearmLength = 0.26;
    this.handLength = 0.10;

    // Widths
    this.shoulderWidth = 0.44;
    this.hipWidth = 0.32;
    this.chestDepth = 0.22;

    // Snowboard dimensions
    this.boardLength = 1.55;
    this.boardWidth = 0.26;
    this.boardThickness = 0.012;

    // Stance (duck stance typical for freestyle/all-mountain)
    this.stanceWidth = 0.52;
    this.bindingAngleFront = 15 * Math.PI / 180;  // +15 degrees
    this.bindingAngleBack = -12 * Math.PI / 180;  // -12 degrees

    // Create the model
    this.createMaterials();
    this.createModel();
  }

  createMaterials() {
    // PBR Materials for realistic rendering

    // Jacket - Technical snow jacket (bright color for visibility)
    this.jacketMaterial = new THREE.MeshStandardMaterial({
      color: 0x2288dd,  // Bright blue
      roughness: 0.7,
      metalness: 0.0,
    });

    // Jacket accent (black panels)
    this.jacketAccentMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.6,
      metalness: 0.0,
    });

    // Pants - Technical snow pants
    this.pantsMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,  // Dark navy/black
      roughness: 0.65,
      metalness: 0.0,
    });

    // Boots - Stiff snowboard boots
    this.bootMaterial = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      roughness: 0.4,
      metalness: 0.1,
    });

    this.bootAccentMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.5,
      metalness: 0.0,
    });

    // Gloves - Insulated snow gloves
    this.gloveMaterial = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.6,
      metalness: 0.0,
    });

    // Skin tone
    this.skinMaterial = new THREE.MeshStandardMaterial({
      color: 0xe8beac,
      roughness: 0.8,
      metalness: 0.0,
    });

    // Helmet - Matte finish
    this.helmetMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      roughness: 0.3,
      metalness: 0.1,
    });

    // Helmet vents
    this.helmetVentMaterial = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      roughness: 0.8,
      metalness: 0.0,
    });

    // Goggles frame
    this.goggleFrameMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.4,
      metalness: 0.2,
    });

    // Goggle lens (reflective)
    this.goggleLensMaterial = new THREE.MeshStandardMaterial({
      color: 0xff6600,  // Orange/amber lens
      roughness: 0.1,
      metalness: 0.8,
      envMapIntensity: 1.5,
    });

    // Snowboard materials
    this.boardTopMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.4,
      metalness: 0.2,
    });

    this.boardBaseMaterial = new THREE.MeshStandardMaterial({
      color: 0x0066cc,  // Blue base
      roughness: 0.2,
      metalness: 0.3,
    });

    this.boardEdgeMaterial = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.2,
      metalness: 0.9,  // Metal edges
    });

    // Binding materials
    this.bindingMaterial = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.5,
      metalness: 0.3,
    });

    this.bindingStrapMaterial = new THREE.MeshStandardMaterial({
      color: 0x444444,
      roughness: 0.6,
      metalness: 0.1,
    });
  }

  createModel() {
    // Root group for entire model
    this.mesh = new THREE.Group();

    // Create board first (reference for rider)
    this.createSnowboard();

    // Create rider
    this.riderGroup = new THREE.Group();
    this.createLowerBody();
    this.createUpperBody();

    this.mesh.add(this.riderGroup);
  }

  createSnowboard() {
    this.boardGroup = new THREE.Group();

    // Main board body with rocker/camber profile
    const boardShape = this.createBoardShape();
    const extrudeSettings = {
      depth: this.boardThickness,
      bevelEnabled: true,
      bevelThickness: 0.002,
      bevelSize: 0.003,
      bevelSegments: 2,
    };

    const boardGeometry = new THREE.ExtrudeGeometry(boardShape, extrudeSettings);
    boardGeometry.rotateX(-Math.PI / 2);
    boardGeometry.translate(0, this.boardThickness / 2, 0);

    // Board top surface
    this.boardMesh = new THREE.Mesh(boardGeometry, this.boardTopMaterial);
    this.boardGroup.add(this.boardMesh);

    // Add board graphics (top sheet design)
    this.addBoardGraphics();

    // Metal edges (visible on sides)
    this.addBoardEdges();

    // Bindings
    this.createBindings();

    this.mesh.add(this.boardGroup);
  }

  createBoardShape() {
    const shape = new THREE.Shape();
    const length = this.boardLength;
    const width = this.boardWidth;
    const noseWidth = width * 0.7;
    const tailWidth = width * 0.75;

    // Start at tail center
    shape.moveTo(0, -length / 2);

    // Tail curve (left side)
    shape.bezierCurveTo(
      -tailWidth / 2, -length / 2,
      -width / 2, -length / 2 + 0.15,
      -width / 2, -length / 4
    );

    // Left edge to waist
    shape.lineTo(-width / 2 * 0.95, 0);  // Slight sidecut

    // Left edge to nose
    shape.lineTo(-width / 2, length / 4);

    // Nose curve
    shape.bezierCurveTo(
      -width / 2, length / 2 - 0.15,
      -noseWidth / 2, length / 2,
      0, length / 2
    );

    // Nose curve (right side)
    shape.bezierCurveTo(
      noseWidth / 2, length / 2,
      width / 2, length / 2 - 0.15,
      width / 2, length / 4
    );

    // Right edge to waist
    shape.lineTo(width / 2 * 0.95, 0);

    // Right edge to tail
    shape.lineTo(width / 2, -length / 4);

    // Tail curve (right side)
    shape.bezierCurveTo(
      width / 2, -length / 2 + 0.15,
      tailWidth / 2, -length / 2,
      0, -length / 2
    );

    return shape;
  }

  addBoardGraphics() {
    // Add graphic stripes/design on top of board
    const stripeGeometry = new THREE.PlaneGeometry(0.03, this.boardLength * 0.6);
    const stripeMaterial = new THREE.MeshStandardMaterial({
      color: 0xff4400,
      roughness: 0.4,
      metalness: 0.2,
    });

    // Left stripe
    const leftStripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
    leftStripe.rotation.x = -Math.PI / 2;
    leftStripe.position.set(-0.06, this.boardThickness + 0.001, 0);
    this.boardGroup.add(leftStripe);

    // Right stripe
    const rightStripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
    rightStripe.rotation.x = -Math.PI / 2;
    rightStripe.position.set(0.06, this.boardThickness + 0.001, 0);
    this.boardGroup.add(rightStripe);

    // Center logo area
    const logoGeometry = new THREE.PlaneGeometry(0.12, 0.08);
    const logoMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.5,
      metalness: 0.0,
    });
    const logo = new THREE.Mesh(logoGeometry, logoMaterial);
    logo.rotation.x = -Math.PI / 2;
    logo.position.set(0, this.boardThickness + 0.001, 0.35);
    this.boardGroup.add(logo);
  }

  addBoardEdges() {
    // Thin metal edge visible on board sides
    const edgeGeometry = new THREE.BoxGeometry(0.003, 0.008, this.boardLength * 0.9);

    const leftEdge = new THREE.Mesh(edgeGeometry, this.boardEdgeMaterial);
    leftEdge.position.set(-this.boardWidth / 2 + 0.002, 0.004, 0);
    this.boardGroup.add(leftEdge);

    const rightEdge = new THREE.Mesh(edgeGeometry, this.boardEdgeMaterial);
    rightEdge.position.set(this.boardWidth / 2 - 0.002, 0.004, 0);
    this.boardGroup.add(rightEdge);
  }

  createBindings() {
    // Front binding
    this.frontBindingGroup = this.createBinding();
    this.frontBindingGroup.position.set(0, this.boardThickness, this.stanceWidth / 2);
    this.frontBindingGroup.rotation.y = this.bindingAngleFront;
    this.boardGroup.add(this.frontBindingGroup);

    // Back binding
    this.backBindingGroup = this.createBinding();
    this.backBindingGroup.position.set(0, this.boardThickness, -this.stanceWidth / 2);
    this.backBindingGroup.rotation.y = this.bindingAngleBack;
    this.boardGroup.add(this.backBindingGroup);
  }

  createBinding() {
    const bindingGroup = new THREE.Group();

    // Base plate
    const basePlateGeometry = new THREE.BoxGeometry(0.12, 0.015, 0.28);
    const basePlate = new THREE.Mesh(basePlateGeometry, this.bindingMaterial);
    basePlate.position.y = 0.0075;
    bindingGroup.add(basePlate);

    // Highback
    const highbackShape = new THREE.Shape();
    highbackShape.moveTo(-0.05, 0);
    highbackShape.lineTo(-0.05, 0.18);
    highbackShape.bezierCurveTo(-0.05, 0.22, -0.03, 0.24, 0, 0.24);
    highbackShape.bezierCurveTo(0.03, 0.24, 0.05, 0.22, 0.05, 0.18);
    highbackShape.lineTo(0.05, 0);
    highbackShape.lineTo(-0.05, 0);

    const highbackGeometry = new THREE.ExtrudeGeometry(highbackShape, {
      depth: 0.02,
      bevelEnabled: true,
      bevelThickness: 0.003,
      bevelSize: 0.003,
      bevelSegments: 1,
    });
    highbackGeometry.rotateY(Math.PI / 2);

    const highback = new THREE.Mesh(highbackGeometry, this.bindingMaterial);
    highback.position.set(0, 0.015, -0.11);
    highback.rotation.x = 0.15;  // Slight forward lean
    bindingGroup.add(highback);

    // Ankle strap
    const ankleStrapGeometry = new THREE.TorusGeometry(0.06, 0.012, 8, 16, Math.PI);
    const ankleStrap = new THREE.Mesh(ankleStrapGeometry, this.bindingStrapMaterial);
    ankleStrap.rotation.x = Math.PI / 2;
    ankleStrap.rotation.z = Math.PI;
    ankleStrap.position.set(0, 0.08, 0);
    bindingGroup.add(ankleStrap);

    // Toe strap
    const toeStrapGeometry = new THREE.TorusGeometry(0.055, 0.01, 8, 16, Math.PI);
    const toeStrap = new THREE.Mesh(toeStrapGeometry, this.bindingStrapMaterial);
    toeStrap.rotation.x = Math.PI / 2;
    toeStrap.rotation.z = Math.PI;
    toeStrap.position.set(0, 0.05, 0.08);
    bindingGroup.add(toeStrap);

    // Ratchets (buckles)
    const ratchetGeometry = new THREE.BoxGeometry(0.025, 0.02, 0.015);
    const ratchetMaterial = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.3,
      metalness: 0.8,
    });

    const ankleRatchet = new THREE.Mesh(ratchetGeometry, ratchetMaterial);
    ankleRatchet.position.set(0.07, 0.08, 0);
    bindingGroup.add(ankleRatchet);

    const toeRatchet = new THREE.Mesh(ratchetGeometry, ratchetMaterial);
    toeRatchet.position.set(0.065, 0.05, 0.08);
    bindingGroup.add(toeRatchet);

    return bindingGroup;
  }

  createLowerBody() {
    this.lowerBodyGroup = new THREE.Group();

    // === BOOTS ===
    this.createBoots();

    // === LEGS ===
    this.createLegs();

    // === PELVIS/HIPS ===
    this.createPelvis();

    this.riderGroup.add(this.lowerBodyGroup);
  }

  createBoots() {
    // Front boot
    this.frontBoot = this.createBoot();
    this.frontBoot.position.set(0, this.boardThickness + 0.015, this.stanceWidth / 2);
    this.frontBoot.rotation.y = this.bindingAngleFront;
    this.lowerBodyGroup.add(this.frontBoot);

    // Back boot
    this.backBoot = this.createBoot();
    this.backBoot.position.set(0, this.boardThickness + 0.015, -this.stanceWidth / 2);
    this.backBoot.rotation.y = this.bindingAngleBack;
    this.lowerBodyGroup.add(this.backBoot);
  }

  createBoot() {
    const bootGroup = new THREE.Group();

    // Boot sole
    const soleGeometry = new THREE.BoxGeometry(0.11, 0.025, 0.30);
    const sole = new THREE.Mesh(soleGeometry, this.bootMaterial);
    sole.position.y = 0.0125;
    bootGroup.add(sole);

    // Boot lower (around foot)
    const lowerShape = this.createBootLowerShape();
    const lowerGeometry = new THREE.ExtrudeGeometry(lowerShape, {
      depth: 0.11,
      bevelEnabled: true,
      bevelThickness: 0.005,
      bevelSize: 0.005,
      bevelSegments: 2,
    });
    lowerGeometry.rotateY(-Math.PI / 2);
    lowerGeometry.translate(0.055, 0, 0);

    const bootLower = new THREE.Mesh(lowerGeometry, this.bootMaterial);
    bootLower.position.set(0, 0.025, -0.04);
    bootGroup.add(bootLower);

    // Boot upper (cuff) - wraps around shin
    const cuffGeometry = new THREE.CylinderGeometry(0.055, 0.06, 0.10, 12, 1, true);
    const bootCuff = new THREE.Mesh(cuffGeometry, this.bootAccentMaterial);
    bootCuff.position.set(0, 0.14, -0.02);
    bootGroup.add(bootCuff);

    // Lacing/closure detail
    const lacingGeometry = new THREE.BoxGeometry(0.04, 0.08, 0.01);
    const lacing = new THREE.Mesh(lacingGeometry, this.bootAccentMaterial);
    lacing.position.set(0, 0.10, 0.04);
    bootGroup.add(lacing);

    return bootGroup;
  }

  createBootLowerShape() {
    const shape = new THREE.Shape();
    // Side profile of boot lower
    shape.moveTo(0, 0);
    shape.lineTo(0.26, 0);  // Toe
    shape.bezierCurveTo(0.28, 0.02, 0.28, 0.06, 0.26, 0.08);  // Toe curve up
    shape.lineTo(0.08, 0.10);  // Top of foot
    shape.bezierCurveTo(0.02, 0.10, 0, 0.08, 0, 0.06);  // Heel curve
    shape.lineTo(0, 0);
    return shape;
  }

  createLegs() {
    // === FRONT LEG ===
    this.frontAnklePivot = new THREE.Group();
    this.frontAnklePivot.position.set(0, this.bootHeight, this.stanceWidth / 2);

    // Front shin
    this.frontShin = this.createShin();
    this.frontAnklePivot.add(this.frontShin);

    // Front knee pivot
    this.frontKneePivot = new THREE.Group();
    this.frontKneePivot.position.y = this.shinLength;
    this.frontAnklePivot.add(this.frontKneePivot);

    // Front knee cap
    this.frontKnee = this.createKnee();
    this.frontKneePivot.add(this.frontKnee);

    // Front thigh
    this.frontThigh = this.createThigh();
    this.frontKneePivot.add(this.frontThigh);

    this.lowerBodyGroup.add(this.frontAnklePivot);

    // === BACK LEG ===
    this.backAnklePivot = new THREE.Group();
    this.backAnklePivot.position.set(0, this.bootHeight, -this.stanceWidth / 2);

    // Back shin
    this.backShin = this.createShin();
    this.backAnklePivot.add(this.backShin);

    // Back knee pivot
    this.backKneePivot = new THREE.Group();
    this.backKneePivot.position.y = this.shinLength;
    this.backAnklePivot.add(this.backKneePivot);

    // Back knee cap
    this.backKnee = this.createKnee();
    this.backKneePivot.add(this.backKnee);

    // Back thigh
    this.backThigh = this.createThigh();
    this.backKneePivot.add(this.backThigh);

    this.lowerBodyGroup.add(this.backAnklePivot);
  }

  createShin() {
    const shinGroup = new THREE.Group();

    // Main shin segment (tapered)
    const shinGeometry = new THREE.CylinderGeometry(0.045, 0.055, this.shinLength, 12);
    const shin = new THREE.Mesh(shinGeometry, this.pantsMaterial);
    shin.position.y = this.shinLength / 2;
    shinGroup.add(shin);

    // Calf muscle bulge (back of shin)
    const calfGeometry = new THREE.SphereGeometry(0.045, 12, 8);
    calfGeometry.scale(0.8, 1.2, 1.0);
    const calf = new THREE.Mesh(calfGeometry, this.pantsMaterial);
    calf.position.set(0, this.shinLength * 0.35, -0.02);
    shinGroup.add(calf);

    return shinGroup;
  }

  createKnee() {
    const kneeGroup = new THREE.Group();

    // Knee cap
    const kneecapGeometry = new THREE.SphereGeometry(0.05, 12, 8);
    kneecapGeometry.scale(1.0, 0.9, 0.8);
    const kneecap = new THREE.Mesh(kneecapGeometry, this.pantsMaterial);
    kneecap.position.set(0, 0, 0.02);
    kneeGroup.add(kneecap);

    // Knee pad (reinforced area)
    const kneePadGeometry = new THREE.CylinderGeometry(0.045, 0.05, 0.06, 12);
    const kneePad = new THREE.Mesh(kneePadGeometry, this.pantsMaterial);
    kneePad.position.set(0, 0, 0.03);
    kneePad.rotation.x = Math.PI / 2;
    kneeGroup.add(kneePad);

    return kneeGroup;
  }

  createThigh() {
    const thighGroup = new THREE.Group();

    // Main thigh segment (tapered, muscular)
    const thighGeometry = new THREE.CylinderGeometry(0.055, 0.065, this.thighLength, 12);
    const thigh = new THREE.Mesh(thighGeometry, this.pantsMaterial);
    thigh.position.y = this.thighLength / 2;
    thighGroup.add(thigh);

    // Quad muscle definition (front of thigh)
    const quadGeometry = new THREE.SphereGeometry(0.04, 12, 8);
    quadGeometry.scale(1.0, 1.5, 0.7);
    const quad = new THREE.Mesh(quadGeometry, this.pantsMaterial);
    quad.position.set(0, this.thighLength * 0.4, 0.03);
    thighGroup.add(quad);

    return thighGroup;
  }

  createPelvis() {
    this.pelvisGroup = new THREE.Group();

    // Main hip/pelvis shape
    const pelvisGeometry = new THREE.BoxGeometry(this.hipWidth, this.pelvisHeight, 0.18);
    pelvisGeometry.translate(0, 0, 0);

    // Round the edges
    this.hipsMesh = new THREE.Mesh(pelvisGeometry, this.pantsMaterial);
    this.pelvisGroup.add(this.hipsMesh);

    // Waistband detail
    const waistbandGeometry = new THREE.TorusGeometry(this.hipWidth / 2.2, 0.015, 8, 24);
    waistbandGeometry.rotateX(Math.PI / 2);
    const waistband = new THREE.Mesh(waistbandGeometry, this.pantsMaterial);
    waistband.position.y = this.pelvisHeight / 2 - 0.01;
    this.pelvisGroup.add(waistband);

    // Hip joint connections (hidden, for smooth look)
    const hipJointGeometry = new THREE.SphereGeometry(0.06, 12, 8);

    const leftHipJoint = new THREE.Mesh(hipJointGeometry, this.pantsMaterial);
    leftHipJoint.position.set(-this.hipWidth / 2 + 0.04, -0.03, 0);
    this.pelvisGroup.add(leftHipJoint);

    const rightHipJoint = new THREE.Mesh(hipJointGeometry, this.pantsMaterial);
    rightHipJoint.position.set(this.hipWidth / 2 - 0.04, -0.03, 0);
    this.pelvisGroup.add(rightHipJoint);

    this.lowerBodyGroup.add(this.pelvisGroup);
  }

  createUpperBody() {
    this.upperBodyGroup = new THREE.Group();

    // === TORSO ===
    this.createTorso();

    // === SHOULDERS & ARMS ===
    this.createArms();

    // === NECK & HEAD ===
    this.createHead();

    this.riderGroup.add(this.upperBodyGroup);
  }

  createTorso() {
    this.torsoGroup = new THREE.Group();

    // Lower torso (connects to pelvis)
    const lowerTorsoGeometry = new THREE.CylinderGeometry(0.12, 0.14, 0.15, 12);
    const lowerTorso = new THREE.Mesh(lowerTorsoGeometry, this.jacketMaterial);
    lowerTorso.position.y = 0.075;
    this.torsoGroup.add(lowerTorso);

    // Main torso/chest
    const chestGeometry = new THREE.BoxGeometry(this.shoulderWidth - 0.06, 0.25, this.chestDepth);
    chestGeometry.translate(0, 0, 0.01);  // Slight forward
    this.torsoMesh = new THREE.Mesh(chestGeometry, this.jacketMaterial);
    this.torsoMesh.position.y = 0.27;
    this.torsoGroup.add(this.torsoMesh);

    // Chest roundness (pectoral area)
    const chestRoundGeometry = new THREE.SphereGeometry(0.15, 12, 8);
    chestRoundGeometry.scale(1.2, 0.8, 0.6);
    const chestRound = new THREE.Mesh(chestRoundGeometry, this.jacketMaterial);
    chestRound.position.set(0, 0.30, 0.08);
    this.torsoGroup.add(chestRound);

    // Jacket collar
    const collarGeometry = new THREE.TorusGeometry(0.08, 0.025, 8, 16, Math.PI);
    const collar = new THREE.Mesh(collarGeometry, this.jacketAccentMaterial);
    collar.rotation.x = Math.PI / 2;
    collar.rotation.z = Math.PI;
    collar.position.set(0, 0.42, 0.06);
    this.torsoGroup.add(collar);

    // Jacket zipper line
    const zipperGeometry = new THREE.BoxGeometry(0.015, 0.28, 0.005);
    const zipperMaterial = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.3,
      metalness: 0.8,
    });
    const zipper = new THREE.Mesh(zipperGeometry, zipperMaterial);
    zipper.position.set(0, 0.24, this.chestDepth / 2 + 0.01);
    this.torsoGroup.add(zipper);

    // Shoulder panels (accent color)
    const shoulderPanelGeometry = new THREE.BoxGeometry(0.08, 0.06, 0.18);

    const leftShoulderPanel = new THREE.Mesh(shoulderPanelGeometry, this.jacketAccentMaterial);
    leftShoulderPanel.position.set(-0.15, 0.38, 0.01);
    this.torsoGroup.add(leftShoulderPanel);

    const rightShoulderPanel = new THREE.Mesh(shoulderPanelGeometry, this.jacketAccentMaterial);
    rightShoulderPanel.position.set(0.15, 0.38, 0.01);
    this.torsoGroup.add(rightShoulderPanel);

    // Shoulders mesh (for arm attachment reference)
    const shouldersGeometry = new THREE.BoxGeometry(this.shoulderWidth, 0.06, 0.14);
    this.shouldersMesh = new THREE.Mesh(shouldersGeometry, this.jacketMaterial);
    this.shouldersMesh.position.y = 0.41;
    this.torsoGroup.add(this.shouldersMesh);

    this.upperBodyGroup.add(this.torsoGroup);
  }

  createArms() {
    // === LEFT ARM ===
    this.leftShoulderPivot = new THREE.Group();
    this.leftShoulderPivot.position.set(-this.shoulderWidth / 2, 0.41, 0);

    // Shoulder joint (deltoid)
    const shoulderJointGeometry = new THREE.SphereGeometry(0.055, 12, 8);
    const leftShoulderJoint = new THREE.Mesh(shoulderJointGeometry, this.jacketMaterial);
    this.leftShoulderPivot.add(leftShoulderJoint);

    // Upper arm
    this.leftUpperArm = this.createUpperArm();
    this.leftUpperArm.position.y = -this.upperArmLength / 2 - 0.03;
    this.leftShoulderPivot.add(this.leftUpperArm);

    // Elbow pivot
    this.leftElbowPivot = new THREE.Group();
    this.leftElbowPivot.position.y = -this.upperArmLength - 0.03;
    this.leftShoulderPivot.add(this.leftElbowPivot);

    // Forearm
    this.leftForearm = this.createForearm();
    this.leftForearm.position.y = -this.forearmLength / 2;
    this.leftElbowPivot.add(this.leftForearm);

    // Hand
    this.leftHand = this.createHand();
    this.leftHand.position.y = -this.forearmLength - 0.02;
    this.leftElbowPivot.add(this.leftHand);

    this.upperBodyGroup.add(this.leftShoulderPivot);

    // === RIGHT ARM ===
    this.rightShoulderPivot = new THREE.Group();
    this.rightShoulderPivot.position.set(this.shoulderWidth / 2, 0.41, 0);

    const rightShoulderJoint = new THREE.Mesh(shoulderJointGeometry, this.jacketMaterial);
    this.rightShoulderPivot.add(rightShoulderJoint);

    this.rightUpperArm = this.createUpperArm();
    this.rightUpperArm.position.y = -this.upperArmLength / 2 - 0.03;
    this.rightShoulderPivot.add(this.rightUpperArm);

    this.rightElbowPivot = new THREE.Group();
    this.rightElbowPivot.position.y = -this.upperArmLength - 0.03;
    this.rightShoulderPivot.add(this.rightElbowPivot);

    this.rightForearm = this.createForearm();
    this.rightForearm.position.y = -this.forearmLength / 2;
    this.rightElbowPivot.add(this.rightForearm);

    this.rightHand = this.createHand();
    this.rightHand.position.y = -this.forearmLength - 0.02;
    this.rightElbowPivot.add(this.rightHand);

    this.upperBodyGroup.add(this.rightShoulderPivot);
  }

  createUpperArm() {
    const armGroup = new THREE.Group();

    // Main upper arm
    const armGeometry = new THREE.CylinderGeometry(0.045, 0.05, this.upperArmLength, 12);
    const arm = new THREE.Mesh(armGeometry, this.jacketMaterial);
    armGroup.add(arm);

    // Bicep bulge
    const bicepGeometry = new THREE.SphereGeometry(0.04, 12, 8);
    bicepGeometry.scale(1.0, 1.3, 0.9);
    const bicep = new THREE.Mesh(bicepGeometry, this.jacketMaterial);
    bicep.position.set(0, 0.02, 0.02);
    armGroup.add(bicep);

    return armGroup;
  }

  createForearm() {
    const forearmGroup = new THREE.Group();

    // Main forearm
    const forearmGeometry = new THREE.CylinderGeometry(0.035, 0.045, this.forearmLength, 12);
    const forearm = new THREE.Mesh(forearmGeometry, this.jacketMaterial);
    forearmGroup.add(forearm);

    // Jacket cuff
    const cuffGeometry = new THREE.CylinderGeometry(0.04, 0.038, 0.04, 12);
    const cuff = new THREE.Mesh(cuffGeometry, this.jacketAccentMaterial);
    cuff.position.y = -this.forearmLength / 2 + 0.02;
    forearmGroup.add(cuff);

    return forearmGroup;
  }

  createHand() {
    const handGroup = new THREE.Group();

    // Palm/main hand
    const palmGeometry = new THREE.BoxGeometry(0.07, 0.04, 0.09);
    const palm = new THREE.Mesh(palmGeometry, this.gloveMaterial);
    palm.position.z = 0.02;
    handGroup.add(palm);

    // Thumb
    const thumbGeometry = new THREE.CapsuleGeometry(0.012, 0.03, 4, 8);
    const thumb = new THREE.Mesh(thumbGeometry, this.gloveMaterial);
    thumb.rotation.z = -0.5;
    thumb.rotation.x = 0.3;
    thumb.position.set(-0.04, 0, 0.02);
    handGroup.add(thumb);

    // Fingers (4 fingers, slightly curled)
    const fingerGeometry = new THREE.CapsuleGeometry(0.01, 0.04, 4, 8);

    for (let i = 0; i < 4; i++) {
      const finger = new THREE.Mesh(fingerGeometry, this.gloveMaterial);
      finger.rotation.x = 0.3;  // Slight curl
      finger.position.set(-0.02 + i * 0.017, -0.01, 0.07);
      handGroup.add(finger);
    }

    return handGroup;
  }

  createHead() {
    this.headGroup = new THREE.Group();

    // === NECK ===
    const neckGeometry = new THREE.CylinderGeometry(0.04, 0.045, this.neckLength, 12);
    this.neckMesh = new THREE.Mesh(neckGeometry, this.skinMaterial);
    this.neckMesh.position.y = 0.48;
    this.headGroup.add(this.neckMesh);

    // Neck gaiter/buff (covers lower neck)
    const gaiterGeometry = new THREE.CylinderGeometry(0.05, 0.055, 0.05, 12);
    const gaiter = new THREE.Mesh(gaiterGeometry, this.jacketAccentMaterial);
    gaiter.position.y = 0.46;
    this.headGroup.add(gaiter);

    // === HEAD ===
    // Main head shape (slightly elongated sphere)
    const headGeometry = new THREE.SphereGeometry(0.10, 16, 12);
    headGeometry.scale(1.0, 1.1, 1.0);
    this.headMesh = new THREE.Mesh(headGeometry, this.skinMaterial);
    this.headMesh.position.y = 0.60;
    this.headGroup.add(this.headMesh);

    // Chin
    const chinGeometry = new THREE.SphereGeometry(0.035, 12, 8);
    chinGeometry.scale(1.0, 0.8, 0.9);
    const chin = new THREE.Mesh(chinGeometry, this.skinMaterial);
    chin.position.set(0, 0.53, 0.06);
    this.headGroup.add(chin);

    // === HELMET ===
    // Main helmet shell
    const helmetGeometry = new THREE.SphereGeometry(0.115, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6);
    helmetGeometry.scale(1.05, 1.0, 1.1);
    this.helmetMesh = new THREE.Mesh(helmetGeometry, this.helmetMaterial);
    this.helmetMesh.position.y = 0.62;
    this.headGroup.add(this.helmetMesh);

    // Helmet brim (front)
    const brimGeometry = new THREE.BoxGeometry(0.20, 0.02, 0.06);
    const brim = new THREE.Mesh(brimGeometry, this.helmetMaterial);
    brim.position.set(0, 0.65, 0.10);
    brim.rotation.x = -0.2;
    this.headGroup.add(brim);

    // Helmet vents (top)
    for (let i = 0; i < 3; i++) {
      const ventGeometry = new THREE.BoxGeometry(0.02, 0.015, 0.06);
      const vent = new THREE.Mesh(ventGeometry, this.helmetVentMaterial);
      vent.position.set(-0.03 + i * 0.03, 0.72, 0.02);
      this.headGroup.add(vent);
    }

    // Helmet ear pads
    const earPadGeometry = new THREE.SphereGeometry(0.04, 12, 8);
    earPadGeometry.scale(0.6, 1.0, 1.0);

    const leftEarPad = new THREE.Mesh(earPadGeometry, this.helmetMaterial);
    leftEarPad.position.set(-0.11, 0.58, 0);
    this.headGroup.add(leftEarPad);

    const rightEarPad = new THREE.Mesh(earPadGeometry, this.helmetMaterial);
    rightEarPad.position.set(0.11, 0.58, 0);
    this.headGroup.add(rightEarPad);

    // === GOGGLES ===
    // Goggle frame
    const goggleFrameShape = new THREE.Shape();
    goggleFrameShape.moveTo(-0.08, -0.025);
    goggleFrameShape.bezierCurveTo(-0.09, -0.02, -0.09, 0.02, -0.08, 0.025);
    goggleFrameShape.lineTo(0.08, 0.025);
    goggleFrameShape.bezierCurveTo(0.09, 0.02, 0.09, -0.02, 0.08, -0.025);
    goggleFrameShape.lineTo(-0.08, -0.025);

    const goggleFrameGeometry = new THREE.ExtrudeGeometry(goggleFrameShape, {
      depth: 0.04,
      bevelEnabled: true,
      bevelThickness: 0.005,
      bevelSize: 0.005,
      bevelSegments: 2,
    });

    const goggleFrame = new THREE.Mesh(goggleFrameGeometry, this.goggleFrameMaterial);
    goggleFrame.position.set(0, 0.61, 0.08);
    this.headGroup.add(goggleFrame);

    // Goggle lens
    const lensGeometry = new THREE.PlaneGeometry(0.15, 0.045);
    this.goggleMesh = new THREE.Mesh(lensGeometry, this.goggleLensMaterial);
    this.goggleMesh.position.set(0, 0.61, 0.125);
    this.headGroup.add(this.goggleMesh);

    // Goggle strap (around helmet)
    const strapGeometry = new THREE.TorusGeometry(0.11, 0.008, 8, 32);
    strapGeometry.rotateY(Math.PI / 2);
    const strap = new THREE.Mesh(strapGeometry, this.goggleFrameMaterial);
    strap.position.set(0, 0.62, 0);
    this.headGroup.add(strap);

    this.upperBodyGroup.add(this.headGroup);
  }

  // === ANIMATION INTERFACE ===
  // These methods provide the same interface as the original model
  // for seamless integration with PlayerController animation system

  setHipPosition(x, y, z) {
    if (this.pelvisGroup) {
      this.pelvisGroup.position.set(x, y, z);
    }
  }

  setHipRotation(x, y, z) {
    if (this.pelvisGroup) {
      this.pelvisGroup.rotation.set(x, y, z);
    }
  }

  setTorsoRotation(x, y, z) {
    if (this.torsoMesh) {
      this.torsoGroup.rotation.set(x, y, z);
    }
  }

  setHeadRotation(x, y, z) {
    if (this.headMesh) {
      this.headGroup.rotation.set(x, y, z);
    }
  }

  // Get model dimensions for animation system
  getDimensions() {
    return {
      thighLength: this.thighLength,
      shinLength: this.shinLength,
      bootHeight: this.bootHeight,
      torsoLength: this.torsoLength,
      stanceWidth: this.stanceWidth,
      shoulderWidth: this.shoulderWidth,
    };
  }

  // Update material colors (for customization)
  setJacketColor(color) {
    this.jacketMaterial.color.setHex(color);
  }

  setPantsColor(color) {
    this.pantsMaterial.color.setHex(color);
  }

  setHelmetColor(color) {
    this.helmetMaterial.color.setHex(color);
  }

  setGoggleLensColor(color) {
    this.goggleLensMaterial.color.setHex(color);
  }

  setBoardGraphicsColor(color) {
    // Update board stripe colors
    this.boardGroup.children.forEach(child => {
      if (child.material && child.material.color) {
        if (child.material.color.getHex() === 0xff4400) {
          child.material.color.setHex(color);
        }
      }
    });
  }

  dispose() {
    // Dispose of all geometries and materials
    this.mesh.traverse((child) => {
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(mat => mat.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }
}
