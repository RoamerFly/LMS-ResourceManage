// ============================================================
// 银行卡管理
// ============================================================

let _bankAccountRows = [];
let bankDraggingEmpId = 0;
let bankDraggingDeptId = 0;
const _bankAutoSaveTimers = {};
const BANK_CARD_VISIBILITY_KEY = 'bankCardVisible';
const BANK_CARD_VISIBILITY_SETTING_KEY = 'bankCardVisible';
let _bankCardVisibilityLoaded = false;
let _bankCardVisibilityValue = localStorage.getItem(BANK_CARD_VISIBILITY_KEY) === 'true';

function getBankSalarySource() {
  return localStorage.getItem('useQcSalary') === 'true' ? 'qc' : 'work';
}

function getBankSalarySourceLabel(source) {
  return source === 'qc' ? '快捷计算数据' : '做货编辑数据';
}

function getBankAccountRow(empId) {
  return (_bankAccountRows || []).find(item => item.emp_id === empId) || null;
}

function orderBankRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const normalized = list.map(item => ({ ...item, id: item.emp_id }));
  if (getMemberOrderSync('banking') && Array.isArray(_state.employees) && _state.employees.length) {
    const groups = [];
    const groupMap = new Map();
    for (const item of normalized) {
      if (!groupMap.has(item.dept_id)) {
        const group = { deptId: item.dept_id, rows: [] };
        groups.push(group);
        groupMap.set(item.dept_id, group);
      }
      groupMap.get(item.dept_id).rows.push(item);
    }
    return groups.flatMap(group => {
      const ids = _state.employees
        .filter(emp => emp.dept_id === group.deptId)
        .map(emp => emp.id);
      return sortItemsByIds(group.rows, ids, item => item.emp_id);
    });
  }
  return orderEmployeesByDisplayPreference('banking', normalized);
}

function handleBankCardDblClick(event, empId) {
  const selection = window.getSelection ? String(window.getSelection()) : '';
  if ((selection || '').trim()) return;
  if (event?.target?.closest?.('.member-list-name-color')) return;
  showEditBankAccountModal(empId);
}

function getBankDefaultNote(year, month) {
  return `${year}-${pad(month)}-工资`;
}

function isBankCardVisible() {
  return _bankCardVisibilityValue;
}

function formatBankCardNumber(cardNo) {
  const clean = String(cardNo || '').replace(/\s+/g, '');
  if (!clean) return '';
  return clean.replace(/(.{4})/g, '$1 ').trim();
}

function maskBankCard(cardNo) {
  const clean = String(cardNo || '').replace(/\s+/g, '');
  if (!clean) return '未填写银行卡';
  if (isBankCardVisible()) return formatBankCardNumber(clean);
  if (clean.length <= 8) return clean;
  return `${clean.slice(0, 4)} **** **** ${clean.slice(-4)}`;
}

function updateBankVisibilityButton() {
  const btn = document.getElementById('bankVisibilityBtn');
  if (!btn) return;
  const visible = isBankCardVisible();
  btn.classList.toggle('is-active', visible);
  btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
  btn.title = visible ? '隐藏全部银行卡号' : '显示全部银行卡号';
  btn.innerHTML = visible
    ? `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" aria-hidden="true">
        <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.89 1 12c.92-2.6 2.6-4.76 4.74-6.22"></path>
        <path d="M9.9 4.24A10.93 10.93 0 0 1 12 4c5 0 9.27 3.11 11 8a11.79 11.79 0 0 1-2.16 3.19"></path>
        <path d="M14.12 14.12A3 3 0 0 1 9.88 9.88"></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
      </svg>
      隐藏卡号`
    : `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" aria-hidden="true">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
      显示卡号`;
}

