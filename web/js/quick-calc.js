// ============================================================
// 快捷计算 - 按大部门分组的多表格（无型号，纯手工输入）
// ============================================================
let _qcViewModeBusy = false;
let qcColumnDraggingEmpId = 0;
let qcColumnDraggingDeptId = 0;
let _qcLoadedPeriod = null;
let _qcSaveQueue = Promise.resolve();

// 空白行只属于电子表格视图；数据库仅保存有单价或对数的在用行。
function isQcRowUsed(rowKey) {
  return Object.values(_qcDeptRows[rowKey] || {}).some(value => Number(value) > 0) ||
    Object.entries(_qcState.qtyData).some(([key, value]) => key.startsWith(rowKey + ',') && Number(value) > 0);
}

function normalizeQcRows() {
  for (const [key, value] of Object.entries(_qcState.qtyData)) {
    if (Number(value) > 0) _qcDeptRows[key.split(',')[0]] ||= {};
    else delete _qcState.qtyData[key];
  }
  for (const [rowKey, row] of Object.entries(_qcDeptRows)) {
    for (const [subId, price] of Object.entries(row)) if (!(Number(price) > 0)) delete row[subId];
    if (!isQcRowUsed(rowKey)) delete _qcDeptRows[rowKey];
  }
}

function getQcUsedRowCount(deptId) {
  return Object.keys(_qcDeptRows).filter(key => key.startsWith(deptId + '_') && isQcRowUsed(key)).length;
}

// 清空中间行后收拢后续数据，保持每个部门的在用行连续排列。
function compactQcRows(deptId) {
  const keys = Object.keys(_qcDeptRows).filter(key => key.startsWith(deptId + '_') && isQcRowUsed(key))
    .sort((a, b) => Number(a.split('_')[1]) - Number(b.split('_')[1]));
  const moves = new Map(keys.map((key, index) => [key, `${deptId}_${index}`]).filter(([from, to]) => from !== to));
  if (!moves.size) return moves;
  const rows = keys.map(key => _qcDeptRows[key]);
  const quantities = Object.entries(_qcState.qtyData).filter(([key]) => key.startsWith(deptId + '_'));
  keys.forEach(key => delete _qcDeptRows[key]);
  quantities.forEach(([key]) => delete _qcState.qtyData[key]);
  keys.forEach((key, index) => { _qcDeptRows[`${deptId}_${index}`] = rows[index]; });
  for (const [key, value] of quantities) {
    const [rowKey, empId] = key.split(',');
    if (keys.includes(rowKey)) _qcState.qtyData[`${moves.get(rowKey) || rowKey},${empId}`] = value;
  }
  return moves;
}

// ---- 初始化 ----
async function initQuickCalc() {
  if (window.LmsSpreadsheet?.getInstance('qcDeptTablesWrap')) {
    await window.LmsSpreadsheet.flush('quick-calc');
    clearTimeout(window._qcAutoSaveTimer);
    await autoSaveQc();
  }
  const [emps, depts, subs] = await Promise.all([
    get('/api/employees'),
    get('/api/departments'),
    get('/api/sub-departments'),
  ]);
  _qcState.employees = emps || [];
  _qcState.departments = depts || [];
  _qcState.subDepartments = subs || [];
  _qcState.qtyData = {};
  _qcState.qcViewMode = 'qty';
  _qcState.qcWageDetail = null;
  await ensureMemberOrderPrefsLoaded('quickcalc', _qcState.employees.map(emp => emp.dept_id));

  // 自动加载上次保存的状态
  const year = parseInt(document.getElementById('qcYear')?.value || _state.currentYear);
  const month = parseInt(document.getElementById('qcMonth')?.value || _state.currentMonth);
  const saved = await get(`/api/quick-calc-save?year=${year}&month=${month}`);
  _qcLoadedPeriod = { year, month };

  if (saved && saved.dept_rows && Object.keys(saved.dept_rows).length > 0) {
    _qcDeptRows = { ...saved.dept_rows };
    _qcState.qtyData = { ...saved.qty_data };
  } else {
    // 新月份从空白表格开始，首次录入时自动启用对应行。
    _qcDeptRows = {};
    _qcState.qtyData = {};
  }
  normalizeQcRows();
  _qcState.departments.forEach(dept => compactQcRows(dept.id));

  // 重置工资视角按钮
  const btn = document.getElementById('qcViewModeBtn');
  if (btn) {
    btn.textContent = '切换工资视角';
    btn.style.background = '#fef3c7';
    btn.style.color = '#92400e';
  }
  ensureMemberOrderSyncSwitch(
    'quickcalc',
    document.getElementById('qcViewModeBtn')?.parentElement || document.querySelector('#view-quickcalc .work-toolbar'),
    () => renderQcDeptTables()
  );

  // 保存初始状态到历史栈（清空之前的历史）
  clearHistory();

  await window.LmsSpreadsheet?.loadLayout('quick-calc', document.getElementById('qcYear').value, document.getElementById('qcMonth').value, _qcState.qcViewMode);
  renderQcDeptTables();
}

