"""Database connection and initialization helpers."""
import os
import sqlite3
import sys


def get_base_dir():
    """Return the writable app data dir, including PyInstaller builds."""
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def get_resource_dir():
    """Return the bundled resource dir for source and PyInstaller builds."""
    if getattr(sys, "frozen", False):
        return getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


BASE_DIR = get_base_dir()
RESOURCE_DIR = get_resource_dir()
DB_PATH = os.path.join(BASE_DIR, "data.db")
SCHEMA_PATH = os.path.join(RESOURCE_DIR, "database", "schema.sql")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_database():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='work_records'")
    has_work_records = cur.fetchone() is not None
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='salary_adjustments'")
    has_adjustments = cur.fetchone() is not None
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='employees'")
    has_employees = cur.fetchone() is not None

    needs_work_migration = False
    has_line_id = False
    if has_work_records:
        cur.execute("PRAGMA table_info(work_records)")
        work_cols = {row[1] for row in cur.fetchall()}
        needs_work_migration = "order_id" not in work_cols
        has_line_id = "line_id" in work_cols

    has_employee_sort_order = False
    if has_employees:
        cur.execute("PRAGMA table_info(employees)")
        employee_cols = {row[1] for row in cur.fetchall()}
        has_employee_sort_order = "sort_order" in employee_cols

    needs_adjustment_migration = False
    if has_adjustments:
        cur.execute("PRAGMA table_info(salary_adjustments)")
        adjustment_cols = {row[1] for row in cur.fetchall()}
        needs_adjustment_migration = "adj_date" not in adjustment_cols

    if needs_work_migration:
        conn.execute("ALTER TABLE work_records RENAME TO _work_records_old")
        conn.commit()

    if needs_adjustment_migration:
        conn.execute("ALTER TABLE salary_adjustments RENAME TO _salary_adjustments_old")
        conn.commit()

    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        conn.executescript(f.read())

    if needs_work_migration:
        cur.execute("SELECT DISTINCT order_no FROM _work_records_old")
        order_map = {}
        for (order_no,) in cur.fetchall():
            cur.execute(
                "INSERT INTO orders (order_no, year, month) VALUES (?,?,?)",
                (order_no, 2026, 4),
            )
            order_map[order_no] = cur.lastrowid
            cur.execute("SELECT id FROM models")
            for (model_id,) in cur.fetchall():
                conn.execute(
                    "INSERT OR IGNORE INTO order_models (order_id, model_id) VALUES (?,?)",
                    (order_map[order_no], model_id),
                )
        conn.commit()

        cur.execute("SELECT year, month, order_no, model_id, emp_id, quantity FROM _work_records_old")
        for (year, month, order_no, model_id, emp_id, quantity) in cur.fetchall():
            order_id = order_map.get(order_no)
            if order_id:
                conn.execute(
                    """
                    INSERT INTO work_records
                    (year, month, order_id, order_no, model_id, emp_id, quantity)
                    VALUES (?,?,?,?,?,?,?)
                    """,
                    (year, month, order_id, order_no, model_id, emp_id, quantity),
                )
        conn.commit()

        conn.execute("DROP TABLE _work_records_old")
        conn.commit()
        print("[db] work_records migration completed")

    if needs_adjustment_migration:
        conn.execute(
            """
            INSERT INTO salary_adjustments (
                emp_id, year, month, adj_date, adj_quantity, adj_amount, reason, created_at
            )
            SELECT
                emp_id,
                year,
                month,
                printf('%04d-%02d-01', year, month),
                adj_quantity,
                adj_amount,
                reason,
                datetime('now')
            FROM _salary_adjustments_old
            """
        )
        conn.commit()
        conn.execute("DROP TABLE _salary_adjustments_old")
        conn.commit()
        print("[db] salary_adjustments migration completed")

    if has_work_records and not has_line_id:
        cur.execute("ALTER TABLE work_records ADD COLUMN line_id INTEGER NOT NULL DEFAULT 0")
        conn.commit()
        print("[db] line_id column added")

    if has_employees and not has_employee_sort_order:
        cur.execute("ALTER TABLE employees ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0")
        cur.execute("UPDATE employees SET sort_order = id WHERE sort_order = 0")
        conn.commit()
        print("[db] employee sort_order column added")

    # 为已有快捷计算保存增加订单核对信息，保留旧月份的数据。
    cur.execute("PRAGMA table_info(quick_calc_saves)")
    if "row_meta" not in {row[1] for row in cur.fetchall()}:
        cur.execute("ALTER TABLE quick_calc_saves ADD COLUMN row_meta TEXT NOT NULL DEFAULT '{}'")
        conn.commit()

    conn.close()
    print(f"[db] database ready: {DB_PATH}")