async function ensureBankCardVisibilityLoaded(force = false) {
  if (_bankCardVisibilityLoaded && !force) return _bankCardVisibilityValue;
  const fallbackVisible = localStorage.getItem(BANK_CARD_VISIBILITY_KEY) === 'true';
  _bankCardVisibilityValue = fallbackVisible;
  try {
    const result = await get(`/api/app-settings/${BANK_CARD_VISIBILITY_SETTING_KEY}`);
    const rawValue = String(result?.value ?? '').trim().toLowerCase();
    if (rawValue === 'true' || rawValue === 'false') {
      _bankCardVisibilityValue = rawValue === 'true';
    }
  } catch (err) {
    _bankCardVisibilityValue = fallbackVisible;
  }
  _bankCardVisibilityLoaded = true;
  localStorage.setItem(BANK_CARD_VISIBILITY_KEY, _bankCardVisibilityValue ? 'true' : 'false');
  updateBankVisibilityButton();
  return _bankCardVisibilityValue;
}

async function persistBankCardVisibility(visible) {
  _bankCardVisibilityValue = !!visible;
  localStorage.setItem(BANK_CARD_VISIBILITY_KEY, _bankCardVisibilityValue ? 'true' : 'false');
  _bankCardVisibilityLoaded = true;
  updateBankVisibilityButton();
  const result = await post('/api/app-settings', {
    key: BANK_CARD_VISIBILITY_SETTING_KEY,
    value: _bankCardVisibilityValue ? 'true' : 'false',
  });
  return !!(result && result.ok);
}

async function toggleBankCardVisibility() {
  const nextVisible = !isBankCardVisible();
  const ok = await persistBankCardVisibility(nextVisible);
  updateBankVisibilityButton();
  const { year, month } = getBankTargetMonth();
  renderBankCards(_bankAccountRows, year, month, getBankSalarySource());
  if (!ok) showToast('卡号显示状态保存失败', 'error');
}

function getBankTargetMonth() {
  const year = parseInt(document.getElementById('bankYear')?.value, 10);
  const month = parseInt(document.getElementById('bankMonth')?.value, 10);
  const today = new Date();
  return {
    year: year || today.getFullYear(),
    month: month || (today.getMonth() + 1),
  };
}

function renderBankCards(rows, year, month, source) {
  const container = document.getElementById('bankingContent');
  if (!rows.length) {
    container.innerHTML = '<div class="empty-state">暂无成员数据</div>';
    return;
  }

  const displayRows = orderBankRows(rows);

  container.innerHTML = displayRows.map(item => `
    <div class="bank-card bank-card-editable bank-card-sortable"
      data-emp-id="${item.emp_id}" data-dept-id="${item.dept_id}"
      ondragover="onBankCardDragOver(event)" ondragleave="onBankCardDragLeave(event)" ondrop="onBankCardDrop(event)"
      ondblclick="handleBankCardDblClick(event, ${item.emp_id})" title="双击卡片可编辑银行卡信息">
      <span class="bank-drag-handle" draggable="true"
        data-emp-id="${item.emp_id}" data-dept-id="${item.dept_id}"
        ondragstart="onBankCardDragStart(event)" ondragend="onBankCardDragEnd(event)"
        title="按住拖拽调整同部门内顺序">⋮</span>
      <div class="bank-card-header">
        <div>
          <div class="bank-card-title">
            <span class="member-list-name-color" onclick="navigateToMemberDetail(${item.emp_id})" title="点击查看成员详情">${escHtml(item.name)}</span>
            <span class="bank-source-pill">${getBankSalarySourceLabel(source)}</span>
          </div>
          <div class="bank-card-meta">
            <span class="dept-large">${escHtml(item.dept_name)}</span>
            <span class="dept-sub">/ ${escHtml(item.sub_dept_name)}</span>
          </div>
        </div>
        <div class="bank-card-amount">
          <div class="bank-card-amount-label">${year}-${pad(month)} 应发参考</div>
          <div class="bank-card-amount-value">¥${fmt(item.total || 0)}</div>
        </div>
      </div>
      <div class="bank-card-body">
        <div class="bank-info-grid">
          <div class="bank-info-item">
            <span class="bank-info-label">收款人</span>
            <span class="bank-info-value">${escHtml(item.account_name || item.name || '-')}</span>
          </div>
          <div class="bank-info-item">
            <span class="bank-info-label">开户行</span>
            <span class="bank-info-value">${escHtml(item.bank_name || '未填写')}</span>
          </div>
          <div class="bank-info-item">
            <span class="bank-info-label">银行卡号</span>
            <span class="bank-info-value bank-card-no">${escHtml(maskBankCard(item.card_no))}</span>
          </div>
          <div class="bank-info-item">
            <span class="bank-info-label">预留手机</span>
            <span class="bank-info-value">${escHtml(item.reserved_phone || '未填写')}</span>
          </div>
        </div>
        ${item.note ? `<div class="bank-note">备注：${escHtml(item.note)}</div>` : ''}
        <div class="bank-stats">
          <div class="bank-stat">
            <span class="bank-stat-label">做货对数</span>
            <span class="bank-stat-value">${fmt(item.pairs || 0)}</span>
          </div>
          <div class="bank-stat">
            <span class="bank-stat-label">做货工资</span>
            <span class="bank-stat-value">¥${fmt(item.wage || 0)}</span>
          </div>
          <div class="bank-stat">
            <span class="bank-stat-label">人工增扣</span>
            <span class="bank-stat-value bank-stat-warn">¥${fmt(item.adj_amount || 0)}</span>
          </div>
        </div>
        <div class="bank-card-hint">双击卡片任意空白处可编辑银行卡信息</div>
      </div>
    </div>
  `).join('');
}

