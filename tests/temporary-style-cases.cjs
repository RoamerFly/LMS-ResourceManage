const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');

module.exports=async({evaluate,call,click,delay,restartBackend})=>{
  const waitFor=async exp=>{for(let n=0;n<100;n++){if(await evaluate(exp))return;await delay(100);}throw new Error('未就绪：'+exp);};
  const ready=()=>waitFor(`LmsSpreadsheet.getInstance('qcDeptTablesWrap')?.ready&&!document.querySelector('#qcDeptTablesWrap [data-u-comp="workbench-skeleton-shimmer"]')`);
  const styles=(id,row,col)=>evaluate(`LmsSpreadsheet.getInstance('qcDeptTablesWrap').book.getSheetBySheetId('${id}').getRange(${row},${col}).getCellStyleData()`);
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await waitFor(`document.getElementById('loadingOverlay')?.style.display==='none'`);
  await evaluate(`(async()=>{applySetting('minimalMode',true,true);await navigateTo('quickcalc');await post('/api/employees',{name:'临时样式人员',gender:'女',dept_id:1,sub_dept_id:1,is_temporary:true});await initQuickCalc();})()`);await ready();
  const price=await evaluate(`[...LmsSpreadsheet.getInstance('qcDeptTablesWrap').sheets.get('dept-1').cells.values()].find(c=>c.row===0&&c.td.dataset.priceId==='1').col`);
  await evaluate(`(() => {const i=LmsSpreadsheet.getInstance('qcDeptTablesWrap'),s=i.book.getActiveSheet();s.getRange(1,${price}).setValue(1.3);s.getRange(1,0).setValue('000123');s.getRange(1,1).setValue(50);const header={...s.getRange(0,${price}).getCellStyleData(),ff:'Arial',fs:18,bl:1,it:1,ht:3,bg:{rgb:'#dfeaff'},bd:{b:{s:2,cl:{rgb:'#123456'}}}};const body={...s.getRange(1,${price}).getCellStyleData(),ff:'Arial',fs:16,bl:1,n:{pattern:'#,##0.0000'}};i.api.syncExecuteCommand('sheet.mutation.set-range-values',{unitId:i.book.getId(),subUnitId:'dept-1',cellValue:{0:{[${price}]:{s:header}},1:{[${price}]:{s:body}}}});s.setColumnWidth(${price},144);s.setColumnWidth(6,160);s.setRowHeightsForced(0,1,46);s.setRowHeightsForced(1,1,48);})()`);
  await click('.lms-add-sheet-tab');await evaluate(`document.getElementById('qcNewSheetName').value='样式临时表';document.getElementById('qcNewSheetDept').value='1'`);await click('#qcCreateSheetBtn');
  await waitFor(`_qcCustomSheets.length===1`);await ready();
  const id='dept-'+await evaluate(`_qcCustomSheets[0].id`);
  for (const row of [0,1]) for (const col of [0,1,2,price,6])
    assert.deepEqual(await styles(id,row,col),await styles('dept-1',row,col),`新增临时表完整样式与主表一致 ${row},${col}`);
  assert.deepEqual(await evaluate(`(() => {const b=LmsSpreadsheet.getInstance('qcDeptTablesWrap').book,a=b.getSheetBySheetId('dept-1'),t=b.getSheetBySheetId('${id}');return [a.getColumnWidth(${price}),t.getColumnWidth(${price}),a.getColumnWidth(6),t.getColumnWidth(6),a.getRowHeight(0),t.getRowHeight(0),a.getRowHeight(1),t.getRowHeight(1)];})()`),[144,144,160,160,46,46,48,48],'行高和列宽继承主表');
  await evaluate(`(() => {const b=LmsSpreadsheet.getInstance('qcDeptTablesWrap').book,s=b.setActiveSheet('dept-1');s.getRange(0,${price}).setFontFamily('Courier New').setFontSize(19);s.setColumnWidth(${price},188);s.setRowHeightsForced(0,1,60);s.zoom(1.2);})()`);await delay(150);
  assert.deepEqual(await styles(id,0,price),await styles('dept-1',0,price),'主表字体实时同步');
  assert.equal(await evaluate(`LmsSpreadsheet.getInstance('qcDeptTablesWrap').book.getSheetBySheetId('${id}').getColumnWidth(${price})`),188,'主表列宽实时同步');
  assert.equal(await evaluate(`LmsSpreadsheet.getInstance('qcDeptTablesWrap').book.getSheetBySheetId('${id}').getRowHeight(0)`),60,'主表行高实时同步');
  assert.equal(await evaluate(`LmsSpreadsheet.getInstance('qcDeptTablesWrap').book.getSheetBySheetId('${id}').getZoom()`),1.2,'显示缩放与主表一致');
  await evaluate(`void LmsSpreadsheet.getInstance('qcDeptTablesWrap').book.setActiveSheet('${id}').getRange(1,6).setValue(7)`);await delay(100);
  assert.deepEqual(await styles(id,1,6),await styles('dept-1',1,6),'录入对数后人员列保留主表样式');
  assert.equal(await evaluate(`LmsSpreadsheet.getInstance('qcDeptTablesWrap').book.getActiveSheet().getRange(1,6).getRawValue()`),7,'样式同步不覆盖临时人员对数');
  await evaluate(`(async()=>{await qcToggleViewMode();LmsSpreadsheet.getInstance('qcDeptTablesWrap').book.setActiveSheet('${id}');})()`);await ready();
  assert.deepEqual(await styles(id,1,6),await styles('dept-1',1,6),'工资视角人员列样式与主表一致');
  assert.equal(await evaluate(`LmsSpreadsheet.getInstance('qcDeptTablesWrap').book.getActiveSheet().getRange(1,6).getRawValue()`),9.1,'工资视角保留准确计算');
  await evaluate(`(async()=>{await qcToggleViewMode();await autoSaveQc();await saveSettings(true);})()`);await ready();await restartBackend();await call('Page.reload');
  await waitFor(`document.getElementById('loadingOverlay')?.style.display==='none'`);await ready();
  for (const row of [0,1]) for (const col of [0,1,2,price,6])
    assert.deepEqual(await styles(id,row,col),await styles('dept-1',row,col),`重启后仍继承主表样式 ${row},${col}`);
  await evaluate(`void LmsSpreadsheet.getInstance('qcDeptTablesWrap').book.setActiveSheet('${id}')`);await delay(120);
  const shot=await call('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(os.tmpdir(),'lms-temporary-inherited-style.png'),Buffer.from(shot.data,'base64'));
  console.log('PASS: 临时表字体/字号/粗斜体/颜色/边框/对齐/数字格式/行高列宽/实时同步与缩放/录入及工资计算/重启继承');
};
