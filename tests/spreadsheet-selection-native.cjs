// 用真实浏览器鼠标/键盘验证选文冲突。运行：node tests/spreadsheet-selection-native.cjs
// 需要 Node.js 22+ 和 Edge，可通过 EDGE_PATH 指定可执行文件。
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const tempRoot = await fs.realpath(os.tmpdir());
  const profile = await fs.mkdtemp(path.join(tempRoot, 'lms-sheet-native-'));
  const edge = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const url = pathToFileURL(path.join(__dirname, 'spreadsheet-selection.html')).href + '?manual=1';
  const browser = spawn(edge, ['--headless=new', '--disable-gpu', '--no-first-run',
    `--user-data-dir=${profile}`, '--remote-debugging-port=0', url], { windowsHide: true, stdio: 'ignore' });
  let launchError;
  browser.on('error', error => { launchError = error; });
  let socket;
  let call;
  try {
    let port;
    for (let i = 0; i < 100; i++) {
      if (launchError) throw launchError;
      try { port = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; }
      catch { await delay(100); }
    }
    assert.ok(port, 'Edge 调试端口启动');
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const target = targets.find(item => item.type === 'page' && item.url.includes('spreadsheet-selection.html'));
    assert.ok(target, '找到测试页面');
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    let id = 0;
    const pending = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
      else entry.resolve(message.result);
    });
    call = (method, params = {}) => new Promise((resolve, reject) => {
      const requestId = ++id;
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`超时：${method}`)); }, 5000);
      pending.set(requestId, { resolve, reject, timer });
      socket.send(JSON.stringify({ id: requestId, method, params }));
    });
    const evaluate = async expression => {
      const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    for (let i = 0; i < 50; i++) {
      if (await evaluate('document.readyState === "complete"')) break;
      await delay(100);
    }
    const point = selector => evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      el.scrollIntoView({block:'nearest'});
      const r = el.getBoundingClientRect();
      return {x:r.x+r.width/2,y:r.y+r.height/2};
    })()`);
    const mouse = (type, at, extra = {}) => call('Input.dispatchMouseEvent', { type, ...at, ...extra });
    const click = async (selector, count = 1) => {
      const at = await point(selector);
      for (let n = 1; n <= count; n++) {
        await mouse('mousePressed', at, { button: 'left', buttons: 1, clickCount: n });
        await mouse('mouseReleased', at, { button: 'left', buttons: 0, clickCount: n });
      }
    };
    const drag = async (from, to) => {
      const first = await point(from);
      const last = await point(to);
      await mouse('mousePressed', first, { button: 'left', buttons: 1, clickCount: 1 });
      for (let i = 1; i <= 12; i++) {
        await mouse('mouseMoved', { x: first.x + (last.x-first.x)*i/12,
          y: first.y + (last.y-first.y)*i/12 }, { button: 'left', buttons: 1 });
      }
      await mouse('mouseReleased', last, { button: 'left', buttons: 0, clickCount: 1 });
    };
    const key = async (name, code, modifiers = 0) => {
      await call('Input.dispatchKeyEvent', { type: 'keyDown', key: name, windowsVirtualKeyCode: code, modifiers });
      await call('Input.dispatchKeyEvent', { type: 'keyUp', key: name, windowsVirtualKeyCode: code, modifiers });
    };
    const noNativeSelection = async label => assert.equal(await evaluate('getSelection().toString()'), '', label);
    const first = '#spreadsheetWrap input[data-row="r1"][data-emp="1"]';
    const last = '#spreadsheetWrap input[data-row="r2"][data-emp="2"]';

    await click('#sheetHeader', 2);
    await noNativeSelection('双击表头不选中文字');
    await click('#readonlyCell', 3);
    await noNativeSelection('三击只读格不选中文字');
    await drag(first, last);
    await noNativeSelection('跨格拖选不产生原生文字选区');
    assert.equal(await evaluate('document.querySelectorAll("#spreadsheetWrap .sheet-selected").length'), 4,
      '真实鼠标拖选四个单元格');
    await drag(first, '#outsideText');
    await noNativeSelection('拖动离开表格也不选中文字');
    assert.equal(await evaluate('document.body.classList.contains("sheet-range-dragging")'), false, '松开鼠标解除拖选锁');
    await click(first);
    assert.equal(await evaluate('document.activeElement.tagName'), 'TD', '单击聚焦单元格');
    await key('ArrowRight', 39);
    await key('ArrowDown', 40, 8);
    assert.equal(await evaluate('document.querySelectorAll("#spreadsheetWrap .sheet-selected").length'), 2, '真实 Shift+方向键扩选');
    await click(first, 2);
    assert.equal(await evaluate('document.activeElement.matches("input.sheet-editing")'), true, '双击进入编辑');
    await click(first);
    assert.equal(await evaluate('document.activeElement.matches("input.sheet-editing")'), true, '编辑时点击保留光标');
    await key('ArrowRight', 39);
    assert.equal(await evaluate('document.activeElement.tagName'), 'TD', '编辑状态方向键提交并移格');
    assert.equal(await evaluate('document.querySelectorAll("input.sheet-editing").length'), 0, '移格后解除编辑标记');
    await click('#outsideText', 2);
    assert.ok(await evaluate('getSelection().toString().length > 0'), '表格外正常选中文字');
    const quickFirst = '#qcDeptTablesWrap input.qc-price-input';
    const quickLast = '#qcDeptTablesWrap tr:last-child input.qc-qty-input';
    await drag(quickFirst, quickLast);
    await noNativeSelection('快捷计算拖选不选中文字');
    assert.equal(await evaluate('document.querySelectorAll("#qcDeptTablesWrap .sheet-selected").length'), 4, '快捷计算真实拖选');
    console.log('PASS: 真实鼠标双击/三击、跨格拖选、越界拖选、键盘扩选、编辑与表格外选文');
  } finally {
    if (call && socket?.readyState === WebSocket.OPEN) {
      await call('Browser.close').catch(() => {});
      socket.close();
    }
    if (browser.exitCode === null && !launchError) {
      await Promise.race([new Promise(resolve => browser.once('exit', resolve)), delay(2000)]);
      if (browser.exitCode === null) browser.kill();
    }
    // 仅清理本次在系统临时目录下创建的浏览器配置目录。
    const resolved = await fs.realpath(profile);
    const relative = path.relative(tempRoot, resolved);
    assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative) &&
      path.basename(resolved).startsWith('lms-sheet-native-'), '临时目录清理范围检查');
    await fs.rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(error => {
      console.warn(`浏览器临时目录保留：${resolved} (${error.code})`);
    });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
