// ============================================================
// 系统设置
// ============================================================
const DEFAULT_SETTINGS = {
  themeMode: 'light',
  radius: '8px',
  shadow: '0 2px 8px rgba(0,0,0,0.08)',
  'fontSize-base': '13',
  fontFamily: "'Microsoft YaHei', 'PingFang SC', sans-serif",
  'table-fontSize': '13',
  'table-rowHeight': '40',
  'table-zebra': false,
  'table-compact': false,
  primary: '#3b82f6',
  'sidebar-bg': '#1e293b',
  bg: '#f1f5f9',
  'card-bg': '#ffffff',
  text: '#1e293b',
  'sidebar-width': '220',
  'content-padding': '18',
  'window-width': '1400',
  'window-height': '900',
  'window-resolution': '1400x900',
  'window-fullscreen': false,
  'window-maximized': false
};

const LEGACY_FONT_SETTING_KEYS = [
  'fontSize-title',
  'fontSize-h1',
  'fontSize-members',
  'fontSize-deptTree',
  'fontSize-sidebar',
  'fontSize-orders'
];

const COLOR_PRESETS = {
  blue: { primary: '#3b82f6', 'sidebar-bg': '#1e293b', bg: '#f1f5f9', 'card-bg': '#ffffff', text: '#1e293b' },
  green: { primary: '#22c55e', 'sidebar-bg': '#14532d', bg: '#f0fdf4', 'card-bg': '#ffffff', text: '#166534' },
  purple: { primary: '#8b5cf6', 'sidebar-bg': '#4c1d95', bg: '#f5f3ff', 'card-bg': '#ffffff', text: '#4c1d95' },
  orange: { primary: '#f59e0b', 'sidebar-bg': '#78350f', bg: '#fffbeb', 'card-bg': '#ffffff', text: '#78350f' },
  red: { primary: '#ef4444', 'sidebar-bg': '#7f1d1d', bg: '#fef2f2', 'card-bg': '#ffffff', text: '#7f1d1d' }
};

const THEME_PALETTES = {
  light: {
    'surface-soft': '#f8fafc',
    'surface-muted': '#f1f5f9',
    'surface-strong': '#e2e8f0',
    'member-link': '#2563eb',
    'member-link-hover': '#f59e0b',
    'member-list-link': '#0f172a',
    'dept-large-color': '#d97706',
    'dept-sub-color': '#059669',
    'summary-gradient-start': '#eff6ff',
    'summary-gradient-end': '#f0fdf4',
    'adjust-bg-start': '#fffdf7',
    'adjust-bg-end': '#ffffff',
    'adjust-title': '#92400e',
    'adjust-empty-border': '#f1c27d',
    'adjust-empty-bg': '#fff7ed',
    'adjust-empty-text': '#9a3412',
    'adjust-table-head-bg': '#fff7ed',
    'adjust-table-head-text': '#9a3412',
    'adjust-table-head-border': '#fed7aa',
    'adjust-table-row-border': '#ffedd5',
    'adjust-table-row-hover': '#fffaf0',
    'work-header-bg': '#059669',
    'work-header-text': '#ffffff',
    'work-select-bg': '#d1fae5',
    'work-select-text': '#065f46',
    'work-cell-filled-bg': '#bfdbfe',
    'work-total-bg': '#fef9c3',
    'work-total-text': '#92400e',
    'work-delete-bg': '#fee2e2',
    'work-delete-text': '#dc2626'
  },
  soft: {
    'bg': '#1f2937',
    'card-bg': '#edf4fb',
    'text': '#1f2937',
    'text-muted': '#64748b',
    'border': '#9fb4cc',
    'surface-soft': '#dbe7f5',
    'surface-muted': '#d2deed',
    'surface-strong': '#b9cadf',
    'member-link': '#1d4ed8',
    'member-link-hover': '#d97706',
    'member-list-link': '#0f172a',
    'dept-large-color': '#c2410c',
    'dept-sub-color': '#0f766e',
    'summary-gradient-start': '#dbeafe',
    'summary-gradient-end': '#e0f2fe',
    'adjust-bg-start': '#fff7ed',
    'adjust-bg-end': '#fefce8',
    'adjust-title': '#9a3412',
    'adjust-empty-border': '#fdba74',
    'adjust-empty-bg': '#fff1df',
    'adjust-empty-text': '#9a3412',
    'adjust-table-head-bg': '#ffedd5',
    'adjust-table-head-text': '#9a3412',
    'adjust-table-head-border': '#fdba74',
    'adjust-table-row-border': '#fed7aa',
    'adjust-table-row-hover': '#fff7ed',
    'work-header-bg': '#0f766e',
    'work-header-text': '#ecfeff',
    'work-select-bg': '#ccfbf1',
    'work-select-text': '#115e59',
    'work-cell-filled-bg': '#bfdbfe',
    'work-total-bg': '#fef3c7',
    'work-total-text': '#92400e',
    'work-delete-bg': '#fee2e2',
    'work-delete-text': '#b91c1c'
  },
  dark: {
    'bg': '#0f172a',
    'card-bg': '#1e293b',
    'text': '#f1f5f9',
    'text-muted': '#94a3b8',
    'border': '#334155',
    'surface-soft': '#172033',
    'surface-muted': '#243244',
    'surface-strong': '#334155',
    'member-link': '#93c5fd',
    'member-link-hover': '#fbbf24',
    'member-list-link': '#e2e8f0',
    'dept-large-color': '#fbbf24',
    'dept-sub-color': '#34d399',
    'summary-gradient-start': '#172554',
    'summary-gradient-end': '#163d2f',
    'adjust-bg-start': '#3f2b16',
    'adjust-bg-end': '#1e293b',
    'adjust-title': '#fdba74',
    'adjust-empty-border': '#9a3412',
    'adjust-empty-bg': '#3f2b16',
    'adjust-empty-text': '#fed7aa',
    'adjust-table-head-bg': '#422006',
    'adjust-table-head-text': '#fed7aa',
    'adjust-table-head-border': '#7c2d12',
    'adjust-table-row-border': '#4b2d19',
    'adjust-table-row-hover': '#312012',
    'work-header-bg': '#0f766e',
    'work-header-text': '#ecfeff',
    'work-select-bg': '#123d3a',
    'work-select-text': '#99f6e4',
    'work-cell-filled-bg': '#1d4ed8',
    'work-total-bg': '#4d3c12',
    'work-total-text': '#fde68a',
    'work-delete-bg': '#4c1d1d',
    'work-delete-text': '#fecaca'
  }
};