function onBankCardDragStart(event) {
  const handle = event.currentTarget;
  const card = handle.closest('.bank-card');
  bankDraggingEmpId = parseInt(handle.dataset.empId, 10);
  bankDraggingDeptId = parseInt(handle.dataset.deptId, 10);
  if (getMemberOrderSync('banking')) {
    setMemberOrderSync('banking', false);
    const syncInput = document.querySelector('#memberOrderSync_banking input');
    if (syncInput) syncInput.checked = false;
  }
  if (card) card.classList.add('dragging');
  event.stopPropagation();
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', String(bankDraggingEmpId));
}

function onBankCardDragOver(event) {
  event.preventDefault();
  const card = event.currentTarget;
  if (parseInt(card.dataset.empId, 10) !== bankDraggingEmpId) {
    markDragOverPosition(card);
  }
}

function onBankCardDragLeave(event) {
  clearDragOverPosition(event.currentTarget);
}

function onBankCardDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  const card = event.currentTarget;
  const targetDeptId = parseInt(card.dataset.deptId, 10);
  const targetEmpId = parseInt(card.dataset.empId, 10);
  if (!bankDraggingEmpId) return;
  if (targetDeptId !== bankDraggingDeptId) {
    showToast('只能在同一部门内调整顺序', 'info');
    return;
  }

  const cards = Array.from(card.parentElement.querySelectorAll('.bank-card-sortable[data-emp-id]'))
    .filter(item => parseInt(item.dataset.deptId, 10) === targetDeptId);
  const currentIds = cards.map(item => parseInt(item.dataset.empId, 10));
  setManualEmployeeOrder(
    'banking',
    targetDeptId,
    swapIds(currentIds, bankDraggingEmpId, targetEmpId)
  );
  const { year, month } = getBankTargetMonth();
  renderBankCards(_bankAccountRows, year, month, getBankSalarySource());
  markSwapSuccess('.bank-card-sortable', [bankDraggingEmpId, targetEmpId]);
}

function onBankCardDragEnd(event) {
  const card = event.currentTarget.closest('.bank-card');
  if (card) card.classList.remove('dragging');
  document.querySelectorAll('.bank-card-sortable.drag-over').forEach(item => clearDragOverPosition(item));
  bankDraggingEmpId = 0;
  bankDraggingDeptId = 0;
}

