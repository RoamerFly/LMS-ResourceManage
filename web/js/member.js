// ============================================================
// 人员管理
// ============================================================
let memberDraggingId = 0;
let memberDraggingDeptId = 0;
let memberSuppressClickUntil = 0;
let memberEditorLoading = false;
let memberSheetContext = null;
let memberLoadVersion = 0;

async function loadMembers(options = {}) {
  const { animate = true } = options;
  const loadVersion = ++memberLoadVersion;
  const year = Number(document.getElementById('memberYear').value);
  const month = Number(document.getElementById('memberMonth').value);
  const source = getSalarySource();
  const container = document.getElementById('memberList');
  const previousScroll = container.scrollTop;
  ensureMemberNameSortButton();
  const finishRefresh = animate
    ? beginContentRefresh(container, {
        loadingText: '正在刷新成员列表...',
        minHeight: 180,
      })
    : () => {};
  try {
    const [emps, summary] = await Promise.all([
      get('/api/employees'),
      get(`/api/salary-summary?year=${year}&month=${month}&source=${source}`),
    ]);
    if (loadVersion !== memberLoadVersion) return;
    if (!Array.isArray(emps) || !Array.isArray(summary)) throw new Error('人员或月度数据加载失败');
    _state.employees = emps;
    document.getElementById('personnelPeriod').textContent = `${year} 年 ${pad(month)} 月 · ${getSalarySourceLabel(source)}`;
    if (!emps || !emps.length) {
      container.innerHTML = '<div class="empty-state">暂无成员，请先添加</div>';
      return;
    }

    const monthlyData = new Map(summary.flatMap(dept => dept.employees).map(emp => [emp.emp_id, emp]));
    container.innerHTML = buildMemberDepartmentBlocks(emps, monthlyData);
    container.scrollTop = previousScroll;
  } catch (error) {
    if (loadVersion === memberLoadVersion) {
      container.innerHTML = '<div class="empty-state">人员或月度数据加载失败，请重新进入人员管理页</div>';
      document.getElementById('personnelPeriod').textContent = '';
    }
  } finally {
    finishRefresh();
  }
}

function ensureMemberNameSortButton() {
  if (document.getElementById('memberNameSortWrap')) return;
  const batchAddBtn = document.querySelector('#view-members button[onclick="showBatchAddMemberModal()"]');
  if (!batchAddBtn || !batchAddBtn.parentElement) return;

  const wrap = document.createElement('div');
  wrap.className = 'sort-menu-wrap';
  wrap.id = 'memberNameSortWrap';
  wrap.innerHTML = `
    <button class="btn btn-sm btn-secondary" type="button" onclick="toggleMemberNameSortMenu(event)">按名称排序</button>
    <div class="sort-menu" id="memberNameSortMenu">
      <button type="button" onclick="sortMembersByName('asc')">升序</button>
      <button type="button" onclick="sortMembersByName('desc')">降序</button>
    </div>
  `;
  batchAddBtn.parentElement.insertBefore(wrap, batchAddBtn.nextSibling);
}

function toggleMemberNameSortMenu(event) {
  event.stopPropagation();
  const menu = document.getElementById('memberNameSortMenu');
  if (!menu) return;
  menu.classList.toggle('show');
}

document.addEventListener('click', event => {
  const menu = document.getElementById('memberNameSortMenu');
  if (!menu || event.target.closest('#memberNameSortWrap')) return;
  menu.classList.remove('show');
});

function compareMemberNamesByUnicode(aName, bName) {
  const aChars = Array.from(String(aName || ''));
  const bChars = Array.from(String(bName || ''));
  const minLength = Math.min(aChars.length, bChars.length);

  for (let i = 0; i < minLength; i += 1) {
    const diff = aChars[i].codePointAt(0) - bChars[i].codePointAt(0);
    if (diff !== 0) return diff;
  }

  return aChars.length - bChars.length;
}