// ---- 渲染所有大部门表格 ----
function renderQcDeptTables() {
  const wrap = document.getElementById('qcDeptTablesWrap');
  if (!wrap) return;
  window.LmsSpreadsheet?.dispose(wrap);
  normalizeQcRows();
  _qcState.departments.forEach(dept => compactQcRows(dept.id));

  const { departments, subDepartments } = _qcState;
  const employees = orderEmployeesByDisplayPreference('quickcalc', _qcState.employees);
  const isWage = _qcState.qcViewMode === 'wage';

  if (!departments.length) {
    wrap.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 1 1 0 10h-2M8 12h8"/></svg><div>请先在部门管理中添加大部门</div></div>';
    document.getElementById('qcGrandTotal').textContent = '¥0.00';
    return;
  }

  let html = '';
  let grandTotal = 0;

  for (const dept of departments) {
    const deptSubs = subDepartments.filter(s => s.dept_id === dept.id);
    const deptEmps = employees.filter(e => e.dept_id === dept.id);

    if (!deptSubs.length && !deptEmps.length) continue;

    // 收集该大部门的所有行
    const deptRowKeys = Object.keys(_qcDeptRows).filter(k => k.startsWith(dept.id + '_'));
    // 至少提供一行 DOM 模板，其余空白行由引擎按需绑定，不生成大量隐藏输入框。
    if (!deptRowKeys.length) deptRowKeys.push(`${dept.id}_0`);
    const sortedRowKeys = deptRowKeys.sort((a, b) => {
      const ra = parseInt(a.split('_')[1]);
      const rb = parseInt(b.split('_')[1]);
      return ra - rb;
    });

    // 大部门标题
    html += `<div class="qc-dept-section">`;
    html += `<div class="qc-dept-header">
      <span class="qc-dept-name">${escHtml(dept.name)}</span>
      <span class="qc-dept-subs">单价：${deptSubs.map(s => escHtml(s.name)).join('、')}</span>
      <span class="qc-dept-emps">成员：${deptEmps.map(e => escHtml(e.name)).join('、')}</span>
    </div>`;

    {
      const zebraCls = (typeof _currentSettings !== 'undefined' && _currentSettings['table-zebra']) ? ' table-zebra' : '';
      html += `<div class="spreadsheet-wrap qc-dept-table-wrap"><table data-dept-id="${dept.id}" class="spreadsheet${isWage ? ' wage-view' : ''}${zebraCls}">`;

      // 表头仅包含业务数据。
      html += '<thead><tr>';
      for (const sub of deptSubs) {
        html += `<th style="min-width:70px;width:70px;background:#d1fae5;color:#065f46;position:sticky;top:0;z-index:10;text-align:center;">
          ${escHtml(sub.name)}<br><span class="qc-th-subtext">单价</span>
        </th>`;
      }
      for (const emp of deptEmps) {
        html += `<th class="employee-order-header quick-employee-header" data-emp-id="${emp.id}" data-dept-id="${emp.dept_id}"
          ondragover="onQcColumnDragOver(event)" ondragleave="onQcColumnDragLeave(event)" ondrop="onQcColumnDrop(event)"
          style="min-width:70px;width:70px;background:#e0e7ff;color:#3730a3;position:sticky;top:0;z-index:10;text-align:center;">
          <span class="column-drag-handle" draggable="true" data-emp-id="${emp.id}" data-dept-id="${emp.dept_id}"
            ondragstart="onQcColumnDragStart(event)" ondragend="onQcColumnDragEnd(event)" title="按住拖拽调整同部门内列顺序">•••</span>
          <span class="member-list-name-color" onclick="showEditMemberModal(${emp.id})" title="编辑人员">${escHtml(emp.name)}</span>
          <br><span class="qc-th-subtext">${escHtml(emp.sub_dept_name)}</span>
        </th>`;
      }
      html += `<th style="min-width:70px;width:70px;background:#fef9c3;color:#92400e;position:sticky;top:0;z-index:10;text-align:center;">行合计</th>`;
      html += '</tr></thead>';

      // 表体
      html += '<tbody>';
      for (const rowKey of sortedRowKeys) {
        const row = _qcDeptRows[rowKey] || {};

        // 计算行合计：对数视角合计对数，工资视角合计金额。
        let rowTotal = 0;
        for (const emp of deptEmps) {
          const qtyKey = `${rowKey},${emp.id}`;
          const qty = _qcState.qtyData[qtyKey] || 0;
          const empSubPrice = row[emp.sub_dept_id] || 0;
          rowTotal += isWage ? roundNumber(qty * empSubPrice) : qty;
        }
        rowTotal = isWage ? roundNumber(rowTotal) : rowTotal;
        const rowDisplay = isWage ? (rowTotal > 0 ? fmtCompact(rowTotal) : '') : rowTotal;
        const rowCompact = String(rowDisplay).length > 8 ? ' compact' : '';

        html += `<tr data-row-key="${escHtml(rowKey)}" data-qc-used="${isQcRowUsed(rowKey)}">`;


        // 各小部门单价列（纯手动输入）
        for (const sub of deptSubs) {
          const priceVal = row[sub.id] || 0;
          if (isWage) {
            html += `<td class="qc-price-cell" style="text-align:center;background:#f0fdf4;">
              <div class="cell-input qc-price-display" title="￥${priceVal.toFixed(2)}">￥${priceVal.toFixed(2)}</div>
            </td>`;
          } else {
            html += `<td class="qc-price-cell" style="text-align:center;background:#f0fdf4;">
              <input type="number" min="0" step="0.01" class="cell-input qc-price-input"
                style="width:65px;text-align:center;"
                value="${priceVal || ''}" placeholder="0"
                data-row-key="${escHtml(rowKey)}" data-sub-id="${sub.id}"
                onfocus="onQcCellFocus(this, 'price')"
                onblur="onQcCellBlur(this, 'price')"
                oninput="onQcPriceInput(this)"
                onkeydown="onQcPriceTab(event, this)">
            </td>`;
          }
        }

        // 成员对数列
        for (const emp of deptEmps) {
          const qtyKey = `${rowKey},${emp.id}`;
          const qty = _qcState.qtyData[qtyKey] || 0;
          const empSubPrice = row[emp.sub_dept_id] || 0;
          const wage = roundNumber(qty * empSubPrice);

          if (isWage) {
            const displayVal = qty > 0 ? fmtCompact(wage) : '';
            const compactClass = String(displayVal).length > 6 ? ' compact' : '';
            html += `<td class="emp-cell">
              <div class="cell-input wage-cell-display${compactClass}"
                data-key="${qtyKey}"
                title="${qty > 0 ? '¥' + fmt(wage) : ''}">${displayVal}</div>
            </td>`;
          } else {
            // 非0值 → 浅蓝色；0值或空值 → 默认颜色
            const hasQty = qty > 0;
            const bgStyle = hasQty ? 'background:#bfdbfe;' : '';
            html += `<td class="emp-cell" style="text-align:center;">
              <input type="number" min="0" class="cell-input qc-qty-input"
                style="width:65px;text-align:center;${bgStyle}"
                value="${qty || ''}" placeholder="0"
                data-key="${qtyKey}"
                data-row-key="${escHtml(rowKey)}"
                data-emp-id="${emp.id}"
                data-sub-id="${emp.sub_dept_id}"
                onfocus="onQcCellFocus(this, 'qty')"
                onblur="onQcCellBlur(this, 'qty')"
                oninput="onQcQtyInput(this)"
                onkeydown="onQcQtyTab(event, this)">
            </td>`;
          }
        }

        // 行合计
        html += `<td data-sheet-value="${rowTotal}" class="row-total-display${isWage ? ' wage' : ''}${rowCompact}" style="background:#fef9c3;font-weight:700;color:#92400e;text-align:center;">${rowDisplay}</td>`;

        html += '</tr>';
      }
      html += '</tbody></table></div>';
    }

    html += '</div>'; // qc-dept-section end

    // 累加该大部门的合计
    for (const rowKey of sortedRowKeys) {
      const row = _qcDeptRows[rowKey] || {};
      const deptEmps2 = employees.filter(e => e.dept_id === dept.id);
      for (const emp of deptEmps2) {
        const qtyKey = `${rowKey},${emp.id}`;
        const qty = _qcState.qtyData[qtyKey] || 0;
        const subPrice = row[emp.sub_dept_id] || 0;
        grandTotal += qty * subPrice;
      }
    }
  }

  wrap.innerHTML = html;
  document.getElementById('qcGrandTotal').textContent = '¥' + fmt(grandTotal);
  window.LmsSpreadsheet?.mount(wrap, 'quick-calc');
}