let _currentSettings = { ...DEFAULT_SETTINGS };
let _systemThemeMediaQuery = null;
let _systemThemeWatcherBound = false;

function normalizeSettings(settings) {
  const normalized = { ...settings };
  LEGACY_FONT_SETTING_KEYS.forEach(key => delete normalized[key]);
  if (!normalized['fontSize-base']) {
    normalized['fontSize-base'] = DEFAULT_SETTINGS['fontSize-base'];
  }
  if (!normalized.themeMode) {
    normalized.themeMode = normalized.darkmode ? 'dark' : DEFAULT_SETTINGS.themeMode;
  }
  delete normalized.darkmode;
  return normalized;
}

function ensureSystemThemeWatcher() {
  if (_systemThemeWatcherBound || !window.matchMedia) return;
  _systemThemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const onThemeChange = () => {
    if (_currentSettings.themeMode === 'system') {
      applyThemeMode('system');
      updateControlDisplay('themeMode', 'system');
    }
  };
  if (_systemThemeMediaQuery.addEventListener) {
    _systemThemeMediaQuery.addEventListener('change', onThemeChange);
  } else if (_systemThemeMediaQuery.addListener) {
    _systemThemeMediaQuery.addListener(onThemeChange);
  }
  _systemThemeWatcherBound = true;
}

