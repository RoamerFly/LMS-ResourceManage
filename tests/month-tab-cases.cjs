const assert=require('node:assert/strict');

module.exports=async({evaluate,call,delay})=>{
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  const wait=async exp=>{for(let n=0;n<100;n++){if(await evaluate(exp))return;await delay(100);}throw new Error('未就绪：'+exp);};
  const ready=()=>wait(`LmsSpreadsheet.getInstance('qcDeptTablesWrap')?.ready&&!document.querySelector('#qcDeptTablesWrap [data-u-comp="workbench-skeleton-shimmer"]')`);
  const active=()=>evaluate(`LmsSpreadsheet.getInstance('qcDeptTablesWrap').book.getActiveSheet().getSheetId()`);
  const activate=id=>evaluate(`void LmsSpreadsheet.getInstance('qcDeptTablesWrap').book.setActiveSheet('${id}')`);
  const period=async(year,month)=>{
    await evaluate(`document.getElementById('qcYear').value='${year}';document.getElementById('qcMonth').value='${month}';document.getElementById('qcMonth').dispatchEvent(new Event('change'))`);
    await wait(`_qcLoadedPeriod?.year===${year}&&_qcLoadedPeriod?.month===${month}`);await ready();
  };
  await wait(`document.getElementById('loadingOverlay')?.style.display==='none'`);
  await evaluate(`(async()=>{applySetting('minimalMode',true,true);await navigateTo('quickcalc');})()`);await ready();
  await activate('dept-2');await period(2026,10);assert.equal(await active(),'dept-2','主部门表切月保持当前标签');
  await activate('bank-cards');
  await evaluate(`void LmsSpreadsheet.getInstance('qcDeptTablesWrap').book.getActiveSheet().getRange(1,3).setValue(123.45)`);
  await period(2026,11);assert.equal(await active(),'bank-cards','银行卡切月保持当前标签');
  assert.equal(await evaluate(`LmsSpreadsheet.getInstance('qcDeptTablesWrap').book.getActiveSheet().getRange(1,3).getRawValue()??''`),'','标签保留但金额仍按月份加载');
  await evaluate(`document.getElementById('qcYear').value='2027';document.getElementById('qcYear').dispatchEvent(new Event('change'))`);
  await wait(`_qcLoadedPeriod?.year===2027`);await ready();assert.equal(await active(),'bank-cards','切年保持当前标签');
  await period(2026,10);assert.equal(await active(),'bank-cards');
  assert.equal(await evaluate(`LmsSpreadsheet.getInstance('qcDeptTablesWrap').book.getActiveSheet().getRange(1,3).getRawValue()`),123.45,'回到原月份显示原金额');
  await period(2026,9);
  await evaluate(`(async()=>{
    const t=await post('/api/quick-calc-sheets',{year:2026,month:9,name:'临时定位',dept_id:1});window.monthTemp='dept-'+t.sheet.id;
    await post('/api/quick-calc-sheets/sync',{sheet_id:t.sheet.id,source_year:2026,source_month:9,targets:[{year:2026,month:10}]});
    const g=await post('/api/custom-grid-sheets',{year:2026,month:9,name:'自定义定位',rows:5,columns:3});window.monthGrid=g.sheet.data.id;
    await post('/api/custom-grid-sheets/sync',{sheet_id:g.sheet.id,source_year:2026,source_month:9,targets:[{year:2026,month:10}]});await initQuickCalc();
  })()`);await ready();
  const temp=await evaluate('monthTemp'),grid=await evaluate('monthGrid');
  await activate(temp);await period(2026,10);assert.equal(await active(),temp,'部门临时表按稳定ID保持标签');
  await period(2026,9);await activate(grid);await period(2026,10);assert.equal(await active(),grid,'独立自定义表保持标签');
  await period(2026,11);assert.equal(await active(),'dept-1','目标月份没有该表时安全回到默认表');
  await period(2026,9);await activate('bank-cards');
  await evaluate(`document.getElementById('qcMonth').value='10';document.getElementById('qcMonth').dispatchEvent(new Event('change'));document.getElementById('qcMonth').value='11';document.getElementById('qcMonth').dispatchEvent(new Event('change'))`);
  await wait(`_qcLoadedPeriod?.month===11`);await ready();assert.equal(await active(),'bank-cards','快速切换最终月份仍保持标签');
  console.log('PASS: 主部门/银行卡/临时表/独立自定义表保持标签/切年/快速切月/缺失表回退/月度金额独立');
};
