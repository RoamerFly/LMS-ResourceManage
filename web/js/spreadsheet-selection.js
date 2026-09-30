// 做货编辑和快捷计算共用的可编辑单元格区域选择与剪贴板操作。
(() => {
  const selector = '#spreadsheetWrap input[data-emp], #qcDeptTablesWrap input.qc-price-input, #qcDeptTablesWrap input.qc-qty-input';
  let selection = null;
  let dragging = false;
  let keepSelectionOnFocus = false;

  function cellFrom(target) {
    if (!(target instanceof Element)) return null;
    return target.closest(selector) || target.closest('td')?.querySelector(selector) || null;
  }

  function gridFor(input) {
    const table = input?.closest('table.spreadsheet');
    if (!table) return null;
    const rows = Array.from(table.querySelectorAll('tbody tr[data-row-key]'))
      .map(tr => Array.from(tr.querySelectorAll(selector)));
    const row = rows.findIndex(cells => cells.includes(input));
    if (row < 0) return null;
    return { table, rows, row, col: rows[row].indexOf(input) };
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
    const input = cellFrom(event.target);
    if (input && !keepSelectionOnFocus) selectCell(input);
  });

  document.addEventListener('mousedown', event => {
    if (event.button !== 0) return;
    const input = cellFrom(event.target);
    if (!input) {
      dragging = false;
      return;
    }
    event.preventDefault();
    const extend = event.shiftKey && selection?.table === input.closest('table');
    selectCell(input, extend);
    keepSelectionOnFocus = true;
    input.focus();
    input.select();
    keepSelectionOnFocus = false;
    dragging = true;
  });

  document.addEventListener('mouseover', event => {
    if (!dragging || !(event.buttons & 1)) return;
    const input = cellFrom(event.target);
    if (input && input.closest('table') === selection?.table) selectCell(input, true);
  });
  document.addEventListener('mouseup', () => { dragging = false; });

  document.addEventListener('keydown', event => {
    const input = cellFrom(event.target);
    if (!input || event.altKey || event.ctrlKey || event.metaKey) return;
    const directions = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const delta = directions[event.key];
    if (!delta) return;
    const grid = gridFor(input);
    if (!grid) return;
    event.preventDefault();
    const point = event.shiftKey && selection?.table === grid.table ? selection.head : grid;
    const row = Math.max(0, Math.min(grid.rows.length - 1, point.row + delta[0]));
    const col = Math.max(0, Math.min(grid.rows[row].length - 1, point.col + delta[1]));
    const next = grid.rows[row][col];
    if (!next) return;
    if (!selection || selection.table !== grid.table) selectCell(input);
    if (event.shiftKey) {
      selectCell(next, true);
    } else {
      keepSelectionOnFocus = true;
      next.focus();
      next.select();
      keepSelectionOnFocus = false;
      selectCell(next);
    }
    next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });

  document.addEventListener('copy', event => {
    const input = cellFrom(event.target);
    if (!input) return;
    if (!selection || selection.table !== input.closest('table')) selectCell(input);
    const grid = selectedGrid();
    if (!grid || !event.clipboardData) return;
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
    event.clipboardData.setData('text/plain', lines.join('\r\n'));
    event.preventDefault();
  });

  document.addEventListener('paste', event => {
    const input = cellFrom(event.target);
    if (!input || !event.clipboardData) return;
    event.preventDefault();
    if (!selection || selection.table !== input.closest('table')) selectCell(input);
    const grid = selectedGrid();
    if (!grid) return;
    if (!Array.from(event.clipboardData.types || []).includes('text/plain')) return;
    const text = event.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n').replace(/\n$/, '');
    const values = text.split('\n').map(line => line.split('\t'));

    const area = bounds();
    const fill = values.length === 1 && values[0].length === 1 &&
      (area.bottom > area.top || area.right > area.left);
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
    input.blur();
    pushHistory(grid.table.closest('#spreadsheetWrap') ? 'work-edit' : 'quick-calc');
    for (const { target, value } of changes) {
      target.value = value;
      target.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const first = grid.rows[area.top][area.left];
    keepSelectionOnFocus = true;
    first.focus();
    keepSelectionOnFocus = false;
    selectCell(first);
    const last = grid.rows[Math.min(area.top + height - 1, grid.rows.length - 1)]?.[
      Math.min(area.left + width - 1, grid.rows[area.top].length - 1)
    ];
    if (last) selectCell(last, true);
    if (clipped) showToast('已粘贴到表格边界，超出部分未写入', 'info');
  });
})();
