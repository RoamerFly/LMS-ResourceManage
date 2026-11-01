const assert=require('node:assert/strict');

module.exports=async({evaluate,call,click,mouse,delay,restartBackend})=>{
  const waitFor=async exp=>{for(let n=0;n<100;n++){if(await evaluate(exp))return;await delay(100);}throw new Error('未就绪：'+exp);};
  const ready=()=>waitFor(`LmsSpreadsheet.getInstance('qcDeptTablesWrap')?.ready&&!document.querySelector('#qcDeptTablesWrap [data-u-comp="workbench-skeleton-shimmer"]')`);
  const rightTab=async id=>{
    const p=await evaluate(`(() => {const el=document.querySelector('#qcDeptTablesWrap [data-u-comp="slide-tab-item"][data-id="${id}"]');el.scrollIntoView({block:'nearest',inline:'nearest'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await mouse('mousePressed',p,{button:'right',buttons:2,clickCount:1});await mouse('mouseReleased',p,{button:'right',buttons:0,clickCount:1});
    await waitFor(`document.querySelector('.sheet-tab-menu button')`);
  };
  const remove=async id=>{
    await rightTab(id);await click('.sheet-tab-menu button');await waitFor(`document.getElementById('qcDeleteSheetConfirm')`);
    assert.ok(await evaluate(`document.getElementById('modalBox').textContent.includes('其他月份')`),'删除确认提示月份范围');
    await click('#qcDeleteSheetConfirm');await waitFor(`!document.getElementById('modalOverlay').classList.contains('show')`);await ready();
  };
  const period=async m=>{await evaluate(`document.getElementById('qcMonth').value='${m}';initQuickCalc()`);await ready();};
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await waitFor(`document.getElementById('loadingOverlay')?.style.display==='none'`);
  await evaluate(`(async()=>{applySetting('minimalMode',true,true);await navigateTo('quickcalc');})()`);await ready();
  await rightTab('dept-1');assert.equal(await evaluate(`document.querySelector('.sheet-tab-menu button').disabled`),true,'主部门表不可删除');
  await rightTab('bank-cards');assert.equal(await evaluate(`document.querySelector('.sheet-tab-menu button').disabled`),true,'银行卡表不可删除');
  await evaluate(`(async()=>{const s=await post('/api/quick-calc-sheets',{year:2026,month:9,name:'临时',dept_id:1});window.deleteTemp=s.sheet.id;await post('/api/quick-calc-sheets/sync',{sheet_id:deleteTemp,source_year:2026,source_month:9,targets:[{year:2026,month:10}]});await post('/api/custom-grid-sheets',{year:2026,month:9,name:'保留数据',rows:10,columns:4});await post('/api/custom-grid-sheets',{year:2026,month:9,name:'待删表',rows:10,columns:4});await initQuickCalc();})()`);await ready();
  const temp='dept-'+await evaluate('deleteTemp');
  await rightTab(temp);await click('.sheet-tab-menu button');await click('#modalBox .btn-secondary');
  assert.equal(await evaluate(`LmsSpreadsheet.getInstance('qcDeptTablesWrap').sheets.has('${temp}')`),true,'取消删除保留工作表');
  const keep=await evaluate(`_qcGridSheets.find(s=>s.name==='保留数据').data.id`),deleted=await evaluate(`_qcGridSheets.find(s=>s.name==='待删表').data.id`);
  await evaluate(`void LmsSpreadsheet.getInstance('qcDeptTablesWrap').book.setActiveSheet('${keep}').getRange(0,0).setValue('保留未刷新数据')`);
  await remove(deleted);
  assert.equal(await evaluate(`LmsSpreadsheet.getInstance('qcDeptTablesWrap').sheets.has('${deleted}')`),false,'删除独立表标签');
  await evaluate(`void LmsSpreadsheet.getInstance('qcDeptTablesWrap').book.setActiveSheet('${keep}')`);
  assert.equal(await evaluate(`LmsSpreadsheet.getInstance('qcDeptTablesWrap').book.getActiveSheet().getRange(0,0).getRawValue()`),'保留未刷新数据','删除其他表保留当前编辑及其他自定义表的最新值');
  await remove(temp);
  assert.equal(await evaluate(`LmsSpreadsheet.getInstance('qcDeptTablesWrap').sheets.has('${temp}')`),false,'删除临时表标签');
  await evaluate('autoSaveQc()');await period(10);assert.equal(await evaluate(`LmsSpreadsheet.getInstance('qcDeptTablesWrap').sheets.has('${temp}')`),true,'已同步月份继续保留此表');
  await period(9);assert.equal(await evaluate(`LmsSpreadsheet.getInstance('qcDeptTablesWrap').sheets.has('${temp}')`),false,'返回删除月份不恢复标签');
  await evaluate('(async()=>{await autoSaveQc();await saveSettings(true);})()');await restartBackend();await call('Page.reload');
  await waitFor(`document.getElementById('loadingOverlay')?.style.display==='none'`);await ready();
  assert.equal(await evaluate(`LmsSpreadsheet.getInstance('qcDeptTablesWrap').sheets.has('${temp}')`),false,'重启不复活已删除表');
  await evaluate(`void LmsSpreadsheet.getInstance('qcDeptTablesWrap').book.setActiveSheet('${keep}')`);
  assert.equal(await evaluate(`LmsSpreadsheet.getInstance('qcDeptTablesWrap').book.getActiveSheet().getRange(0,0).getRawValue()`),'保留未刷新数据','重启后其他表内容完整保留');
  console.log('PASS: 右键标签删除/确认与取消/固定表保护/其他表最新值保留/按月删除/同步月份保留/自动保存及重启不复活');
};