// ---- 单元格获得焦点 ----
function onQcColumnDragStart(event) {
  const handle = event.currentTarget;
  const th = handle.closest('th');
  qcColumnDraggingEmpId = parseInt(handle.dataset.empId, 10);
  qcColumnDraggingDeptId = parseInt(handle.dataset.deptId, 10);
  if (getMemberOrderSync('quickcalc')) {
    setMemberOrderSync('quickcalc', false);
    const syncInput = document.querySelector('#memberOrderSync_quickcalc input');
    if (syncInput) syncInput.checked = false;
  }
  if (th) th.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', String(qcColumnDraggingEmpId));
}

function onQcColumnDragOver(event) {
  event.preventDefault();
  const th = event.currentTarget;
  if (parseInt(th.dataset.empId, 10) !== qcColumnDraggingEmpId) {
    markDragOverPosition(th);
  }
}

function onQcColumnDragLeave(event) {
  clearDragOverPosition(event.currentTarget);
}

function onQcColumnDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  const th = event.currentTarget;
  const targetDeptId = parseInt(th.dataset.deptId, 10);
  const targetEmpId = parseInt(th.dataset.empId, 10);
  if (!qcColumnDraggingEmpId) return;
  if (targetDeptId !== qcColumnDraggingDeptId) {
    showToast('只能在同一部门内调整列顺序', 'info');
    return;
  }

  const headers = Array.from(th.closest('tr').querySelectorAll('.quick-employee-header[data-emp-id]'))
    .filter(item => parseInt(item.dataset.deptId, 10) === targetDeptId);
  const currentIds = headers.map(item => parseInt(item.dataset.empId, 10));
  setManualEmployeeOrder(
    'quickcalc',
    targetDeptId,
    swapIds(currentIds, qcColumnDraggingEmpId, targetEmpId)
  );
  renderQcDeptTables();
  markSwapSuccess('.quick-employee-header', [qcColumnDraggingEmpId, targetEmpId]);
}

