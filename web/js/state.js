// ============================================================
// 全局状态
// ============================================================
const API = '';

// 编辑会话跟踪（用于单元格级撤销）
let _editSession = null;

let _state = {
  departments: [],
  subDepartments: [],
  employees: [],
  models: [],
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth() + 1,
  workRecords: [],
  workEmployees: [],
  workModels: [],
  workOrders: [],
  workOrderModels: {},
  priceData: null,
  selectedDeptId: null,
  selectedSubDeptId: null,
  viewMode: 'qty',   // 'qty' | 'wage'
  wageDetail: null,  // 工资明细数据
};

// 脏缓存
let _dirtyCells = {};  // "order_id|model_id|emp_id" -> quantity
let _qcData = {};      // 快捷计算：emp_id -> {model_id -> qty}

// 快捷计算内部状态（按大部门分组多表格，无型号）
let _qcState = {
  employees: [],       // 所有员工（含 dept_id, sub_dept_id, dept_name, sub_dept_name）
  departments: [],     // 所有大部门
  subDepartments: [],  // 所有小部门（含 dept_id, dept_name）
  qtyData: {},         // 对数："rowKey,empId" -> qty
  qcViewMode: 'qty',   // 'qty' | 'wage'
  qcWageDetail: null,
};

// 快捷计算：每个大部门表格的行数据
// key = "deptId_rowIdx", value = { 各小部门subDeptId -> 单价值 }
let _qcDeptRows = {};  // "deptId_rowIdx" -> { [subDeptId]: price }

// 虚拟行ID计数器（用于标识未选择订单/型号的空行）
let _tempRowCounter = 0;
// 已删除行集合（存储已删除的 orderId|modelId 组合），用于防止重新加载时出现
let _deletedRowKeys = new Set();

// 当前视图
let _currentView = 'overview';

const MEMBER_ORDER_SYNC_PREFIX = 'memberOrderSync.';
const MANUAL_EMP_ORDER_PREFIX = 'manualEmployeeOrder.';
const _orderPreferenceCache = {};

function getOrderPreferenceKey(prefix, page, deptId = null) {
  return deptId == null ? `${prefix}${page}` : `${prefix}${page}.${deptId}`;
}

async function loadOrderPreference(key, fallback = '') {
  if (Object.prototype.hasOwnProperty.call(_orderPreferenceCache, key)) {
    return _orderPreferenceCache[key];
  }
  try {
    const result = await get(`/api/app-settings/${encodeURIComponent(key)}`);
    _orderPreferenceCache[key] = String(result?.value ?? fallback);
  } catch (e) {
    _orderPreferenceCache[key] = fallback;
  }
  return _orderPreferenceCache[key];
}

async function saveOrderPreference(key, value) {
  const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
  _orderPreferenceCache[key] = stringValue;
  return post('/api/app-settings', { key, value: stringValue });
}

async function ensureMemberOrderPrefsLoaded(page, deptIds = []) {
  const ids = Array.from(new Set((deptIds || []).map(id => parseInt(id, 10)).filter(Boolean)));
  const syncKey = getOrderPreferenceKey(MEMBER_ORDER_SYNC_PREFIX, page);
  await loadOrderPreference(syncKey, 'false');
  await Promise.all(ids.map(deptId =>
    loadOrderPreference(getOrderPreferenceKey(MANUAL_EMP_ORDER_PREFIX, page, deptId), '[]')
  ));
}

function getMemberOrderSync(page) {
  return _orderPreferenceCache[getOrderPreferenceKey(MEMBER_ORDER_SYNC_PREFIX, page)] === 'true';
}

function setMemberOrderSync(page, enabled) {
  return saveOrderPreference(getOrderPreferenceKey(MEMBER_ORDER_SYNC_PREFIX, page), enabled ? 'true' : 'false');
}

function getManualEmployeeOrder(page, deptId) {
  try {
    const raw = _orderPreferenceCache[getOrderPreferenceKey(MANUAL_EMP_ORDER_PREFIX, page, deptId)] || '[]';
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids.map(id => parseInt(id, 10)).filter(Boolean) : [];
  } catch (e) {
    return [];
  }
}

function setManualEmployeeOrder(page, deptId, empIds) {
  return saveOrderPreference(
    getOrderPreferenceKey(MANUAL_EMP_ORDER_PREFIX, page, deptId),
    JSON.stringify((empIds || []).map(id => parseInt(id, 10)).filter(Boolean))
  );
}

function sortItemsByIds(items, ids, getId) {
  const rank = new Map((ids || []).map((id, index) => [parseInt(id, 10), index]));
  return [...items].sort((a, b) => {
    const ai = rank.has(getId(a)) ? rank.get(getId(a)) : Number.MAX_SAFE_INTEGER;
    const bi = rank.has(getId(b)) ? rank.get(getId(b)) : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return 0;
  });
}

