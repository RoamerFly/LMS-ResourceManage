// ============================================================
// 月份选择器
// ============================================================
function buildMonthPickers(ids, yearIds) {
  const y = new Date().getFullYear();
  const m = new Date().getMonth() + 1;
  (yearIds || ids).forEach(id => {
    const el = document.getElementById(id);
    el.innerHTML = '';
    for (let i = y - 2; i <= y + 1; i += 1) {
      el.innerHTML += `<option value="${i}"${i === y ? ' selected' : ''}>${i}</option>`;
    }
  });
  ids.forEach(id => {
    const el = document.getElementById(id);
    el.innerHTML = '';
    for (let i = 1; i <= 12; i += 1) {
      el.innerHTML += `<option value="${i}"${i === m ? ' selected' : ''}>${pad(i)}</option>`;
    }
  });
}

function initMonthPickers() {
  buildMonthPickers(
    ['globalMonth', 'memberMonth', 'workMonth', 'salaryMonth', 'orderMonth', 'qcMonth', 'bankMonth'],
    ['globalYear', 'memberYear', 'workYear', 'salaryYear', 'orderYear', 'qcYear', 'bankYear']
  );
}

const _PAGE_DATE_SELECTORS = {
  members: ['memberYear', 'memberMonth'],
  orders: ['orderYear', 'orderMonth'],
  work: ['workYear', 'workMonth'],
  salary: ['salaryYear', 'salaryMonth'],
  quickcalc: ['qcYear', 'qcMonth'],
  banking: ['bankYear', 'bankMonth'],
};

function onGlobalDateChange() {
  const gy = document.getElementById('globalYear');
  const gm = document.getElementById('globalMonth');
  if (!gy || !gm) return;
  const yv = gy.value;
  const mv = gm.value;

  for (const sel of Object.values(_PAGE_DATE_SELECTORS)) {
    const ty = document.getElementById(sel[0]);
    const tm = document.getElementById(sel[1]);
    if (ty) ty.value = yv;
    if (tm) tm.value = mv;
  }

  _currentSettings['globalYear'] = yv;
  _currentSettings['globalMonth'] = mv;
  saveSettingsDebounced();

  const view = _currentView;
  if (view === 'members') loadMembers({ animate: false });
  else if (view === 'orders') loadOrders({ animate: false });
  else if (view === 'work') loadWorkRecords();
  else if (view === 'salary') loadSalary({ animate: false });
  else if (view === 'quickcalc') initQuickCalc();
  else if (view === 'banking') loadBankAccounts({ animate: false });
}

// ============================================================
// 导航历史
// ============================================================
let _navHistory = [];

function _updateBackBtn() {
  const btn = document.getElementById('topbarBackBtn');
  if (!btn) return;
  btn.style.display = _navHistory.length > 0 ? 'inline-flex' : 'none';
}

function goBack() {
  if (_navHistory.length === 0) return;
  const prev = _navHistory.pop();
  if (prev.view === 'member-detail') {
    _doNavigateToMemberDetail(prev.empId);
  } else {
    _doNavigateTo(prev.view);
  }
  _updateBackBtn();
}

// ============================================================
// 导航
// ============================================================
function _doNavigateTo(view) {
  if (_currentView === 'work' && view !== 'work') autoSaveWorkRecords();
  if (_currentView === 'quickcalc' && view !== 'quickcalc') autoSaveQc();

  _currentView = view;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navEl = document.querySelector(`.nav-item[data-view="${view}"]`);
  if (navEl) navEl.classList.add('active');
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const viewEl = document.getElementById(`view-${view}`);
  viewEl.classList.add('active');

  const titles = {
    overview: '资源总览',
    members: '成员管理',
    departments: '部门管理',
    orders: '订单管理',
    prices: '型号单价表',
    work: '做货编辑',
    salary: '总工资表',
    quickcalc: '快捷计算',
    banking: '银行卡管理',
    'member-detail': '成员详情',
    settings: '系统设置',
  };
  document.getElementById('topbarTitle').textContent = titles[view] || view;

  if (view === 'overview' && typeof renderOverviewCards === 'function') renderOverviewCards();
  else if (view === 'members') loadMembers({ animate: false });
  else if (view === 'departments') loadDepartments();
  else if (view === 'orders') loadOrders({ animate: false });
  else if (view === 'prices') loadPriceTable();
  else if (view === 'work') { _state.viewMode = 'qty'; loadWorkRecords(); }
  else if (view === 'salary') loadSalary({ animate: false });
  else if (view === 'quickcalc') initQuickCalc();
  else if (view === 'banking') loadBankAccounts({ animate: false });
  else if (view === 'settings') initSettingsPage();
}

function navigateTo(view) {
  _navHistory = [];
  _doNavigateTo(view);
  _updateBackBtn();
}