function onQcColumnDragEnd(event) {
  const th = event.currentTarget.closest('th');
  if (th) th.classList.remove('dragging');
  document.querySelectorAll('.quick-employee-header.drag-over').forEach(item => clearDragOverPosition(item));
  qcColumnDraggingEmpId = 0;
  qcColumnDraggingDeptId = 0;
}

function onQcCellFocus(el, type) {
  if (type === 'price') {
    const rowKey = el.dataset.rowKey;
    const subId = parseInt(el.dataset.subId);
    const currentVal = _qcDeptRows[rowKey]?.[subId] || 0;
    
    _editSession = {
      type: 'quick-calc-price',
      rowKey: rowKey,
      subId: subId,
      originalValue: currentVal
    };
  } else if (type === 'qty') {
    const qtyKey = el.dataset.key;
    const currentVal = _qcState.qtyData[qtyKey] || 0;
    
    _editSession = {
      type: 'quick-calc-qty',
      qtyKey: qtyKey,
      originalValue: currentVal
    };
  }
  
  // 如果值为0或空，清空输入框方便输入
  if (el.value === '0' || el.value === '') {
    el.value = '';
  }
}

// ---- 单元格失去焦点 ----
function onQcCellBlur(el, type) {
  const rawVal = el.value.trim();
  const val = rawVal === '' ? 0 : ((type === 'price' ? parseFloat(rawVal) : parseInt(rawVal)) || 0);
  
  // 检查值是否变化，变化才保存历史（按单元格撤销）
  let hasChanged = false;
  if (_editSession) {
    if (type === 'price' && _editSession.type === 'quick-calc-price') {
      const rowKey = el.dataset.rowKey;
      const subId = parseInt(el.dataset.subId);
      if (_editSession.rowKey === rowKey && _editSession.subId === subId) {
        if (val !== _editSession.originalValue) {
          pushHistory('quick-calc');
          hasChanged = true;
        }
      }
    } else if (type === 'qty' && _editSession.type === 'quick-calc-qty') {
      const qtyKey = el.dataset.key;
      if (_editSession.qtyKey === qtyKey) {
        if (val !== _editSession.originalValue) {
          pushHistory('quick-calc');
          hasChanged = true;
        }
      }
    }
  }
  
  _editSession = null;
  
  // 如果值为0，显示0
  if (val === 0) {
    el.value = '0';
  }

  // 值变化时触发自动保存
  if (hasChanged) {
    clearTimeout(window._qcAutoSaveTimer);
    window._qcAutoSaveTimer = setTimeout(() => autoSaveQc(), 500);
  }
}