function orderEmployeesByDisplayPreference(page, employees) {
  if (!Array.isArray(employees)) return [];
  if (getMemberOrderSync(page)) return [...employees];

  const groups = [];
  const groupMap = new Map();
  for (const emp of employees) {
    if (!groupMap.has(emp.dept_id)) {
      const group = { deptId: emp.dept_id, employees: [] };
      groups.push(group);
      groupMap.set(emp.dept_id, group);
    }
    groupMap.get(emp.dept_id).employees.push(emp);
  }

  return groups.flatMap(group => {
    const ids = getManualEmployeeOrder(page, group.deptId);
    return ids.length ? sortItemsByIds(group.employees, ids, emp => emp.id) : group.employees;
  });
}

function moveIdBefore(list, movingId, beforeId) {
  const id = parseInt(movingId, 10);
  const before = parseInt(beforeId, 10);
  if (before && before === id) {
    return (list || []).map(v => parseInt(v, 10)).filter(Boolean);
  }
  const next = (list || []).map(v => parseInt(v, 10)).filter(v => v && v !== id);
  if (before && before !== id) {
    const index = next.indexOf(before);
    if (index >= 0) {
      next.splice(index, 0, id);
      return next;
    }
  }
  next.push(id);
  return next;
}

function swapIds(list, firstId, secondId) {
  const a = parseInt(firstId, 10);
  const b = parseInt(secondId, 10);
  const next = (list || []).map(v => parseInt(v, 10)).filter(Boolean);
  if (!a || !b || a === b) return next;

  const ai = next.indexOf(a);
  const bi = next.indexOf(b);
  if (ai < 0 || bi < 0) return next;

  [next[ai], next[bi]] = [next[bi], next[ai]];
  return next;
}

function markDragOverPosition(target) {
  if (!target) return;
  target.classList.add('drag-over');
}

function clearDragOverPosition(target) {
  if (!target) return;
  target.classList.remove('drag-over');
}

function markSwapSuccess(selector, ids, attr = 'data-emp-id') {
  requestAnimationFrame(() => {
    for (const id of ids || []) {
      const el = document.querySelector(`${selector}[${attr}="${id}"]`);
      if (!el) continue;
      el.classList.remove('swap-success');
      void el.offsetWidth;
      el.classList.add('swap-success');
    }
  });
}

function ensureMemberOrderSyncSwitch(page, toolbar, onChange) {
  if (!toolbar) return null;
  const id = `memberOrderSync_${page}`;
  let label = document.getElementById(id);
  if (!label) {
    label = document.createElement('label');
    label.className = 'order-sync-toggle';
    label.id = id;
    label.innerHTML = `<input type="checkbox"><span>显示顺序同步成员管理页</span>`;
    toolbar.appendChild(label);
  }

  const input = label.querySelector('input');
  if (input) {
    input.checked = getMemberOrderSync(page);
    input.onchange = () => {
      setMemberOrderSync(page, input.checked);
      if (typeof onChange === 'function') onChange(input.checked);
    };
  }
  return label;
}

// ============================================================
// 撤销/重做历史栈
// ============================================================
let _undoStack = [];      // 撤销栈
let _redoStack = [];      // 重做栈
const MAX_HISTORY = 50;   // 最大历史记录数

// 保存当前状态到历史栈（每次操作都保存，不去重）
function pushHistory(type) {
  let snapshot = null;

  if (type === 'work-edit') {
    // 做货编辑：保存行映射数据（从 work-edit.js 获取）
    if (typeof _weRowMap !== 'undefined') {
      snapshot = {
        type: 'work-edit',
        weRowMap: JSON.parse(JSON.stringify(_weRowMap)),
        timestamp: Date.now()
      };
    }
  } else if (type === 'quick-calc') {
    // 快捷计算：保存单价和对数
    snapshot = {
      type: 'quick-calc',
      qcDeptRows: JSON.parse(JSON.stringify(_qcDeptRows)),
      qtyData: JSON.parse(JSON.stringify(_qcState.qtyData)),
      timestamp: Date.now()
    };
  }

  if (!snapshot) return;
  snapshot.sheetWorkbook = window.LmsSpreadsheet?.capture(type) || null;

  _undoStack.push(snapshot);
  // 限制历史记录数量
  if (_undoStack.length > MAX_HISTORY) {
    _undoStack.shift();
  }
  // 清空重做栈（新操作后重做栈失效）
  _redoStack = [];
  updateUndoRedoButtons();
}

// 撤销操作
async function undo() {
  if (_undoStack.length === 0) return;
  
  const currentSnapshot = _undoStack.pop();
  
  // 保存当前状态到重做栈
  let redoSnapshot = null;
  if (currentSnapshot.type === 'work-edit') {
    if (typeof _weRowMap !== 'undefined') {
      redoSnapshot = {
        type: 'work-edit',
        weRowMap: JSON.parse(JSON.stringify(_weRowMap)),
        timestamp: Date.now()
      };
    }
  } else if (currentSnapshot.type === 'quick-calc') {
    redoSnapshot = {
      type: 'quick-calc',
      qcDeptRows: JSON.parse(JSON.stringify(_qcDeptRows)),
      qtyData: JSON.parse(JSON.stringify(_qcState.qtyData)),
      timestamp: Date.now()
    };
  }
  _redoStack.push(redoSnapshot);
  redoSnapshot.sheetWorkbook = window.LmsSpreadsheet?.capture(currentSnapshot.type) || null;
  
  // 恢复到历史状态
  await restoreSnapshot(currentSnapshot);
  updateUndoRedoButtons();
}

