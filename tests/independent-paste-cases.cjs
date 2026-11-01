const assert=require('node:assert/strict');

module.exports=async({evaluate,call,click,key,delay,restartBackend})=>{
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await call('Browser.grantPermissions',{permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
  const wait=async exp=>{for(let n=0;n<150;n++){if(await evaluate(exp))return;await delay(100);}throw new Error('未就绪：'+exp);};
  const ready=()=>wait(`LmsSpreadsheet.getInstance('qcDeptTablesWrap')?.ready&&!document.querySelector('#qcDeptTablesWrap [data-u-comp="workbench-skeleton-shimmer"]')`);
  const activate=async id=>{await evaluate(`void LmsSpreadsheet.getInstance('qcDeptTablesWrap').book.setActiveSheet('${id}')`);await delay(100);};
  const raw=(r,c)=>evaluate(`LmsSpreadsheet.getInstance('qcDeptTablesWrap').book.getActiveSheet().getRange(${r},${c}).getRawValue()??''`);
  const count=()=>evaluate(`LmsSpreadsheet.getInstance('qcDeptTablesWrap').book.getActiveSheet().getMaxRows()`);
  const set=(r,c,value)=>evaluate(`void LmsSpreadsheet.getInstance('qcDeptTablesWrap').book.getActiveSheet().getRange(${r},${c}).setValue(${JSON.stringify(value)})`);
  const period=async(m,id='bank-cards')=>{await evaluate(`(async()=>{await LmsSpreadsheet.flush('quick-calc');await autoSaveQc();document.getElementById('qcMonth').value='${m}';await initQuickCalc();})()`);await ready();await activate(id);};
  const paste=async(r,c,values,html=false)=>{
    const text=values.map(row=>row.join('\t')).join('\n');
    await evaluate(`void LmsSpreadsheet.getInstance('qcDeptTablesWrap').book.getActiveSheet().setActiveRange(LmsSpreadsheet.getInstance('qcDeptTablesWrap').book.getActiveSheet().getRange(${r},${c}))`);
    if(html){
      const table='<table>'+values.map(row=>'<tr>'+row.map(v=>`<td style="font-size:30pt;background-color:#ff0000">${v}</td>`).join('')+'</tr>').join('')+'</table>';
      await evaluate(`navigator.clipboard.write([new ClipboardItem({'text/plain':new Blob([${JSON.stringify(text)}],{type:'text/plain'}),'text/html':new Blob([${JSON.stringify(table)}],{type:'text/html'})})])`);
    }else await evaluate(`navigator.clipboard.writeText(${JSON.stringify(text)})`);
    await key('v',86,2);await delay(500);
    await wait(`!LmsSpreadsheet.getInstance('qcDeptTablesWrap').independentPaste`);
  };
  await wait(`document.getElementById('loadingOverlay')?.style.display==='none'`);
  await evaluate(`(async()=>{applySetting('minimalMode',true,true);await navigateTo('quickcalc');})()`);await ready();await activate('bank-cards');
  const original=await count(),start=original-2,rows=500;
  await period(10);await set(start,3,222);await period(9);
  const style=await evaluate(`LmsSpreadsheet.getInstance('qcDeptTablesWrap').book.getActiveSheet().getRange(${start},2).getCellStyleData()`);
  const values=Array.from({length:rows},(_,n)=>[n===20?'':`粘贴人员${n}`,n===20?'':n===0?0:n+.25]);
  await paste(start,2,values,true);
  assert.equal(await count(),start+rows,'HTML批量粘贴按实际末行扩展');
  assert.equal(await raw(start+rows-1,2),'粘贴人员499','末行未截断');
  assert.equal(await raw(start,3),0,'0值保持在当前月份');
  assert.equal(await raw(start+20,2),'','中间空白行保留');
  assert.deepEqual(await evaluate(`LmsSpreadsheet.getInstance('qcDeptTablesWrap').book.getActiveSheet().getRange(${start+rows-1},2).getCellStyleData()`),style,'扩展新行仍用银行卡模板样式');
  const ids=await evaluate(`Object.values(LmsSpreadsheet.captureGridStates(true)['bank-cards'].rowData).map(r=>r.custom?.lmsRowId)`);
  assert.equal(new Set(ids).size,start+rows,'批量扩展每行身份唯一');
  await key('z',90,2);await ready();await activate('bank-cards');assert.equal(await count(),original,'一次撤销同时还原粘贴与扩展');
  await key('y',89,2);await ready();await activate('bank-cards');assert.equal(await count(),start+rows);assert.equal(await raw(start+499,2),'粘贴人员499','一次重做恢复完整内容');
  await period(10);assert.equal(await count(),start+rows);assert.equal(await raw(start+499,2),'粘贴人员499');assert.equal(await raw(start,3),222,'保留其他月份已有金额');assert.equal(await raw(start+499,3),'','新增行其他月份金额为空');
  await set(start+499,3,333);await period(11);assert.equal(await raw(start+499,2),'粘贴人员499');assert.equal(await raw(start+499,3),'','未来月份金额为空');
  await period(9);assert.equal(await raw(start+499,3),499.25,'来源月份金额仍保存');
  assert.ok(await evaluate(`fetch('/api/bank-sheet/export?year=2026&month=9').then(r=>r.ok)`),'自动扩展行可导出XLS');
  // 第二次使用纯文本粘贴，继续从已有末行扩展。
  await paste(start+rows-1,2,[['再次粘贴',5],['新末行',6]]);
  assert.equal(await count(),start+rows+1);assert.equal(await raw(start+rows,2),'新末行');
  await click('.lms-add-sheet-tab');await evaluate(`document.getElementById('qcNewSheetType').value='grid';document.getElementById('qcNewSheetType').dispatchEvent(new Event('change'));document.getElementById('qcNewSheetName').value='粘贴自定义表';document.getElementById('qcNewGridRows').value='4';`);await click('#qcCreateSheetBtn');
  await wait(`_qcGridSheets.length===1`);await ready();const grid=await evaluate('_qcGridSheets[0].data.id'),sid=await evaluate('_qcGridSheets[0].id');await activate(grid);
  assert.equal(await count(),4);
  await evaluate(`(async()=>{await post('/api/custom-grid-sheets/blank-columns',{sheet_key:'${grid}',columns:[1]});await post('/api/custom-grid-sheets/sync',{sheet_id:${sid},source_year:2026,source_month:9,targets:[{year:2026,month:10},{year:2026,month:11}]});})()`);
  await period(10,grid);await set(3,1,200);await period(9,grid);
  const data=Array.from({length:rows},(_,n)=>[`资料${n}`,n]);await paste(3,0,data);
  assert.equal(await count(),503);assert.equal(await raw(502,0),'资料499');assert.equal(await raw(502,1),499);
  await key('z',90,2);await ready();await activate(grid);assert.equal(await count(),4,'自定义表粘贴一次撤销扩展');
  await key('y',89,2);await ready();await activate(grid);assert.equal(await count(),503);
  await period(10,grid);assert.equal(await raw(502,0),'资料499');assert.equal(await raw(3,1),200);assert.equal(await raw(502,1),'');
  await set(502,1,999);await period(11,grid);assert.equal(await count(),503);assert.equal(await raw(502,1),'');
  await period(9,grid);assert.equal(await raw(502,1),499);
  // 超限整次取消，不允许只写入部分内容或破坏已有行结构。
  await paste(502,0,Array.from({length:4500},()=>['超限']));assert.equal(await count(),503);assert.equal(await raw(502,0),'资料499');
  await evaluate('(async()=>{await autoSaveQc();await saveSettings(true);})()');await restartBackend();await call('Page.reload');await wait(`document.getElementById('loadingOverlay')?.style.display==='none'`);await ready();await period(10,grid);
  assert.equal(await count(),503);assert.equal(await raw(502,1),999,'重启保留自动扩展结构与月度值');await activate('bank-cards');assert.equal(await raw(start+499,3),333);assert.equal(await raw(start+rows,2),'新末行');
  const beforeHeader=await count(),header=await raw(0,2);
  await paste(0,2,Array.from({length:beforeHeader+2},(_,n)=>['带表头'+n,n]));
  assert.equal(await count(),beforeHeader+2,'从表头粘贴也可扩展');assert.equal(await raw(0,2),header,'原表头保持只读');assert.equal(await raw(beforeHeader+1,2),'带表头'+(beforeHeader+1));
  await key('z',90,2);await ready();await activate('bank-cards');assert.equal(await count(),beforeHeader,'从表头粘贴整次撤销');
  console.log('PASS: 银行卡HTML500行/文本粘贴自动扩展/样式/空白与0/自定义表500行/跨月共享/置空列独立/一次撤销重做/超限整次取消/重启/XLS导出');
};
