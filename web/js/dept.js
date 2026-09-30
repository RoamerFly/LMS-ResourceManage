// 部门管理：从人员页打开，在树状图节点中直接维护大部门和小部门。
async function showDepartmentManager() {
  openModal(`<div class="department-modal-header"><div><h2>部门管理</h2><p>按大部门和小部门组织人员</p></div><button class="btn btn-secondary" onclick="closeModal()">关闭</button></div><div class="department-tree-scroll" id="departmentTreeContent"><div class="empty-state">加载中…</div></div>`, 'department-modal');
  await loadDepartments();
}

function departmentForm(deptId = null) {
  const suffix = deptId === null ? 'root' : deptId;
  return `<form class="department-create-form" id="dept-form-${suffix}" hidden onsubmit="saveDepartmentNode(event,${deptId})">
    <label for="dept-name-${suffix}">${deptId === null ? '大部门名称' : '小部门名称'}</label>
    <input id="dept-name-${suffix}" name="name" required maxlength="100" placeholder="输入部门名称" autocomplete="off">
    <div class="flex gap-6"><button class="btn btn-primary btn-sm" type="submit">添加</button><button class="btn btn-secondary btn-sm" type="button" onclick="toggleDepartmentForm('${suffix}',false)">取消</button></div>
  </form>`;
}

async function loadDepartments() {
  const [depts, subs, employees] = await Promise.all([get('/api/departments'), get('/api/sub-departments'), get('/api/employees')]);
  _state.departments = depts; _state.subDepartments = subs;
  const tree = document.getElementById('departmentTreeContent');
  if (!tree) return;
  const count = (deptId, subId = null) => employees.filter(emp => emp.dept_id === deptId && (subId === null || emp.sub_dept_id === subId)).length;
  tree.innerHTML = `<div class="organization-chart">
    <div class="organization-root"><strong>人员部门结构</strong><button class="btn btn-primary btn-sm" onclick="toggleDepartmentForm('root',true)">＋ 添加大部门</button>${departmentForm()}</div>
    <ul class="organization-branches" aria-label="大部门">${depts.map(dept => {
      const children = subs.filter(sub => sub.dept_id === dept.id);
      return `<li class="organization-branch"><div class="department-node department-parent" data-dept-id="${dept.id}">
        <div class="department-node-heading"><strong>${escHtml(dept.name)}</strong><span>${count(dept.id)} 人</span></div>
        <div class="department-node-actions"><button class="btn btn-secondary btn-sm" onclick="toggleDepartmentForm('${dept.id}',true)">＋ 小部门</button><button class="btn btn-danger btn-sm" onclick="delDept(${dept.id})">删除</button></div>${departmentForm(dept.id)}
      </div><ul class="organization-children" aria-label="${escHtml(dept.name)}的小部门">${children.length ? children.map(sub => `<li><div class="department-node department-child" data-sub-dept-id="${sub.id}"><div><strong>${escHtml(sub.name)}</strong><span>${count(dept.id,sub.id)} 人</span></div><button class="btn btn-danger btn-sm" onclick="delSubDept(${sub.id})" aria-label="删除${escHtml(sub.name)}">删除</button></div></li>`).join('') : '<li><div class="department-empty">暂无小部门</div></li>'}</ul></li>`;
    }).join('')}</ul>${depts.length ? '' : '<div class="empty-state">点击上方按钮添加第一个大部门</div>'}
  </div>`;
}

function toggleDepartmentForm(suffix, show) {
  const form = document.getElementById(`dept-form-${suffix}`);
  if (!form) return;
  form.hidden = !show;
  if (show) form.elements.name.focus();
  else form.reset();
}

async function saveDepartmentNode(event, deptId) {
  event.preventDefault();
  const form = event.currentTarget;
  const name = form.elements.name.value.trim();
  if (!name) return toast('请输入部门名称', 'error');
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const result = await post(deptId === null ? '/api/departments' : '/api/sub-departments', deptId === null ? {name} : {dept_id: deptId, name});
    if (!result.ok) return toast(result.error || '添加失败', 'error');
    await loadDepartments();
    await loadMembers({animate:false});
    toast('添加成功', 'success');
  } finally { button.disabled = false; }
}

async function delDept(deptId) {
  if (!confirm('删除大部门会同时删除其下所有小部门，确认？')) return;
  const result = await del(`/api/departments/${deptId}`);
  if (result?.error) return toast(result.error, 'error');
  await loadDepartments();
  await loadMembers({animate:false});
  toast('已删除', 'info');
}

async function delSubDept(subDeptId) {
  if (!confirm('确认删除该小部门？')) return;
  const result = await del(`/api/sub-departments/${subDeptId}`);
  if (result?.error) return toast(result.error, 'error');
  await loadDepartments();
  await loadMembers({animate:false});
  toast('已删除', 'info');
}