async function loadBankAccounts(options = {}) {
  const { animate = true } = options;
  const { year, month } = getBankTargetMonth();
  const source = getBankSalarySource();
  const container = document.getElementById('bankingContent');
  if (!container) return;

  const finishRefresh = animate
    ? beginContentRefresh(container, {
        loadingText: `正在切换到 ${year}-${pad(month)}...`,
        minHeight: 220,
      })
    : () => {};

  try {
    await ensureBankCardVisibilityLoaded();
    updateBankVisibilityButton();
    const data = await get(`/api/bank-accounts?year=${year}&month=${month}&source=${source}`);
    _bankAccountRows = Array.isArray(data) ? data : [];
    await ensureMemberOrderPrefsLoaded('banking', _bankAccountRows.map(item => item.dept_id));
    if (getMemberOrderSync('banking')) {
      _state.employees = await get('/api/employees');
    }
    ensureMemberOrderSyncSwitch('banking', document.querySelector('#view-banking .bank-toolbar-actions'), () => {
      loadBankAccounts({ animate: false });
    });
    renderBankCards(_bankAccountRows, year, month, source);
  } finally {
    finishRefresh();
  }
}

function updateBankRowCache(empId, payload) {
  const row = getBankAccountRow(empId);
  if (!row) return;
  row.account_name = payload.account_name;
  row.bank_name = payload.bank_name;
  row.card_no = payload.card_no;
  row.note = payload.note;
  row.reserved_phone = payload.reserved_phone;
}

function setBankAutoSaveHint(text, type = 'info') {
  const hint = document.getElementById('bank-auto-save-hint');
  if (!hint) return;
  hint.textContent = text;
  hint.style.color = type === 'error' ? 'var(--danger)' : type === 'success' ? 'var(--success)' : 'var(--text-muted)';
}

function buildModalBankPayload(empId, year, month) {
  const item = getBankAccountRow(empId) || {};
  return {
    account_name: (document.getElementById('bank-account-name')?.value || item.account_name || item.name || '').trim(),
    bank_name: (document.getElementById('bank-bank-name')?.value || item.bank_name || '').trim(),
    card_no: (document.getElementById('bank-card-no')?.value || item.card_no || '').trim(),
    reserved_phone: (document.getElementById('bank-phone')?.value || item.reserved_phone || '').trim(),
    note: (document.getElementById('bank-note')?.value || item.note || getBankDefaultNote(year, month)).trim(),
  };
}

async function autoSaveBankAccount(empId, year, month, options = {}) {
  const { silent = true } = options;
  const payload = buildModalBankPayload(empId, year, month);
  setBankAutoSaveHint('正在自动保存...', 'info');
  const result = await post(`/api/bank-accounts/${empId}`, payload);
  if (result && result.ok) {
    updateBankRowCache(empId, payload);
    setBankAutoSaveHint('已自动保存', 'success');
    if (!silent) showToast('银行卡信息已保存', 'success');
  } else {
    setBankAutoSaveHint((result && result.error) || '自动保存失败', 'error');
    if (!silent) showToast((result && result.error) || '保存失败', 'error');
  }
}

function queueAutoSaveBankAccount(empId, year, month) {
  if (_bankAutoSaveTimers[empId]) clearTimeout(_bankAutoSaveTimers[empId]);
  setBankAutoSaveHint('检测到修改，准备自动保存...', 'info');
  _bankAutoSaveTimers[empId] = setTimeout(() => {
    autoSaveBankAccount(empId, year, month);
  }, 500);
}