function memberDepartmentTone(deptId) {
  // 由部门 ID 决定色相，换月、排序和重启后保持同部门的颜色一致。
  return ((Number(deptId) || 0) * 137.508 % 360).toFixed(1);
}

function buildMemberDepartmentBlocks(emps, monthlyData = new Map()) {
  const groups = [];
  const groupMap = new Map();
  emps.forEach(emp => {
    if (!groupMap.has(emp.dept_id)) {
      const group = {
        dept_id: emp.dept_id,
        dept_name: emp.dept_name,
        employees: [],
      };
      groups.push(group);
      groupMap.set(emp.dept_id, group);
    }
    groupMap.get(emp.dept_id).employees.push(emp);
  });

  return groups.map(group => `
    <div class="dept-block member-dept-block" data-dept-id="${group.dept_id}" style="--member-dept-hue:${memberDepartmentTone(group.dept_id)}">
      <div class="dept-block-header member-dept-header">
        <span><span class="dept-large">${escHtml(group.dept_name)}</span></span>
        <span class="dept-totals">${group.employees.length} 人</span>
      </div>
      <div class="member-dept-body"
        data-dept-id="${group.dept_id}"
        ondragover="onMemberGroupDragOver(event)"
        ondrop="onMemberGroupDrop(event)">
        ${group.employees.map(emp => buildMemberCard(emp, monthlyData.get(emp.id))).join('')}
      </div>
    </div>
  `).join('');
}

async function sortMembersByName(direction) {
  const menu = document.getElementById('memberNameSortMenu');
  if (menu) menu.classList.remove('show');
  const factor = direction === 'desc' ? -1 : 1;
  const groups = new Map();
  for (const emp of _state.employees || []) {
    if (!groups.has(emp.dept_id)) groups.set(emp.dept_id, []);
    groups.get(emp.dept_id).push(emp);
  }

  let ok = 0;
  let fail = 0;
  for (const [deptId, emps] of groups.entries()) {
    const ids = [...emps]
      .sort((a, b) => {
        const diff = compareMemberNamesByUnicode(a.name, b.name);
        if (diff !== 0) return diff * factor;
        return Number(a.id || 0) - Number(b.id || 0);
      })
      .map(emp => emp.id);
    const result = await put('/api/employees/order', { dept_id: deptId, emp_ids: ids });
    if (result && result.ok !== false) ok += 1;
    else fail += 1;
  }

  showToast(
    fail ? `名称排序完成，${fail} 个部门保存失败` : `已按名称${direction === 'desc' ? '降序' : '升序'}排序`,
    fail ? 'info' : 'success'
  );
  await loadMembers({ animate: false });
}

function buildMemberCard(emp, monthly = {}) {
  return `
    <div class="member-card" data-emp-id="${emp.id}" data-dept-id="${emp.dept_id}"
      data-gender="${emp.gender === '女' ? 'female' : 'male'}" style="--member-dept-hue:${memberDepartmentTone(emp.dept_id)}"
      role="button" tabindex="0" aria-label="编辑${escHtml(emp.name)}"
      onclick="safeShowEditMemberModal(${emp.id}, event)"
      onkeydown="onMemberCardKeyDown(${emp.id}, event)"
      draggable="true" ondragstart="onMemberDragStart(event)"
      ondragover="onMemberDragOver(event)"
      ondragleave="onMemberDragLeave(event)"
      ondrop="onMemberDrop(event)"
      ondragend="onMemberDragEnd(event)">
      <div class="member-card-info">
        <div class="member-card-title"><span class="member-name member-list-name-color">${escHtml(emp.name)}</span>
        <span class="member-gender-badge" title="${escHtml(emp.gender)}">${emp.gender === '女' ? '♀' : '♂'}</span></div>
        <span class="dept-sub">${escHtml(emp.sub_dept_name)}</span>
      </div>
      <div class="member-monthly-stats">
        <div><span>做货对数</span><strong class="member-pairs">${Number(monthly.pairs) || 0}<small> 对</small></strong></div>
        <div><span>工资</span><strong class="member-wage" title="含增扣，与总工资表一致">¥${fmt(monthly.total)}</strong></div>
      </div>
    </div>
  `;
}