function navigateWithHistory(view) {
  _navHistory.push({ view: _currentView });
  _doNavigateTo(view);
  _updateBackBtn();
}

document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', () => navigateTo(el.dataset.view));
});

function getCurrentView() {
  return _currentView;
}

function showEmployeeDetail(empId) {
  navigateToMemberDetail(empId);
}

// ============================================================
// 模态框
// ============================================================
function openModal(html) {
  document.getElementById('modalBox').innerHTML = html;
  document.getElementById('modalOverlay').classList.add('show');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('show');
}

function closeModalOnOverlay(e) {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
}

// ============================================================
// 成员详情页
// ============================================================
async function _doNavigateToMemberDetail(empId) {
  _currentView = 'member-detail';
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const detailView = document.getElementById('view-member-detail');
  detailView.classList.add('active');
  document.getElementById('topbarTitle').textContent = '成员详情';
  await loadMemberDetail(empId);
}

async function navigateToMemberDetail(empId) {
  _navHistory.push({ view: _currentView });
  await _doNavigateToMemberDetail(empId);
  _updateBackBtn();
}

function getAdjustmentMonthKey(year, month) {
  return `${year}-${pad(month)}`;
}

function getDefaultAdjustmentDate(year, month) {
  const today = new Date();
  const sameMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  if (sameMonth) return `${year}-${pad(month)}-${pad(today.getDate())}`;
  return `${year}-${pad(month)}-01`;
}

function getMemberAdjustmentTargetMonth() {
  const yearEl = document.getElementById('memberYear');
  const monthEl = document.getElementById('memberMonth');
  const year = parseInt(yearEl?.value, 10);
  const month = parseInt(monthEl?.value, 10);
  if (year && month) return { year, month };
  const today = new Date();
  return { year: today.getFullYear(), month: today.getMonth() + 1 };
}

function getSelectedAdjustmentIds(year, month) {
  const key = getAdjustmentMonthKey(year, month);
  return Array.from(document.querySelectorAll(`.adj-check[data-month-key="${key}"]:checked`))
    .map(cb => parseInt(cb.value, 10))
    .filter(Boolean);
}

function updateAdjustmentBatchDeleteButton(year, month) {
  const key = getAdjustmentMonthKey(year, month);
  const btn = document.getElementById(`adj-batch-del-${key}`);
  const checks = Array.from(document.querySelectorAll(`.adj-check[data-month-key="${key}"]`));
  const checked = checks.filter(cb => cb.checked);
  if (btn) {
    btn.style.display = checked.length > 0 ? 'inline-flex' : 'none';
    btn.textContent = checked.length > 0 ? `批量删除增扣 (${checked.length})` : '批量删除增扣';
  }

  const selectAll = document.getElementById(`adj-select-all-${key}`);
  if (selectAll) {
    selectAll.checked = checks.length > 0 && checked.length === checks.length;
    selectAll.indeterminate = checked.length > 0 && checked.length < checks.length;
  }
}

function toggleAdjustmentMonth(year, month) {
  const key = getAdjustmentMonthKey(year, month);
  const selectAll = document.getElementById(`adj-select-all-${key}`);
  const checked = !!(selectAll && selectAll.checked);
  document.querySelectorAll(`.adj-check[data-month-key="${key}"]`).forEach(cb => {
    cb.checked = checked;
  });
  updateAdjustmentBatchDeleteButton(year, month);
}

async function showAddAdjustmentModal(empId, year, month) {
  openModal(`
    <div class="modal-title">新增增扣明细</div>
    <div class="form-row">
      <div class="form-group">
        <label>增扣日期</label>
        <input id="adj-date" type="date" value="${getDefaultAdjustmentDate(year, month)}">
      </div>
      <div class="form-group">
        <label>增扣对数</label>
        <input id="adj-qty" type="number" step="0.01" value="0">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>增扣工资 (¥)</label>
        <input id="adj-amt" type="number" step="0.01" value="0">
      </div>
      <div class="form-group">
        <label>增扣理由</label>
        <input id="adj-reason" type="text" placeholder="简要说明">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="doAddAdjustment(${empId}, ${year}, ${month})">保存</button>
    </div>
  `);
}

async function doAddAdjustment(empId, year, month) {
  const adj_date = document.getElementById('adj-date').value;
  const adj_quantity = parseFloat(document.getElementById('adj-qty').value) || 0;
  const adj_amount = parseFloat(document.getElementById('adj-amt').value) || 0;
  const reason = document.getElementById('adj-reason').value.trim();

  if (!adj_date) {
    showToast('请选择增扣日期', 'error');
    return;
  }

  const r = await post('/api/adjustments', {
    emp_id: empId,
    year,
    month,
    adj_date,
    adj_quantity,
    adj_amount,
    reason,
  });

  if (r && r.ok) {
    closeModal();
    showToast('增扣明细已添加', 'success');
    loadMemberDetail(empId);
  } else {
    showToast((r && r.error) || '保存失败', 'error');
  }
}