function showEditBankAccountModal(empId) {
  const item = getBankAccountRow(empId);
  if (!item) {
    showToast('未找到该成员的银行卡信息', 'error');
    return;
  }

  const { year, month } = getBankTargetMonth();
  openModal(`
    <div class="modal-title">编辑银行卡信息</div>
    <div class="form-row">
      <div class="form-group">
        <label>成员姓名</label>
        <input type="text" value="${escHtml(item.name)}" disabled>
      </div>
      <div class="form-group">
        <label>收款人姓名</label>
        <input id="bank-account-name" type="text" value="${escHtml(item.account_name || item.name || '')}" placeholder="默认使用成员姓名" oninput="queueAutoSaveBankAccount(${empId}, ${year}, ${month})">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>开户行</label>
        <input id="bank-bank-name" type="text" value="${escHtml(item.bank_name || '')}" placeholder="例如：中国农业银行" oninput="queueAutoSaveBankAccount(${empId}, ${year}, ${month})">
      </div>
      <div class="form-group">
        <label>银行卡号</label>
        <input id="bank-card-no" type="text" value="${escHtml(item.card_no || '')}" placeholder="请输入银行卡号" oninput="queueAutoSaveBankAccount(${empId}, ${year}, ${month})">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>预留手机</label>
        <input id="bank-phone" type="text" value="${escHtml(item.reserved_phone || '')}" placeholder="选填" oninput="queueAutoSaveBankAccount(${empId}, ${year}, ${month})">
      </div>
      <div class="form-group">
        <label>备注</label>
        <input id="bank-note" type="text" value="${escHtml(item.note || getBankDefaultNote(year, month))}" placeholder="默认日期-工资" oninput="queueAutoSaveBankAccount(${empId}, ${year}, ${month})">
      </div>
    </div>
    <div id="bank-auto-save-hint" class="bank-auto-save-hint">修改后将自动保存</div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal(); loadBankAccounts();">关闭</button>
    </div>
  `);
}

async function lookupBankName(empId, options = {}) {
  const { silent = false } = options;
  const item = getBankAccountRow(empId);
  const cardNo = (item?.card_no || '').trim();
  if (!cardNo) {
    if (!silent) showToast('该成员还没有保存银行卡号', 'info');
    return { ok: false };
  }

  const result = await get(`/api/bank-lookup?card_no=${encodeURIComponent(cardNo)}`);
  if (result && result.ok) {
    const payload = {
      account_name: item.account_name || item.name || '',
      bank_name: result.bank_name || result.bank_code || '',
      card_no: item.card_no || '',
      reserved_phone: item.reserved_phone || '',
      note: item.note || '',
    };
    const saveResult = await post(`/api/bank-accounts/${empId}`, payload);
    if (saveResult && saveResult.ok) {
      updateBankRowCache(empId, payload);
      if (!silent) showToast(`已识别开户行：${payload.bank_name}`, 'success');
      return { ok: true, bank_name: payload.bank_name };
    }
    if (!silent) showToast((saveResult && saveResult.error) || '开户行保存失败', 'error');
    return { ok: false, error: (saveResult && saveResult.error) || '开户行保存失败' };
  } else {
    if (!silent) showToast((result && result.error) || '开户行查询失败', 'error');
    return { ok: false, error: (result && result.error) || '开户行查询失败' };
  }
}

async function bulkLookupBankNames() {
  const rows = (_bankAccountRows || []).filter(item => (item.card_no || '').trim());
  if (!rows.length) {
    showToast('暂无可更新开户行的银行卡号', 'info');
    return;
  }

  let success = 0;
  let failed = 0;
  showToast(`开始更新 ${rows.length} 条开户行信息`, 'info');
  for (const row of rows) {
    const result = await lookupBankName(row.emp_id, { silent: true });
    if (result && result.ok) success += 1;
    else failed += 1;
  }
  await loadBankAccounts();
  showToast(`开户行更新完成：成功 ${success} 条，失败 ${failed} 条`, failed ? 'info' : 'success');
}

const _bankYearEl = document.getElementById('bankYear');
const _bankMonthEl = document.getElementById('bankMonth');
if (_bankYearEl) _bankYearEl.addEventListener('change', loadBankAccounts);
if (_bankMonthEl) _bankMonthEl.addEventListener('change', loadBankAccounts);
updateBankVisibilityButton();

async function clearAllBankCardInfo() {
  if (!confirm('确定要清空所有银行卡信息吗？\n\n将清除全部成员的银行卡号和开户行信息，此操作不可撤销。')) return;

  const result = await post('/api/bank-accounts/clear-all');
  if (result && result.ok) {
    showToast(`已清空 ${result.cleared || 0} 条银行卡信息`, 'success');
    await loadBankAccounts({ animate: false });
  } else {
    showToast((result && result.error) || '清空失败', 'error');
  }
}