function safeShowEditMemberModal(empId, event) {
  if (Date.now() < memberSuppressClickUntil) {
    if (event) event.preventDefault();
    return;
  }
  showEditMemberModal(empId);
}

function onMemberCardKeyDown(empId, event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  safeShowEditMemberModal(empId, event);
}

function onMemberDragStart(event) {
  const card = event.currentTarget.closest('.member-card');
  if (!card) return;
  event.stopPropagation();
  memberDraggingId = parseInt(card.dataset.empId, 10);
  memberDraggingDeptId = parseInt(card.dataset.deptId, 10);
  memberSuppressClickUntil = Date.now() + 300;
  card.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', String(memberDraggingId));
}

function onMemberDragOver(event) {
  event.preventDefault();
  const card = event.currentTarget;
  if (parseInt(card.dataset.empId, 10) !== memberDraggingId) {
    markDragOverPosition(card);
  }
}

function onMemberDragLeave(event) {
  clearDragOverPosition(event.currentTarget);
}

function onMemberDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  const card = event.currentTarget;
  applyMemberDrop(
    parseInt(card.dataset.deptId, 10),
    parseInt(card.dataset.empId, 10)
  );
}

function onMemberGroupDragOver(event) {
  event.preventDefault();
}

function onMemberGroupDrop(event) {
  if (event.target.closest && event.target.closest('.member-card')) return;
  event.preventDefault();
  applyMemberDrop(parseInt(event.currentTarget.dataset.deptId, 10), 0);
}

function onMemberDragEnd(event) {
  memberSuppressClickUntil = Date.now() + 300;
  const card = event.currentTarget.closest('.member-card') || event.currentTarget;
  card.classList.remove('dragging');
  clearMemberDragState();
  memberDraggingId = 0;
  memberDraggingDeptId = 0;
}

function clearMemberDragState() {
  document.querySelectorAll('.member-card.drag-over').forEach(card => {
    clearDragOverPosition(card);
  });
}

async function applyMemberDrop(targetDeptId, targetEmpId) {
  const empId = memberDraggingId;
  if (!empId) return;
  if (targetDeptId !== memberDraggingDeptId) {
    showToast('成员只能在同一部门内调整顺序', 'info');
    return;
  }

  memberSuppressClickUntil = Date.now() + 300;
  if (targetEmpId === empId) return;

  const currentIds = _state.employees
    .filter(emp => emp.dept_id === targetDeptId)
    .map(emp => emp.id);
  const nextIds = targetEmpId
    ? swapIds(currentIds, empId, targetEmpId)
    : currentIds.filter(id => id !== empId).concat(empId);
  const result = await put('/api/employees/order', {
    dept_id: targetDeptId,
    emp_ids: nextIds,
  });

  if (result && result.ok !== false) {
    showToast('成员顺序已保存', 'success');
    await loadMembers({ animate: false });
    if (targetEmpId) markSwapSuccess('.member-card', [empId, targetEmpId]);
  } else {
    showToast(result?.error || '保存成员顺序失败', 'error');
    await loadMembers({ animate: false });
  }
}

