// 做货编辑和快捷计算共用的可编辑单元格区域选择与剪贴板操作。
(() => {
  const selector = '#spreadsheetWrap input[data-emp], #qcDeptTablesWrap input.qc-price-input, #qcDeptTablesWrap input.qc-qty-input';
  const tableSelector = '#spreadsheetWrap table.spreadsheet, #qcDeptTablesWrap table.spreadsheet';
  let selection = null;
  let dragging = false;
  let editingInput = null;
  const gridCache = new WeakMap();

  function endDrag() {
    dragging = false;
    document.body.classList.remove('sheet-range-dragging');
  }

  function endEdit() {
    editingInput?.classList.remove('sheet-editing');
    editingInput = null;
  }

  function clearNativeSelection() {
    window.getSelection()?.removeAllRanges();
  }

  function cellFrom(target) {
    if (!(target instanceof Element)) return null;
    return target.closest(selector) || target.closest('td')?.querySelector(selector) || null;
  }

  function gridFor(input) {
    const table = input?.closest('table.spreadsheet');
    if (!table) return null;
    let cached = gridCache.get(table);
    if (!cached || !cached.positions.has(input)) {
      const positions = new Map();
      const rows = Array.from(table.querySelectorAll('tbody tr[data-row-key]'))
        .map((tr, row) => Array.from(tr.querySelectorAll(selector)).map((cell, col) => {
          positions.set(cell, { row, col });
          return cell;
        }));
      cached = { rows, positions };
      gridCache.set(table, cached);
    }
    const position = cached.positions.get(input);
    return position ? { table, rows: cached.rows, ...position } : null;
  }

  function clearHighlight() {
    if (!selection) return;
    selection.table.querySelectorAll('.sheet-selected, .sheet-active').forEach(td => {
      td.classList.remove('sheet-selected', 'sheet-active');
    });
  }

  function bounds() {
    if (!selection) return null;
    const { anchor, head } = selection;
    return {
      top: Math.min(anchor.row, head.row),
      bottom: Math.max(anchor.row, head.row),
      left: Math.min(anchor.col, head.col),
      right: Math.max(anchor.col, head.col),
    };
  }

  function paint() {
    if (!selection) return;
    const { rows } = gridFor(selection.table.querySelector(selector)) || {};
    if (!rows) return;
    const { top, bottom, left, right } = bounds();
    for (let row = top; row <= bottom; row++) {
      for (let col = left; col <= right; col++) {
        rows[row]?.[col]?.closest('td')?.classList.add('sheet-selected');
      }
    }
    rows[selection.head.row]?.[selection.head.col]?.closest('td')?.classList.add('sheet-active');
  }

  function selectCell(input, extend = false) {
    const grid = gridFor(input);
    if (!grid) return;
    const sameTable = selection?.table === grid.table;
    if (extend && sameTable && selection.head.row === grid.row && selection.head.col === grid.col) return;
    clearHighlight();
    selection = {
      table: grid.table,
      anchor: extend && sameTable ? selection.anchor : { row: grid.row, col: grid.col },
      head: { row: grid.row, col: grid.col },
    };
    paint();
  }

  function selectedGrid() {
    if (!selection?.table.isConnected) return null;
    const input = selection.table.querySelector(selector);
    return input ? gridFor(input) : null;
  }

  function focusCell(input, extend = false) {
    endEdit();
    clearNativeSelection();
    selectCell(input, extend);
    const td = input.closest('td');
    td.tabIndex = -1;
    td.focus({ preventScroll: true });
    td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function beginEdit(input, firstKey = null) {
    endDrag();
    endEdit();
    editingInput = input;
    input.classList.add('sheet-editing');
    input.focus();
    if (firstKey !== null) {
      input.value = firstKey;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function cellValue(input) {
    if (input.dataset.emp) {
      return String(_weRowMap[input.dataset.row]?.emps[input.dataset.emp] ?? input.value);
    }
    if (input.classList.contains('qc-price-input')) {
      return String(_qcDeptRows[input.dataset.rowKey]?.[input.dataset.subId] ?? input.value);
    }
    return String(_qcState.qtyData[input.dataset.key] ?? input.value);
  }

  document.addEventListener('focusin', event => {
    const input = event.target.matches?.(selector) ? event.target : null;
    if (input) {
      // 新增行的自动聚焦、复制后恢复焦点也需要同步编辑状态。
      if (editingInput !== input) {
        endEdit();
        editingInput = input;
        input.classList.add('sheet-editing');
      }
      selectCell(input);
    }
  });
  document.addEventListener('focusout', event => {
    if (event.target === editingInput) endEdit();
  });

  // 浏览器的文字选区与单元格选区互斥；只在主动编辑输入框时放行。
  document.addEventListener('selectstart', event => {
    const element = event.target instanceof Element ? event.target : event.target?.parentElement;
    const inTable = element?.closest(tableSelector);
    if (dragging || (inTable && event.target !== editingInput)) event.preventDefault();
  }, true);
  document.addEventListener('dragstart', event => {
    if (dragging || (event.target instanceof Element && event.target.closest(tableSelector))) {
      event.preventDefault();
    }
  }, true);

  document.addEventListener('mousedown', event => {
    if (event.button !== 0) return;
    const input = cellFrom(event.target);
    if (!input) {
      endDrag();
      if (event.target instanceof Element && event.target.closest(tableSelector)) clearNativeSelection();
      return;
    }
    // 双击/F2 后再次点当前输入框时，允许调整光标或选择正在编辑的数字。
    if (input === editingInput && document.activeElement === input && !event.shiftKey) {
      endDrag();
      return;
    }
    event.preventDefault();
    const extend = event.shiftKey && selection?.table === input.closest('table');
    focusCell(input, extend);
    dragging = true;
    document.body.classList.add('sheet-range-dragging');
  }, true);

  document.addEventListener('dblclick', event => {
    const input = cellFrom(event.target);
    if (input) {
      event.preventDefault();
      clearNativeSelection();
      beginEdit(input);
    }
  }, true);

  document.addEventListener('mouseover', event => {
    if (!dragging || !(event.buttons & 1)) return;
    const input = cellFrom(event.target);
    if (input && input.closest('table') === selection?.table) selectCell(input, true);
  });
  document.addEventListener('mouseup', endDrag, true);
  window.addEventListener('blur', endDrag);

  function selectionText() {
    const grid = selectedGrid();
    if (!grid) return '';
    const { top, bottom, left, right } = bounds();
    const lines = [];
    for (let row = top; row <= bottom; row++) {
      const values = [];
      for (let col = left; col <= right; col++) {
        const cell = grid.rows[row]?.[col];
        values.push(cell ? cellValue(cell) : '');
      }
      lines.push(values.join('\t'));
    }
    return lines.join('\r\n');
  }

  function copySelection() {
    const value = selectionText();
    const previous = document.activeElement;
    const proxy = document.createElement('textarea');
    proxy.value = value;
    proxy.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
    document.body.appendChild(proxy);
    proxy.focus();
    proxy.select();
    const copied = document.execCommand('copy');
    proxy.remove();
    if (previous?.isConnected) previous.focus({ preventScroll: true });
    if (!copied && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value).catch(() => showToast('复制失败，请重试', 'error'));
    } else if (!copied) {
      showToast('复制失败，请重试', 'error');
    }
  }

  function navigate(event, input, grid) {
    const rows = grid.rows;
    const current = selection?.table === grid.table ? selection.head : grid;
    let row = current.row;
    let col = current.col;
    const extend = event.shiftKey && event.key.startsWith('Arrow');
    if (event.key === 'ArrowUp') row--;
    else if (event.key === 'ArrowDown') row++;
    else if (event.key === 'ArrowLeft') col--;
    else if (event.key === 'ArrowRight') col++;
    else if (event.key === 'Tab') {
      col += event.shiftKey ? -1 : 1;
      if (col < 0) { row--; col = rows[0].length - 1; }
      if (col >= rows[0].length) { row++; col = 0; }
      row = (row + rows.length) % rows.length;
    } else if (event.key === 'Enter') {
      row += event.shiftKey ? -1 : 1;
      if (row < 0) { row = rows.length - 1; col--; }
      if (row >= rows.length) { row = 0; col++; }
      col = (col + rows[0].length) % rows[0].length;
    }
    row = Math.max(0, Math.min(rows.length - 1, row));
    col = Math.max(0, Math.min(rows[row].length - 1, col));
    const next = rows[row][col];
    if (next) focusCell(next, extend);
  }

  document.addEventListener('keydown', event => {
    const input = cellFrom(event.target);
    if (!input) return;
    const grid = gridFor(input);
    if (!grid) return;
    if (!selection || selection.table !== grid.table) selectCell(input);
    const editing = event.target === input;

    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      if (event.key.toLowerCase() === 'c') {
        event.preventDefault();
        event.stopPropagation();
        copySelection();
      } else if (event.key.toLowerCase() === 'a' && !editing) {
        event.preventDefault();
        event.stopPropagation();
        clearHighlight();
        selection.anchor = { row: 0, col: 0 };
        selection.head = { row: grid.rows.length - 1, col: grid.rows[grid.rows.length - 1].length - 1 };
        paint();
      }
      return;
    }
    if (event.altKey) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      navigate(event, input, grid);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      focusCell(input);
    } else if (!editing && event.key === 'F2') {
      event.preventDefault();
      beginEdit(input);
    } else if (!editing && /^\d$/.test(event.key)) {
      event.preventDefault();
      beginEdit(input, event.key);
    } else if (!editing && (event.key === 'Delete' || event.key === 'Backspace')) {
      event.preventDefault();
      applyValues(grid, [['']], true);
    }
  }, true);

  document.addEventListener('copy', event => {
    const input = cellFrom(event.target);
    if (!input) return;
    if (!selection || selection.table !== input.closest('table')) selectCell(input);
    if (!event.clipboardData) return;
    event.clipboardData.setData('text/plain', selectionText());
    event.preventDefault();
  });

  function applyValues(grid, values, fillSelection = false) {
    const area = bounds();
    const fill = fillSelection || (values.length === 1 && values[0].length === 1 &&
      (area.bottom > area.top || area.right > area.left));
    const height = fill ? area.bottom - area.top + 1 : values.length;
    const width = fill ? area.right - area.left + 1 : Math.max(...values.map(row => row.length));
    const changes = [];
    let clipped = false;
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const target = grid.rows[area.top + r]?.[area.left + c];
        if (!target) { clipped = true; continue; }
        const raw = (fill ? values[0][0] : values[r][c] ?? '').trim();
        const isPrice = target.classList.contains('qc-price-input');
        if (raw !== '' && (!/^\d+(?:\.\d+)?$/.test(raw) || (!isPrice && !/^\d+$/.test(raw)))) {
          showToast('粘贴内容须为非负数字；对数须为整数', 'error');
          return;
        }
        if (Number(cellValue(target) || 0) !== Number(raw || 0)) changes.push({ target, value: raw });
      }
    }
    if (!changes.length) return;
    // 先结束当前编辑会话，再把整块粘贴作为一次撤销操作。
    if (document.activeElement?.matches?.(selector)) document.activeElement.blur();
    pushHistory(grid.table.closest('#spreadsheetWrap') ? 'work-edit' : 'quick-calc');
    for (const { target, value } of changes) {
      target.value = value;
      target.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const first = grid.rows[area.top][area.left];
    focusCell(first);
    const last = grid.rows[Math.min(area.top + height - 1, grid.rows.length - 1)]?.[
      Math.min(area.left + width - 1, grid.rows[area.top].length - 1)
    ];
    if (last) selectCell(last, true);
    if (clipped) showToast('已粘贴到表格边界，超出部分未写入', 'info');
  }

  document.addEventListener('paste', event => {
    const input = cellFrom(event.target);
    if (!input || !event.clipboardData) return;
    event.preventDefault();
    if (!selection || selection.table !== input.closest('table')) selectCell(input);
    const grid = selectedGrid();
    if (!grid || !Array.from(event.clipboardData.types || []).includes('text/plain')) return;
    const text = event.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n').replace(/\n$/, '');
    applyValues(grid, text.split('\n').map(line => line.split('\t')));
  });
})();
