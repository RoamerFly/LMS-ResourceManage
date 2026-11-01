const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const sample=require('./fixtures/qc-payroll-sample.json');

module.exports=async({evaluate,call,click,key,delay,restartBackend})=>{
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  const waitFor=async expression=>{for(let n=0;n<100;n++){if(await evaluate(expression))return;await delay(100);}throw new Error(`未就绪：${expression}`);};
  const ready=()=>waitFor(`LmsSpreadsheet.getInstance('qcDeptTablesWrap')?.ready&&!document.querySelector('#qcDeptTablesWrap [data-u-comp="workbench-skeleton-shimmer"]')`);
  const activate=id=>evaluate(`void LmsSpreadsheet.getInstance('qcDeptTablesWrap').book.setActiveSheet('${id}')`);
  const raw=(row,col)=>evaluate(`LmsSpreadsheet.getInstance('qcDeptTablesWrap').book.getActiveSheet().getRange(${row},${col}).getRawValue() ?? ''`);
  const period=async(year,month)=>{await evaluate(`document.getElementById('qcYear').value='${year}';document.getElementById('qcMonth').value='${month}';initQuickCalc()`);await ready();};
  await waitFor(`document.getElementById('loadingOverlay')?.style.display==='none'`);
  await evaluate(`(async()=>{applySetting('minimalMode',true,true);await navigateTo('quickcalc');})()`);await ready();
  assert.equal(await evaluate(`wageAmount(1,1.005)`),1.01,'十进制半分边界');
  assert.equal(await evaluate(`wageAmount(1,2.675)`),2.68,'二进制敏感边界');
  assert.equal(await evaluate(`roundNumber(-1.005)`),-1.01,'负数对称四舍五入');
  assert.equal(await evaluate(`wageAmount(3,1e-3)`),0,'科学记数法精确处理');
  await evaluate(`(() => {const i=LmsSpreadsheet.getInstance('qcDeptTablesWrap'),s=i.book.getActiveSheet(),m=i.sheets.get('dept-1');window.samplePrice=[...m.cells.values()].find(c=>c.row===0&&c.td.dataset.priceId==='1').col;window.sampleOtherPrice=[...m.cells.values()].find(c=>c.row===0&&c.td.dataset.priceId==='2').col;window.sampleQty=[...m.cells.values()].find(c=>c.row===0&&c.td.dataset.empId==='1').col;const data=${JSON.stringify(sample)};const patches={};data.forEach(([a,b,q],r)=>patches[r+1]={[samplePrice]:{v:a},[sampleOtherPrice]:{v:b},[sampleQty]:{v:q}});i.api.syncExecuteCommand('sheet.mutation.set-range-values',{unitId:i.book.getId(),subUnitId:'dept-1',cellValue:patches});})()`);
  assert.equal(await evaluate(`document.getElementById('qcGrandTotal').textContent`),'¥10194.60','用户26行样例前端合计');
  await evaluate('autoSaveQc()');
  assert.equal(await evaluate(`get('/api/qc-salary-summary?year=2026&month=9').then(d=>d[0].employees.find(e=>e.emp_id===1).wage)`),10194.60,'样例后端总工资与前端一致');
  await evaluate('qcToggleViewMode()');await ready();
  assert.equal(await raw(1,6),317.2,'工资视角单格工资');
  await evaluate('qcToggleViewMode()');await ready();
  console.log('PASS: 样例7471对/10194.60元/十进制半分边界/前后端工资一致/工资视角');
};