async function showBatchAddMemberModal() {
  const depts = await get('/api/departments');
  const subs = await get('/api/sub-departments');
  _state.batchDepts = depts;
  _state.batchSubs = subs;

  function makeRowHtml(idx) {
    const genderOptions = '<option value="男">男</option><option value="女">女</option>';
    const deptOptions = '<option value="">--</option>' + depts.map(d => `<option value="${d.id}">${escHtml(d.name)}</option>`).join('');
    return `<tr data-idx="${idx}">
      <td class="row-num">${idx}</td>
      <td><input type="text" class="batch-name" placeholder="姓名" style="width:90px;"></td>
      <td><select class="batch-gender">${genderOptions}</select></td>
      <td><select class="batch-dept" onchange="onBatchDeptChange(this)">${deptOptions}</select></td>
      <td><select class="batch-subdept"><option value="">--先选大部门--</option></select></td>
      <td class="row-del"><button type="button" onclick="delBatchRow(this)">×</button></td>
    </tr>`;
  }

  openModal(`
    <div class="modal-title">批量添加人员</div>
    <div class="batch-add-toolbar">
      <button type="button" class="btn btn-sm" onclick="addBatchRow()">+ 添加行</button>
      <span style="font-size:var(--font-size-11);color:var(--text-muted);margin-left:8px;">直接填写姓名和部门，最后点击“批量添加”</span>
    </div>
    <div style="max-height:400px;overflow:auto;">
      <table class="batch-add-table">
        <thead><tr><th style="width:32px;">#</th><th>姓名</th><th style="width:50px;">性别</th><th>大部门</th><th>小部门</th><th style="width:36px;"></th></tr></thead>
        <tbody id="batchTableBody">${makeRowHtml(1)}</tbody>
      </table>
    </div>
    <div class="batch-add-add-row">
      <button type="button" class="btn btn-sm btn-secondary" onclick="addBatchRow()">+ 继续添加行</button>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="doBatchAddMember()">批量添加</button>
    </div>
  `, 'batch-add-modal');
}

function onBatchDeptChange(deptSel) {
  const tr = deptSel.closest('tr');
  const deptId = parseInt(deptSel.value, 10);
  const subSel = tr.querySelector('.batch-subdept');
  const subs = _state.batchSubs.filter(s => s.dept_id === deptId);
  subSel.innerHTML = '<option value="">--选择--</option>' + subs.map(s => `<option value="${s.id}">${escHtml(s.name)}</option>`).join('');
}

function addBatchRow() {
  const tbody = document.getElementById('batchTableBody');
  const rows = tbody.querySelectorAll('tr');
  const newIdx = rows.length + 1;
  const genderOptions = '<option value="男">男</option><option value="女">女</option>';
  const deptOptions = '<option value="">--</option>' + _state.batchDepts.map(d => `<option value="${d.id}">${escHtml(d.name)}</option>`).join('');
  tbody.insertAdjacentHTML('beforeend', `<tr data-idx="${newIdx}">
    <td class="row-num">${newIdx}</td>
    <td><input type="text" class="batch-name" placeholder="姓名" style="width:90px;"></td>
    <td><select class="batch-gender">${genderOptions}</select></td>
    <td><select class="batch-dept" onchange="onBatchDeptChange(this)">${deptOptions}</select></td>
    <td><select class="batch-subdept"><option value="">--先选大部门--</option></select></td>
    <td class="row-del"><button type="button" onclick="delBatchRow(this)">×</button></td>
  </tr>`);
}

function delBatchRow(btn) {
  const tbody = document.getElementById('batchTableBody');
  if (tbody.querySelectorAll('tr').length <= 1) return;
  btn.closest('tr').remove();
  tbody.querySelectorAll('tr').forEach((tr, i) => {
    tr.dataset.idx = i + 1;
    tr.querySelector('.row-num').textContent = i + 1;
  });
}

