// ============================================================
// 总工资表
// ============================================================
let salaryDraggingEmpId = 0;
let salaryDraggingDeptId = 0;

function getSalarySource() {
  return localStorage.getItem('useQcSalary') === 'true' ? 'qc' : 'work';
}

function getSalarySourceLabel(source) {
  return source === 'qc' ? '快捷计算数据' : '做货编辑数据';
}

function orderSalaryEmployees(dept, memberOrder) {
  const employees = dept.employees || [];
  const ids = getMemberOrderSync('salary')
    ? (memberOrder || []).filter(emp => emp.dept_id === dept.dept_id).map(emp => emp.id)
    : getManualEmployeeOrder('salary', dept.dept_id);
  return ids.length ? sortItemsByIds(employees, ids, emp => emp.emp_id) : employees;
}

async function loadSalary(options = {}) {
  const { animate = true } = options;
  const year = parseInt(document.getElementById('salaryYear').value, 10);
  const month = parseInt(document.getElementById('salaryMonth').value, 10);
  const source = getSalarySource();
  const content = document.getElementById('salaryContent');
  const queryBtn = document.getElementById('salaryQueryBtn');
  const sourceLabel = source === 'qc' ? '（快捷计算）' : '';
  const finishButton = animate
    ? beginButtonLoading(queryBtn, '正在查询...')
    : () => {};
  const finishRefresh = animate
    ? beginContentRefresh(content, {
        loadingText: `正在刷新 ${year}-${pad(month)} 工资汇总...`,
        minHeight: 240,
      })
    : () => {};

  try {
    const data = await get(`/api/salary-summary?year=${year}&month=${month}&source=${source}`);
    await ensureMemberOrderPrefsLoaded('salary', (data || []).map(dept => dept.dept_id));
    ensureMemberOrderSyncSwitch('salary', queryBtn?.parentElement, () => loadSalary({ animate: false }));
    const syncedMemberOrder = getMemberOrderSync('salary') ? await get('/api/employees') : [];
    if (syncedMemberOrder && syncedMemberOrder.length) _state.employees = syncedMemberOrder;

    if (!data || !data.length) {
      content.innerHTML = '<div class="empty-state">暂无工资数据</div>';
      return;
    }

    const displayData = data.map(dept => ({
      ...dept,
      employees: orderSalaryEmployees(dept, syncedMemberOrder),
    }));

    const grandTotalWage = data.reduce((sum, dept) => sum + dept.total_wage, 0);
    const grandTotalPairs = data.reduce((sum, dept) => sum + dept.total_pairs, 0);
    const printedAt = new Date().toLocaleString('zh-CN', { hour12: false });

    let html = `<div class="salary-report">
      <div class="salary-print-header">
        <div>
          <div class="salary-print-title">${year} 年 ${pad(month)} 月总工资汇总表</div>
          <div class="salary-print-meta">数据源：${getSalarySourceLabel(source)}</div>
        </div>
        <div class="salary-print-meta">生成时间：${printedAt}</div>
      </div>
      <div class="grand-total">
        <span>全厂合计${sourceLabel ? ` <span class="qc-badge">${sourceLabel}</span>` : ''}</span>
        <span>对数：<strong>${fmt(grandTotalPairs)}</strong> &nbsp;|&nbsp; 总工资：<strong>¥${fmt(grandTotalWage)}</strong></span>
      </div>`;

    displayData.forEach(dept => {
      html += `<div class="dept-block salary-dept-block" data-dept-id="${dept.dept_id}">
        <div class="dept-block-header">
          <span><span class="dept-large">${escHtml(dept.dept_name)}</span></span>
          <span class="dept-totals">对数合计：${fmt(dept.total_pairs)} &nbsp;|&nbsp; 部门工资合计：¥${fmt(dept.total_wage)}</span>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>姓名</th><th>小部门</th><th class="text-right">做货对数</th><th class="text-right">做货工资</th><th class="text-right">人工增扣</th><th class="text-right">总工资</th></tr></thead>
          <tbody>${dept.employees.map(emp => `<tr data-emp-id="${emp.emp_id}" data-dept-id="${dept.dept_id}"
            ondragover="onSalaryRowDragOver(event)" ondragleave="onSalaryRowDragLeave(event)" ondrop="onSalaryRowDrop(event)">
            <td><span class="salary-drag-handle" draggable="true" data-emp-id="${emp.emp_id}" data-dept-id="${dept.dept_id}"
              ondragstart="onSalaryRowDragStart(event)" ondragend="onSalaryRowDragEnd(event)" title="按住拖拽调整同部门内顺序">⋮</span><span class="member-name-color" onclick="navigateToMemberDetail(${emp.emp_id})" title="点击查看详情">${escHtml(emp.name)}</span></td>
            <td><span class="dept-sub">${escHtml(emp.sub_dept_name)}</span></td>
            <td class="text-right table-num">${fmt(emp.pairs)}</td>
            <td class="text-right table-num">¥${fmt(emp.wage)}</td>
            <td class="text-right table-num text-danger">¥${fmt(emp.adj_amount)}</td>
            <td class="text-right table-num" style="font-weight:700;color:var(--success);">¥${fmt(emp.total)}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>`;
    });

    html += '</div>';
    content.innerHTML = html;
  } finally {
    finishRefresh();
    finishButton();
  }
}

function onSalaryRowDragStart(event) {
  const handle = event.currentTarget;
  const row = handle.closest('tr');
  salaryDraggingEmpId = parseInt(handle.dataset.empId, 10);
  salaryDraggingDeptId = parseInt(handle.dataset.deptId, 10);
  if (getMemberOrderSync('salary')) {
    setMemberOrderSync('salary', false);
    const syncInput = document.querySelector('#memberOrderSync_salary input');
    if (syncInput) syncInput.checked = false;
  }
  if (row) row.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', String(salaryDraggingEmpId));
}

function onSalaryRowDragOver(event) {
  event.preventDefault();
  const row = event.currentTarget;
  if (parseInt(row.dataset.empId, 10) !== salaryDraggingEmpId) {
    markDragOverPosition(row);
  }
}

function onSalaryRowDragLeave(event) {
  clearDragOverPosition(event.currentTarget);
}

async function onSalaryRowDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  const row = event.currentTarget;
  const targetDeptId = parseInt(row.dataset.deptId, 10);
  const targetEmpId = parseInt(row.dataset.empId, 10);
  if (!salaryDraggingEmpId) return;
  if (targetDeptId !== salaryDraggingDeptId) {
    showToast('只能在同一部门内调整顺序', 'info');
    return;
  }

  const rows = Array.from(row.closest('tbody').querySelectorAll('tr[data-emp-id]'));
  const currentIds = rows.map(tr => parseInt(tr.dataset.empId, 10));
  setManualEmployeeOrder(
    'salary',
    targetDeptId,
    swapIds(currentIds, salaryDraggingEmpId, targetEmpId)
  );
  await loadSalary({ animate: false });
  markSwapSuccess('.salary-dept-block tr', [salaryDraggingEmpId, targetEmpId]);
}

function onSalaryRowDragEnd(event) {
  const row = event.currentTarget.closest('tr');
  if (row) row.classList.remove('dragging');
  document.querySelectorAll('.salary-dept-block tr.drag-over').forEach(tr => clearDragOverPosition(tr));
  salaryDraggingEmpId = 0;
  salaryDraggingDeptId = 0;
}

function printSalary(mode = 'color') {
  const content = document.getElementById('salaryContent');
  if (!content || !content.textContent.trim()) {
    showToast('请先查询工资数据再打印', 'info');
    return;
  }

  document.body.classList.add('salary-print-mode');
  document.body.classList.toggle('print-mono', mode === 'mono');

  const sidebar = document.querySelector('.sidebar');
  const topbar = document.querySelector('.topbar');
  const viewSalary = document.getElementById('view-salary');
  const cardTitle = viewSalary ? viewSalary.querySelector('.card-title') : null;
  const backBtn = viewSalary ? viewSalary.querySelector('.btn-back-home') : null;

  const hiddenEls = [sidebar, topbar, cardTitle, backBtn].filter(Boolean);
  hiddenEls.forEach(el => { el.style.display = 'none'; });

  const viewParent = viewSalary ? viewSalary.parentElement : null;
  const savedSiblings = [];
  if (viewParent) {
    Array.from(viewParent.children).forEach(child => {
      if (child !== viewSalary && child.style.display !== 'none') {
        savedSiblings.push({ el: child, prev: child.style.display });
        child.style.display = 'none';
      }
    });
  }

  const mainEl = document.querySelector('.main');
  const contentEl = document.querySelector('.content');
  const cardEl = viewSalary ? viewSalary.querySelector('.card') : null;
  const printEls = [mainEl, contentEl, viewSalary, cardEl, content].filter(Boolean);
  const savedStyles = printEls.map(el => ({
    el,
    display: el.style.display,
    overflow: el.style.overflow,
    position: el.style.position,
    flex: el.style.flex,
  }));
  printEls.forEach(el => {
    el.style.display = 'block';
    el.style.overflow = 'visible';
    el.style.position = 'static';
    el.style.flex = 'none';
  });

  const cleanup = () => {
    document.body.classList.remove('salary-print-mode');
    document.body.classList.remove('print-mono');
    hiddenEls.forEach(el => { el.style.display = ''; });
    savedSiblings.forEach(({ el, prev }) => { el.style.display = prev; });
    savedStyles.forEach(({ el, display, overflow, position, flex }) => {
      el.style.display = display;
      el.style.overflow = overflow;
      el.style.position = position;
      el.style.flex = flex;
    });
    window.removeEventListener('afterprint', cleanup);
  };

  window.addEventListener('afterprint', cleanup);
  window.print();
}

document.getElementById('salaryYear').addEventListener('change', loadSalary);
document.getElementById('salaryMonth').addEventListener('change', loadSalary);
