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
from services import db,crud,bank_sheet


class BankSheetTests(unittest.TestCase):
    def setUp(self):
        template=Path(__file__).parents[1]/'工资表模板-9月工资.xls'
        if not template.exists():
            self.skipTest('此本地模板含银行卡数据，未提交到公共仓库')
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
        self.assertEqual(crud.get_custom_grid_sheets(2026,10)[0]['data']['cellData'],{})
        self.assertEqual(crud.get_qc_salary_summary(2026,9),[])