async function doBatchAddMember() {
  const rows = document.querySelectorAll('#batchTableBody tr');
  const employees = [];
  let hasValid = false;

  rows.forEach(tr => {
    const name = tr.querySelector('.batch-name').value.trim();
    const gender = tr.querySelector('.batch-gender').value;
    const deptId = parseInt(tr.querySelector('.batch-dept').value, 10);
    const subDeptId = parseInt(tr.querySelector('.batch-subdept').value, 10);
    if (name && deptId && subDeptId) {
      employees.push({ name, gender, dept_id: deptId, sub_dept_id: subDeptId });
      hasValid = true;
    }
  });

  if (!hasValid) {
    showToast('请至少填写一行完整的姓名和部门信息', 'error');
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const emp of employees) {
    const r = await post('/api/employees', emp);
    if (r && r.ok !== false) ok += 1;
    else fail += 1;
  }

  closeModal();
  showToast(`成功添加 ${ok} 人${fail ? `，失败 ${fail} 人` : ''}`, ok > 0 ? 'success' : 'error');
  if (ok > 0) await loadMembers();
}

function onDeptChange(prefix) {
  const deptId = parseInt(document.getElementById(prefix + '-dept').value, 10);
  const subs = _state.subDepartments.filter(s => s.dept_id === deptId);
  document.getElementById(prefix + '-subdept').innerHTML =
    '<option value="">-- 选择 --</option>' + subs.map(s => `<option value="${s.id}">${escHtml(s.name)}</option>`).join('');
}

async function prepareMemberSheetContext() {
  const type = _currentView === 'quickcalc' ? 'quick-calc' : _currentView === 'work' ? 'work-edit' : null;
  if (!type) return null;
  await window.LmsSpreadsheet?.flush(type);
  if (type === 'quick-calc') {
    clearTimeout(window._qcAutoSaveTimer);
    await autoSaveQc();
  } else {
    clearTimeout(window._weAutoSaveTimer);
    await autoSaveWorkRecords();
  }
  return { navigation: window.LmsSpreadsheet?.captureNavigation(type), view: _currentView,
    wage: type === 'quick-calc' ? _qcState.qcViewMode === 'wage' : _state.viewMode === 'wage' };
}

async function refreshMemberSheet(context) {
  if (context?.view !== getCurrentView()) return false;
  if (context.view === 'quickcalc') {
    await initQuickCalc();
    if (context.wage) await qcToggleViewMode();
  } else if (context.view === 'work') await loadWorkRecords();
  else return false;
  await window.LmsSpreadsheet?.restoreNavigation(context.navigation);
  return true;
}

async function showAddMemberModal(options = {}) {
  if (memberEditorLoading) return;
  memberEditorLoading = true;
  try {
    memberSheetContext = await prepareMemberSheetContext();
    const [depts, subs] = await Promise.all([get('/api/departments'), get('/api/sub-departments')]);
    _state.departments = depts;
    _state.subDepartments = subs;
    openModal(`
      <div class="modal-title">添加人员</div>
      <div class="form-row">
        <div class="form-group"><label>姓名</label><input id="m-name" type="text" placeholder="输入姓名"></div>
        <div class="form-group"><label>性别</label><select id="m-gender"><option value="男">男</option><option value="女">女</option></select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>大部门</label><select id="m-dept" onchange="onDeptChange('m')"><option value="">-- 选择 --</option>${depts.map(d => `<option value="${d.id}">${escHtml(d.name)}</option>`).join('')}</select></div>
        <div class="form-group"><label>小部门</label><select id="m-subdept"><option value="">-- 先选大部门 --</option></select></div>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="doAddMember()">保存</button></div>
    `);
    if (options.deptId && depts.some(dept => dept.id === options.deptId)) {
      document.getElementById('m-dept').value = String(options.deptId);
      onDeptChange('m');
      const departmentSubs = subs.filter(sub => sub.dept_id === options.deptId);
      if (departmentSubs.length === 1) document.getElementById('m-subdept').value = String(departmentSubs[0].id);
    }
    document.getElementById('m-name').focus();
  } finally { memberEditorLoading = false; }
}