function getResolvedThemeMode(mode = _currentSettings.themeMode) {
  if (mode === 'system') {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  if (mode === 'soft') return 'soft';
  return mode === 'dark' ? 'dark' : 'light';
}

function applyThemeMode(mode = _currentSettings.themeMode) {
  const root = document.documentElement;
  const resolvedMode = getResolvedThemeMode(mode);
  const palette = THEME_PALETTES[resolvedMode] || THEME_PALETTES.light;

  if (resolvedMode === 'light') {
    root.style.setProperty('--bg', _currentSettings.bg || '#f1f5f9');
    root.style.setProperty('--card-bg', _currentSettings['card-bg'] || '#ffffff');
    root.style.setProperty('--text', _currentSettings.text || '#1e293b');
    root.style.setProperty('--text-muted', '#64748b');
    root.style.setProperty('--border', '#e2e8f0');
  } else {
    root.style.setProperty('--bg', palette['bg']);
    root.style.setProperty('--card-bg', palette['card-bg']);
    root.style.setProperty('--text', palette['text']);
    root.style.setProperty('--text-muted', palette['text-muted']);
    root.style.setProperty('--border', palette['border']);
  }

  for (const [key, val] of Object.entries(palette)) {
    if (['bg', 'card-bg', 'text', 'text-muted', 'border'].includes(key)) continue;
    root.style.setProperty(`--${key}`, val);
  }

}

async function loadSettings() {
  // 优先从数据库加载设置
  try {
    const dbSettings = await get('/api/app-settings-all');
    if (dbSettings && Object.keys(dbSettings).length > 0) {
      // 从数据库加载（带 ui_ 前缀），去掉前缀后合并默认值
      const normalized = {};
      for (const key in dbSettings) {
        if (key.startsWith('ui_')) {
          normalized[key.slice(3)] = dbSettings[key];  // 去掉 ui_ 前缀
        } else {
          normalized[key] = dbSettings[key];  // 保留不带前缀的
        }
      }
      _currentSettings = normalizeSettings({ ...DEFAULT_SETTINGS, ...normalized });
      // 同时更新 localStorage（保持一致性）
      localStorage.setItem('li_jie_hr_settings', JSON.stringify(_currentSettings));
      return;
    }
  } catch (e) {
    console.log('从数据库加载设置失败:', e);
  }
  
  // 数据库没有则从 localStorage 加载
  try {
    const saved = localStorage.getItem('li_jie_hr_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      _currentSettings = normalizeSettings({ ...DEFAULT_SETTINGS, ...parsed });
    }
  } catch (e) {
    _currentSettings = { ...DEFAULT_SETTINGS };
  }
}

function applyAllSettings() {
  ensureSystemThemeWatcher();
  for (const key in _currentSettings) {
    applySetting(key, _currentSettings[key], true);
  }
}

function applySetting(key, value, skipSave = false) {
  _currentSettings[key] = value;
  const root = document.documentElement;

  switch (key) {
    case 'themeMode':
      applyThemeMode(value);
      break;
    case 'radius':
    case 'shadow':
      root.style.setProperty('--' + key, value);
      break;
    case 'sidebar-width':
      root.style.setProperty('--sidebar-width', value + 'px');
      break;
    case 'content-padding':
      root.style.setProperty('--content-padding', value + 'px');
      break;
    case 'fontFamily':
      // 直接设置字体族，font-family 值本身可以包含引号，无需再外套
      root.style.setProperty('--font-family', value);
      break;
    case 'fontSize-base':
      root.style.setProperty('--font-size-base', value + 'px');
      break;
    case 'table-fontSize':
      root.style.setProperty('--table-font-size', value + 'px');
      document.querySelectorAll('.settings-preview-table').forEach(t => t.style.fontSize = value + 'px');
      break;
    case 'table-rowHeight':
      root.style.setProperty('--table-row-height', value + 'px');
      break;
    case 'table-zebra':
      document.querySelectorAll('.spreadsheet').forEach(t => {
        t.classList.toggle('table-zebra', value);
      });
      break;
    case 'table-compact':
      if (value) {
        root.style.setProperty('--content-padding', '10px');
        root.style.setProperty('--table-font-size', '11px');
      } else {
        root.style.setProperty('--content-padding', _currentSettings['content-padding'] + 'px');
        root.style.setProperty('--table-font-size', _currentSettings['table-fontSize'] + 'px');
      }
      _toggleCompactLayoutLock(value);
      break;
    case 'primary':
    case 'sidebar-bg':
    case 'bg':
    case 'card-bg':
    case 'text':
      if (key === 'primary' || key === 'sidebar-bg') {
        root.style.setProperty('--' + key.replace(/([A-Z])/g, '-$1').toLowerCase(), value);
      }
      if (getResolvedThemeMode() === 'light') {
        if (key === 'bg') root.style.setProperty('--bg', value);
        if (key === 'card-bg') root.style.setProperty('--card-bg', value);
        if (key === 'text') root.style.setProperty('--text', value);
        if (key === 'sidebar-bg') root.style.setProperty('--sidebar-bg', value);
      }
      // 更新 primary 相关的派生色
      if (key === 'primary') {
        root.style.setProperty('--primary-dark', adjustColor(value, -20));
        root.style.setProperty('--primary-light', adjustColor(value, 60, true));
        root.style.setProperty('--sidebar-active', value);
      }
      break;
  }

  // 更新控件显示
  updateControlDisplay(key, value);
  if (!skipSave) saveSettingsDebounced();
}

function updateControlDisplay(key, value) {
  const el = document.getElementById('s-' + key);
  if (!el) {
    const radioEls = document.querySelectorAll(`input[name="s-${key}"]`);
    if (radioEls.length) {
      radioEls.forEach(radio => {
        radio.checked = radio.value === String(value);
      });
    }
    return;
  }
  if (el.type === 'checkbox') {
    el.checked = value;
  } else if (el.tagName === 'SELECT') {
    el.value = value;
  } else if (el.type === 'range') {
    el.value = value;
    updateSliderVal(key, value);
  } else if (el.type === 'color') {
    el.value = value;
    updateColorHex(key, value);
  }
}

function updateSliderVal(key, value) {
  const valEl = document.getElementById('s-' + key + '-val');
  if (valEl) valEl.textContent = value + 'px';
}

// 双击滑块数值输入自定义值
function editSliderVal(key, el) {
  const currentVal = parseInt(el.textContent) || 13;
  const slider = document.getElementById('s-' + key);

  let min = 8, max = 32;
  if (slider) { min = parseInt(slider.min) || min; max = parseInt(slider.max) || max; }

  const input = document.createElement('input');
  input.type = 'number';
  input.value = currentVal;
  input.min = min;
  input.max = max;
  input.style.cssText = 'width:60px;padding:2px 4px;border:1px solid var(--primary);border-radius:4px;font-size:var(--font-size-12);text-align:center;';
  
  const saveValue = () => {
    let val = parseInt(input.value);
    if (isNaN(val)) val = currentVal;
    const min = parseInt(input.min);
    const max = parseInt(input.max);
    val = Math.max(min, Math.min(max, val));
    
    el.textContent = val + 'px';
    
    const slider = document.getElementById('s-' + key);
    if (slider) slider.value = val;
    
    applySetting(key, val, true);
    _currentSettings[key] = val;
    saveSettings();
    
    input.remove();
  };
  
  input.onblur = saveValue;
  input.onkeydown = (e) => {
    if (e.key === 'Enter') {
      input.blur();
    } else if (e.key === 'Escape') {
      el.textContent = currentVal + 'px';
      el.style.display = '';
    }
  };
  
  el.textContent = '';
  el.appendChild(input);
  input.focus();
  input.select();
}

// 分辨率预设列表
const RESOLUTION_PRESETS = [
  { w: 2560, h: 1600, label: '2560 × 1600 (推荐)' },
  { w: 2560, h: 1440, label: '2560 × 1440' },
  { w: 2048, h: 1536, label: '2048 × 1536' },
  { w: 2048, h: 1152, label: '2048 × 1152' },
  { w: 1920, h: 1440, label: '1920 × 1440' },
  { w: 1920, h: 1200, label: '1920 × 1200' },
  { w: 1920, h: 1080, label: '1920 × 1080' },
  { w: 1856, h: 1392, label: '1856 × 1392' },
  { w: 1792, h: 1344, label: '1792 × 1344' },
  { w: 1680, h: 1050, label: '1680 × 1050' },
  { w: 1600, h: 1200, label: '1600 × 1200' },
  { w: 1600, h: 900, label: '1600 × 900' },
  { w: 1440, h: 900, label: '1440 × 900' },
  { w: 1400, h: 1050, label: '1400 × 1050' },
  { w: 1366, h: 768, label: '1366 × 768' },
  { w: 1360, h: 768, label: '1360 × 768' },
  { w: 1280, h: 1024, label: '1280 × 1024' },
  { w: 1280, h: 960, label: '1280 × 960' },
  { w: 1280, h: 800, label: '1280 × 800' },
  { w: 1280, h: 768, label: '1280 × 768' },
  { w: 1280, h: 720, label: '1280 × 720' },
  { w: 1280, h: 600, label: '1280 × 600' },
  { w: 1152, h: 864, label: '1152 × 864' },
  { w: 1024, h: 768, label: '1024 × 768' },
  { w: 800, h: 600, label: '800 × 600' }
];

// 分辨率下拉框变化
function onResolutionChange(value) {
  if (value === 'custom') {
    // 保持当前值，等待用户双击自定义
    return;
  }
  const [w, h] = value.split('x').map(Number);
  if (w && h) {
    // 更新显示
    const valEl = document.getElementById('s-window-res-val');
    if (valEl) {
      valEl.textContent = `${w} × ${h}`;
    }
    // 更新设置
    _currentSettings['window-width'] = w;
    _currentSettings['window-height'] = h;
    _currentSettings['window-resolution'] = value;
    // 保存设置
    saveSettings();
    // 立即应用窗口设置
    applyWindowSettings();
  }
}

// 双击分辨率数值自定义
function editResolutionVal(el) {
  const currentText = el.textContent.trim();
  const match = currentText.match(/(\d+)\s*×\s*(\d+)/);
  const currentW = match ? parseInt(match[1]) : 1400;
  const currentH = match ? parseInt(match[2]) : 900;
  
  const input = document.createElement('input');
  input.type = 'text';
  input.value = `${currentW}x${currentH}`;
  input.placeholder = '宽x高，如 1920x1080';
  input.style.cssText = 'width:100px;padding:4px 6px;border:1px solid var(--primary);border-radius:4px;font-size:var(--font-size-13);text-align:center;';
  
  const saveValue = () => {
    const val = input.value.trim();
    const parts = val.split(/[xX×,，\s]+/).map(Number);
    let w = parts[0] || currentW;
    let h = parts[1] || currentH;
    
    // 限制范围
    w = Math.max(800, Math.min(3840, w));
    h = Math.max(600, Math.min(2160, h));
    
    // 更新显示
    el.textContent = `${w} × ${h}`;
    
    // 查找是否匹配预设
    const preset = RESOLUTION_PRESETS.find(r => r.w === w && r.h === h);
    const select = document.getElementById('s-window-resolution');
    if (select) {
      if (preset) {
        select.value = `${w}x${h}`;
        _currentSettings['window-resolution'] = `${w}x${h}`;
      } else {
        select.value = 'custom';
        _currentSettings['window-resolution'] = 'custom';
      }
    }
    
    // 更新宽高设置
    _currentSettings['window-width'] = w;
    _currentSettings['window-height'] = h;
    saveSettings();
    applyWindowSettings();
    
    el.style.display = '';
  };
  
  input.onblur = saveValue;
  input.onkeydown = (e) => {
    if (e.key === 'Enter') {
      input.blur();
    } else if (e.key === 'Escape') {
      el.textContent = currentText;
      el.style.display = '';
    }
  };
  
  el.textContent = '';
  el.appendChild(input);
  input.focus();
  input.select();
}

function updateColorHex(key, value) {
  const hexEl = document.getElementById('s-' + key + '-hex');
  if (hexEl) hexEl.textContent = value;
}

function applyColorPreset(preset) {
  if (preset === 'custom') return;
  const colors = COLOR_PRESETS[preset];
  if (colors) {
    for (const [key, value] of Object.entries(colors)) {
      applySetting(key, value, true);
      _currentSettings[key] = value;
    }
    saveSettings();
  }
}

let _saveTimer = null;
function saveSettingsDebounced() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    saveSettings(true).catch(e => console.error('保存设置失败:', e));
  }, 300);
}

