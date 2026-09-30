// ============================================================
// 订单管理
// ============================================================
async function switchOrderPanel(panel) {
  const prices = panel === 'prices';
  document.getElementById('orderRecordsPanel').hidden = prices;
  document.getElementById('orderPricesPanel').hidden = !prices;
  for (const [id, active] of [['orderRecordsTab', !prices], ['orderPricesTab', prices]]) {
    const tab = document.getElementById(id);
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  }
  if (prices) await loadPriceTable();
  else await loadOrders({ animate: false });
}

async function loadOrders(options = {}) {
  const { animate = true } = options;
  const year = parseInt(document.getElementById('orderYear').value);
  const month = parseInt(document.getElementById('orderMonth').value);
  const container = document.getElementById('orderList');
  const finishRefresh = animate
    ? beginContentRefresh(container, {
        loadingText: `正在刷新 ${year}年${pad(month)}月 订单...`,
        minHeight: 180,
      })
    : () => {};

  try {
    const orders = await get(`/api/orders?year=${year}&month=${month}`);
    _state.orders = orders || [];
    if (!orders || !orders.length) {
      container.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><div>暂无订单，点击右上角"添加订单"</div></div>';
      document.getElementById('orderSelectAll').checked = false;
      updateBatchDelOrderBtn();
      return;
    }
    container.innerHTML = orders.map(o => `
      <div class="order-card">
        <div class="order-card-header">
          <div style="display:flex;align-items:center;gap:10px;">
            <input type="checkbox" class="order-check" value="${o.id}" onchange="updateBatchDelOrderBtn()">
            <span class="order-no">${escHtml(o.order_no)}</span>
          </div>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-sm btn-secondary" onclick="showEditOrderModal(${o.id})">编辑</button>
            <button class="btn btn-sm btn-danger" onclick="delOrder(${o.id})">删除</button>
          </div>
        </div>
        <div class="order-meta">
          <span>📅 ${o.year}年${pad(o.month)}月</span>
          <span>📦 总对数：<strong>${o.total_pairs || 0}</strong></span>
          ${o.remark ? `<span>📝 ${escHtml(o.remark)}</span>` : ''}
        </div>
        <div class="order-models">
          ${(o.models||[]).map(m => `<span class="model-tag">${escHtml(m.model_no)}</span>`).join('')}
        </div>
      </div>`).join('');
    document.getElementById('orderSelectAll').checked = false;
    updateBatchDelOrderBtn();
  } finally {
    finishRefresh();
  }
}

// 全选/取消全选订单
function toggleSelectAllOrders() {
  const checked = document.getElementById('orderSelectAll').checked;
  document.querySelectorAll('.order-check').forEach(cb => cb.checked = checked);
  updateBatchDelOrderBtn();
}

// 更新批量删除订单按钮状态
function updateBatchDelOrderBtn() {
  const checked = document.querySelectorAll('.order-check:checked');
  const btn = document.getElementById('batchDelOrderBtn');
  if (btn) {
    btn.style.display = checked.length > 0 ? 'inline-flex' : 'none';
    if (checked.length > 0) {
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg> 批量删除 (${checked.length})`;
    }
  }
}

// 批量删除订单
async function batchDeleteOrders() {
  const checked = document.querySelectorAll('.order-check:checked');
  if (!checked.length) return;
  const ids = Array.from(checked).map(cb => parseInt(cb.value));
  const names = ids.map(id => _state.orders.find(o => o.id === id)?.order_no).filter(Boolean);
  if (!confirm(`确定要删除以下订单吗？\n${names.join('、')}\n\n此操作不可恢复！`)) return;
  let ok = 0, fail = 0;
  for (const id of ids) {
    const r = await del(`/api/orders/${id}`);
    if (r && r.success !== false) ok++; else fail++;
  }
  showToast(`成功删除 ${ok} 个${fail ? `，失败 ${fail} 个` : ''}`, ok > 0 ? 'success' : 'error');
  if (ok > 0) {
    document.getElementById('orderSelectAll').checked = false;
    await loadOrders();
  }
}

async function showAddOrderModal() {
  const models = await get('/api/models');
  const year = parseInt(document.getElementById('orderYear').value);
  const month = parseInt(document.getElementById('orderMonth').value);
  openModal(`
    <div class="modal-title">添加订单</div>
    <div class="form-row">
      <div class="form-group"><label>订单号</label><input id="o-no" type="text" placeholder="例如：ORD-001"></div>
      <div class="form-group"><label>备注</label><input id="o-remark" type="text" placeholder="可选备注"></div>
    </div>
    <div class="form-group mb-10"><label>关联型号（可多选）</label>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">
        ${models.map(m => `<label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:var(--font-size-12);background:#f8fafc;border:1px solid var(--border);border-radius:5px;padding:4px 8px;">
          <input type="checkbox" value="${m.id}" class="om-check"> ${escHtml(m.model_no)}
        </label>`).join('')}
      </div>
    </div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="doAddOrder(${year},${month})">保存</button></div>`);
}

async function doAddOrder(year, month) {
  const order_no = document.getElementById('o-no').value.trim();
  const remark = document.getElementById('o-remark').value.trim();
  const model_ids = Array.from(document.querySelectorAll('.om-check:checked')).map(el => parseInt(el.value));
  if (!order_no) return toast('请输入订单号', 'error');
  const r = await post('/api/orders', { order_no, year, month, model_ids, remark });
  if (r.ok) { closeModal(); toast('添加成功', 'success'); loadOrders(); }
  else toast(r.error || '添加失败', 'error');
}

async function showEditOrderModal(orderId) {
  const year = parseInt(document.getElementById('orderYear').value);
  const month = parseInt(document.getElementById('orderMonth').value);
  const orders = await get(`/api/orders?year=${year}&month=${month}`);
  const o = orders.find(x => x.id === orderId);
  const allModels = await get('/api/models');
  if (!o) return;
  openModal(`
    <div class="modal-title">编辑订单 — ${escHtml(o.order_no)}</div>
    <div class="form-row">
      <div class="form-group"><label>订单号</label><input id="o-no" type="text" value="${escHtml(o.order_no)}"></div>
      <div class="form-group"><label>备注</label><input id="o-remark" type="text" value="${escHtml(o.remark||'')}"></div>
    </div>
    <div class="form-group mb-10"><label>关联型号</label>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">
        ${allModels.map(m => `<label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:var(--font-size-12);background:#f8fafc;border:1px solid var(--border);border-radius:5px;padding:4px 8px;">
          <input type="checkbox" value="${m.id}" class="om-check"${(o.models||[]).some(om=>om.id===m.id)?' checked':''}> ${escHtml(m.model_no)}
        </label>`).join('')}
      </div>
    </div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="doEditOrder(${orderId})">保存</button></div>`);
}

async function doEditOrder(orderId) {
  const order_no = document.getElementById('o-no').value.trim();
  const remark = document.getElementById('o-remark').value.trim();
  const model_ids = Array.from(document.querySelectorAll('.om-check:checked')).map(el => parseInt(el.value));
  if (!order_no) return toast('请输入订单号', 'error');
  const r = await put(`/api/orders/${orderId}`, { order_no, model_ids, remark });
  if (r.ok) { closeModal(); toast('保存成功', 'success'); loadOrders(); }
  else toast('保存失败', 'error');
}

async function delOrder(orderId) {
  if (!confirm('确认删除该订单？')) return;
  await del(`/api/orders/${orderId}`); toast('已删除', 'info'); loadOrders();
}

document.getElementById('orderYear').addEventListener('change', loadOrders);
document.getElementById('orderMonth').addEventListener('change', loadOrders);
