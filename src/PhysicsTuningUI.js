/**
 * PhysicsTuningUI - Real-time physics parameter tuning overlay
 *
 * Press '~' (tilde) to toggle the tuning panel
 * - Adjust sliders to change physics in real-time
 * - Use presets for quick feel changes
 * - Export/Import configs for saving
 */

import {
  PHYSICS_CONFIG,
  PHYSICS_PRESETS,
  getConfig,
  setConfig,
  applyPreset,
  exportConfig,
  importConfig,
  getCategories
} from './PhysicsConfig.js';

export class PhysicsTuningUI {
  constructor() {
    this.visible = false;
    this.currentCategory = 'edge';
    this.container = null;
    this.onConfigChange = null;  // Callback when config changes

    this.init();
  }

  init() {
    // Create container
    this.container = document.createElement('div');
    this.container.id = 'physics-tuning-ui';
    this.container.innerHTML = this.generateHTML();
    document.body.appendChild(this.container);

    // Add styles
    this.addStyles();

    // Set up event listeners
    this.setupEventListeners();

    // Initially hidden
    this.hide();

    // Keyboard shortcut
    document.addEventListener('keydown', (e) => {
      if (e.key === '`' || e.key === '~') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  generateHTML() {
    const categories = getCategories();

    return `
      <div class="tuning-header">
        <h2>Physics Tuning</h2>
        <div class="tuning-controls">
          <button id="tuning-close" title="Close (press ~)">×</button>
        </div>
      </div>

      <div class="tuning-presets">
        <label>Presets:</label>
        <select id="preset-select">
          ${Object.entries(PHYSICS_PRESETS).map(([key, preset]) =>
            `<option value="${key}">${preset.name}</option>`
          ).join('')}
        </select>
        <button id="apply-preset">Apply</button>
        <button id="export-config">Export</button>
        <button id="import-config">Import</button>
      </div>

      <div class="tuning-tabs">
        ${categories.map(cat =>
          `<button class="tab-btn ${cat === this.currentCategory ? 'active' : ''}"
                   data-category="${cat}">${this.formatCategoryName(cat)}</button>`
        ).join('')}
      </div>

      <div class="tuning-content" id="tuning-params">
        ${this.generateCategoryParams(this.currentCategory)}
      </div>

      <div class="tuning-footer">
        <div class="tuning-hint">Press ~ to toggle | Changes apply immediately</div>
        <div class="tuning-stats" id="tuning-stats"></div>
      </div>
    `;
  }

  generateCategoryParams(category) {
    const params = PHYSICS_CONFIG[category];
    if (!params) return '<div class="no-params">No parameters</div>';

    return Object.entries(params).map(([key, param]) => `
      <div class="param-row" data-path="${category}.${key}">
        <div class="param-header">
          <label class="param-name" title="${param.description}">${param.name}</label>
          <span class="param-value" id="val-${category}-${key}">${param.value.toFixed(3)}</span>
          <span class="param-unit">${param.unit || ''}</span>
        </div>
        <div class="param-control">
          <input type="range"
                 id="slider-${category}-${key}"
                 min="${param.min}"
                 max="${param.max}"
                 step="${param.step}"
                 value="${param.value}"
                 class="param-slider">
          <button class="reset-btn" data-path="${category}.${key}" title="Reset to default">↺</button>
        </div>
        <div class="param-desc">${param.description}</div>
      </div>
    `).join('');
  }

  formatCategoryName(name) {
    return name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  }

  addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #physics-tuning-ui {
        position: fixed;
        top: 10px;
        right: 10px;
        width: 380px;
        max-height: calc(100vh - 20px);
        background: rgba(15, 15, 20, 0.95);
        border: 1px solid rgba(100, 150, 255, 0.3);
        border-radius: 8px;
        color: #e0e0e0;
        font-family: 'Consolas', 'Monaco', monospace;
        font-size: 12px;
        z-index: 10000;
        display: flex;
        flex-direction: column;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(10px);
      }

      #physics-tuning-ui.hidden {
        display: none;
      }

      .tuning-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 15px;
        border-bottom: 1px solid rgba(100, 150, 255, 0.2);
        background: rgba(30, 40, 60, 0.5);
      }

