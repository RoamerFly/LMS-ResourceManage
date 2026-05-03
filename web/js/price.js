// ============================================================
// 型号单价表
// ============================================================
async function loadPriceTable() {
  const data = await get('/api/price-table');
  _state.priceData = data;
  const { models, sub_departments, prices } = data;
  if (!models?.length || !sub_departments?.length) {
    document.getElementById('priceTable').innerHTML = '<div class="empty-state">请先添加部门，然后添加型号</div>';
    document.getElementById('modelSelectAll').checked = false;
    updateBatchDelModelBtn();
    return;
  }
  const thead = `<thead><tr><th style="min-width:40px;"><input type="checkbox" id="modelTableSelectAll" onchange="toggleSelectAllModels()"></th><th style="min-width:90px;">型号</th>${sub_departments.map(s => `<th style="min-width:80px;"><span class="dept-large">${escHtml(s.dept_name)}</span><br><span class="dept-sub">${escHtml(s.name)}</span></th>`).join('')}<th style="min-width:50px;">操作</th></tr></thead>`;
  const tbody = models.map(m => {
    const cells = sub_departments.map(s => {
      const price = prices[`${m.id},${s.id}`] || 0;
      return `<td><input type="number" step="0.01" min="0" class="table-input" value="${price}" onchange="updatePrice(${m.id},${s.id},this.value)"></td>`;
    }).join('');
    return `<tr><td><input type="checkbox" class="model-check" value="${m.id}" onchange="updateBatchDelModelBtn()"></td><td style="font-weight:600;color:var(--primary-dark);">${escHtml(m.model_no)}</td>${cells}<td><button class="btn btn-sm btn-danger" onclick="delModel(${m.id})">删除</button></td></tr>`;
  }).join('');
  const zebraCls = (typeof _currentSettings !== 'undefined' && _currentSettings['table-zebra']) ? ' table-zebra' : '';
  document.getElementById('priceTable').innerHTML = `<div class="table-wrap"><table class="${zebraCls.trim()}">${thead}<tbody>${tbody}</tbody></table></div>`;
  // 同步全选状态
  const headerCb = document.getElementById('modelSelectAll');
  const tableCb = document.getElementById('modelTableSelectAll');
  if (headerCb && tableCb) {
    tableCb.checked = headerCb.checked;
  }
  updateBatchDelModelBtn();
}

// 全选/取消全选型号
function toggleSelectAllModels() {
  const headerCb = document.getElementById('modelSelectAll');
  const tableCb = document.getElementById('modelTableSelectAll');
  const checked = headerCb ? headerCb.checked : (tableCb ? tableCb.checked : false);
  // 同步两个全选框
  if (headerCb) headerCb.checked = checked;
  if (tableCb) tableCb.checked = checked;
  document.querySelectorAll('.model-check').forEach(cb => cb.checked = checked);
  updateBatchDelModelBtn();
}

// 更新批量删除型号按钮状态
function updateBatchDelModelBtn() {
  const checked = document.querySelectorAll('.model-check:checked');
  const btn = document.getElementById('batchDelModelBtn');
  if (btn) {
    btn.style.display = checked.length > 0 ? 'inline-flex' : 'none';
    if (checked.length > 0) {
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg> 批量删除 (${checked.length})`;
    }
  }
}

// 批量删除型号
async function batchDeleteModels() {
  const checked = document.querySelectorAll('.model-check:checked');
  if (!checked.length) return;
  const ids = Array.from(checked).map(cb => parseInt(cb.value));
  const models = _state.priceData?.models || [];
  const names = ids.map(id => models.find(m => m.id === id)?.model_no).filter(Boolean);
  if (!confirm(`确定要删除以下型号吗？\n${names.join('、')}\n\n此操作不可恢复！`)) return;
  let ok = 0, fail = 0;
  for (const id of ids) {
    const r = await del(`/api/models/${id}`);
    if (r && r.success !== false) ok++; else fail++;
  }
  showToast(`成功删除 ${ok} 个${fail ? `，失败 ${fail} 个` : ''}`, ok > 0 ? 'success' : 'error');
  if (ok > 0) {
    document.getElementById('modelSelectAll').checked = false;
    await loadPriceTable();
  }
}

async function updatePrice(modelId, subDeptId, val) {
  await put('/api/price-table', { model_id: modelId, sub_dept_id: subDeptId, unit_price: parseFloat(val) || 0 });
  toast('已保存', 'success');
}

async function showAddModelModal() {
  openModal(`<div class="modal-title">添加型号</div>
    <div class="form-group mb-10"><label>型号编号</label><input id="new-model-no" type="text" placeholder="例如：LJ-2024-01"></div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="doAddModel()">保存</button></div>`);
}

async function doAddModel() {
  const model_no = document.getElementById('new-model-no').value.trim();
  if (!model_no) return toast('请输入型号', 'error');
  const r = await post('/api/models', { model_no });
  if (r.ok) { closeModal(); toast('添加成功', 'success'); loadPriceTable(); }
  else toast(r.error || '添加失败', 'error');
}

async function delModel(modelId) {
  if (!confirm('确认删除该型号？')) return;
  await del(`/api/models/${modelId}`); toast('已删除', 'info'); loadPriceTable();
}