async function deleteAdjustmentItem(empId, adjustmentId) {
  if (!confirm('确认删除这条增扣明细？')) return;
  const r = await post('/api/adjustments/batch-delete', { ids: [adjustmentId] });
  if (r && r.ok) {
    showToast('增扣明细已删除', 'success');
    loadMemberDetail(empId);
  } else {
    showToast((r && r.error) || '删除失败', 'error');
  }
}

async function batchDeleteAdjustments(empId, year, month) {
  const ids = getSelectedAdjustmentIds(year, month);
  if (!ids.length) return;
  if (!confirm(`确认删除选中的 ${ids.length} 条增扣明细？`)) return;

  const r = await post('/api/adjustments/batch-delete', { ids });
  if (r && r.ok) {
    showToast(`已删除 ${r.deleted || ids.length} 条增扣明细`, 'success');
    loadMemberDetail(empId);
  } else {
    showToast((r && r.error) || '批量删除失败', 'error');
  }
}

function renderAdjustmentSection(empId, item) {
  const key = getAdjustmentMonthKey(item.year, item.month);
  const adjustments = item.adjustments || [];

  if (!adjustments.length) {
    return `
      <div class="md-adjustment-section">
        <div class="md-adjustment-toolbar">
          <div class="md-adjustment-title">增扣明细</div>
          <div class="md-adjustment-actions">
            <button class="btn btn-sm btn-secondary" onclick="showAddAdjustmentModal(${empId}, ${item.year}, ${item.month})">新增增扣</button>
            <button class="btn btn-sm btn-danger" id="adj-batch-del-${key}" style="display:none;" onclick="batchDeleteAdjustments(${empId}, ${item.year}, ${item.month})">批量删除增扣</button>
          </div>
        </div>
        <div class="md-adjustment-empty">本月暂无增扣明细</div>
      </div>
    `;
  }

  const rows = adjustments.map(adj => `
    <tr>
      <td style="text-align:center;"><input type="checkbox" class="adj-check" data-month-key="${key}" value="${adj.id}" onchange="updateAdjustmentBatchDeleteButton(${item.year}, ${item.month})"></td>
      <td>${escHtml(adj.adj_date || '')}</td>
      <td style="text-align:right;">${fmt(adj.adj_quantity || 0)}</td>
      <td style="text-align:right; color:#b45309; font-weight:600;">¥${fmt(adj.adj_amount || 0)}</td>
      <td>${escHtml(adj.reason || '')}</td>
      <td style="text-align:center;"><button class="btn btn-sm btn-danger" onclick="deleteAdjustmentItem(${empId}, ${adj.id})">删除</button></td>
    </tr>
  `).join('');

  return `
    <div class="md-adjustment-section">
      <div class="md-adjustment-toolbar">
        <div class="md-adjustment-title">增扣明细</div>
        <div class="md-adjustment-actions">
          <button class="btn btn-sm btn-secondary" onclick="showAddAdjustmentModal(${empId}, ${item.year}, ${item.month})">新增增扣</button>
          <button class="btn btn-sm btn-danger" id="adj-batch-del-${key}" style="display:none;" onclick="batchDeleteAdjustments(${empId}, ${item.year}, ${item.month})">批量删除增扣</button>
        </div>
      </div>
      <table class="md-adjustments-table">
        <thead>
          <tr>
            <th style="width:44px; text-align:center;"><input type="checkbox" id="adj-select-all-${key}" onchange="toggleAdjustmentMonth(${item.year}, ${item.month})"></th>
            <th>增扣日期</th>
            <th style="text-align:right;">增扣对数</th>
            <th style="text-align:right;">增扣工资</th>
            <th>增扣理由</th>
            <th style="width:72px; text-align:center;">操作</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

async function loadMemberDetail(empId) {
  const header = document.getElementById('mdHeader');
  const content = document.getElementById('mdContent');
  header.innerHTML = '<span>成员详情</span>';
  const finishRefresh = beginContentRefresh(content, {
    loadingText: '正在加载成员详情...',
    minHeight: 260,
  });

  try {
    const source = localStorage.getItem('useQcSalary') === 'true' ? 'qc' : 'work';
    const data = await get(`/api/employees/${empId}/work-history?source=${source}`);
    if (!data) {
      content.innerHTML = '<div class="empty-state">未找到该成员</div>';
      return;
    }

    const emp = data.employee;
    const history = data.history || [];
    if (!_state.employees) _state.employees = [];
    if (!_state.employees.find(e => e.id === emp.id)) _state.employees.push(emp);

    const totalWage = history.reduce((sum, item) => sum + (item.month_wage || 0), 0);
    const totalPairs = history.reduce((sum, item) => sum + (item.total_pairs || 0), 0);
    const totalAdj = history.reduce((sum, item) => sum + (item.adj_amount || 0), 0);
    const totalAll = history.reduce((sum, item) => sum + (item.total || 0), 0);
    const targetMonth = getMemberAdjustmentTargetMonth();

    const summaryCard = `
      <div class="md-summary-card">
        <div class="md-summary-info">
          <div class="md-summary-name member-list-name-color" onclick="showEditMemberModal(${emp.id})" title="点击编辑成员信息" style="cursor:pointer;">${escHtml(emp.name)}</div>
          <div class="md-summary-meta">
            <span class="member-gender-badge">${emp.gender === '女' ? '♀' : '♂'}</span>
            <span class="dept-large">${escHtml(emp.dept_name)}</span>
            <span class="dept-sub">/ ${escHtml(emp.sub_dept_name)}</span>
            &nbsp;|&nbsp; 共 ${history.length} 个月有记录
          </div>
        </div>
        <div class="md-summary-stats">
          <div class="md-summary-stat">
            <div class="md-summary-stat-val orange">${fmt(totalPairs)}</div>
            <div class="md-summary-stat-label">累计做货对数</div>
          </div>
          <div class="md-summary-stat">
            <div class="md-summary-stat-val">¥${fmt(totalWage)}</div>
            <div class="md-summary-stat-label">累计做货工资</div>
          </div>
          <div class="md-summary-stat">
            <div class="md-summary-stat-val orange">¥${fmt(totalAdj)}</div>
            <div class="md-summary-stat-label">累计人工增扣</div>
          </div>
          <div class="md-summary-stat">
            <div class="md-summary-stat-val green">¥${fmt(totalAll)}</div>
            <div class="md-summary-stat-label">累计总收入</div>
          </div>
        </div>
        <div class="md-summary-actions">
          <button class="btn btn-sm btn-secondary" onclick="showAddAdjustmentModal(${emp.id}, ${targetMonth.year}, ${targetMonth.month})">新增 ${targetMonth.year}-${pad(targetMonth.month)} 增扣</button>
        </div>
      </div>
    `;

    let historyHtml = '';
    if (!history.length) {
      historyHtml = '<div class="md-history-empty">暂无做货记录</div>';
    } else {
      historyHtml = history.map(item => {
      const recs = (source === 'qc' && (!item.records || !item.records.length) && ((item.total_pairs || 0) !== 0 || (item.month_wage || 0) !== 0))
        ? [{
            order_no: '来自快捷计算',
            model_no: '来自快捷计算',
            quantity: item.total_pairs || 0,
            unit_price: null,
            line_wage: item.month_wage || 0,
          }]
        : (item.records || []);
      const recRows = recs.length
        ? recs.map(r => `
            <tr>
              <td>${escHtml(r.order_no || '-')}</td>
              <td>${escHtml(r.model_no || '-')}</td>
              <td style="text-align:right;">${fmt(r.quantity || 0)}</td>
              <td style="text-align:right;">${r.unit_price == null ? '-' : `¥${fmt(r.unit_price || 0)}`}</td>
              <td style="text-align:right; font-weight:600;">¥${fmt(r.line_wage || 0)}</td>
            </tr>
          `).join('')
        : '<tr class="md-no-records"><td colspan="5">暂无做货明细</td></tr>';

      return `
        <div class="md-month-block">
          <div class="md-month-header">
            <span>${item.year} 年 ${pad(item.month)} 月</span>
            <div class="md-month-totals">
              <span>做货对数：<b>${fmt(item.total_pairs || 0)}</b></span>
              <span>做货工资：<b style="color:var(--primary);">¥${fmt(item.month_wage || 0)}</b></span>
              ${item.adj_amount ? `<span>增扣：<b style="color:#d97706;">¥${fmt(item.adj_amount || 0)}</b></span>` : ''}
              <span>本月合计：<b style="color:var(--success);">¥${fmt(item.total || 0)}</b></span>
            </div>
          </div>
          <table class="md-records-table">
            <thead>
              <tr>
                <th>订单号</th>
                <th>型号</th>
                <th style="text-align:right;">做货对数</th>
                <th style="text-align:right;">单价</th>
                <th style="text-align:right;">工资</th>
              </tr>
            </thead>
            <tbody>${recRows}</tbody>
          </table>
          ${renderAdjustmentSection(empId, item)}
        </div>
      `;
      }).join('');
    }

    content.innerHTML = summaryCard + `<div class="md-history-section">${historyHtml}</div>`;
    history.forEach(item => updateAdjustmentBatchDeleteButton(item.year, item.month));
  } finally {
    finishRefresh();
  }
}
