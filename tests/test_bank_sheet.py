"""原 XLS 的默认值、月份规则、单元格格式与全部文档流保持测试。"""
import io
import json
import shutil
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
import olefile
import xlrd
from services import db,crud,bank_sheet,independent_sheet
import copy


class BankSheetTests(unittest.TestCase):
    def setUp(self):
        template=Path(__file__).parents[1]/'resources/bank-card-template.xls'
        self.temp=tempfile.TemporaryDirectory(prefix='lms-bank-test-')
        self.old_db,self.old_base=db.DB_PATH,bank_sheet.get_base_dir
        db.DB_PATH=str(Path(self.temp.name)/'data.db')
        bank_sheet.get_base_dir=lambda:self.temp.name
        shutil.copyfile(template,Path(self.temp.name)/'bank-card-template.xls')
        db.init_database()
        self.original=template.read_bytes()

    def tearDown(self):
        db.DB_PATH,bank_sheet.get_base_dir=self.old_db,self.old_base
        self.temp.cleanup()

    def test_default_blank_rules_and_month_snapshots(self):
        september=bank_sheet.load_sheet(2026,9)
        self.assertTrue(all(v=='' for k,v in september['cells'].items() if k.endswith(',3')))
        old_name=september['cells']['1,2']
        bank_sheet.set_blank_columns([2,3,8])
        self.assertEqual(bank_sheet.load_sheet(2026,9)['cells']['1,2'],old_name)
        self.assertEqual(bank_sheet.load_sheet(2026,10)['cells']['1,2'],'')
        september['cells']['1,3']=123.45
        crud.save_quick_calc(2026,9,{}, {},bank_cells=september['cells'])
        self.assertEqual(bank_sheet.load_sheet(2026,9)['cells']['1,3'],123.45)
        self.assertEqual(bank_sheet.load_sheet(2026,10)['cells']['1,3'],'')

    def test_export_preserves_biff_styles_and_other_streams(self):
        state=bank_sheet.load_sheet(2026,9)
        state['cells']['1,1']='0001234567890123456789'
        state['cells']['1,2']='测试户名😀'
        state['cells']['1,3']=123.45
        crud.save_quick_calc(2026,9,{}, {},bank_cells=state['cells'])
        output=bank_sheet.export_sheet(2026,9)
        book=xlrd.open_workbook(file_contents=output,formatting_info=True)
        original=xlrd.open_workbook(file_contents=self.original,formatting_info=True)
        sheet=book.sheet_by_index(0);source=original.sheet_by_index(0)
        self.assertEqual(sheet.cell_value(1,1),'0001234567890123456789')
        self.assertEqual(sheet.cell_value(1,2),'测试户名😀')
        self.assertEqual(sheet.cell_value(1,3),123.45)
        self.assertEqual(sheet.cell_value(2,3),'')
        self.assertEqual((sheet.nrows,sheet.ncols),(source.nrows,source.ncols))
        for r in range(source.nrows):
            for c in range(source.ncols):
                self.assertEqual(sheet.cell_xf_index(r,c),source.cell_xf_index(r,c))
        with olefile.OleFileIO(io.BytesIO(self.original)) as before,olefile.OleFileIO(io.BytesIO(output)) as after:
            self.assertEqual(before.listdir(),after.listdir())
            for name in before.listdir():
                if name!=['Workbook']:
                    self.assertEqual(before.openstream(name).read(),after.openstream(name).read())
            # 字体、XF、调色板、数字格式、行高、列宽、合并、打印和页面布局的记录逐字节相同。
            style_codes={0x0031,0x00e0,0x0092,0x041e,0x0208,0x007d,0x00e5,0x00a1,0x0026,0x0027,0x0028,0x0029,0x0083,0x0084}
            extract=lambda value:[(code,body) for code,body in bank_sheet._records(value) if code in style_codes]
            self.assertEqual(extract(before.openstream('Workbook').read()),extract(after.openstream('Workbook').read()))

    def test_table_is_independent_and_validates_bounds(self):
        with self.assertRaises(ValueError):bank_sheet.validate_cells({'0,0':'修改表头'})
        with self.assertRaises(ValueError):bank_sheet.validate_cells({'9999,3':1})
        with self.assertRaises(ValueError):bank_sheet.set_blank_columns([-1])
        grid=crud.create_custom_grid(2026,9,'工资表',10,5)['sheet']
        state=grid['data'];state['cellData']={'0':{'0':{'v':'独立数据','t':1}}}
        crud.save_quick_calc(2026,9,{}, {},grid_states={state['id']:state})
        crud.sync_custom_grid(grid['id'],2026,9,[{'year':2026,'month':10}])
        self.assertEqual(crud.get_custom_grid_sheets(2026,9)[0]['data']['cellData']['0']['0']['v'],'独立数据')
        self.assertEqual(crud.get_custom_grid_sheets(2026,10)[0]['data']['cellData']['0']['0']['v'],'独立数据')
        self.assertEqual(crud.get_qc_salary_summary(2026,9),[])

    def test_insert_row_shared_structure_monthly_amounts_and_export(self):
        sep=bank_sheet.load_sheet(2026,9)
        oct=bank_sheet.load_sheet(2026,10)
        sep['cells']['2,3']=101.11
        crud.save_quick_calc(2026,9,{}, {},bank_cells=sep['cells'])
        oct['cells']['2,3']=202.22
        crud.save_quick_calc(2026,10,{}, {},bank_cells=oct['cells'])
        # 模拟升级前只有 cells 的历史月份，验证迁移不会串行。
        with closing(db.get_connection()) as conn,conn:
            conn.execute('DELETE FROM independent_bank_periods WHERE year=2026 AND month=10')
        data=bank_sheet.load_sheet(2026,9)['data']
        # 在第2行之前插入一行，模拟引擎移动原行的 metadata。
        for field in ('cellData','rowData'):
            data[field]={str(int(r)+(int(r)>=2)):v for r,v in data[field].items()}
        data['rowCount']+=1
        data['rowData']['2']={'custom':{'lmsRowId':'new-test-row','templateRow':1}}
        data['cellData']['2']={str(c):{'v':'','s':copy.deepcopy(data['cellData']['1'][str(c)]['s'])} for c in range(data['columnCount'])}
        data['cellData']['2']['2']['v']='新增测试人员'
        data['cellData']['2']['3']['v']=0
        cells={f'{r},{c}':v.get('v','') for r,cols in data['cellData'].items() if int(r)>0 for c,v in cols.items()}
        crud.save_quick_calc(2026,9,{}, {},bank_cells=cells,bank_state=data)
        other=bank_sheet.load_sheet(2026,10)
        self.assertEqual(other['data']['rowCount'],data['rowCount'])
        self.assertEqual(other['cells']['2,2'],'新增测试人员')
        self.assertEqual(other['cells']['2,3'],'')
        self.assertEqual(other['cells']['3,3'],202.22)
        self.assertEqual(bank_sheet.load_sheet(2026,9)['cells']['3,3'],101.11)
        self.assertEqual(bank_sheet.load_sheet(2026,9)['cells']['2,3'],0)
        future=bank_sheet.load_sheet(2027,1)
        self.assertEqual(future['cells']['2,2'],'新增测试人员')
        self.assertTrue(all(v=='' for k,v in future['cells'].items() if k.endswith(',3')))
        exported=xlrd.open_workbook(file_contents=bank_sheet.export_sheet(2026,10),formatting_info=True).sheet_by_index(0)
        self.assertEqual(exported.nrows,data['rowCount'])
        self.assertEqual(exported.cell_value(2,2),'新增测试人员')
        self.assertEqual(exported.cell_value(3,3),202.22)
        self.assertEqual(exported.cell_xf_index(2,2),bank_sheet._template()['sheet'].cell_xf_index(1,2))
        # 共享列覆盖更新，另一月付款金额仍独立。
        other['cells']['2,2']='更名测试人员'
        crud.save_quick_calc(2026,10,{}, {},bank_cells=other['cells'],bank_state=other['data'])
        self.assertEqual(bank_sheet.load_sheet(2026,9)['cells']['2,2'],'更名测试人员')
        self.assertEqual(bank_sheet.load_sheet(2026,9)['cells']['2,3'],0)

    def test_custom_grid_monthly_columns_follow_row_identity(self):
        item=crud.create_custom_grid(2026,9,'自定义测试',3,2)['sheet']
        key=item['data']['id'];sid=item['id']
        with closing(db.get_connection()) as conn,conn:
            conn.execute('INSERT INTO app_settings VALUES (?,?)',(f'{key}_blank_columns','[1]'))
        state=item['data'];state['cellData']={'1':{'0':{'v':'固定资料'},'1':{'v':10}},'2':{'1':{'v':20}}}
        crud.save_quick_calc(2026,9,{}, {},grid_states={key:state})
        crud.sync_custom_grid(sid,2026,9,[{'year':2026,'month':10}])
        other=crud.get_custom_grid_sheets(2026,10)[0]['data']
        self.assertEqual(other['cellData']['1']['1']['v'],'')
        other['cellData']['1']['1']['v']=99
        crud.save_quick_calc(2026,10,{}, {},grid_states={key:other})
        state=crud.get_custom_grid_sheets(2026,9)[0]['data']
        for field in ('cellData','rowData'):
            state[field]={str(int(r)+(int(r)>=1)):v for r,v in state[field].items()}
        state['rowCount']+=1
        state['rowData']['1']={'custom':{'lmsRowId':'inserted'}}
        state['cellData']['1']={'0':{'v':'新行'},'1':{'v':123}}
        crud.save_quick_calc(2026,9,{}, {},grid_states={key:state})
        other=crud.get_custom_grid_sheets(2026,10)[0]['data']
        self.assertEqual(other['rowCount'],4)
        self.assertEqual(other['cellData']['1']['0']['v'],'新行')
        self.assertEqual(other['cellData']['1']['1']['v'],'')
        self.assertEqual(other['cellData']['2']['1']['v'],99)
