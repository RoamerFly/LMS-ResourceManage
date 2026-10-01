"""订单核对信息的旧库迁移与月份持久化回归。"""
import sqlite3
import tempfile
import unittest
from pathlib import Path

from services import crud, db


class QuickCalcOrderMetaTests(unittest.TestCase):
    def test_old_database_migration_and_month_isolation(self):
        original_path = db.DB_PATH
        with tempfile.TemporaryDirectory(prefix="lms-order-meta-") as folder:
            db.DB_PATH = str(Path(folder) / "data.db")
            try:
                conn = sqlite3.connect(db.DB_PATH)
                try:
                    conn.execute("""
                        CREATE TABLE quick_calc_saves (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            year INTEGER NOT NULL, month INTEGER NOT NULL,
                            dept_rows TEXT NOT NULL DEFAULT '{}',
                            qty_data TEXT NOT NULL DEFAULT '{}',
                            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            UNIQUE(year, month))
                    """)
                    conn.execute("""
                        INSERT INTO quick_calc_saves(year, month, dept_rows, qty_data)
                        VALUES (2026, 9, ?, ?)
                    """, ('{"1_0":{"10":1.25}}', '{"1_0,1":5}'))
                    conn.commit()
                finally:
                    conn.close()
                db.init_database()
                old = crud.load_quick_calc(2026, 9)
                self.assertEqual(old, {
                    "dept_rows": {"1_0": {"10": 1.25}},
                    "qty_data": {"1_0,1": 5}, "row_meta": {},
                })
                references = {"1_0": {"orderNo": "000123", "orderQty": 50}}
                crud.save_quick_calc(2026, 9, old["dept_rows"], old["qty_data"], references)
                # 重复启动迁移既不丢数据，也不重复添加列。
                db.init_database()
                self.assertEqual(crud.load_quick_calc(2026, 9)["row_meta"], references)
                crud.save_quick_calc(2026, 10, {}, {}, {"1_0": {"orderNo": "A-002"}})
                self.assertEqual(crud.load_quick_calc(2026, 9)["row_meta"], references)
                self.assertEqual(crud.load_quick_calc(2026, 10)["row_meta"]["1_0"]["orderNo"], "A-002")
            finally:
                db.DB_PATH = original_path


if __name__ == "__main__":
    unittest.main()