// ---- 单价输入变化 ----
function onQcPriceInput(el) {
  const rowKey = el.dataset.rowKey;
  const subId = parseInt(el.dataset.subId);
  const val = parseFloat(el.value) || 0;

  _qcDeptRows[rowKey] ||= {};

  // 实时更新显示，但不保存历史
  if (val === 0) {
    delete _qcDeptRows[rowKey][subId];
    el.style.background = '';
  } else {
    _qcDeptRows[rowKey][subId] = val;
    el.style.background = '#fef9c3';
  }

  // 更新所有员工列（因为单价变了，工资会变）
  updateDeptRowTotals(rowKey);

  // 防抖自动保存
  clearTimeout(window._qcAutoSaveTimer);
  window._qcAutoSaveTimer = setTimeout(() => autoSaveQc(), 500);
}

// ---- 单价 Tab/Enter 导航 ----
function _getQcRows(el) {
  const table = el.closest('table');
  if (!table) return [];
  return Array.from(table.querySelectorAll('tbody tr[data-row-key]'));
}

function _getQcAllInputs(rowKey) {
  const priceCells = Array.from(document.querySelectorAll(`.qc-price-input[data-row-key="${rowKey}"]`));
  const qtyCells = Array.from(document.querySelectorAll(`.qc-qty-input[data-row-key="${rowKey}"]`));
  return [...priceCells, ...qtyCells];
}

function _focusQcCell(inputs, idx) {
  if (idx >= 0 && idx < inputs.length) {
    inputs[idx].focus();
  }
}