async function saveSettings(silent = false) {
  // 同时保存到 localStorage 和数据库
  localStorage.setItem('li_jie_hr_settings', JSON.stringify(_currentSettings));
  
  // 保存到数据库时，给所有键加上 ui_ 前缀
  const dbSettings = {};
  for (const key in _currentSettings) {
    dbSettings['ui_' + key] = _currentSettings[key];
  }
  try {
    await post('/api/app-settings-all', dbSettings);
  } catch (e) {
    console.error('保存设置到数据库失败:', e);
  }
  
  if (!silent) showToast('设置已保存', 'success');
}

function resetSettings() {
  _currentSettings = { ...DEFAULT_SETTINGS };
  applyAllSettings();
  initSettingsPage();
  saveSettings();
  const validKeys = Object.keys(DEFAULT_SETTINGS).map(k => 'ui_' + k);
  validKeys.push('ui_globalYear', 'ui_globalMonth');
  post('/api/settings/clear-orphaned', { valid_keys: validKeys }).catch(() => {});
  showToast('已恢复默认设置', 'info');
}

function resetAllSettings() {
  if (confirm('确定要重置所有设置吗？这将恢复所有设置为默认值。')) {
    resetSettings();
  }
}

function exportSettings() {
  const data = JSON.stringify(_currentSettings, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lijie_hr_settings_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('设置已导出', 'success');
}

function importSettings(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      _currentSettings = normalizeSettings({ ...DEFAULT_SETTINGS, ...data });
      applyAllSettings();
      initSettingsPage();
      saveSettings();
      showToast('设置已导入', 'success');
    } catch (err) {
      showToast('导入失败：文件格式错误', 'error');
    }
  };
  reader.readAsText(file);
  input.value = '';
}

function clearQuickCalcSaves() {
  if (confirm('确定要清除快捷计算的自动保存数据吗？')) {
    post('/api/quick-calc-save/clear').then(res => {
      if (res.ok) {
        showToast(`已清除 ${res.cleared || 0} 条快捷计算保存数据`, 'success');
      } else {
        showToast('清除失败：' + (res.error || '未知错误'), 'error');
      }
    }).catch(err => {
      showToast('请求失败：' + err.message, 'error');
    });
  }
}

