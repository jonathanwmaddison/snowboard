import * as THREE from 'three';

/**
 * MinecraftMode - Resource gathering system
 * Mine blocks scattered across the slopes to collect resources!
 */

// Resource types with colors and properties
export const RESOURCES = {
  SNOW: { name: 'Snow', color: 0xffffff, hardness: 0.5, rarity: 0.4 },
  WOOD: { name: 'Wood', color: 0x8B4513, hardness: 1.0, rarity: 0.25 },
  STONE: { name: 'Stone', color: 0x808080, hardness: 2.0, rarity: 0.2 },
  IRON: { name: 'Iron', color: 0xC0C0C0, hardness: 3.0, rarity: 0.1 },
  GOLD: { name: 'Gold', color: 0xFFD700, hardness: 2.5, rarity: 0.04 },
  DIAMOND: { name: 'Diamond', color: 0x00FFFF, hardness: 4.0, rarity: 0.01 }
};

// Craftable items
export const CRAFTABLES = {
  PLANKS: { name: 'Planks', color: 0xDEB887, recipe: { WOOD: 1 }, yields: 4 },
  SNOWBALL: { name: 'Snowball', color: 0xF0F8FF, recipe: { SNOW: 2 }, yields: 4 },
  COBBLESTONE: { name: 'Cobblestone', color: 0x696969, recipe: { STONE: 2 }, yields: 1 },
  IRON_BLOCK: { name: 'Iron Block', color: 0xE8E8E8, recipe: { IRON: 9 }, yields: 1 },
  GOLD_BLOCK: { name: 'Gold Block', color: 0xFFD700, recipe: { GOLD: 9 }, yields: 1 },
  DIAMOND_BLOCK: { name: 'Diamond Block', color: 0x00CED1, recipe: { DIAMOND: 9 }, yields: 1 },
  TORCH: { name: 'Torch', color: 0xFFA500, recipe: { WOOD: 1, STONE: 1 }, yields: 4 },
  FENCE: { name: 'Fence', color: 0xA0522D, recipe: { WOOD: 4 }, yields: 3 },
  BRICK: { name: 'Brick', color: 0xB22222, recipe: { STONE: 4, IRON: 1 }, yields: 4 },
  IGLOO_BLOCK: { name: 'Igloo Block', color: 0xE0FFFF, recipe: { SNOW: 4, STONE: 1 }, yields: 2 }
};

export class MinecraftMode {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.enabled = false;

    // Blocks in the world (natural + player-placed)
    this.blocks = [];
    this.placedBlocks = [];  // Player-placed blocks
    this.blockMeshes = new THREE.Group();
    this.blockMeshes.name = 'minecraftBlocks';

    // Raw resource inventory
    this.inventory = {
      SNOW: 0,
      WOOD: 0,
      STONE: 0,
      IRON: 0,
      GOLD: 0,
      DIAMOND: 0
    };

    // Crafted items inventory
    this.craftedItems = {};
    for (const type of Object.keys(CRAFTABLES)) {
      this.craftedItems[type] = 0;
    }

    // Mining state
    this.currentTarget = null;
    this.miningProgress = 0;
    this.isMining = false;

    // Building state
    this.buildMode = false;
    this.selectedBuildItem = null;  // What item to place
    this.buildPreview = null;       // Preview mesh
    this.buildPosition = new THREE.Vector3();

    // Crafting state
    this.craftingOpen = false;

    // UI elements
    this.inventoryUI = null;
    this.miningBar = null;
    this.targetIndicator = null;
    this.craftingUI = null;
    this.buildUI = null;
    this.hotbarUI = null;

    // Hotbar (quick select for building)
    this.hotbar = ['SNOW', 'WOOD', 'STONE', 'PLANKS', 'COBBLESTONE', 'BRICK', 'FENCE', 'TORCH', 'IGLOO_BLOCK'];
    this.hotbarIndex = 0;

    // Block size
    this.blockSize = 2;
    this.interactRange = 8;
    this.buildRange = 12;