function onQcPriceTab(e, el) {
  if (e.key === 'Tab') {
    e.preventDefault();
    const rowKey = el.dataset.rowKey;
    const allRows = _getQcRows(el);
    const rowIdx = allRows.findIndex(r => r.dataset.rowKey === rowKey);
    if (rowIdx < 0) return;

    const allInputs = _getQcAllInputs(rowKey);
    const curIdx = allInputs.indexOf(el);
    if (curIdx < 0) return;

    if (e.shiftKey) {
      if (curIdx > 0) {
        allInputs[curIdx - 1].focus();
      } else {
        const prevRow = rowIdx > 0 ? allRows[rowIdx - 1] : allRows[allRows.length - 1];
        const prevInputs = _getQcAllInputs(prevRow.dataset.rowKey);
        prevInputs[prevInputs.length - 1].focus();
      }
    } else {
      if (curIdx < allInputs.length - 1) {
        allInputs[curIdx + 1].focus();
      } else {
        const nextRow = rowIdx < allRows.length - 1 ? allRows[rowIdx + 1] : allRows[0];
        const nextInputs = _getQcAllInputs(nextRow.dataset.rowKey);
        nextInputs[0].focus();
      }
    }
  }
  else if (e.key === 'Enter') {
    e.preventDefault();
    const rowKey = el.dataset.rowKey;
    const allRows = _getQcRows(el);
    const rowIdx = allRows.findIndex(r => r.dataset.rowKey === rowKey);
    if (rowIdx < 0) return;

    const allInputs = _getQcAllInputs(rowKey);
    const colIdx = allInputs.indexOf(el);
    if (colIdx < 0) return;

    let targetRow = rowIdx + 1;
    let targetCol = colIdx;

    if (targetRow >= allRows.length) {
      targetRow = 0;
      targetCol = colIdx + 1;
      const maxCols = allRows.reduce((max, r) => Math.max(max, _getQcAllInputs(r.dataset.rowKey).length), 0);
      if (targetCol >= maxCols) targetCol = 0;
    }

    const nextInputs = _getQcAllInputs(allRows[targetRow].dataset.rowKey);
    _focusQcCell(nextInputs, targetCol);
  }
}

// ---- 对数输入变化 ----
function onQcQtyInput(el) {
  const key = el.dataset.key;
  if (!key) return;
  const val = parseInt(el.value) || 0;
  const rowKey = el.dataset.rowKey;

  // 实时更新显示，但不保存历史
  if (val === 0) {
    delete _qcState.qtyData[key];
    el.style.background = '';  // 0值恢复默认颜色
  } else {
    _qcState.qtyData[key] = val;
    _qcDeptRows[rowKey] ||= {};
    el.style.background = '#bfdbfe';  // 非0值浅蓝色（与做货编辑一致）
  }

  updateDeptRowTotals(rowKey);

  // 防抖自动保存
  clearTimeout(window._qcAutoSaveTimer);
  window._qcAutoSaveTimer = setTimeout(() => autoSaveQc(), 500);
}

// ---- 对数 Tab/Enter 导航 ----
function onQcQtyTab(e, el) {
  if (e.key === 'Tab') {
    e.preventDefault();
    const rowKey = el.dataset.rowKey;
    const allRows = _getQcRows(el);
    const rowIdx = allRows.findIndex(r => r.dataset.rowKey === rowKey);
    if (rowIdx < 0) return;

    const allInputs = _getQcAllInputs(rowKey);
    const curIdx = allInputs.indexOf(el);
    if (curIdx < 0) return;

    if (e.shiftKey) {
      if (curIdx > 0) {
        allInputs[curIdx - 1].focus();
      } else {
        const prevRow = rowIdx > 0 ? allRows[rowIdx - 1] : allRows[allRows.length - 1];
        const prevInputs = _getQcAllInputs(prevRow.dataset.rowKey);
        prevInputs[prevInputs.length - 1].focus();
      }
    } else {
      if (curIdx < allInputs.length - 1) {
        allInputs[curIdx + 1].focus();
      } else {
        const nextRow = rowIdx < allRows.length - 1 ? allRows[rowIdx + 1] : allRows[0];
        const nextInputs = _getQcAllInputs(nextRow.dataset.rowKey);
        nextInputs[0].focus();
      }
    }
  }
  else if (e.key === 'Enter') {
    e.preventDefault();
    const rowKey = el.dataset.rowKey;
    const allRows = _getQcRows(el);
    const rowIdx = allRows.findIndex(r => r.dataset.rowKey === rowKey);
    if (rowIdx < 0) return;

    const allInputs = _getQcAllInputs(rowKey);
    const colIdx = allInputs.indexOf(el);
    if (colIdx < 0) return;

    let targetRow = rowIdx + 1;
    let targetCol = colIdx;

    if (targetRow >= allRows.length) {
      targetRow = 0;
      targetCol = colIdx + 1;
      const maxCols = allRows.reduce((max, r) => Math.max(max, _getQcAllInputs(r.dataset.rowKey).length), 0);
      if (targetCol >= maxCols) targetCol = 0;
    }

    const nextInputs = _getQcAllInputs(allRows[targetRow].dataset.rowKey);
    _focusQcCell(nextInputs, targetCol);
  }
}