async function doAddMember() {
  const name = document.getElementById('m-name').value.trim();
  const gender = document.getElementById('m-gender').value;
  const dept_id = parseInt(document.getElementById('m-dept').value, 10);
  const sub_dept_id = parseInt(document.getElementById('m-subdept').value, 10);
  if (!name) return toast('请输入姓名', 'error');
  if (!dept_id || !sub_dept_id) return toast('请选择部门', 'error');
  const r = await post('/api/employees', { name, gender, dept_id, sub_dept_id });
  if (r.ok) {
    closeModal();
    toast('添加成功', 'success');
    if (!await refreshMemberSheet(memberSheetContext)) await loadMembers();
  } else {
    toast(r.error || '添加失败', 'error');
  }
}

async function showEditMemberModal(empId) {
  if (memberEditorLoading) return;
  memberEditorLoading = true;
  try {
    // 提交数字并记住当前部门、选区和视口，保存人员后回到同一位置。
    memberSheetContext = await prepareMemberSheetContext();
    const [employees, depts, subs] = await Promise.all([get('/api/employees'), get('/api/departments'), get('/api/sub-departments')]);
    const emp = employees.find(e => e.id === empId);
    if (!emp) return toast('该人员已不存在，请刷新页面', 'error');
    _state.employees = employees;
    _state.departments = depts;
    _state.subDepartments = subs;
    openModal(`
      <div class="modal-title">编辑人员</div>
      <div class="form-row">
        <div class="form-group"><label>姓名</label><input id="m-name" type="text" value="${escHtml(emp.name)}"></div>
        <div class="form-group"><label>性别</label><select id="m-gender"><option value="男"${emp.gender === '男' ? ' selected' : ''}>男</option><option value="女"${emp.gender === '女' ? ' selected' : ''}>女</option></select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>大部门</label><select id="m-dept" onchange="onDeptChange('m')">${depts.map(d => `<option value="${d.id}"${d.id === emp.dept_id ? ' selected' : ''}>${escHtml(d.name)}</option>`).join('')}</select></div>
        <div class="form-group"><label>小部门</label><select id="m-subdept">${subs.filter(s => s.dept_id === emp.dept_id).map(s => `<option value="${s.id}"${s.id === emp.sub_dept_id ? ' selected' : ''}>${escHtml(s.name)}</option>`).join('')}</select></div>
      </div>
      <div class="member-editor-actions">
        <div>${_currentView === 'members' ? `<button class="btn btn-secondary" onclick="closeModal();navigateToMemberDetail(${empId})">做货明细</button><button class="btn btn-danger" onclick="delMember(${empId})">删除人员</button>` : ''}</div>
        <div><button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="doEditMember(${empId})">保存</button></div>
      </div>
    `);
    document.getElementById('m-name').focus();
  } finally { memberEditorLoading = false; }
}

async function doEditMember(empId) {
  const name = document.getElementById('m-name').value.trim();
  const gender = document.getElementById('m-gender').value;
  const dept_id = parseInt(document.getElementById('m-dept').value, 10);
  const sub_dept_id = parseInt(document.getElementById('m-subdept').value, 10);
  if (!name || !dept_id || !sub_dept_id) return toast('请填写完整', 'error');
  const r = await put(`/api/employees/${empId}`, { name, gender, dept_id, sub_dept_id });
  if (r.ok) {
    closeModal();
    toast('保存成功', 'success');
    const view = getCurrentView();
    if (await refreshMemberSheet(memberSheetContext)) return;
    if (view === 'work') await loadWorkRecords();
    else if (view === 'member-detail') await loadMemberDetail(empId);
    else if (view === 'salary') await loadSalary({ animate: false });
    else await loadMembers({ animate: false });
  } else {
    toast('保存失败', 'error');
  }
}

async function delMember(empId) {
  if (!confirm('确认删除该成员？')) return;
  const result = await del(`/api/employees/${empId}`);
  if (!result?.ok) return toast(result?.error || '删除失败', 'error');
  closeModal();
  toast('已删除', 'info');
  await loadMembers({ animate: false });
}

document.getElementById('memberYear').addEventListener('change', loadMembers);
document.getElementById('memberMonth').addEventListener('change', loadMembers);
