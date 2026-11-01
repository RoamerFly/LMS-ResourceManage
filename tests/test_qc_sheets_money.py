"""工资十进制精度、用户案例、自定义工作表及月份独立持久化。"""
import json
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path
from contextlib import closing

from services import crud, db


class QcSheetMoneyTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory(prefix='lms-qc-money-')
        self.old_path = db.DB_PATH
        db.DB_PATH = str(Path(self.folder.name) / 'data.db')
        db.init_database()
        with closing(db.get_connection()) as conn, conn:
            conn.execute("INSERT INTO employees(id,name,gender,dept_id,sub_dept_id) VALUES(1,'样例人员','男',1,1)")

    def tearDown(self):
        db.DB_PATH = self.old_path
        self.folder.cleanup()

    def employee(self, year=2026, month=9):
        return crud.get_qc_salary_summary(year, month)[0]['employees'][0]

    def test_user_payroll_case(self):
        data = json.loads((Path(__file__).parent / 'fixtures/qc-payroll-sample.json').read_text())
        rows = {f'1_{i}': {'1': a, '2': b} for i, (a, b, _) in enumerate(data)}
        quantities = {f'1_{i},1': q for i, (_, _, q) in enumerate(data)}
        crud.save_quick_calc(2026, 9, rows, quantities)
        employee = self.employee()
        self.assertEqual(employee['pairs'], 7471)
        self.assertEqual(employee['wage'], 10194.60)
        with closing(db.get_connection()) as conn:
            emp = conn.execute('SELECT * FROM employees WHERE id=1').fetchone()
            history = crud._get_employee_qc_history(conn, emp)['history'][0]
        self.assertEqual(history['month_wage'], 10194.60)
        self.assertEqual(sum(Decimal(str(r['line_wage'])) for r in history['records']), Decimal('10194.60'))

    def test_half_up_line_rounding_and_adjustments(self):
        crud.save_quick_calc(2026, 9,
            {'1_0': {'1': 1.005}, '1_1': {'1': 1.005}, '1_2': {'1': 2.675}, '1_3': {'1': .1}},
            {'1_0,1': 1, '1_1,1': 1, '1_2,1': 1, '1_3,1': 3})
        with closing(db.get_connection()) as conn, conn:
            conn.execute("INSERT INTO salary_adjustments(emp_id,year,month,adj_date,adj_amount) VALUES(1,2026,9,'2026-09-01',-1.005)")
        result = self.employee()
        self.assertEqual(result['wage'], 5.0)  # 1.01 + 1.01 + 2.68 + 0.30
        self.assertEqual(float(result['adj_amount']), -1.01)
        self.assertEqual(result['total'], 3.99)
        self.assertEqual(crud.line_money(Decimal('1'), Decimal('1.005')), Decimal('1.01'))

    def test_custom_sheet_sync_isolation_and_payroll(self):
        sheet = crud.create_quick_calc_sheet(2026, 9, '补单', 1)['sheet']
        # 升级前已存在的旧自定义表保持原数据口径。
        with closing(db.get_connection()) as conn,conn:
            conn.execute('UPDATE quick_calc_sheets SET is_temporary=0 WHERE id=?',(-sheet['id'],))
        sheet['is_temporary']=False
        self.assertLess(sheet['id'], 0)
        key = f"{sheet['id']}_0"
        crud.save_quick_calc(2026, 9, {'1_0': {'1': 1.3}, key: {'1': 1.005}}, {'1_0,1': 10, f'{key},1': 1})
        self.assertEqual(self.employee()['wage'], 14.01)
        self.assertEqual(self.employee()['pairs'], 11)
        self.assertEqual(crud.get_quick_calc_sheets(2026, 10), [])
        original = crud.load_quick_calc(2026, 9)
        target_original = {'1_0': {'1': 2.2}}
        crud.save_quick_calc(2026, 10, target_original, {'1_0,1': 20})
        sync = lambda: crud.sync_quick_calc_sheet(sheet['id'], 2026, 9, [{'year': 2026, 'month': 10}, {'year': 2027, 'month': 1}])
        self.assertEqual(sync()['added'], 2)
        self.assertEqual(sync()['added'], 0)
        self.assertEqual(crud.load_quick_calc(2026, 9), original)
        self.assertEqual(crud.load_quick_calc(2026, 10)['dept_rows'], target_original)
        self.assertEqual(crud.get_quick_calc_sheets(2027, 1), [sheet])
        crud.save_quick_calc(2026, 10, {**target_original, key: {'1': 2.675}}, {'1_0,1': 20, f'{key},1': 1})
        self.assertEqual(self.employee(2026, 10)['wage'], 46.68)
        self.assertEqual(self.employee()['wage'], 14.01)
        db.init_database()  # 重复升级不重置工作表及关联。
        self.assertEqual(crud.get_quick_calc_sheets(2026, 10), [sheet])
        with closing(db.get_connection()) as conn:
            emp = conn.execute('SELECT * FROM employees WHERE id=1').fetchone()
            history = crud._get_employee_qc_history(conn, emp)['history']
        self.assertEqual([r['month_wage'] for r in history], [46.68, 14.01])

    def test_sync_validation_atomicity_and_names(self):
        sheet = crud.create_quick_calc_sheet(2026, 9, '补单', 1)['sheet']
        for name, dept in [('补单', 1), ('', 1), ('x'*41, 1), ('不存在', 9999)]:
            with self.assertRaises(ValueError):
                crud.create_quick_calc_sheet(2026, 9, name, dept)
        crud.create_quick_calc_sheet(2026, 10, '补单', 1)
        with self.assertRaises(ValueError):
            crud.sync_quick_calc_sheet(sheet['id'], 2026, 9, [{'year': 2027, 'month': 1}, {'year': 2026, 'month': 10}])
        self.assertEqual(crud.get_quick_calc_sheets(2027, 1), [])
        with self.assertRaises(ValueError):
            crud.sync_quick_calc_sheet(sheet['id'], 2026, 8, [{'year': 2027, 'month': 1}])
        with self.assertRaises(ValueError):
            crud.sync_quick_calc_sheet(sheet['id'], 2026, 9, [{'year': 2027, 'month': 13}])

    def test_temporary_sheet_inherits_main_and_separates_people(self):
        self.assertTrue(crud.add_employee('临时回归人员','女',1,1,True)['ok'])
        emp=next(e for e in crud.get_employees() if e['is_temporary'])
        sheet=crud.create_quick_calc_sheet(2026,9,'面部临时表',1)['sheet']
        key=f"{sheet['id']}_0"
        crud.save_quick_calc(2026,9,{'1_0':{'1':1.005},key:{'1':999}},
            {'1_0,1':10,f"{key},{emp['id']}":3,f'{key},1':500},
            {'1_0':{'orderNo':'000123','orderQty':20},key:{'orderNo':'伪造'}})
        saved=crud.load_quick_calc(2026,9)
        self.assertEqual(saved['dept_rows'][key],{'1':1.005})
        self.assertEqual(saved['row_meta'][key],{'orderNo':'000123','orderQty':20})
        self.assertNotIn(f'{key},1',saved['qty_data'])
        result=crud.get_qc_salary_summary(2026,9)[0]['employees']
        self.assertEqual(next(e for e in result if e['emp_id']==1)['wage'],10.05)
        self.assertEqual(next(e for e in result if e['emp_id']==emp['id'])['wage'],3.02)
        with closing(db.get_connection()) as conn:
            stored=json.loads(conn.execute('SELECT dept_rows FROM quick_calc_saves').fetchone()[0])
        self.assertNotIn(key,stored)
        changed=crud.update_employee(emp['id'],emp['name'],emp['gender'],1,1,False)
        self.assertFalse(changed['ok'],'已有工资记录时不能直接改人员类型而丢失历史工资')

    def test_delete_legacy_sheet_only_cleans_selected_month(self):
        with closing(db.get_connection()) as conn,conn:
            conn.execute("INSERT INTO quick_calc_sheets(id,name,dept_id,is_temporary) VALUES(1,'临时',1,0),(10,'保留表',1,0)")
            conn.executemany('INSERT INTO quick_calc_sheet_periods VALUES (?,?,?)',[(s,2026,m) for s in (1,10) for m in (9,10)])
        rows={'1_0':{'1':1},'-1_0':{'1':2},'-10_0':{'1':3}}
        qty={'1_0,1':4,'-1_0,1':5,'-10_0,1':6}
        meta={'1_0':{'orderNo':'主表'},'-1_0':{'orderNo':'删除'},'-10_0':{'orderNo':'保留'}}
        for m in (9,10):crud.save_quick_calc(2026,m,rows,qty,meta)
        before=crud.load_quick_calc(2026,10)
        self.assertTrue(crud.delete_month_sheet('department',-1,2026,9)['ok'])
        saved=crud.load_quick_calc(2026,9)
        self.assertEqual(saved['dept_rows'],{'1_0':{'1':1},'-10_0':{'1':3}})
        self.assertEqual(saved['qty_data'],{'1_0,1':4,'-10_0,1':6})
        self.assertNotIn('-1_0',saved['row_meta'])
        self.assertEqual(crud.load_quick_calc(2026,10),before)
        self.assertEqual([s['id'] for s in crud.get_quick_calc_sheets(2026,9)],[-10])
        self.assertIn(-1,[s['id'] for s in crud.get_quick_calc_sheets(2026,10)])
        crud.save_quick_calc(2026,9,rows,qty,meta)
        self.assertNotIn('-1_0',crud.load_quick_calc(2026,9)['dept_rows'],'迟到自动保存不能恢复已删除表内容')
        self.assertEqual(crud.load_quick_calc(2026,10),before)
        with self.assertRaises(ValueError):crud.delete_month_sheet('department',1,2026,9)
        with self.assertRaises(ValueError):crud.delete_month_sheet('bank',1,2026,9)
        with self.assertRaises(ValueError):crud.delete_month_sheet('department',-1,2026,9)

    def test_delete_independent_sheet_keeps_other_months(self):
        sheet=crud.create_custom_grid(2026,9,'工资表',10,4)['sheet']
        crud.sync_custom_grid(sheet['id'],2026,9,[{'year':2026,'month':10}])
        state=sheet['data'];state['cellData']={'0':{'0':{'v':'保留值','t':1}}}
        crud.save_quick_calc(2026,10,{}, {},grid_states={state['id']:state})
        self.assertTrue(crud.delete_month_sheet('grid',sheet['id'],2026,9)['ok'])
        self.assertEqual(crud.get_custom_grid_sheets(2026,9),[])
        self.assertEqual(crud.get_custom_grid_sheets(2026,10)[0]['data']['cellData']['0']['0']['v'],'保留值')


if __name__ == '__main__':
    unittest.main()