// ---- 更新某行所有合计（行合计 + 全厂合计） ----
function updateDeptRowTotals(rowKey) {
  const deptId = parseInt(rowKey.split('_')[0]);
  const row = _qcDeptRows[rowKey] || {};
  const deptEmps = _qcState.employees.filter(e => e.dept_id === deptId);
  const isWage = _qcState.qcViewMode === 'wage';

  let rowTotal = 0;
  for (const emp of deptEmps) {
    const qtyKey = `${rowKey},${emp.id}`;
    const qty = _qcState.qtyData[qtyKey] || 0;
    const empSubPrice = row[emp.sub_dept_id] || 0;
    rowTotal += isWage ? roundNumber(qty * empSubPrice) : qty;

    // 更新该成员的工资显示（工资视角下）
    if (isWage) {
      const wage = roundNumber(qty * empSubPrice);
      const displayVal = qty > 0 ? fmtCompact(wage) : '';
      const allDisplays = document.querySelectorAll(`.wage-cell-display[data-key="${qtyKey}"]`);
      for (const d of allDisplays) {
        d.textContent = displayVal;
        d.title = qty > 0 ? '¥' + fmt(wage) : '';
        d.className = `cell-input wage-cell-display${String(displayVal).length > 6 ? ' compact' : ''}`;
      }
    }
  }

  // 更新行合计 - 通过 rowKey 找到对应行的第一个 td（在同一个 table 中按行序号定位）
  const wrap = document.getElementById('qcDeptTablesWrap');
  if (!wrap) return;
  const tables = wrap.querySelectorAll('.spreadsheet');
  for (const table of tables) {
    const rows = table.querySelectorAll('tbody tr');
    // 直接用行标识匹配，新增行也能稳定更新合计。
    for (const tr of rows) {
      if (tr.dataset.rowKey === rowKey) {
        tr.dataset.qcUsed = String(isQcRowUsed(rowKey));
        const totalEl = tr.querySelector('.row-total-display');
        if (totalEl) {
          rowTotal = isWage ? roundNumber(rowTotal) : rowTotal;
          totalEl.dataset.sheetValue = String(rowTotal);
          const rowDisplay = isWage ? (rowTotal > 0 ? fmtCompact(rowTotal) : '') : rowTotal;
          const rowCompact = String(rowDisplay).length > 8 ? ' compact' : '';
          totalEl.textContent = rowDisplay;
          totalEl.className = `row-total-display${isWage ? ' wage' : ''}${rowCompact}`;
        }
        break;
      }
    }
  }

  // 更新全厂合计
  let grandTotal = 0;
  for (const dept of _qcState.departments) {
    const dEmps = _qcState.employees.filter(e => e.dept_id === dept.id);
    const dRowKeys = Object.keys(_qcDeptRows).filter(k => k.startsWith(dept.id + '_'));
    for (const rk of dRowKeys) {
      const r = _qcDeptRows[rk];
      for (const emp of dEmps) {
        const qtyKey = `${rk},${emp.id}`;
        const qty = _qcState.qtyData[qtyKey] || 0;
        const subPrice = r[emp.sub_dept_id] || 0;
        grandTotal += qty * subPrice;
      }
    }
  }
  document.getElementById('qcGrandTotal').textContent = '¥' + fmt(grandTotal);
  if (!isQcRowUsed(rowKey)) delete _qcDeptRows[rowKey];
}