      .tuning-header h2 {
        margin: 0;
        font-size: 14px;
        color: #80b0ff;
        font-weight: 600;
      }

      #tuning-close {
        background: none;
        border: none;
        color: #888;
        font-size: 20px;
        cursor: pointer;
        padding: 0 5px;
      }

      #tuning-close:hover {
        color: #ff6666;
      }

      .tuning-presets {
        display: flex;
        gap: 8px;
        padding: 10px 15px;
        border-bottom: 1px solid rgba(100, 150, 255, 0.15);
        align-items: center;
        flex-wrap: wrap;
      }

      .tuning-presets label {
        color: #888;
      }

      .tuning-presets select {
        background: rgba(40, 50, 70, 0.8);
        border: 1px solid rgba(100, 150, 255, 0.3);
        color: #e0e0e0;
        padding: 4px 8px;
        border-radius: 4px;
        font-family: inherit;
      }

      .tuning-presets button {
        background: rgba(60, 100, 180, 0.4);
        border: 1px solid rgba(100, 150, 255, 0.4);
        color: #b0c8ff;
        padding: 4px 10px;
        border-radius: 4px;
        cursor: pointer;
        font-family: inherit;
        font-size: 11px;
      }

      .tuning-presets button:hover {
        background: rgba(80, 120, 200, 0.5);
      }

      .tuning-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 2px;
        padding: 8px 10px;
        border-bottom: 1px solid rgba(100, 150, 255, 0.15);
        background: rgba(20, 25, 35, 0.5);
      }

      .tab-btn {
        background: rgba(40, 50, 70, 0.5);
        border: 1px solid transparent;
        color: #888;
        padding: 5px 10px;
        border-radius: 4px;
        cursor: pointer;
        font-family: inherit;
        font-size: 11px;
        transition: all 0.15s;
      }

      .tab-btn:hover {
        background: rgba(60, 80, 110, 0.6);
        color: #aaa;
      }

      .tab-btn.active {
        background: rgba(60, 100, 180, 0.5);
        border-color: rgba(100, 150, 255, 0.4);
        color: #b0c8ff;
      }

      .tuning-content {
        flex: 1;
        overflow-y: auto;
        padding: 10px 15px;
        max-height: 60vh;
      }

      .param-row {
        margin-bottom: 15px;
        padding-bottom: 12px;
        border-bottom: 1px solid rgba(100, 150, 255, 0.1);
      }

      .param-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 5px;
      }

      .param-name {
        flex: 1;
        color: #c0d0f0;
        cursor: help;
      }

      .param-value {
        font-family: monospace;
        color: #80ff80;
        background: rgba(0, 80, 0, 0.3);
        padding: 2px 6px;
        border-radius: 3px;
        min-width: 60px;
        text-align: right;
      }

      .param-unit {
        color: #666;
        min-width: 30px;
      }

      .param-control {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .param-slider {
        flex: 1;
        height: 6px;
        -webkit-appearance: none;
        background: rgba(60, 80, 120, 0.5);
        border-radius: 3px;
        outline: none;
      }

      .param-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 14px;
        height: 14px;
        background: #6090d0;
        border-radius: 50%;
        cursor: pointer;
        border: 2px solid #4070b0;
      }

      .param-slider::-webkit-slider-thumb:hover {
        background: #70a0e0;
      }

      .reset-btn {
        background: rgba(80, 60, 60, 0.5);
        border: 1px solid rgba(150, 100, 100, 0.3);
        color: #c0a0a0;
        padding: 2px 6px;
        border-radius: 3px;
        cursor: pointer;
        font-size: 12px;
      }

      .reset-btn:hover {
        background: rgba(120, 80, 80, 0.6);
      }

      .param-desc {
        font-size: 10px;
        color: #666;
        margin-top: 4px;
        line-height: 1.3;
      }

      .tuning-footer {
        padding: 8px 15px;
        border-top: 1px solid rgba(100, 150, 255, 0.15);
        background: rgba(20, 25, 35, 0.5);
        display: flex;
        justify-content: space-between;
      }

      .tuning-hint {
        color: #555;
        font-size: 10px;
      }

      .tuning-stats {
        color: #80b080;
        font-size: 10px;
      }

      /* Scrollbar styling */
      .tuning-content::-webkit-scrollbar {
        width: 6px;
      }

      .tuning-content::-webkit-scrollbar-track {
        background: rgba(20, 25, 35, 0.5);
      }

      .tuning-content::-webkit-scrollbar-thumb {
        background: rgba(100, 150, 255, 0.3);
        border-radius: 3px;
      }

      .tuning-content::-webkit-scrollbar-thumb:hover {
        background: rgba(100, 150, 255, 0.5);
      }
    `;
    document.head.appendChild(style);
  }

  setupEventListeners() {
    // Close button
    this.container.querySelector('#tuning-close').addEventListener('click', () => {
      this.hide();
    });

    // Tab buttons
    this.container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchCategory(btn.dataset.category);
      });
    });

    // Preset controls
    this.container.querySelector('#apply-preset').addEventListener('click', () => {
      const preset = this.container.querySelector('#preset-select').value;
      applyPreset(preset);
      this.refreshParams();
      this.showMessage(`Applied preset: ${PHYSICS_PRESETS[preset].name}`);
    });

    this.container.querySelector('#export-config').addEventListener('click', () => {
      const json = exportConfig();
      navigator.clipboard.writeText(json).then(() => {
        this.showMessage('Config copied to clipboard!');
      });
    });

    this.container.querySelector('#import-config').addEventListener('click', () => {
      const json = prompt('Paste config JSON:');
      if (json) {
        if (importConfig(json)) {
          this.refreshParams();
          this.showMessage('Config imported!');
        } else {
          this.showMessage('Import failed!', true);
        }
      }
    });

    // Slider changes (delegated)
    this.container.addEventListener('input', (e) => {
      if (e.target.classList.contains('param-slider')) {
        const path = e.target.id.replace('slider-', '').replace('-', '.');
        const value = parseFloat(e.target.value);
        setConfig(path, value);

        // Update value display
        const parts = path.split('.');
        const valueEl = this.container.querySelector(`#val-${parts[0]}-${parts[1]}`);
        if (valueEl) {
          valueEl.textContent = value.toFixed(3);
        }

        // Callback for live update
        if (this.onConfigChange) {
          this.onConfigChange(path, value);
        }
      }
    });

    // Reset buttons (delegated)
    this.container.addEventListener('click', (e) => {
      if (e.target.classList.contains('reset-btn')) {
        // Reset would require storing defaults
        this.showMessage('Reset not implemented yet');
      }
    });
  }

  switchCategory(category) {
    this.currentCategory = category;

    // Update tab buttons
    this.container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.category === category);
    });

    // Regenerate params
    this.container.querySelector('#tuning-params').innerHTML =
      this.generateCategoryParams(category);
  }

  refreshParams() {
    this.container.querySelector('#tuning-params').innerHTML =
      this.generateCategoryParams(this.currentCategory);
  }

  show() {
    this.visible = true;
    this.container.classList.remove('hidden');
  }

  hide() {
    this.visible = false;
    this.container.classList.add('hidden');
  }

  toggle() {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  showMessage(msg, isError = false) {
    const stats = this.container.querySelector('#tuning-stats');
    stats.textContent = msg;
    stats.style.color = isError ? '#ff8080' : '#80ff80';
    setTimeout(() => {
      stats.textContent = '';
    }, 2000);
  }

  updateStats(speed, gForce, flowState) {
    const stats = this.container.querySelector('#tuning-stats');
    if (stats && !stats.textContent.includes('!')) {
      stats.textContent = `Speed: ${speed.toFixed(1)} | G: ${gForce.toFixed(2)} | Flow: ${(flowState * 100).toFixed(0)}%`;
    }
  }
}

// Export singleton
let tuningUI = null;

export function initPhysicsTuningUI() {
  if (!tuningUI) {
    tuningUI = new PhysicsTuningUI();
  }
  return tuningUI;
}

export function getPhysicsTuningUI() {
  return tuningUI;
}