// ── 数据库导入导出 ─────────────────────────────────────────

async function exportDatabase() {
  try {
    const result = await get('/api/database/export');
    if (result.ok) {
      // 将 base64 数据转换为文件下载
      const byteCharacters = atob(result.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/x-sqlite3' });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `li_jie_hr_backup_${new Date().toISOString().slice(0,10)}.db`;
      a.click();
      URL.revokeObjectURL(url);
      
      showToast('数据库已导出', 'success');
    } else {
      showToast('导出失败：' + result.error, 'error');
    }
  } catch (err) {
    showToast('导出失败：' + err.message, 'error');
  }
}

async function importDatabase(input) {
  const file = input.files[0];
  if (!file) return;
  
  if (!confirm('警告：导入数据库将覆盖当前所有数据！\n\n建议先导出当前数据库作为备份。\n\n确定要继续吗？')) {
    input.value = '';
    return;
  }
  
  try {
    const reader = new FileReader();
    reader.onload = async function(e) {
      try {
        // 将文件转换为 base64
        const arrayBuffer = e.target.result;
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Data = btoa(binary);
        
        // 调用 API 导入
        const result = await post('/api/database/import', { data: base64Data });
        
        if (result.ok) {
          showToast('数据库导入成功，请刷新页面', 'success');
          // 延迟刷新页面
          setTimeout(() => {
            location.reload();
          }, 1500);
        } else {
          showToast('导入失败：' + result.error, 'error');
        }
      } catch (err) {
        showToast('导入失败：' + err.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  } catch (err) {
    showToast('读取文件失败：' + err.message, 'error');
  }
  
  input.value = '';
}

async function loadWindowSettingsFromFile() {
  // 从 window_settings.json 文件读取窗口设置并更新分辨率显示
  try {
    const result = await get('/api/window/settings');
    // 后端返回的是 result.config，不是 result.data
    const settings = result.config || result.data;
    if (result.ok && settings) {
      const width = settings.width || 1400;
      const height = settings.height || 900;
      
      // 更新当前设置
      _currentSettings['window-width'] = width;
      _currentSettings['window-height'] = height;
      
      // 更新分辨率显示
      const valEl = document.getElementById('s-window-res-val');
      if (valEl) {
        valEl.textContent = `${width} × ${height}`;
      }
      
      // 查找是否匹配预设分辨率
      const select = document.getElementById('s-window-resolution');
      if (select) {
        const presetKey = `${width}x${height}`;
        const hasPreset = Array.from(select.options).some(opt => opt.value === presetKey);
        if (hasPreset) {
          select.value = presetKey;
          _currentSettings['window-resolution'] = presetKey;
        } else {
          select.value = 'custom';
          _currentSettings['window-resolution'] = 'custom';
        }
      }
      
      // 更新全屏和最大化开关（互斥：只有一个能为 true）
      const fullscreen = settings.fullscreen || false;
      const maximized = settings.maximized || false;
      
      _currentSettings['window-fullscreen'] = fullscreen;
      _currentSettings['window-maximized'] = maximized;
      
      // 直接设置 checkbox 的 checked 状态
      const fsEl = document.getElementById('s-window-fullscreen');
      const maxEl = document.getElementById('s-window-maximized');
      
      if (fsEl) fsEl.checked = fullscreen;
      if (maxEl) maxEl.checked = maximized;
    }
  } catch (err) {
    console.log('读取窗口设置失败:', err);
  }
}

async function initSettingsPage() {
  // 先加载自定义字体（注入 @font-face，填充下拉框）
  await loadCustomFontsList();

  // 再从文件加载窗口设置（这会更新 _currentSettings 中的宽高值）
  await loadWindowSettingsFromFile();
  
  // 然后同步所有控件的值到 UI
  for (const key in _currentSettings) {
    updateControlDisplay(key, _currentSettings[key]);
  }

  LEGACY_FONT_SETTING_KEYS.forEach(key => {
    const legacyRow = document.getElementById('s-' + key)?.closest('.settings-row');
    if (legacyRow) legacyRow.remove();
  });

  if (_currentSettings['table-compact']) _toggleCompactLayoutLock(true);
}

// 最大化窗口开关变化（与全屏模式互斥）
async function onMaximizedChange(checked) {
  _currentSettings['window-maximized'] = checked;
  
  // 如果开启最大化，关闭全屏模式
  if (checked) {
    _currentSettings['window-fullscreen'] = false;
    const fsEl = document.getElementById('s-window-fullscreen');
    if (fsEl) fsEl.checked = false;
  }
  
  // 立即切换窗口最大化状态
  try {
    if (window.pywebview && window.pywebview.api) {
      await window.pywebview.api.toggle_maximize();
    }
  } catch (e) {
    console.error('切换最大化失败:', e);
  }
  
  // 保存到文件（保存当前互斥后的状态）
  await saveWindowSettings();
  
  // 调试：确认保存的值
  console.log('最大化开关变化:', {maximized: checked, fullscreen: _currentSettings['window-fullscreen']});
}

// 全屏模式开关变化（与最大化窗口互斥）
async function onFullscreenChange(checked) {
  _currentSettings['window-fullscreen'] = checked;
  
  // 如果开启全屏，关闭最大化窗口
  if (checked) {
    _currentSettings['window-maximized'] = false;
    const maxEl = document.getElementById('s-window-maximized');
    if (maxEl) maxEl.checked = false;
  }
  
  // 立即切换全屏状态
  try {
    if (window.pywebview && window.pywebview.api) {
      await window.pywebview.api.toggle_fullscreen();
    }
  } catch (e) {
    console.error('切换全屏失败:', e);
  }
  
  // 保存到文件（保存当前互斥后的状态）
  await saveWindowSettings();
  
  // 调试：确认保存的值
  console.log('全屏开关变化:', {fullscreen: checked, maximized: _currentSettings['window-maximized']});
}

// 保存窗口设置到文件
async function saveWindowSettings() {
  try {
    const settings = {
      width: parseInt(_currentSettings['window-width']) || 1400,
      height: parseInt(_currentSettings['window-height']) || 900,
      fullscreen: _currentSettings['window-fullscreen'] || false,
      maximized: _currentSettings['window-maximized'] || false
    };
    
    console.log('保存窗口设置:', settings);
    
    const result = await post('/api/window/settings', settings);
    if (result.ok) {
      showToast('窗口设置已保存', 'success');
    } else {
      showToast('保存窗口设置失败', 'error');
    }
  } catch (err) {
    console.error('保存窗口设置失败:', err);
    showToast('保存窗口设置失败', 'error');
  }
}

// 应用窗口设置
async function applyWindowSettings() {
  const width = parseInt(_currentSettings['window-width']) || 1400;
  const height = parseInt(_currentSettings['window-height']) || 900;
  const fullscreen = _currentSettings['window-fullscreen'] || false;
  const maximized = _currentSettings['window-maximized'] || false;

  try {
    // 调用后端 API 设置窗口大小
    const result = await post('/api/window/settings', {
      width: width,
      height: height,
      fullscreen: fullscreen,
      maximized: maximized
    });

    if (result.ok) {
      showToast('窗口设置已保存，重启程序后生效', 'success');
    } else {
      showToast('设置失败：' + (result.error || '未知错误'), 'error');
    }
  } catch (err) {
    showToast('设置失败：' + err.message, 'error');
  }
}

// ── 自定义字体管理 ─────────────────────────────────────────

/**
 * 注入 @font-face 声明到文档
 * @param {string} fontFamily - CSS font-family 名称
 * @param {string} filename   - fonts/ 下的文件名
 */
function injectFontFace(fontFamily, filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const formatMap = { ttf: 'truetype', ttc: 'truetype', woff: 'woff', woff2: 'woff2', otf: 'opentype' };
  const format = formatMap[ext] || 'truetype';
  const style = document.createElement('style');
  style.textContent = `@font-face { font-family: '${fontFamily}'; src: url('/fonts/${filename}') format('${format}'); font-weight: normal; font-style: normal; }`;
  document.head.appendChild(style);
}

/**
 * 将自定义字体添加到下拉框
 */
function addFontOption(displayName, filename) {
  const select = document.getElementById('s-fontFamily');
  if (!select) return;

  const fontFamily = 'Custom_' + displayName.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
  const value = `'${fontFamily}', sans-serif`;

  // 避免重复添加
  const existing = Array.from(select.options).find(o => o.dataset.custom === filename);
  if (existing) return;

  // 插入到"系统默认"选项之前
  const sysDefaultOpt = Array.from(select.options).find(o => o.value.includes('system-ui'));
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = displayName + '（自定义）';
  opt.dataset.custom = filename;
  opt.dataset.fontFamily = fontFamily;
  if (sysDefaultOpt) {
    select.insertBefore(opt, sysDefaultOpt);
  } else {
    select.appendChild(opt);
  }
}

/**
 * 从下拉框移除自定义字体选项
 */
function removeFontOption(filename) {
  const select = document.getElementById('s-fontFamily');
  if (!select) return;
  const opt = Array.from(select.options).find(o => o.dataset.custom === filename);
  if (opt) opt.remove();
}

/**
 * 渲染自定义字体列表（显示在设置页面）
 */
function renderCustomFontsList(fonts) {
  const container = document.getElementById('customFontsList');
  if (!container) return;
  if (!fonts || fonts.length === 0) {
    container.innerHTML = '<span style="opacity:.5;">暂无自定义字体</span>';
    return;
  }
  container.innerHTML = fonts.map(f => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);">
      <span title="${escHtml(f.filename)}">${escHtml(f.display_name)}</span>
      <button class="btn" style="padding:2px 8px;font-size:11px;color:var(--danger);background:transparent;border:1px solid var(--danger);border-radius:4px;cursor:pointer;"
        onclick="deleteCustomFont('${escHtml(f.filename)}', '${escHtml(f.display_name)}')">删除</button>
    </div>
  `).join('');
}

/**
 * 上传自定义字体文件
 */
async function uploadCustomFont(input) {
  const file = input.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/api/fonts/upload', { method: 'POST', body: formData });
    const data = await res.json();

    if (data.ok) {
      // 注入 @font-face
      injectFontFace('Custom_' + data.display_name.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_'), data.filename);
      // 添加到下拉框
      addFontOption(data.display_name, data.filename);
      // 刷新列表显示
      loadCustomFontsList();
      showToast('字体导入成功：' + data.display_name, 'success');
    } else {
      showToast('导入失败：' + (data.error || '未知错误'), 'error');
    }
  } catch (e) {
    showToast('导入失败：' + e.message, 'error');
  }

  input.value = '';
}

/**
 * 删除自定义字体
 */
async function deleteCustomFont(filename, displayName) {
  if (!confirm('确定删除自定义字体「' + displayName + '」吗？')) return;

  try {
    const res = await fetch('/api/fonts/' + encodeURIComponent(filename), { method: 'DELETE' });
    const data = await res.json();

    if (data.ok) {
      // 如果当前正在使用这个字体，切换回默认
      const select = document.getElementById('s-fontFamily');
      if (select) {
        const opt = Array.from(select.options).find(o => o.dataset.custom === filename);
        if (opt && select.value === opt.value) {
          select.value = "'Microsoft YaHei', 'PingFang SC', sans-serif";
          applySetting('fontFamily', select.value);
        }
      }
      // 从下拉框移除
      removeFontOption(filename);
      // 刷新列表显示
      loadCustomFontsList();
      showToast('字体已删除', 'success');
    } else {
      showToast('删除失败：' + (data.error || '未知错误'), 'error');
    }
  } catch (e) {
    showToast('删除失败：' + e.message, 'error');
  }
}

/**
 * 从后端加载已保存的自定义字体列表，注入 @font-face 并填充下拉框
 */
async function loadCustomFontsList() {
  try {
    const data = await get('/api/fonts/list');
    if (data && data.ok && data.fonts) {
      // 注入所有字体的 @font-face 并添加到下拉框
      data.fonts.forEach(f => {
        const fontFamily = 'Custom_' + f.display_name.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
        injectFontFace(fontFamily, f.filename);
        addFontOption(f.display_name, f.filename);
      });
      // 渲染列表 UI
      renderCustomFontsList(data.fonts);
    }
  } catch (e) {
    console.log('加载自定义字体列表失败:', e);
  }
}

// ── 紧凑模式锁定布局控件 ────────────────────────────────────
function _toggleCompactLayoutLock(locked) {
  const id = 's-content-padding';
  const lockInfoId = 'compact-layout-lock-info';
  let infoEl = document.getElementById(lockInfoId);

  const el = document.getElementById(id);
  if (el) {
    el.disabled = locked;
    el.style.opacity = locked ? '0.5' : '';
    el.style.pointerEvents = locked ? 'none' : '';
  }

  if (locked) {
    const row = el?.closest('.settings-row');
    if (row && !infoEl) {
      const hint = document.createElement('div');
      hint.id = lockInfoId;
      hint.style.cssText = 'font-size:var(--font-size-11);color:var(--warning);margin-top:4px;';
      hint.textContent = '紧凑模式已启用，内容边距由紧凑模式控制';
      row.parentElement.insertBefore(hint, row);
    }
  } else if (infoEl) {
    infoEl.remove();
  }
}

// ── 设置导航切换 ─────────────────────────────────────────
document.querySelectorAll('.settings-nav-item').forEach(el => {
  el.addEventListener('click', () => {
    document.querySelectorAll('.settings-nav-item').forEach(n => n.classList.remove('active'));
    el.classList.add('active');
    const section = el.dataset.settings;
    document.querySelectorAll('.settings-section').forEach(s => s.style.display = 'none');
    const target = document.getElementById('settings-' + section);
    if (target) target.style.display = 'block';
  });
});

// ── 复制字体路径 ────────────────────────────────────────────

async function copyFontPath(el, path) {
  try {
    await navigator.clipboard.writeText(path);
    // 复制成功：短暂变色提示
    el.style.color = 'var(--success)';
    setTimeout(() => { el.style.color = ''; }, 1200);
    showToast('路径已复制：' + path, 'success');
  } catch (e) {
    // clipboard 不可用时 fallback 到选中文本
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    showToast('已选中路径，请手动 Ctrl+C 复制', 'info');
  }
}

// ── 清理业务数据 ─────────────────────────────────────────

async function showCleanDataModal() {
  // 加载员工列表，用于成员选择器
  let employees = [];
  try { employees = await get('/api/employees'); } catch (e) { employees = []; }

  const empOptions = employees.map(e =>
    `<option value="${e.id}">${escHtml(e.name)}（${escHtml(e.sub_dept_name || '')}）</option>`
  ).join('');

  // 当前年月，供默认值
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;
  const monthOpts = Array.from({length:12}, (_,i) =>
    `<option value="${i+1}"${i+1===curMonth?' selected':''}>${i+1}</option>`
  ).join('');

  openModal(`
    <div class="modal-title">清理业务数据</div>

    <!-- 清理模式 -->
    <div style="margin-bottom:14px;">
    <div style="font-size:var(--font-size-12);color:var(--text-muted);margin-bottom:8px;">选择清理范围</div>
      <div style="display:flex;flex-direction:column;gap:7px;" id="cleanModeGroup">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 12px;border:1.5px solid var(--border);border-radius:var(--radius);transition:border-color .15s;">
          <input type="radio" name="cleanMode" value="emp" style="accent-color:var(--primary)" onchange="_onCleanModeChange()">
        <span style="font-size:var(--font-size-13);">指定成员的所有月份数据</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 12px;border:1.5px solid var(--border);border-radius:var(--radius);transition:border-color .15s;">
          <input type="radio" name="cleanMode" value="ym" style="accent-color:var(--primary)" onchange="_onCleanModeChange()">
        <span style="font-size:var(--font-size-13);">指定年月的所有成员数据</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 12px;border:1.5px solid var(--border);border-radius:var(--radius);transition:border-color .15s;">
          <input type="radio" name="cleanMode" value="empym" style="accent-color:var(--primary)" onchange="_onCleanModeChange()">
        <span style="font-size:var(--font-size-13);">指定成员 × 指定年月</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 12px;border:1.5px solid var(--border);border-radius:var(--radius);transition:border-color .15s;">
          <input type="radio" name="cleanMode" value="all" style="accent-color:var(--primary)" onchange="_onCleanModeChange()">
        <span style="font-size:var(--font-size-13);font-weight:600;color:#ef4444;">清空所有业务数据</span>
        </label>
      </div>
    </div>

    <!-- 成员选择器 -->
    <div id="cleanEmpRow" style="display:none;margin-bottom:12px;">
      <div style="font-size:var(--font-size-12);color:var(--text-muted);margin-bottom:6px;">选择成员</div>
      <select id="cleanEmpSel" style="width:100%;padding:6px 10px;border:1.5px solid var(--border);border-radius:var(--radius);font-size:var(--font-size-13);background:var(--card-bg);color:var(--text);">
        <option value="">-- 请选择成员 --</option>
        ${empOptions}
      </select>
    </div>

    <!-- 年月选择器 -->
    <div id="cleanYmRow" style="display:none;margin-bottom:12px;">
      <div style="font-size:var(--font-size-12);color:var(--text-muted);margin-bottom:6px;">选择年月</div>
      <div style="display:flex;gap:8px;align-items:center;">
        <input type="number" id="cleanYear" value="${curYear}" min="2000" max="2099"
          style="width:90px;padding:6px 10px;border:1.5px solid var(--border);border-radius:var(--radius);font-size:var(--font-size-13);background:var(--card-bg);color:var(--text);text-align:center;">
        <span style="color:var(--text-muted);font-size:var(--font-size-13);">年</span>
        <select id="cleanMonth" style="width:70px;padding:6px 8px;border:1.5px solid var(--border);border-radius:var(--radius);font-size:var(--font-size-13);background:var(--card-bg);color:var(--text);">
          ${monthOpts}
        </select>
        <span style="color:var(--text-muted);font-size:var(--font-size-13);">月</span>
      </div>
    </div>

    <!-- 提示区 -->
    <div id="cleanHint" style="display:none;padding:10px 12px;border-radius:var(--radius);font-size:var(--font-size-12);margin-bottom:12px;"></div>

    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">取消</button>
      <button class="btn btn-danger" id="confirmCleanBtn" disabled onclick="doCleanData()">确认清理</button>
    </div>
  `);
}

function _onCleanModeChange() {
  const mode = document.querySelector('input[name="cleanMode"]:checked')?.value;
  const empRow = document.getElementById('cleanEmpRow');
  const ymRow = document.getElementById('cleanYmRow');
  const hint = document.getElementById('cleanHint');
  const btn = document.getElementById('confirmCleanBtn');

  empRow.style.display = (mode === 'emp' || mode === 'empym') ? 'block' : 'none';
  ymRow.style.display  = (mode === 'ym'  || mode === 'empym') ? 'block' : 'none';

  // 提示文案
  const hintMap = {
    emp:   { bg: '#fef3c7', color: '#92400e', text: '将删除该成员所有月份的做货记录和工资增扣，不可恢复。（快捷计算按年月整体存储，不支持按成员清理）' },
    ym:    { bg: '#fef3c7', color: '#92400e', text: '将删除指定年月内所有人的做货记录、工资增扣及快捷计算保存，不可恢复。' },
    empym: { bg: '#fef3c7', color: '#92400e', text: '将删除该成员在指定年月的做货记录和工资增扣，不可恢复。（快捷计算按年月整体存储，不支持按成员清理）' },
    all:   { bg: '#fee2e2', color: '#991b1b', text: '⚠ 将删除所有成员所有月份的做货记录、工资增扣及快捷计算保存！此操作不可恢复，请谨慎操作！' }
  };
  if (mode && hintMap[mode]) {
    const h = hintMap[mode];
    hint.style.display = 'block';
    hint.style.background = h.bg;
    hint.style.color = h.color;
    hint.textContent = h.text;
  } else {
    hint.style.display = 'none';
  }

  btn.disabled = !mode;
}

async function doCleanData() {
  const mode = document.querySelector('input[name="cleanMode"]:checked')?.value;
  if (!mode) return;

  const empId = (mode === 'emp' || mode === 'empym') ? document.getElementById('cleanEmpSel').value : null;
  const year  = (mode === 'ym'  || mode === 'empym') ? document.getElementById('cleanYear').value  : null;
  const month = (mode === 'ym'  || mode === 'empym') ? document.getElementById('cleanMonth').value : null;

  // 验证
  if ((mode === 'emp' || mode === 'empym') && !empId) {
    showToast('请先选择成员', 'error'); return;
  }
  if ((mode === 'ym' || mode === 'empym') && (!year || !month)) {
    showToast('请填写年份和月份', 'error'); return;
  }

  // 二次确认
  let confirmMsg = '';
  if (mode === 'all') {
    confirmMsg = '您确定要清空所有业务数据吗？此操作不可撤销！';
  } else {
    const empName = empId ? document.getElementById('cleanEmpSel').options[document.getElementById('cleanEmpSel').selectedIndex].text : '';
    const ymStr = (year && month) ? `${year}年${month}月` : '';
    if (mode === 'emp')   confirmMsg = `确定删除【${empName}】的所有做货数据吗？`;
    if (mode === 'ym')    confirmMsg = `确定删除【${ymStr}】的所有业务数据吗？`;
    if (mode === 'empym') confirmMsg = `确定删除【${empName}】在【${ymStr}】的做货数据吗？`;
  }

  if (!confirm(confirmMsg)) return;

  // 构造查询参数
  const params = new URLSearchParams();
  if (empId) params.append('emp_id', empId);
  if (year)  params.append('year',   year);
  if (month) params.append('month',  month);

  try {
    const res = await fetch(`/api/data/clean?${params.toString()}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) {
      closeModal();
      const c = data.counts || {};
      const parts = [];
      if (c.work_records) parts.push(`${c.work_records} 条做货记录`);
      if (c.salary_adjustments) parts.push(`${c.salary_adjustments} 条增扣`);
      if (c.quick_calc_saves) parts.push(`${c.quick_calc_saves} 条快捷计算`);
      const msg = parts.length ? `已清理：${parts.join('、')}` : '无需清理，数据为空';
      showToast(msg, 'success');
    } else {
      showToast('清理失败：' + (data.error || '未知错误'), 'error');
    }
  } catch (e) {
    showToast('请求失败：' + e.message, 'error');
  }
}