// ---- 自动保存快捷计算状态 ----
async function autoSaveQc() {
  normalizeQcRows();
  const year = _qcLoadedPeriod?.year ?? parseInt(document.getElementById('qcYear')?.value || _state.currentYear);
  const month = _qcLoadedPeriod?.month ?? parseInt(document.getElementById('qcMonth')?.value || _state.currentMonth);
  const payload = JSON.parse(JSON.stringify({
    year, month,
    dept_rows: _qcDeptRows,
    qty_data: _qcState.qtyData,
  }));
  const saved = _qcSaveQueue.catch(() => {}).then(() => post('/api/quick-calc-save', payload));
  _qcSaveQueue = saved;
  return saved;
}

// ---- 手动保存 ----
async function saveQcState() {
  await window.LmsSpreadsheet?.flush('quick-calc');
  await autoSaveQc();
  const btn = document.getElementById('qcSaveBtn');
  if (btn) {
    btn.textContent = '✓ 已保存';
    btn.style.background = '#d1fae5';
    btn.style.color = '#065f46';
    setTimeout(() => {
      btn.textContent = '💾 保存';
      btn.style.background = '';
      btn.style.color = '';
    }, 2000);
  }
  toast('保存成功', 'success');
}

// ---- 清空对数 ----
function clearQcInputs() {
  pushHistory('quick-calc');
  _qcState.qtyData = {};
  renderQcDeptTables();
  saveQcState();
}

// ---- 清空单价 ----
function clearQcPrices() {
  pushHistory('quick-calc');
  // 遍历所有行的单价，重置为0
  for (const rowKey in _qcDeptRows) {
    const row = _qcDeptRows[rowKey];
    for (const subDeptId in row) {
      row[subDeptId] = 0;
    }
  }
  renderQcDeptTables();
  saveQcState();
}

// ---- 切换工资视角 ----
async function qcToggleViewMode() {
  if (_qcViewModeBusy) return;
  _qcViewModeBusy = true;

  const btn = document.getElementById('qcViewModeBtn');
  const finishButton = beginButtonLoading(
    btn,
    _qcState.qcViewMode === 'qty' ? '正在计算工资...' : '正在切换...'
  );
  const finishRefresh = beginContentRefresh(document.getElementById('qcDeptTablesWrap'), {
    loadingText: _qcState.qcViewMode === 'qty' ? '正在计算快捷工资视角...' : '正在恢复对数视角...',
    minHeight: 260,
    allowEntrance: false,
  });

  try {
    await window.LmsSpreadsheet?.flush('quick-calc');
    await autoSaveQc();
    if (_qcState.qcViewMode === 'qty') {
      _qcState.qcViewMode = 'wage';
      if (btn) {
        btn.textContent = '切换对数视角';
        btn.style.background = '#dcfce7';
        btn.style.color = '#15803d';
      }
      toast('工资视角：对数 × 单价', 'info');
    } else {
      _qcState.qcViewMode = 'qty';
      _qcState.qcWageDetail = null;
      if (btn) {
        btn.textContent = '切换工资视角';
        btn.style.background = '#fef3c7';
        btn.style.color = '#92400e';
      }
      toast('对数视角', 'info');
    }
    await window.LmsSpreadsheet?.loadLayout('quick-calc', document.getElementById('qcYear').value, document.getElementById('qcMonth').value, _qcState.qcViewMode);
    renderQcDeptTables();
  } catch (e) {
    console.error('快捷计算切换工资视角失败', e);
    showToast('切换工资视角失败，请稍后重试', 'error');
  } finally {
    finishRefresh();
    finishButton();
    if (btn) {
      if (_qcState.qcViewMode === 'wage') {
        btn.textContent = '切换对数视角';
        btn.style.background = '#dcfce7';
        btn.style.color = '#15803d';
      } else {
        btn.textContent = '切换工资视角';
        btn.style.background = '#fef3c7';
        btn.style.color = '#92400e';
      }
    }
    _qcViewModeBusy = false;
  }
}

// ---- 年月变化时重新加载 ----
document.getElementById('qcYear').addEventListener('change', initQuickCalc);
document.getElementById('qcMonth').addEventListener('change', initQuickCalc);
