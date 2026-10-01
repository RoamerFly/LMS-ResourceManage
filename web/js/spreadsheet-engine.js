// 将现有工资表的数据视图映射为 Univer 工作簿。输入、选区和剪贴板由引擎处理。
(() => {
  const instances = new Map();
  const reusable = new Map();
  const pendingRestore = new Map();
  const layoutCache = new Map();
  let workbookSequence = 0;
  const inputSelector = 'input[data-emp], input.qc-price-input, input.qc-qty-input';
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const notify = message => showToast(message, 'error');

  function getLayoutKey(type, year, month, mode) {
    return `lms.sheet-layout.${type}.${year}.${month}.${mode}`;
  }

  async function loadLayout(type, year, month, mode) {
    const key = getLayoutKey(type, year, month, mode);
    if (layoutCache.has(key)) return;
    try {
      const result = await get(`/api/app-settings/${encodeURIComponent(key)}`);
      layoutCache.set(key, JSON.parse(result?.value || '{}'));
    } catch {
      try { layoutCache.set(key, JSON.parse(localStorage.getItem(key) || '{}')); } catch { layoutCache.set(key, {}); }
    }
  }

  function textValue(cell) {
    if (cell.closest('tr')?.dataset.qcUsed === 'false') return '';
    if (cell.dataset.sheetValue !== undefined) return Number(cell.dataset.sheetValue);
    const input = cell.querySelector(inputSelector);
    if (input) return input.classList.contains('qc-price-input') || input.classList.contains('qc-qty-input')
      ? (input.value === '' ? '' : Number(input.value)) : Number(input.value || 0);
    const display = cell.querySelector('.wage-cell-display, .qc-price-display');
    const member = cell.querySelector('.member-list-name-color');
    if (member) return member.textContent.trim();
    const text = (display?.title || cell.textContent).trim().replace(/[¥￥,]/g, '');
    return text !== '' && Number.isFinite(Number(text)) ? Number(text) : cell.textContent.trim().replace(/\s+/g, ' ');
  }

  function qcRowStyle(cell, used, style = cell.baseStyle) {
    const total = cell.td.classList.contains('row-total-display');
    return { ...style,
      bg: { rgb: !used ? '#ffffff' : total ? '#fef9c3' : cell.isPrice ? '#f0fdf4' : '#eff6ff' },
      cl: { rgb: !used ? '#64748b' : total ? '#92400e' : cell.baseStyle.cl.rgb },
      ...(total ? { bl: used ? 1 : 0 } : {}),
    };
  }

  function makeSheet(table, index, type) {
    const cellData = {};
    const cells = new Map();
    const rows = new Map();
    const mergeData = [];
    const columnData = {};
    const headerRows = table.tHead?.rows.length || 1;
    const name = type === 'work-edit' ? '做货记录' : table.closest('.qc-dept-section')?.querySelector('.qc-dept-name')?.textContent || `部门${index + 1}`;
    let columnCount = 0;
    Array.from(table.rows).forEach((tr, tableRow) => {
      // 业务行标识与电子表格行号对应。
      const r = type === 'quick-calc' && tr.dataset.rowKey
        ? Number(tr.dataset.rowKey.split('_')[1]) + headerRows : tableRow;
      cellData[r] = {};
      if (tr.dataset.rowKey) rows.set(r, tr);
      let c = 0;
      for (const td of tr.cells) {
        const input = td.querySelector(inputSelector);
        const css = getComputedStyle(td);
        const contentCss = getComputedStyle(input || td.querySelector('.cell-input') || td);
        const total = td.matches('.row-total, .row-total-display');
        const style = {
          ff: contentCss.fontFamily.split(',')[0].replace(/["']/g, '').trim(), fs: parseFloat(contentCss.fontSize) || 13, ht: 2, vt: 2,
          bl: td.tagName === 'TH' || total ? 1 : 0,
          cl: { rgb: css.color },
          bg: { rgb: css.backgroundColor === 'rgba(0, 0, 0, 0)' ? '#ffffff' : css.backgroundColor },
          bd: { t: { s: 1, cl: { rgb: '#e2e8f0' } }, b: { s: 1, cl: { rgb: '#e2e8f0' } },
            l: { s: 1, cl: { rgb: '#e2e8f0' } }, r: { s: 1, cl: { rgb: '#e2e8f0' } } },
        };
        if (input && Number(input.value) > 0) style.bg = { rgb: contentCss.backgroundColor };
        if (input?.classList.contains('qc-price-input') || td.querySelector('.wage-cell-display, .qc-price-display') || (total && table.classList.contains('wage-view'))) {
          style.n = { pattern: '#,##0.00' };
        } else if (input || typeof textValue(td) === 'number') style.n = { pattern: '0' };
        const value = textValue(td);
        const cell = { td, input, row: r, col: c, isPrice: td.classList.contains('qc-price-cell'), baseStyle: style };
        cellData[r][c] = { v: value, t: typeof value === 'number' ? 2 : 1,
          s: type === 'quick-calc' && tr.dataset.rowKey ? qcRowStyle(cell, tr.dataset.qcUsed === 'true') : style };
        cells.set(`${r},${c}`, cell);
        if (td.colSpan > 1) mergeData.push({ startRow: r, endRow: r, startColumn: c, endColumn: c + td.colSpan - 1 });
        if (r === headerRows - 1) columnData[c] = { w: type === 'work-edit' && c === 0 ? 155 : type === 'work-edit' && c === 1 ? 120 : 92 };
        c += td.colSpan;
      }
      columnCount = Math.max(columnCount, c);
    });
    const id = type === 'work-edit' ? 'work' : `dept-${table.dataset.deptId || index}`;
    const columnKeys = Object.fromEntries([...cells.values()].filter(cell => cell.row === headerRows - 1)
      .map(cell => [cell.col, cell.td.dataset.empId ? `emp-${cell.td.dataset.empId}` : textValue(cell.td)]));
    for (const cell of cells.values()) {
      cell.layoutKey = `${cell.td.closest('tr').dataset.rowKey || `header-${cell.row}`}|${columnKeys[cell.col] || cell.col}`;
    }
    const data = { id, name, cellData, mergeData, columnData,
      rowCount: type === 'quick-calc' ? Math.max(200, ...Array.from(rows.keys(), r => r + 101)) : Math.max(table.rows.length + 20, 50),
      columnCount: type === 'quick-calc' ? columnCount : Math.max(columnCount + 3, 12),
      defaultColumnWidth: 92, defaultRowHeight: 32,
      rowHeader: { width: 42 }, columnHeader: { height: 25 },
      freeze: { startRow: headerRows, startColumn: type === 'work-edit' ? 2 : 0, ySplit: headerRows, xSplit: type === 'work-edit' ? 2 : 0 },
    };
    const fingerprint = type === 'quick-calc' ? JSON.stringify([id, table.classList.contains('wage-view'), columnKeys]) : JSON.stringify(Array.from(cells.values(), cell => [cell.row, cell.col,
      cell.td.closest('tr').dataset.rowKey || cell.row, cell.input?.dataset.emp || cell.input?.dataset.key || cell.input?.dataset.subId ||
      (cell.td.tagName === 'TH' ? cell.td.textContent.trim() : 'readonly')]));
    const firstDataRow = rows.keys().next().value;
    const columnTemplates = new Map([...cells.values()].filter(cell => cell.row === firstDataRow).map(cell => [cell.col, cell]));
    return { id, data, cells, rows, headerRows, fingerprint, columnCount, columnKeys, columnTemplates, table,
      rowTemplate: type === 'quick-calc' ? table.tBodies[0]?.rows[0]?.cloneNode(true) : null };
  }

  function getCell(meta, row, col) {
    if (!meta) return;
    row = Number(row); col = Number(col);
    let cell = meta.cells.get(`${row},${col}`);
    if (cell || !meta.rowTemplate || !Number.isInteger(row) || !Number.isInteger(col) || row < meta.headerRows || row >= meta.data.rowCount || col < 0 || col >= meta.columnCount) return cell;
    // 只为真正编辑到的空白行建立业务绑定；无需重建工作簿或移动选区。
    const tr = meta.rowTemplate.cloneNode(true);
    const rowKey = `${meta.id.replace('dept-', '')}_${row - meta.headerRows}`;
    tr.dataset.rowKey = rowKey;
    tr.dataset.qcUsed = 'false';
    for (const [c, td] of Array.from(tr.cells).entries()) {
      const input = td.querySelector(inputSelector);
      if (input) {
        input.value = '';
        input.style.background = '';
        input.dataset.rowKey = rowKey;
        if (input.dataset.key) input.dataset.key = `${rowKey},${input.dataset.empId}`;
      } else {
        const display = td.querySelector('.wage-cell-display, .qc-price-display');
        if (display) { display.textContent = ''; display.title = ''; }
        if (td.classList.contains('row-total-display')) { td.textContent = ''; td.dataset.sheetValue = '0'; }
      }
      const templateCell = meta.columnTemplates.get(c);
      meta.cells.set(`${row},${c}`, { td, input, row, col: c, isPrice: td.classList.contains('qc-price-cell'),
        baseStyle: templateCell.baseStyle, layoutKey: `${rowKey}|${meta.columnKeys[c] || c}` });
    }
    meta.table.tBodies[0].appendChild(tr);
    meta.rows.set(row, tr);
    return meta.cells.get(`${row},${col}`);
  }

  function current() {
    return [...instances.values()].find(instance => instance.wrap.offsetParent !== null);
  }

  function capture(type) {
    const instance = [...instances.values()].find(item => item.type === type);
    return instance ? { data: JSON.parse(JSON.stringify(instance.book.save())), fingerprints: instance.fingerprints } : null;
  }

  function dispose(wrap) {
    const instance = instances.get(wrap);
    if (!instance) return;
    instance.saveLayout?.();
    clearTimeout(instance.layoutTimer);
    instance.disposables.forEach(item => item.dispose());
    instance.api.disposeUnit(instance.book.getId());
    reusable.set(wrap, instance);
    instances.delete(wrap);
  }

  function validValue(cell, value) {
    if (value == null || value === '') return true;
    if (typeof value !== 'string' && typeof value !== 'number') return false;
    const raw = String(value).trim();
    return /^\d+(?:\.\d+)?$/.test(raw) && Number.isFinite(Number(raw)) &&
      (cell.isPrice || Number.isSafeInteger(Number(raw)));
  }

  function attachColumnDrag(instance, swapColumns) {
    const { host, book, api } = instance;
    let press = null;
    let timer = null;
    let preview = null;
    let marker = null;
    let ghost = null;
    let counterpart = null;
    let origin = null;
    let settling = false;
    let suppressEditUntil = 0;
    const headers = meta => [...meta.cells.values()].filter(cell => cell.row === meta.headerRows - 1 && cell.td.dataset.empId);
    const canvasElement = () => [...host.querySelectorAll('canvas')]
      .sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
    const canvasRect = () => canvasElement()?.getBoundingClientRect();
    const columnGhost = (meta, cell) => {
      const canvas = canvasElement();
      const bounds = canvas?.getBoundingClientRect();
      const rect = book.getSheetBySheetId(meta.id).getRange(cell.row, cell.col).getCellRect();
      if (!bounds || !rect) return null;
      const left = Math.max(bounds.left, bounds.left + rect.x);
      const top = Math.max(bounds.top, bounds.top + rect.y);
      const width = Math.min(bounds.right, bounds.left + rect.x + rect.width) - left;
      const height = bounds.bottom - top;
      if (width <= 0 || height <= 0) return null;
      const element = document.createElement('div');
      element.className = 'lms-column-drag-ghost';
      Object.assign(element.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
      const image = document.createElement('canvas');
      const scaleX = canvas.width / bounds.width, scaleY = canvas.height / bounds.height;
      image.width = Math.ceil(width * scaleX); image.height = Math.ceil(height * scaleY);
      image.getContext('2d').drawImage(canvas, (left - bounds.left) * scaleX, (top - bounds.top) * scaleY,
        width * scaleX, height * scaleY, 0, 0, image.width, image.height);
      element.append(image);
      document.body.append(element);
      return { element, left, top, width, height, cell };
    };
    const headerAt = (meta, x, y) => {
      const canvas = canvasRect();
      if (!canvas || x < canvas.left || x > canvas.right || y < canvas.top || y > canvas.bottom) return null;
      const sheet = book.getActiveSheet();
      if (sheet.getSheetId() !== meta.id) return null;
      for (const cell of headers(meta)) {
        const rect = sheet.getRange(cell.row, cell.col).getCellRect();
        if (rect && x >= canvas.x + rect.x && x <= canvas.x + rect.x + rect.width &&
          y >= canvas.y + rect.y && y <= canvas.y + rect.y + rect.height) return { cell, rect, canvas };
      }
      return null;
    };
    const clear = () => {
      clearTimeout(timer);
      if (press?.active) suppressEditUntil = Date.now() + 350;
      press = null;
      preview?.remove(); marker?.remove();
      preview = marker = null;
      ghost?.element.remove(); counterpart?.element.remove(); origin?.remove();
      ghost = counterpart = origin = null;
      host.classList.remove('lms-column-dragging');
    };
    const paint = (x, y) => {
      const hit = headerAt(press.meta, x, y);
      const allowed = hit?.cell.td.dataset.deptId === press.source.td.dataset.deptId;
      press.target = allowed ? hit.cell : null;
      ghost.element.style.transform = `translate(${x - press.x}px, ${y - press.y}px)`;
      if (press.target && press.target !== press.source) {
        if (counterpart?.cell !== press.target) {
          counterpart?.element.remove();
          counterpart = columnGhost(press.meta, press.target);
          if (counterpart) {
            counterpart.element.classList.add('lms-column-drag-counterpart');
            // 先展示目标列，再平滑移向原位置，让交换方向可见。
            counterpart.element.getBoundingClientRect();
          }
        }
        if (counterpart) counterpart.element.style.transform = `translateX(${ghost.left - counterpart.left}px)`;
      } else { counterpart?.element.remove(); counterpart = null; }
      preview.textContent = !hit ? '拖到同部门姓名上换位' : !allowed ? '只能在同一部门内换位' :
        `${textValue(press.source.td)} → ${textValue(hit.cell.td)}`;
      preview.style.left = `${Math.min(x + 14, innerWidth - 240)}px`;
      preview.style.top = `${Math.min(y + 18, innerHeight - 48)}px`;
      marker.hidden = !hit;
      if (hit) {
        Object.assign(marker.style, { left: `${hit.canvas.x + hit.rect.x}px`, top: `${hit.canvas.y + hit.rect.y}px`,
          width: `${hit.rect.width}px`, height: `${hit.rect.height}px` });
        marker.classList.toggle('invalid', !allowed);
      }
    };
    const down = event => {
      if (settling) return;
      clear();
      if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.target.tagName !== 'CANVAS') return;
      press = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, active: false };
    };
    const move = event => {
      if (!press || event.pointerId !== press.pointerId) return;
      if (!press.active) {
        if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 6) clear();
        return;
      }
      event.preventDefault(); event.stopImmediatePropagation();
      paint(event.clientX, event.clientY);
    };
    const up = event => {
      if (!press || event.pointerId !== press.pointerId) return;
      const gesture = press;
      if (gesture.active) { paint(event.clientX, event.clientY); event.preventDefault(); }
      const flights = gesture.active && gesture.target && gesture.target !== gesture.source && counterpart
        ? { source: ghost, target: counterpart } : null;
      if (flights) { ghost = counterpart = null; settling = true; }
      clear();
      // 让引擎先结束自身的选格手势，再保存与重建人员列。
      if (flights) {
        setTimeout(async () => {
          try {
            const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180;
            const animation = flights.source.element.animate([
              { transform: flights.source.element.style.transform },
              { transform: `translate(${flights.target.left - flights.source.left}px, 0px)` },
            ], { duration, easing: 'ease-out', fill: 'forwards' });
            await animation.finished;
            await swapColumns(gesture.meta, gesture.source, gesture.target);
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          } finally {
            flights.source.element.remove(); flights.target.element.remove();
            settling = false;
          }
        }, 0);
      }
    };
    const escape = event => {
      if (event.key === 'Escape' && press?.active) { event.preventDefault(); event.stopImmediatePropagation(); clear(); }
    };
    const suppressClick = event => {
      if (press?.active || Date.now() < suppressEditUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    host.addEventListener('pointerdown', down, true);
    host.addEventListener('click', suppressClick, true);
    host.addEventListener('dblclick', suppressClick, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', clear, true);
    window.addEventListener('blur', clear);
    window.addEventListener('keydown', escape, true);
    instance.disposables.push(api.addEvent(api.Event.CellPointerDown, event => {
      if (!press || press.active) return;
      const meta = instance.sheets.get(event.worksheet.getSheetId());
      const source = meta?.cells.get(`${event.row},${event.column}`);
      if (!source?.td.dataset.empId || event.row !== meta.headerRows - 1) return;
      Object.assign(press, { meta, source });
      timer = setTimeout(() => {
        if (!press) return;
        ghost = columnGhost(press.meta, press.source);
        if (!ghost) { clear(); return; }
        press.active = true;
        host.classList.add('lms-column-dragging');
        preview = document.createElement('div'); preview.className = 'lms-column-drag-preview';
        marker = document.createElement('div'); marker.className = 'lms-column-drag-marker';
        origin = document.createElement('div'); origin.className = 'lms-column-drag-origin';
        Object.assign(origin.style, { left: `${ghost.left}px`, top: `${ghost.top}px`, width: `${ghost.width}px`, height: `${ghost.height}px` });
        document.body.append(preview, marker, origin);
        paint(press.x, press.y);
      }, 450);
    }));
    instance.disposables.push({ dispose() {
      clear();
      host.removeEventListener('pointerdown', down, true);
      host.removeEventListener('click', suppressClick, true);
      host.removeEventListener('dblclick', suppressClick, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', clear, true);
      window.removeEventListener('blur', clear);
      window.removeEventListener('keydown', escape, true);
    } });
    return { isDragging: () => !!press?.active || settling, suppressEdit: () => press?.active || settling || Date.now() < suppressEditUntil };
  }

  function mount(wrap, type) {
    if (!wrap || !window.LmsSheetEngine) return;
    // 两个业务页面只允许一个活动工作簿，避免隐藏表格抢占键盘和编辑器焦点。
    for (const otherWrap of instances.keys()) if (otherWrap !== wrap) dispose(otherWrap);
    const tables = Array.from(wrap.querySelectorAll('table.spreadsheet'));
    if (!tables.length) return;
    const sheets = tables.map((table, index) => makeSheet(table, index, type));
    const year = type === 'work-edit' ? _state.currentYear : document.getElementById('qcYear')?.value;
    const month = type === 'work-edit' ? _state.currentMonth : document.getElementById('qcMonth')?.value;
    const viewMode = type === 'work-edit' ? _state.viewMode : _qcState.qcViewMode;
    const layoutKey = getLayoutKey(type, year, month, viewMode);
    let savedLayout = layoutCache.get(layoutKey) || {};
    if (!layoutCache.has(layoutKey)) {
      try { savedLayout = JSON.parse(localStorage.getItem(layoutKey) || '{}'); } catch { /* 首次使用默认样式 */ }
    }
    for (const sheet of sheets) {
      const layout = savedLayout[sheet.id];
      if (!layout) continue;
      for (const cell of sheet.cells.values()) {
        if (layout.cellStyles?.[cell.layoutKey]) sheet.data.cellData[cell.row][cell.col].s = layout.cellStyles[cell.layoutKey];
        if (type === 'quick-calc' && cell.row >= sheet.headerRows) {
          sheet.data.cellData[cell.row][cell.col].s = qcRowStyle(cell, cell.td.closest('tr').dataset.qcUsed === 'true', sheet.data.cellData[cell.row][cell.col].s);
        }
      }
      for (const [col, key] of Object.entries(sheet.columnKeys)) {
        if (layout.columns?.[key]) sheet.data.columnData[col] = layout.columns[key];
      }
      sheet.data.rowData = Object.fromEntries([...sheet.rows].filter(([, tr]) => layout.rows?.[tr.dataset.rowKey])
        .map(([r, tr]) => [r, layout.rows[tr.dataset.rowKey]]));
      if (layout.zoomRatio) sheet.data.zoomRatio = layout.zoomRatio;
    }
    const source = document.createElement('div');
    source.className = 'lms-sheet-source';
    while (wrap.firstChild) source.appendChild(wrap.firstChild);
    source.hidden = true;
    const externalBar = type === 'quick-calc' ? document.getElementById('qcSelectionActions') : null;
    const bar = externalBar || document.createElement('div');
    bar.className = `lms-sheet-actions${type === 'quick-calc' ? ' qc-selection-actions' : ''}`;
    const previous = reusable.get(wrap);
    reusable.delete(wrap);
    const host = previous?.host || document.createElement('div');
    host.className = 'lms-sheet-host';
    if (!externalBar) wrap.appendChild(bar);
    wrap.append(host, source);
    const { createUniver, LocaleType, UniverSheetsCorePreset, zhCN } = window.LmsSheetEngine;
    const hiddenCommands = ['univer.command.undo', 'univer.command.redo', 'sheet.command.insert-row', 'sheet.command.insert-col', 'sheet.command.remove-row', 'sheet.command.remove-col',
      'sheet.command.insert-sheet', 'sheet.command.delete-sheet', 'sheet.command.set-worksheet-name', 'sheet.command.set-range-merge',
      'sheet.command.insert-row-before', 'sheet.command.insert-row-after', 'sheet.command.insert-col-before', 'sheet.command.insert-col-after',
      'sheet.command.insert-multi-rows-above', 'sheet.command.insert-multi-rows-after', 'sheet.command.insert-multi-cols-before',
      'sheet.command.insert-multi-cols-right', 'sheet.command.remove-row-by-range', 'sheet.command.remove-col-by-range', 'sheet.command.remove-sheet'];
    const menu = Object.fromEntries(hiddenCommands.map(id => [id, { hidden: true }]));
    const engine = previous ? { univer: previous.univer, univerAPI: previous.api } : createUniver({ locale: LocaleType.ZH_CN,
      locales: { [LocaleType.ZH_CN]: zhCN },
      presets: [UniverSheetsCorePreset({ container: host, header: true, toolbar: true, ribbonType: 'simple',
        // 必须允许自动聚焦：键入字符时引擎才能从临时文档进入单元格编辑。
        contextMenu: true, menu,
        footer: { sheetBar: true, statisticBar: true, zoomSlider: true, menus: false, addSheetButtonConfig: { show: false } },
        sheets: { protectedRangeShadow: false, clipboardConfig: { hidePasteOptions: true } },
      })],
    });
    const { univer, univerAPI: api } = engine;
    let data = { id: `lms-${type}`, name: type === 'work-edit' ? '做货编辑' : '快捷计算',
      appVersion: '1.0.3', locale: LocaleType.ZH_CN, styles: {},
      sheetOrder: sheets.map(sheet => sheet.id), sheets: Object.fromEntries(sheets.map(sheet => [sheet.id, sheet.data])) };
    const fingerprints = Object.fromEntries(sheets.map(sheet => [sheet.id, sheet.fingerprint]));
    const restored = pendingRestore.get(type);
    pendingRestore.delete(type);
    if (restored && JSON.stringify(restored.fingerprints) === JSON.stringify(fingerprints)) data = restored.data;
    // 每次换簿使用不同标识，防止上一轮编辑的异步命令写入新工作簿。
    data = { ...data, id: `lms-${type}-${++workbookSequence}` };
    const book = api.createWorkbook(data);
    for (const sheet of sheets) sheet.data.rowCount = data.sheets[sheet.id].rowCount;
    const instance = { wrap, type, univer, api, book, sheets: new Map(sheets.map(sheet => [sheet.id, sheet])),
      fingerprints, source, bar, host, syncing: false, historyPending: false, disposables: [] };
    instances.set(wrap, instance);
    instance.saveLayout = () => {
      const snapshot = book.save();
      const layouts = {};
      for (const meta of instance.sheets.values()) {
        const sheet = snapshot.sheets[meta.id];
        const cellStyles = {};
        for (const cell of meta.cells.values()) {
          const style = sheet.cellData?.[cell.row]?.[cell.col]?.s;
          const resolved = typeof style === 'string' ? snapshot.styles[style] : style;
          if (resolved) cellStyles[cell.layoutKey] = resolved;
        }
        layouts[meta.id] = { cellStyles, zoomRatio: sheet.zoomRatio,
          columns: Object.fromEntries(Object.entries(meta.columnKeys).map(([c, key]) => [key, sheet.columnData?.[c]])),
          rows: Object.fromEntries([...meta.rows].map(([r, tr]) => [tr.dataset.rowKey, sheet.rowData?.[r]])) };
      }
      layoutCache.set(layoutKey, layouts);
      const value = JSON.stringify(layouts);
      try { localStorage.setItem(layoutKey, value); } catch { /* 主存储是数据库 */ }
      if (typeof post === 'function') {
        void post('/api/app-settings', { key: layoutKey, value }).catch(error => console.error('表格格式保存失败', error));
      }
    };
    const listen = (event, fn) => instance.disposables.push(api.addEvent(event, fn));
    const recordHistory = () => {
      if (instance.historyPending) return;
      instance.historyPending = true;
      pushHistory(type);
      queueMicrotask(() => { instance.historyPending = false; });
    };
    const syncDerived = meta => {
      const cellValue = {};
      for (const cell of meta.cells.values()) {
        if (cell.input) continue;
        const value = textValue(cell.td);
        const actual = book.getSheetBySheetId(meta.id).getRange(cell.row, cell.col).getValue();
        if (String(value) === String(actual)) continue;
        (cellValue[cell.row] ||= {})[cell.col] = { v: value, t: typeof value === 'number' ? 2 : 1 };
      }
      if (!Object.keys(cellValue).length) return;
      instance.syncing = true;
      try { api.syncExecuteCommand('sheet.mutation.set-range-values', { unitId: book.getId(), subUnitId: meta.id, cellValue }); }
      finally { instance.syncing = false; }
    };
    const syncQcRows = (meta, changedRows, movedStyles = null) => {
      const sheet = book.getSheetBySheetId(meta.id);
      const cellValue = {};
      for (const cell of meta.cells.values()) {
        if (!changedRows.has(cell.row)) continue;
        const used = cell.td.closest('tr').dataset.qcUsed === 'true';
        const range = sheet.getRange(cell.row, cell.col);
        const style = qcRowStyle(cell, used, { ...cell.baseStyle, ...(movedStyles?.get(cell.row)?.get(cell.col) || range.getCellStyleData()) });
        const patch = { s: style };
        if (!used) Object.assign(patch, { v: null, t: 2, p: null });
        else if (movedStyles) {
          const value = textValue(cell.td);
          Object.assign(patch, { v: value === '' ? null : value, t: 2, p: null });
        }
        (cellValue[cell.row] ||= {})[cell.col] = patch;
      }
      instance.syncing = true;
      try {
        api.syncExecuteCommand('sheet.mutation.set-range-values', { unitId: book.getId(), subUnitId: meta.id, cellValue });
        if (Math.max(...changedRows) >= meta.data.rowCount - 20) {
          meta.data.rowCount += 100;
          sheet.setRowCount(meta.data.rowCount);
        }
      } finally { instance.syncing = false; }
    };
    let columnOrderBusy = false;
    const swapEmployeeColumns = async (meta, source, target) => {
      if (columnOrderBusy || instances.get(wrap) !== instance || source.td.dataset.deptId !== target.td.dataset.deptId) return;
      columnOrderBusy = true;
      try {
        await flush(type);
        if (type === 'work-edit') { clearTimeout(window._weAutoSaveTimer); await autoSaveWorkRecords(); }
        else { clearTimeout(window._qcAutoSaveTimer); await autoSaveQc(); }
        const page = type === 'work-edit' ? 'work' : 'quickcalc';
        const ids = [...meta.cells.values()].filter(cell => cell.row === meta.headerRows - 1 &&
          cell.td.dataset.empId && cell.td.dataset.deptId === source.td.dataset.deptId).map(cell => Number(cell.td.dataset.empId));
        const sync = await setMemberOrderSync(page, false);
        const order = await setManualEmployeeOrder(page, Number(source.td.dataset.deptId),
          swapIds(ids, Number(source.td.dataset.empId), Number(target.td.dataset.empId)));
        if (sync?.ok === false || order?.ok === false) throw new Error('列顺序保存失败');
        const syncInput = document.querySelector(`#memberOrderSync_${page} input`);
        if (syncInput) syncInput.checked = false;
        if (type === 'work-edit') renderSpreadsheet(); else renderQcDeptTables();
        const next = instances.get(wrap);
        const sheet = next.book.setActiveSheet(meta.id);
        const moved = [...next.sheets.get(meta.id).cells.values()].find(cell =>
          cell.row === meta.headerRows - 1 && cell.td.dataset.empId === source.td.dataset.empId);
        if (moved) sheet.setActiveRange(sheet.getRange(moved.row, moved.col));
      } catch (error) { notify(error.message || '列顺序保存失败'); }
      finally { columnOrderBusy = false; }
    };
    const columnDrag = attachColumnDrag(instance, swapEmployeeColumns);
    const personHeader = (meta, row, column) => {
      const header = meta?.cells.get(`${row},${column}`)?.td;
      return row === meta?.headerRows - 1 && header?.dataset.empId ? header : null;
    };
    const editSelectedPerson = event => {
      if (!host.contains(event.target) || !event.target.closest('[data-u-comp="editor"]')) return;
      // 只读表头的键盘编辑可能被引擎提前拦截，在窗口捕获阶段识别录入意图。
      if (event.type === 'keydown' && ((event.ctrlKey || event.metaKey || event.altKey) ||
        !(event.key.length === 1 || ['F2', 'Backspace', 'Process', 'Dead'].includes(event.key)))) return;
      if (columnDrag.isDragging()) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      const sheet = book.getActiveSheet();
      const active = sheet.getSelection()?.getCurrentCell();
      const header = personHeader(instance.sheets.get(sheet.getSheetId()),
        active?.actualRow ?? active?.startRow, active?.actualColumn ?? active?.startColumn);
      if (!header) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void showEditMemberModal(Number(header.dataset.empId));
    };
    window.addEventListener('keydown', editSelectedPerson, true);
    window.addEventListener('compositionstart', editSelectedPerson, true);
    instance.disposables.push({ dispose() {
      window.removeEventListener('keydown', editSelectedPerson, true);
      window.removeEventListener('compositionstart', editSelectedPerson, true);
    } });
    listen(api.Event.BeforeSheetEditStart, event => {
      if (columnDrag.suppressEdit()) { event.cancel = true; return; }
      const meta = instance.sheets.get(event.worksheet.getSheetId());
      const header = personHeader(meta, event.row, event.column);
      // 姓名由人员资料统一维护：只选中不弹窗，开始编辑（打字、F2、双击）时打开人员编辑。
      if (header) {
        event.cancel = true;
        void showEditMemberModal(Number(header.dataset.empId));
        return;
      }
      if (type === 'quick-calc' && event.row > meta.headerRows + getQcUsedRowCount(meta.id.replace('dept-', ''))) {
        event.cancel = true;
        notify('请先填写上一行，不能跳过空白行');
        return;
      }
      if (!getCell(meta, event.row, event.column)?.input) event.cancel = true;
    });
    listen(api.Event.BeforeCommandExecute, event => {
      if (instance.syncing) return;
      if (event.id.startsWith('sheet.') && event.params?.unitId && event.params.unitId !== book.getId()) {
        event.cancel = true;
        return;
      }
      if (['univer.command.undo', 'univer.command.redo'].includes(event.id)) {
        event.cancel = true;
        if (event.id.endsWith('undo')) void undo(); else void redo();
        return;
      }
      // 工资表结构由订单/部门/员工管理维护，避免通用行列操作改变数据对应关系。
      if (/^sheet\.(command|mutation)\.((insert|remove|delete|move)-(row|rows|col|cols|columns|sheet|range|multi-rows|multi-cols)($|-)|set-worksheet-name|set-range-merge|add-worksheet-merge|remove-worksheet-merge)/.test(event.id)) {
        event.cancel = true;
        return;
      }
      if (event.id === 'sheet.mutation.set-range-values') {
        const meta = instance.sheets.get(event.params?.subUnitId);
        if (!meta) { event.cancel = true; return; }
        const proposedRows = new Map();
        for (const [r, columns] of Object.entries(event.params.cellValue || {})) {
          for (const [c, patch] of Object.entries(columns || {})) {
            const cell = getCell(meta, r, c);
            const writesValue = patch === null || own(patch, 'v') || own(patch, 'f') || own(patch, 'p');
            if (!writesValue) continue;
            // 默认粘贴携带 s（包括空格的 null 样式）：数值沿用目标格式，新增行回退到业务模板。
            // 只修改写值补丁，工具栏主动设置字体、颜色等纯格式操作仍可正常使用。
            if (cell && patch && own(patch, 's')) {
              const targetStyle = book.getSheetBySheetId(meta.id).getRange(Number(r), Number(c)).getCellStyleData();
              patch.s = { ...cell.baseStyle, ...targetStyle };
            }
            if (!cell?.input) {
              // 允许选中整条快捷计算数据行按 Delete，合计由业务计算更新。
              // 空白扩展列不保存，表头仍保持只读。
              if (type === 'quick-calc' && Number(r) >= meta.headerRows &&
                (patch === null || (patch.v == null && !patch.f && !patch.p))) {
                delete columns[c];
                continue;
              }
              const same = patch && !patch.f && !patch.p && String(patch.v ?? '') === String(cell ? textValue(cell.td) : '');
              if (same) continue;
              event.cancel = true;
              notify('请在对数或单价单元格中输入；表头与合计为只读');
              return;
            }
            // 外部表格的富文本数字转成数值，消除源文本内部的字体与颜色。
            if (patch?.p && !patch.f) {
              const plain = String(patch.p.body?.dataStream || '').trim();
              if (validValue(cell, plain)) { patch.v = Number(plain || 0); patch.t = 2; patch.p = null; }
            }
            if (patch?.f || patch?.p || !validValue(cell, patch?.v)) {
              event.cancel = true;
              notify('对数须为非负整数，单价须为非负数字');
              return;
            }
            if (patch && patch.v != null && patch.v !== '') {
              patch.v = Number(patch.v);
              patch.t = 2;
            }
            if (type === 'quick-calc') {
              const row = Number(r);
              if (!proposedRows.has(row)) proposedRows.set(row, new Map([...meta.columnTemplates.keys()]
                .map(col => meta.cells.get(`${row},${col}`)).filter(item => item.input)
                .map(item => [item.col, Number(item.input.value || 0)])));
              proposedRows.get(row).set(Number(c), Number(patch?.v || 0));
            }
          }
        }
        if (type === 'quick-calc') {
          const firstEmptyRow = meta.headerRows + getQcUsedRowCount(meta.id.replace('dept-', ''));
          for (const row of proposedRows.keys()) {
            if (row <= firstEmptyRow) continue;
            for (let preceding = firstEmptyRow; preceding < row; preceding++) {
              if (![...(proposedRows.get(preceding)?.values() || [])].some(value => value > 0)) {
                event.cancel = true;
                notify('请连续录入，不能跳过空白行粘贴或编辑');
                return;
              }
            }
          }
        }
        recordHistory();
      } else if (event.type === 2 && /^sheet\.mutation\.(set-col-width|set-row-height|set-range-style)/.test(event.id)) recordHistory();
    });
    listen(api.Event.SheetValueChanged, event => {
      if (instance.syncing) return;
      const qcChanges = new Map();
      for (const range of event.effectedRanges) {
        const meta = instance.sheets.get(range.getSheetId());
        if (!meta) continue;
        const changedRange = range.getRange();
        const sheet = book.getSheetBySheetId(meta.id);
        const changedRows = new Set();
        for (const cell of meta.cells.values()) {
          if (cell.row < changedRange.startRow || cell.row > changedRange.endRow ||
            cell.col < changedRange.startColumn || cell.col > changedRange.endColumn) continue;
          // 粘贴会覆盖空格和相同值的格式，涉及的整行都需按业务数据恢复在用样式。
          if (type === 'quick-calc' && cell.row >= meta.headerRows) changedRows.add(cell.row);
          if (!cell.input) continue;
          const value = sheet.getRange(cell.row, cell.col).getValue();
          if (type === 'quick-calc' ? String(value ?? '') === cell.input.value : Number(value || 0) === Number(cell.input.value || 0)) continue;
          cell.input.value = value == null ? '' : String(value);
          cell.input.dispatchEvent(new Event('input', { bubbles: true }));
          changedRows.add(cell.row);
        }
        syncDerived(meta);
        if (type === 'quick-calc' && changedRows.size) {
          const combined = qcChanges.get(meta) || new Set();
          changedRows.forEach(row => combined.add(row));
          qcChanges.set(meta, combined);
        }
      }
      for (const [meta, changedRows] of qcChanges) {
        const sheet = book.getSheetBySheetId(meta.id);
        const moves = compactQcRows(meta.id.replace('dept-', ''));
        if (!moves.size) { syncQcRows(meta, changedRows); continue; }
        const styles = new Map([...meta.rows.keys()].map(row => [row, new Map([...meta.cells.values()]
          .filter(cell => cell.row === row).map(cell => [cell.col, sheet.getRange(row, cell.col).getCellStyleData()]))]));
        const movedStyles = new Map([...moves].map(([from, to]) => [Number(to.split('_')[1]) + meta.headerRows, styles.get(Number(from.split('_')[1]) + meta.headerRows)]));
        for (const row of meta.rows.keys()) {
          const tr = meta.rows.get(row);
          const rowKey = tr.dataset.rowKey;
          for (const cell of meta.cells.values()) {
            if (cell.row !== row || !cell.input) continue;
            cell.input.value = String((cell.isPrice ? _qcDeptRows[rowKey]?.[cell.input.dataset.subId] : _qcState.qtyData[cell.input.dataset.key]) || '');
          }
          updateDeptRowTotals(rowKey);
        }
        syncQcRows(meta, new Set(meta.rows.keys()), movedStyles);
      }
    });
    listen(api.Event.CommandExecuted, event => {
      if (!/^sheet\.mutation\./.test(event.id) && event.id !== 'sheet.operation.set-zoom-ratio') return;
      clearTimeout(instance.layoutTimer);
      instance.layoutTimer = setTimeout(instance.saveLayout, 600);
    });
    const updateActions = () => {
      const sheet = book.getActiveSheet();
      const meta = instance.sheets.get(sheet.getSheetId());
      const active = sheet.getSelection()?.getCurrentCell();
      const tr = meta?.rows.get(active?.actualRow ?? active?.startRow);
      const column = active?.actualColumn ?? active?.startColumn;
      const header = meta?.cells.get(`${meta.headerRows - 1},${column}`)?.td;
      bar.replaceChildren();
      let actionTarget = bar;
      if (type === 'quick-calc') {
        bar.hidden = !header?.dataset.empId;
        if (bar.hidden) return;
        const menu = document.createElement('details');
        const title = document.createElement('summary');
        title.textContent = `${textValue(header)} ⋯`;
        title.title = '员工详情与列顺序';
        actionTarget = document.createElement('div');
        actionTarget.className = 'qc-employee-menu';
        menu.append(title, actionTarget);
        bar.appendChild(menu);
      }
      if (type === 'work-edit') {
        const hint = document.createElement('span');
        hint.className = 'lms-sheet-hint';
        hint.textContent = '单击选格 · 拖选区域 · Ctrl+C/V 复制粘贴 · 双击/F2 编辑';
        bar.appendChild(hint);
        for (const kind of ['order', 'model']) {
          const original = tr?.querySelector(`.work-choice-button[data-type="${kind}"]`);
          const button = document.createElement('button');
          button.className = 'btn btn-secondary btn-sm';
          button.textContent = `${kind === 'order' ? '订单' : '型号'}：${original?.textContent.trim() || '选中数据行'}`;
          button.disabled = !original;
          if (original) Object.assign(button.dataset, original.dataset);
          button.onclick = event => openWorkChoiceMenu(event, button);
          bar.appendChild(button);
        }
      }
      if (header?.dataset.empId) {
        const details = document.createElement('button');
        details.className = 'btn btn-secondary btn-sm';
        details.textContent = '员工详情';
        details.onclick = () => showEmployeeDetail(Number(header.dataset.empId));
        actionTarget.appendChild(details);
        for (const direction of [-1, 1]) {
          const move = document.createElement('button');
          move.className = 'btn btn-secondary btn-sm';
          move.textContent = direction === -1 ? '员工列 ←' : '员工列 →';
          const headers = [...meta.cells.values()].filter(cell => cell.row === meta.headerRows - 1 && cell.td.dataset.empId && cell.td.dataset.deptId === header.dataset.deptId);
          const at = headers.findIndex(cell => cell.td === header);
          const neighbor = headers[at + direction];
          move.disabled = !neighbor;
          move.onclick = () => swapEmployeeColumns(meta, headers[at], neighbor);
          actionTarget.appendChild(move);
        }
      }
      if (type === 'quick-calc') return;
      const add = document.createElement('button');
      add.className = 'btn btn-primary btn-sm';
      add.textContent = '+ 添加行';
      add.onclick = () => addWorkRow();
      const remove = document.createElement('button');
      remove.className = 'btn btn-danger btn-sm';
      remove.textContent = '删除选中行';
      remove.disabled = !tr;
      remove.onclick = () => deleteWorkRow(tr.dataset.rowKey);
      bar.append(add, remove);
    };
    listen(api.Event.SelectionChanged, updateActions);
    listen(api.Event.ActiveSheetChanged, updateActions);
    instance.updateActions = updateActions;
    updateActions();
    // 鼠标点击工具栏前完成正在输入的数字。
    bar.onmousedown = () => { if (book.isCellEditing()) void book.endEditingAsync(true); };
    const first = sheets[0];
    const inputCell = Array.from(first.cells.values()).find(cell => cell.input);
    if (inputCell) book.getActiveSheet().setActiveRange(book.getActiveSheet().getRange(inputCell.row, inputCell.col));
    updateActions();
    instance.ready = true;
  }

  async function flush(type) {
    const instance = [...instances.values()].find(item => item.type === type);
    if (instance?.book.isCellEditing()) await instance.book.endEditingAsync(true);
  }

  window.LmsSpreadsheet = { mount, dispose, capture, loadLayout, flush,
    prepareRestore(type, snapshot) { if (snapshot) pendingRestore.set(type, snapshot); },
    getInstance(wrapId) { return instances.get(document.getElementById(wrapId)); },
    focusInput(input) {
      const instance = [...instances.values()].find(item => item.source.contains(input));
      if (!instance) return false;
      for (const meta of instance.sheets.values()) {
        const cell = Array.from(meta.cells.values()).find(item => item.input === input);
        if (!cell) continue;
        const sheet = instance.book.setActiveSheet(meta.id);
        sheet.setActiveRange(sheet.getRange(cell.row, cell.col));
        return true;
      }
      return false;
    },
  };
  // 引擎快捷键在 window 层监听，先在同一层接管统一撤销，避免执行两次。
  window.addEventListener('keydown', event => {
    const instance = current();
    if (!instance || !(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === 'z' || key === 'y') {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (key === 'y' || event.shiftKey) void redo(); else void undo();
    }
  }, true);
})();