// 重做操作
async function redo() {
  if (_redoStack.length === 0) return;
  
  const redoSnapshot = _redoStack.pop();
  
  // 保存当前状态到撤销栈
  let currentSnapshot = null;
  if (redoSnapshot.type === 'work-edit') {
    if (typeof _weRowMap !== 'undefined') {
      currentSnapshot = {
        type: 'work-edit',
        weRowMap: JSON.parse(JSON.stringify(_weRowMap)),
        timestamp: Date.now()
      };
    }
  } else if (redoSnapshot.type === 'quick-calc') {
    currentSnapshot = {
      type: 'quick-calc',
      qcDeptRows: JSON.parse(JSON.stringify(_qcDeptRows)),
      qtyData: JSON.parse(JSON.stringify(_qcState.qtyData)),
      timestamp: Date.now()
    };
  }
  _undoStack.push(currentSnapshot);
  currentSnapshot.sheetWorkbook = window.LmsSpreadsheet?.capture(redoSnapshot.type) || null;
  
  // 恢复到重做状态
  await restoreSnapshot(redoSnapshot);
  updateUndoRedoButtons();
}

// 恢复快照
async function restoreSnapshot(snapshot) {
  window.LmsSpreadsheet?.prepareRestore(snapshot.type, snapshot.sheetWorkbook);
  if (snapshot.type === 'work-edit') {
    if (typeof _weRowMap !== 'undefined' && typeof renderSpreadsheet === 'function') {
      _weRowMap = JSON.parse(JSON.stringify(snapshot.weRowMap));
      renderSpreadsheet();
      // 撤销/重做后自动保存到数据库
      if (typeof autoSaveWorkRecords === 'function') {
        await autoSaveWorkRecords();
      }
    }
  } else if (snapshot.type === 'quick-calc') {
    if (typeof _qcDeptRows !== 'undefined' && typeof renderQcDeptTables === 'function') {
      _qcDeptRows = JSON.parse(JSON.stringify(snapshot.qcDeptRows));
      _qcState.qtyData = JSON.parse(JSON.stringify(snapshot.qtyData));
      renderQcDeptTables();
      // 撤销/重做后自动保存到数据库
      if (typeof autoSaveQc === 'function') {
        await autoSaveQc();
      }
    }
  }
}

// 更新撤销/重做按钮状态
function updateUndoRedoButtons() {
  // 快捷计算页面按钮
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  if (undoBtn) {
    undoBtn.disabled = _undoStack.length === 0;
    undoBtn.style.opacity = _undoStack.length === 0 ? '0.5' : '1';
  }
  if (redoBtn) {
    redoBtn.disabled = _redoStack.length === 0;
    redoBtn.style.opacity = _redoStack.length === 0 ? '0.5' : '1';
  }
  
  // 做货编辑页面按钮
  const undoBtnWork = document.getElementById('undoBtnWork');
  const redoBtnWork = document.getElementById('redoBtnWork');
  if (undoBtnWork) {
    undoBtnWork.disabled = _undoStack.length === 0;
    undoBtnWork.style.opacity = _undoStack.length === 0 ? '0.5' : '1';
  }
  if (redoBtnWork) {
    redoBtnWork.disabled = _redoStack.length === 0;
    redoBtnWork.style.opacity = _redoStack.length === 0 ? '0.5' : '1';
  }
}

// 清空历史栈（切换页面时调用）
function clearHistory() {
  _undoStack = [];
  _redoStack = [];
  updateUndoRedoButtons();
}

// 键盘快捷键监听
document.addEventListener('keydown', async (e) => {
  if (e.defaultPrevented) return;
  // Ctrl+Z 撤销
  if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    await undo();
  }
  // Ctrl+Y 重做 或 Ctrl+Shift+Z 重做
  if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
    e.preventDefault();
    await redo();
  }
});

// 工资数据源开关（持久化到数据库 + localStorage）
function toggleQcSalary(enabled) {
  const val = enabled ? 'true' : 'false';
  localStorage.setItem('useQcSalary', val);
  post('/api/app-settings', { key: 'useQcSalary', value: val });
  document.querySelectorAll('#qcSwitch').forEach(el => el.checked = enabled);
  showToast(enabled ? '已启用快捷计算作为工资数据源' : '已切换回做货编辑数据源');
}

async function initQcSwitch() {
  // 优先从数据库读取，fallback 到 localStorage
  let saved = false;
  try {
    const res = await get('/api/app-settings/useQcSalary');
    if (res && res.value === 'true') saved = true;
  } catch(e) {}
  if (!saved) saved = localStorage.getItem('useQcSalary') === 'true';
  // 关键：同步到 localStorage，让 getSalarySource() 能读到正确值
  localStorage.setItem('useQcSalary', saved ? 'true' : 'false');
  document.querySelectorAll('#qcSwitch').forEach(el => el.checked = saved);
}