    // Create shared geometries and materials
    this.blockGeometry = new THREE.BoxGeometry(this.blockSize, this.blockSize, this.blockSize);
    this.materials = {};

    // Materials for raw resources
    for (const [type, data] of Object.entries(RESOURCES)) {
      this.materials[type] = new THREE.MeshStandardMaterial({
        color: data.color,
        roughness: 0.8,
        metalness: type === 'IRON' || type === 'GOLD' ? 0.6 : 0.1
      });
    }

    // Materials for craftables
    for (const [type, data] of Object.entries(CRAFTABLES)) {
      this.materials[type] = new THREE.MeshStandardMaterial({
        color: data.color,
        roughness: 0.7,
        metalness: type.includes('IRON') || type.includes('GOLD') || type.includes('DIAMOND') ? 0.5 : 0.1
      });
    }
  }

  /**
   * Toggle Minecraft mode on/off
   */
  toggle() {
    this.enabled = !this.enabled;

    if (this.enabled) {
      this.enable();
    } else {
      this.disable();
    }

    return this.enabled;
  }

  /**
   * Enable Minecraft mode
   */
  enable() {
    this.enabled = true;
    this.scene.add(this.blockMeshes);
    this.generateBlocks();
    this.createUI();
    console.log('⛏️ MINECRAFT MODE: ON - Mine blocks with E key!');
  }

  /**
   * Disable Minecraft mode
   */
  disable() {
    this.enabled = false;
    this.scene.remove(this.blockMeshes);
    this.clearBlocks();
    this.removeUI();
    this.stopMining();
    console.log('⛏️ MINECRAFT MODE: OFF');
  }

  /**
   * Generate blocks scattered across the terrain
   */
  generateBlocks() {
    this.clearBlocks();

    const blockCount = 150;
    const spawnRange = { minX: -200, maxX: 200, minZ: -800, maxZ: 100 };

    for (let i = 0; i < blockCount; i++) {
      // Random position
      const x = spawnRange.minX + Math.random() * (spawnRange.maxX - spawnRange.minX);
      const z = spawnRange.minZ + Math.random() * (spawnRange.maxZ - spawnRange.minZ);

      // Get terrain height
      let y = 0;
      if (this.terrain) {
        y = this.terrain.getHeightAt(x, z) || 0;
      }
      y += this.blockSize / 2 + 0.1; // Sit on top of terrain

      // Determine resource type based on rarity
      const roll = Math.random();
      let cumulative = 0;
      let resourceType = 'SNOW';

      for (const [type, data] of Object.entries(RESOURCES)) {
        cumulative += data.rarity;
        if (roll < cumulative) {
          resourceType = type;
          break;
        }
      }

      // Create block
      this.createBlock(x, y, z, resourceType);
    }
  }

  /**
   * Create a single block
   */
  createBlock(x, y, z, resourceType) {
    const mesh = new THREE.Mesh(this.blockGeometry, this.materials[resourceType]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Add slight random rotation for variety
    mesh.rotation.y = Math.random() * Math.PI * 2;

    // Store block data
    const block = {
      mesh,
      type: resourceType,
      health: RESOURCES[resourceType].hardness,
      maxHealth: RESOURCES[resourceType].hardness,
      position: new THREE.Vector3(x, y, z)
    };

    mesh.userData.block = block;
    this.blocks.push(block);
    this.blockMeshes.add(mesh);

    return block;
  }

  /**
   * Clear all blocks
   */
  clearBlocks() {
    for (const block of this.blocks) {
      this.blockMeshes.remove(block.mesh);
      block.mesh.geometry = null; // Don't dispose shared geometry
    }
    this.blocks = [];
  }

  /**
   * Create UI elements
   */
  createUI() {
    // Inventory display
    this.inventoryUI = document.createElement('div');
    this.inventoryUI.id = 'minecraft-inventory';
    this.inventoryUI.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 15px;
      border-radius: 8px;
      font-family: 'Courier New', monospace;
      font-size: 14px;
      border: 2px solid #555;
      min-width: 150px;
    `;
    this.updateInventoryUI();
    document.body.appendChild(this.inventoryUI);

    // Mining progress bar
    this.miningBar = document.createElement('div');
    this.miningBar.id = 'mining-bar';
    this.miningBar.style.cssText = `
      position: fixed;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      width: 200px;
      height: 20px;
      background: rgba(0, 0, 0, 0.7);
      border-radius: 10px;
      border: 2px solid #555;
      overflow: hidden;
      display: none;
    `;

    const progressFill = document.createElement('div');
    progressFill.id = 'mining-progress';
    progressFill.style.cssText = `
      width: 0%;
      height: 100%;
      background: linear-gradient(90deg, #4CAF50, #8BC34A);
      transition: width 0.1s;
    `;
    this.miningBar.appendChild(progressFill);
    document.body.appendChild(this.miningBar);

    // Target indicator (shows what you're looking at)
    this.targetIndicator = document.createElement('div');
    this.targetIndicator.id = 'target-indicator';
    this.targetIndicator.style.cssText = `
      position: fixed;
      bottom: 130px;
      left: 50%;
      transform: translateX(-50%);
      color: white;
      font-family: 'Courier New', monospace;
      font-size: 16px;
      text-shadow: 2px 2px 4px black;
      display: none;
    `;
    document.body.appendChild(this.targetIndicator);
  }

  /**
   * Update inventory UI display
   */
  updateInventoryUI() {
    if (!this.inventoryUI) return;

    let html = '<div style="font-weight: bold; margin-bottom: 10px; color: #4CAF50;">⛏️ INVENTORY</div>';

    for (const [type, count] of Object.entries(this.inventory)) {
      const data = RESOURCES[type];
      const colorHex = '#' + data.color.toString(16).padStart(6, '0');
      html += `<div style="margin: 4px 0;">
        <span style="display: inline-block; width: 12px; height: 12px; background: ${colorHex}; margin-right: 8px; border: 1px solid #333;"></span>
        ${data.name}: ${count}
      </div>`;
    }

    const total = Object.values(this.inventory).reduce((a, b) => a + b, 0);
    html += `<div style="margin-top: 10px; border-top: 1px solid #555; padding-top: 8px;">Total: ${total}</div>`;

    this.inventoryUI.innerHTML = html;
  }

  /**
   * Remove UI elements
   */
  removeUI() {
    if (this.inventoryUI) {
      this.inventoryUI.remove();
      this.inventoryUI = null;
    }
    if (this.miningBar) {
      this.miningBar.remove();
      this.miningBar = null;
    }
    if (this.targetIndicator) {
      this.targetIndicator.remove();
      this.targetIndicator = null;
    }
  }

  /**
   * Find nearest block to player
   */
  findNearestBlock(playerPos) {
    let nearest = null;
    let nearestDist = Infinity;

    for (const block of this.blocks) {
      const dist = playerPos.distanceTo(block.position);
      if (dist < nearestDist && dist < this.interactRange) {
        nearest = block;
        nearestDist = dist;
      }
    }

    return nearest;
  }

  /**
   * Update - call each frame
   */
  update(dt, playerPos, isMiningKeyHeld, playerHeading = 0) {
    if (!this.enabled) return;

    // Update build preview position
    if (this.buildMode) {
      this.updateBuildPosition(playerPos, playerHeading);
    }

    // Find nearest block
    const nearest = this.findNearestBlock(playerPos);

    // Update target indicator
    if (nearest && this.targetIndicator && !this.buildMode) {
      const data = RESOURCES[nearest.type] || CRAFTABLES[nearest.type];
      this.targetIndicator.textContent = `[E] Mine ${data?.name || 'Block'}`;
      this.targetIndicator.style.display = 'block';

      // Highlight the block
      if (this.currentTarget !== nearest) {
        // Unhighlight previous
        if (this.currentTarget) {
          this.currentTarget.mesh.scale.setScalar(1);
        }
        this.currentTarget = nearest;
      }
      nearest.mesh.scale.setScalar(1.1 + Math.sin(Date.now() * 0.005) * 0.05);
    } else {
      if (this.targetIndicator) this.targetIndicator.style.display = 'none';
      if (this.currentTarget) {
        this.currentTarget.mesh.scale.setScalar(1);
        this.currentTarget = null;
      }
    }

    // Handle mining (not in build mode)
    if (isMiningKeyHeld && nearest && !this.buildMode) {
      this.mine(dt, nearest);
    } else {
      this.stopMining();
    }
  }

  /**
   * Mine a block
   */
  mine(dt, block) {
    this.isMining = true;

    // Show mining bar
    if (this.miningBar) {
      this.miningBar.style.display = 'block';
    }

    // Increase progress
    const mineSpeed = 1.0; // Units per second
    this.miningProgress += mineSpeed * dt;

    // Update progress bar
    const progressPercent = (this.miningProgress / block.maxHealth) * 100;
    const progressFill = document.getElementById('mining-progress');
    if (progressFill) {
      progressFill.style.width = progressPercent + '%';
    }

    // Shake the block
    block.mesh.position.x = block.position.x + (Math.random() - 0.5) * 0.1;
    block.mesh.position.z = block.position.z + (Math.random() - 0.5) * 0.1;

    // Block mined!
    if (this.miningProgress >= block.maxHealth) {
      this.collectBlock(block);
    }
  }

  /**
   * Stop mining
   */
  stopMining() {
    if (!this.isMining) return;

    this.isMining = false;
    this.miningProgress = 0;

    // Reset block position
    if (this.currentTarget) {
      this.currentTarget.mesh.position.copy(this.currentTarget.position);
    }

    // Hide mining bar
    if (this.miningBar) {
      this.miningBar.style.display = 'none';
    }
    const progressFill = document.getElementById('mining-progress');
    if (progressFill) {
      progressFill.style.width = '0%';
    }
  }

  /**
   * Collect a block - add to inventory and remove from world
   */
  collectBlock(block) {
    // Add to inventory
    this.inventory[block.type]++;
    this.updateInventoryUI();

    // Create particle burst effect
    this.createBreakParticles(block);

    // Remove block
    const index = this.blocks.indexOf(block);
    if (index > -1) {
      this.blocks.splice(index, 1);
    }
    this.blockMeshes.remove(block.mesh);

    // Reset mining state
    this.stopMining();
    this.currentTarget = null;

    // Log collection
    const data = RESOURCES[block.type];
    console.log(`⛏️ Collected ${data.name}! (Total: ${this.inventory[block.type]})`);

    // Special messages for rare items
    if (block.type === 'DIAMOND') {
      console.log('💎 DIAMOND! You found a diamond!');
    } else if (block.type === 'GOLD') {
      console.log('🥇 Nice! Gold ore collected!');
    }
  }

  /**
   * Create particle effect when block breaks
   */
  createBreakParticles(block) {
    const particleCount = 20;
    const data = RESOURCES[block.type];

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = [];

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = block.position.x;
      positions[i * 3 + 1] = block.position.y;
      positions[i * 3 + 2] = block.position.z;

      velocities.push({
        x: (Math.random() - 0.5) * 10,
        y: Math.random() * 8 + 2,
        z: (Math.random() - 0.5) * 10
      });
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: data.color,
      size: 0.5,
      transparent: true,
      opacity: 1
    });

    const particles = new THREE.Points(geometry, material);
    this.scene.add(particles);

    // Animate particles
    let time = 0;
    const animate = () => {
      time += 0.016;

      const positions = particles.geometry.attributes.position.array;
      for (let i = 0; i < particleCount; i++) {
        positions[i * 3] += velocities[i].x * 0.016;
        positions[i * 3 + 1] += velocities[i].y * 0.016;
        positions[i * 3 + 2] += velocities[i].z * 0.016;

        velocities[i].y -= 15 * 0.016; // Gravity
      }
      particles.geometry.attributes.position.needsUpdate = true;

      material.opacity = 1 - time;

      if (time < 1) {
        requestAnimationFrame(animate);
      } else {
        this.scene.remove(particles);
        geometry.dispose();
        material.dispose();
      }
    };
    animate();
  }

  /**
   * Get inventory contents
   */
  getInventory() {
    return { ...this.inventory };
  }

  /**
   * Check if mode is enabled
   */
  isEnabled() {
    return this.enabled;
  }

  // ==================== CRAFTING SYSTEM ====================

  /**
   * Toggle crafting menu
   */
  toggleCrafting() {
    this.craftingOpen = !this.craftingOpen;
    if (this.craftingOpen) {
      this.showCraftingUI();
    } else {
      this.hideCraftingUI();
    }
  }

  /**
   * Check if we can craft an item
   */
  canCraft(itemType) {
    const recipe = CRAFTABLES[itemType]?.recipe;
    if (!recipe) return false;

    for (const [resource, amount] of Object.entries(recipe)) {
      if ((this.inventory[resource] || 0) < amount) {
        return false;
      }
    }
    return true;
  }

  /**
   * Craft an item
   */
  craft(itemType) {
    if (!this.canCraft(itemType)) {
      console.log('Not enough resources!');
      return false;
    }

    const craftable = CRAFTABLES[itemType];

    // Consume resources
    for (const [resource, amount] of Object.entries(craftable.recipe)) {
      this.inventory[resource] -= amount;
    }

    // Add crafted item
    this.craftedItems[itemType] = (this.craftedItems[itemType] || 0) + craftable.yields;

    console.log(`🔨 Crafted ${craftable.yields}x ${craftable.name}!`);

    // Update UIs
    this.updateInventoryUI();
    if (this.craftingOpen) {
      this.showCraftingUI();
    }

    return true;
  }

  /**
   * Show crafting UI
   */
  showCraftingUI() {
    if (this.craftingUI) {
      this.craftingUI.remove();
    }

    this.craftingUI = document.createElement('div');
    this.craftingUI.id = 'crafting-ui';
    this.craftingUI.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(60, 40, 20, 0.95);
      color: white;
      padding: 20px;
      border-radius: 8px;
      font-family: 'Courier New', monospace;
      font-size: 14px;
      border: 4px solid #8B4513;
      min-width: 350px;
      max-height: 80vh;
      overflow-y: auto;
      z-index: 1000;
    `;

    let html = '<div style="font-weight: bold; font-size: 18px; margin-bottom: 15px; text-align: center; color: #FFD700;">🔨 CRAFTING TABLE</div>';
    html += '<div style="margin-bottom: 10px; color: #aaa; text-align: center;">Click to craft | Press Q to close</div>';

    for (const [type, data] of Object.entries(CRAFTABLES)) {
      const canCraft = this.canCraft(type);
      const colorHex = '#' + data.color.toString(16).padStart(6, '0');
      const recipeText = Object.entries(data.recipe).map(([r, a]) => `${a} ${RESOURCES[r]?.name || r}`).join(' + ');
      const count = this.craftedItems[type] || 0;

      html += `<div
        onclick="window.minecraftCraft('${type}')"
        style="
          display: flex;
          align-items: center;
          padding: 10px;
          margin: 5px 0;
          background: ${canCraft ? 'rgba(0,100,0,0.3)' : 'rgba(100,0,0,0.3)'};
          border: 2px solid ${canCraft ? '#4CAF50' : '#666'};
          border-radius: 4px;
          cursor: ${canCraft ? 'pointer' : 'not-allowed'};
          opacity: ${canCraft ? 1 : 0.6};
        ">
        <span style="display: inline-block; width: 20px; height: 20px; background: ${colorHex}; margin-right: 10px; border: 2px solid #333;"></span>
        <div style="flex: 1;">
          <div style="font-weight: bold;">${data.name} (x${data.yields})</div>
          <div style="font-size: 12px; color: #aaa;">${recipeText}</div>
        </div>
        <div style="color: #888;">[${count}]</div>
      </div>`;
    }

    this.craftingUI.innerHTML = html;
    document.body.appendChild(this.craftingUI);

    // Global craft function
    window.minecraftCraft = (type) => this.craft(type);
  }

  /**
   * Hide crafting UI
   */
  hideCraftingUI() {
    if (this.craftingUI) {
      this.craftingUI.remove();
      this.craftingUI = null;
    }
  }

  // ==================== BUILDING SYSTEM ====================

  /**
   * Toggle build mode
   */
  toggleBuildMode() {
    this.buildMode = !this.buildMode;

    if (this.buildMode) {
      this.selectedBuildItem = this.hotbar[this.hotbarIndex];
      this.createBuildPreview();
      this.showHotbarUI();
      console.log('🏗️ BUILD MODE: ON - Click to place blocks!');
    } else {
      this.removeBuildPreview();
      this.hideHotbarUI();
      console.log('🏗️ BUILD MODE: OFF');
    }
  }

  /**
   * Show hotbar UI for building
   */
  showHotbarUI() {
    if (this.hotbarUI) this.hotbarUI.remove();

    this.hotbarUI = document.createElement('div');
    this.hotbarUI.id = 'hotbar-ui';
    this.hotbarUI.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 5px;
      background: rgba(0, 0, 0, 0.7);
      padding: 10px;
      border-radius: 8px;
      border: 2px solid #555;
    `;

    this.updateHotbarUI();
    document.body.appendChild(this.hotbarUI);
  }

  /**
   * Update hotbar display
   */
  updateHotbarUI() {
    if (!this.hotbarUI) return;

    let html = '';
    for (let i = 0; i < this.hotbar.length; i++) {
      const item = this.hotbar[i];
      const isRaw = RESOURCES[item];
      const data = isRaw ? RESOURCES[item] : CRAFTABLES[item];
      const count = isRaw ? this.inventory[item] : this.craftedItems[item];
      const colorHex = '#' + (data?.color || 0x888888).toString(16).padStart(6, '0');
      const selected = i === this.hotbarIndex;

      html += `<div
        onclick="window.minecraftSelectHotbar(${i})"
        style="
          width: 50px;
          height: 50px;
          background: ${colorHex};
          border: 3px solid ${selected ? '#FFD700' : '#333'};
          border-radius: 4px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          position: relative;
        ">
        <span style="font-size: 10px; color: white; text-shadow: 1px 1px black;">${i + 1}</span>
        <span style="font-size: 12px; color: white; text-shadow: 1px 1px black; font-weight: bold;">${count || 0}</span>
      </div>`;
    }

    this.hotbarUI.innerHTML = html;
    window.minecraftSelectHotbar = (i) => this.selectHotbar(i);
  }

  /**
   * Select hotbar slot
   */
  selectHotbar(index) {
    this.hotbarIndex = index;
    this.selectedBuildItem = this.hotbar[index];
    this.updateHotbarUI();
    this.updateBuildPreview();
  }

  /**
   * Cycle hotbar selection (mouse wheel)
   */
  cycleHotbar(direction) {
    this.hotbarIndex = (this.hotbarIndex + direction + this.hotbar.length) % this.hotbar.length;
    this.selectedBuildItem = this.hotbar[this.hotbarIndex];
    this.updateHotbarUI();
    this.updateBuildPreview();
  }

  /**
   * Hide hotbar UI
   */
  hideHotbarUI() {
    if (this.hotbarUI) {
      this.hotbarUI.remove();
      this.hotbarUI = null;
    }
  }

  /**
   * Create build preview mesh
   */
  createBuildPreview() {
    this.removeBuildPreview();

    const material = new THREE.MeshStandardMaterial({
      color: this.materials[this.selectedBuildItem]?.color || 0x888888,
      transparent: true,
      opacity: 0.5
    });

    this.buildPreview = new THREE.Mesh(this.blockGeometry, material);
    this.buildPreview.name = 'buildPreview';
    this.scene.add(this.buildPreview);
  }

  /**
   * Update build preview appearance
   */
  updateBuildPreview() {
    if (!this.buildPreview) return;

    const data = RESOURCES[this.selectedBuildItem] || CRAFTABLES[this.selectedBuildItem];
    if (data) {
      this.buildPreview.material.color.setHex(data.color);
    }
  }

  /**
   * Remove build preview
   */
  removeBuildPreview() {
    if (this.buildPreview) {
      this.scene.remove(this.buildPreview);
      this.buildPreview.material.dispose();
      this.buildPreview = null;
    }
  }

  /**
   * Update build preview position based on player position and heading
   */
  updateBuildPosition(playerPos, playerHeading) {
    if (!this.buildPreview || !this.buildMode) return;

    // Calculate position in front of player
    const distance = 5;
    const x = playerPos.x - Math.sin(playerHeading) * distance;
    const z = playerPos.z + Math.cos(playerHeading) * distance;

    // Get terrain height
    let y = 0;
    if (this.terrain) {
      y = this.terrain.getHeightAt(x, z) || 0;
    }
    y += this.blockSize / 2;

    // Snap to grid
    const gridSize = this.blockSize;
    const snappedX = Math.round(x / gridSize) * gridSize;
    const snappedZ = Math.round(z / gridSize) * gridSize;

    this.buildPosition.set(snappedX, y, snappedZ);
    this.buildPreview.position.copy(this.buildPosition);

    // Check if can place here (has resources)
    const canPlace = this.canPlaceBlock();
    this.buildPreview.material.color.setHex(canPlace ? 0x00ff00 : 0xff0000);
    this.buildPreview.material.opacity = canPlace ? 0.6 : 0.3;
  }

  /**
   * Check if we can place the selected block
   */
  canPlaceBlock() {
    const item = this.selectedBuildItem;

    // Check raw resources
    if (RESOURCES[item]) {
      return (this.inventory[item] || 0) > 0;
    }

    // Check crafted items
    if (CRAFTABLES[item]) {
      return (this.craftedItems[item] || 0) > 0;
    }

    return false;
  }

  /**
   * Place a block at the preview position
   */
  placeBlock() {
    if (!this.buildMode || !this.canPlaceBlock()) {
      return false;
    }

    const item = this.selectedBuildItem;

    // Consume item from inventory
    if (RESOURCES[item]) {
      this.inventory[item]--;
    } else if (CRAFTABLES[item]) {
      this.craftedItems[item]--;
    }

    // Create the block
    const block = this.createPlacedBlock(
      this.buildPosition.x,
      this.buildPosition.y,
      this.buildPosition.z,
      item
    );

    console.log(`🧱 Placed ${RESOURCES[item]?.name || CRAFTABLES[item]?.name}!`);

    // Update UIs
    this.updateInventoryUI();
    this.updateHotbarUI();

    return true;
  }

  /**
   * Create a player-placed block
   */
  createPlacedBlock(x, y, z, itemType) {
    const material = this.materials[itemType];
    if (!material) return null;

    const mesh = new THREE.Mesh(this.blockGeometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const block = {
      mesh,
      type: itemType,
      position: new THREE.Vector3(x, y, z),
      isPlaced: true
    };

    mesh.userData.block = block;
    this.placedBlocks.push(block);
    this.blockMeshes.add(mesh);

    return block;
  }

  /**
   * Remove a placed block (get resources back)
   */
  removeBlock(block) {
    if (!block.isPlaced) return;

    // Return item to inventory
    if (RESOURCES[block.type]) {
      this.inventory[block.type]++;
    } else if (CRAFTABLES[block.type]) {
      this.craftedItems[block.type]++;
    }

    // Remove from scene
    this.blockMeshes.remove(block.mesh);
    const index = this.placedBlocks.indexOf(block);
    if (index > -1) {
      this.placedBlocks.splice(index, 1);
    }

    this.updateInventoryUI();
    this.updateHotbarUI();

    console.log(`Removed ${RESOURCES[block.type]?.name || CRAFTABLES[block.type]?.name}`);
  }

  /**
   * Handle number key press for hotbar
   */
  handleHotkey(num) {
    if (num >= 1 && num <= this.hotbar.length) {
      this.selectHotbar(num - 1);
    }
  }
}
