"""所有数据库 CRUD 操作"""
from datetime import datetime

from services.db import get_connection

# ── 全局设置 ────────────────────────────────────────────

def get_app_setting(key):
    conn = get_connection()
    row = conn.execute("SELECT value FROM app_settings WHERE key=?", (key,)).fetchone()
    conn.close()
    if row:
        return {"value": row[0]}
    return {"value": ""}

def set_app_setting(key, value):
    conn = get_connection()
    conn.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)", (key, value))
    conn.commit()
    conn.close()
    return {"ok": True}


def get_all_app_settings():
    """获取所有 UI 设置（以 JSON 对象形式返回）"""
    conn = get_connection()
    rows = conn.execute("SELECT key, value FROM app_settings WHERE key LIKE 'ui_%'").fetchall()
    conn.close()
    settings = {}
    for row in rows:
        key = row[0]
        value = row[1]
        # 尝试解析 JSON（支持布尔值、数字等）
        if value in ('true', 'false'):
            value = value == 'true'
        elif value.isdigit():
            value = int(value)
        else:
            try:
                import json
                value = json.loads(value)
            except (json.JSONDecodeError, ValueError):
                pass  # 保留原始字符串
        settings[key] = value
    return settings


def save_all_app_settings(settings: dict):
    """批量保存所有 UI 设置"""
    import json
    conn = get_connection()
    for key, value in settings.items():
        # 布尔值和数字转字符串存储
        if isinstance(value, bool):
            value = 'true' if value else 'false'
        elif isinstance(value, (int, float)):
            value = str(value)
        elif isinstance(value, dict):
            value = json.dumps(value, ensure_ascii=False)
        conn.execute(
            "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)",
            (key, str(value))
        )
    conn.commit()
    conn.close()
    return {"ok": True}

# ── 部门管理 ────────────────────────────────────────────


def get_departments():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM departments ORDER BY id").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def add_department(name: str):
    conn = get_connection()
    try:
        conn.execute("INSERT INTO departments (name) VALUES (?)", (name,))
        conn.commit()
        conn.close()
        return {"ok": True}
    except Exception:
        conn.close()
        return {"ok": False, "error": "该部门已存在"}


def delete_department(dept_id: int):
    conn = get_connection()
    conn.execute("DELETE FROM departments WHERE id = ?", (dept_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


def get_sub_departments(dept_id: int = None):
    conn = get_connection()
    if dept_id is None:
        rows = conn.execute(
            "SELECT sd.*, d.name AS dept_name FROM sub_departments sd "
            "JOIN departments d ON sd.dept_id=d.id ORDER BY sd.dept_id"
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM sub_departments WHERE dept_id = ?", (dept_id,)
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def add_sub_department(dept_id: int, name: str):
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO sub_departments (dept_id, name) VALUES (?, ?)",
            (dept_id, name)
        )
        conn.commit()
        conn.close()
        return {"ok": True}
    except Exception:
        conn.close()
        return {"ok": False, "error": "该小部门已存在"}


def delete_sub_department(sub_dept_id: int):
    conn = get_connection()
    conn.execute("DELETE FROM sub_departments WHERE id = ?", (sub_dept_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


# ── 员工管理 ────────────────────────────────────────────


def get_employees():
    conn = get_connection()
    rows = conn.execute(
        "SELECT e.*, d.name AS dept_name, sd.name AS sub_dept_name "
        "FROM employees e "
        "JOIN departments d ON e.dept_id=d.id "
        "JOIN sub_departments sd ON e.sub_dept_id=sd.id "
        "ORDER BY d.id, COALESCE(NULLIF(e.sort_order, 0), e.id), e.id"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def add_employee(name: str, gender: str, dept_id: int, sub_dept_id: int):
    conn = get_connection()
    try:
        sort_order = conn.execute(
            "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM employees WHERE dept_id=?",
            (dept_id,)
        ).fetchone()[0]
        conn.execute(
            "INSERT INTO employees (name, gender, dept_id, sub_dept_id, sort_order) VALUES (?,?,?,?,?)",
            (name, gender, dept_id, sub_dept_id, sort_order)
        )
        conn.commit()
        conn.close()
        return {"ok": True}
    except Exception:
        conn.close()
        return {"ok": False, "error": "该员工已存在"}


def update_employee(emp_id: int, name: str, gender: str, dept_id: int, sub_dept_id: int):
    conn = get_connection()
    current = conn.execute("SELECT dept_id FROM employees WHERE id=?", (emp_id,)).fetchone()
    if current and current["dept_id"] != dept_id:
        sort_order = conn.execute(
            "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM employees WHERE dept_id=?",
            (dept_id,)
        ).fetchone()[0]
        conn.execute(
            "UPDATE employees SET name=?, gender=?, dept_id=?, sub_dept_id=?, sort_order=? WHERE id=?",
            (name, gender, dept_id, sub_dept_id, sort_order, emp_id)
        )
    else:
        conn.execute(
            "UPDATE employees SET name=?, gender=?, dept_id=?, sub_dept_id=? WHERE id=?",
            (name, gender, dept_id, sub_dept_id, emp_id)
        )
    conn.commit()
    conn.close()
    return {"ok": True}


def update_employee_order(dept_id: int, emp_ids: list[int]):
    clean_ids = [int(emp_id) for emp_id in emp_ids if emp_id]
    if not clean_ids:
        return {"ok": False, "error": "排序成员不能为空"}

    conn = get_connection()
    placeholders = ",".join("?" for _ in clean_ids)
    rows = conn.execute(
        f"SELECT id, dept_id FROM employees WHERE id IN ({placeholders})",
        clean_ids,
    ).fetchall()
    found_ids = {row["id"] for row in rows}
    wrong_dept = [row["id"] for row in rows if row["dept_id"] != dept_id]
    if len(found_ids) != len(clean_ids) or wrong_dept:
        conn.close()
        return {"ok": False, "error": "只能调整同一部门内的成员顺序"}

    for index, emp_id in enumerate(clean_ids, start=1):
        conn.execute(
            "UPDATE employees SET sort_order=? WHERE id=? AND dept_id=?",
            (index, emp_id, dept_id)
        )
    conn.commit()
    conn.close()
    return {"ok": True}


def delete_employee(emp_id: int):
    conn = get_connection()
    conn.execute("DELETE FROM employees WHERE id = ?", (emp_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


def _flatten_salary_rows(rows):
    salary_map = {}
    for dept in rows or []:
        for emp in dept.get("employees", []):
            salary_map[emp["emp_id"]] = {
                "pairs": round(float(emp.get("pairs") or 0), 2),
                "wage": round(float(emp.get("wage") or 0), 2),
                "adj_amount": round(float(emp.get("adj_amount") or 0), 2),
                "total": round(float(emp.get("total") or 0), 2),
            }
    return salary_map


def get_employee_bank_accounts(year: int, month: int, source: str = "work"):
    salary_rows = get_qc_salary_summary(year, month) if source == "qc" else get_salary_summary(year, month)
    salary_map = _flatten_salary_rows(salary_rows)

    conn = get_connection()
    rows = conn.execute("""
        SELECT
            e.id AS emp_id,
            e.name,
            e.gender,
            e.dept_id,
            e.sub_dept_id,
            d.name AS dept_name,
            sd.name AS sub_dept_name,
            COALESCE(eba.account_name, e.name) AS account_name,
            COALESCE(eba.bank_name, '') AS bank_name,
            COALESCE(eba.card_no, '') AS card_no,
            COALESCE(eba.reserved_phone, '') AS reserved_phone,
            COALESCE(eba.note, '') AS note,
            COALESCE(eba.updated_at, '') AS bank_updated_at
        FROM employees e
        JOIN departments d ON e.dept_id=d.id
        JOIN sub_departments sd ON e.sub_dept_id=sd.id
        LEFT JOIN employee_bank_accounts eba ON eba.emp_id=e.id
        ORDER BY d.id, sd.id, e.id
    """).fetchall()
    conn.close()

    result = []
    for row in rows:
        item = dict(row)
        salary = salary_map.get(item["emp_id"], {"pairs": 0, "wage": 0, "adj_amount": 0, "total": 0})
        item.update(salary)
        item["source"] = source
        result.append(item)
    return result


def save_employee_bank_account(
    emp_id: int,
    account_name: str,
    bank_name: str,
    card_no: str,
    reserved_phone: str = "",
    note: str = "",
):
    conn = get_connection()
    emp = conn.execute("SELECT name FROM employees WHERE id=?", (emp_id,)).fetchone()
    if not emp:
        conn.close()
        return {"ok": False, "error": "未找到该成员"}

    clean_account_name = (account_name or "").strip() or emp["name"]
    clean_bank_name = (bank_name or "").strip()
    clean_card_no = "".join(str(card_no or "").split())
    clean_phone = "".join(str(reserved_phone or "").split())
    clean_note = (note or "").strip()

    conn.execute("""
        INSERT INTO employee_bank_accounts (
            emp_id, account_name, bank_name, card_no, reserved_phone, note, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(emp_id) DO UPDATE SET
            account_name=excluded.account_name,
            bank_name=excluded.bank_name,
            card_no=excluded.card_no,
            reserved_phone=excluded.reserved_phone,
            note=excluded.note,
            updated_at=datetime('now')
    """, (emp_id, clean_account_name, clean_bank_name, clean_card_no, clean_phone, clean_note))
    conn.commit()
    conn.close()
    return {"ok": True}


def clear_all_bank_card_info():
    conn = get_connection()
    try:
        count = conn.execute("SELECT COUNT(*) FROM employee_bank_accounts WHERE card_no != '' OR bank_name != ''").fetchone()[0]
        conn.execute("UPDATE employee_bank_accounts SET card_no='', bank_name='', updated_at=datetime('now') WHERE card_no != '' OR bank_name != ''")
        conn.commit()
        return {"ok": True, "cleared": count}
    except Exception as e:
        return {"ok": False, "error": str(e)}
    finally:
        conn.close()


def _get_adjustment_items(conn, emp_id: int, year: int, month: int):
    rows = conn.execute("""
        SELECT id, emp_id, year, month, adj_date, adj_quantity, adj_amount, reason, created_at
        FROM salary_adjustments
        WHERE emp_id=? AND year=? AND month=?
        ORDER BY adj_date DESC, id DESC
    """, (emp_id, year, month)).fetchall()
    return [dict(r) for r in rows]


def _build_adjustment_summary(items: list[dict]):
    total_quantity = round(sum(float(item.get("adj_quantity") or 0) for item in items), 2)
    total_amount = round(sum(float(item.get("adj_amount") or 0) for item in items), 2)
    reasons = [str(item.get("reason") or "").strip() for item in items]
    reasons = [reason for reason in reasons if reason]
    return {
        "adjustments": items,
        "adj_quantity": total_quantity,
        "adj_amount": total_amount,
        "reason": "；".join(reasons),
    }


def get_employee_detail(emp_id: int, year: int, month: int):
    """员工单月工资明细"""
    conn = get_connection()

    # 获取员工小部门
    emp_row = conn.execute(
        "SELECT sub_dept_id FROM employees WHERE id=?", (emp_id,)
    ).fetchone()
    if not emp_row:
        conn.close()
        return {"wage": 0, "total_pairs": 0, "adj_quantity": 0, "adj_amount": 0, "reason": "", "adjustments": [], "total": 0}

    sub_dept_id = emp_row["sub_dept_id"]

    # 做货工资：quantity * 该型号该小部门的单价
    wage = conn.execute("""
        SELECT COALESCE(SUM(wr.quantity * mp.unit_price), 0) AS wage
        FROM work_records wr
        JOIN model_prices mp ON wr.model_id=mp.model_id AND mp.sub_dept_id=?
        WHERE wr.emp_id=? AND wr.year=? AND wr.month=?
    """, (sub_dept_id, emp_id, year, month)).fetchone()

    # 做货总对数
    pairs = conn.execute(
        "SELECT COALESCE(SUM(quantity), 0) FROM work_records "
        "WHERE emp_id=? AND year=? AND month=?",
        (emp_id, year, month)
    ).fetchone()

    # 增扣
    adj_summary = _build_adjustment_summary(_get_adjustment_items(conn, emp_id, year, month))

    conn.close()

    wage_val = round(wage[0] if wage else 0, 2)
    return {
        "wage": wage_val,
        "total_pairs": pairs[0] if pairs else 0,
        "adj_quantity": adj_summary["adj_quantity"],
        "adj_amount": adj_summary["adj_amount"],
        "reason": adj_summary["reason"],
        "adjustments": adj_summary["adjustments"],
        "total": round(wage_val + adj_summary["adj_amount"], 2)
    }


def get_employee_work_history(emp_id: int, source: str = "work"):
    """获取指定员工自入职以来的所有做货记录（按年月汇总）
    source='work' 从做货编辑读取，source='qc' 从快捷计算读取
    """
    conn = get_connection()

    # 获取员工基本信息
    emp = conn.execute(
        "SELECT e.*, d.name AS dept_name, s.name AS sub_dept_name "
        "FROM employees e "
        "LEFT JOIN departments d ON e.dept_id=d.id "
        "LEFT JOIN sub_departments s ON e.sub_dept_id=s.id "
        "WHERE e.id=?", (emp_id,)
    ).fetchone()
    if not emp:
        conn.close()
        return None

    if source == "qc":
        result = _get_employee_qc_history(conn, emp)
        conn.close()
        return result

    # 原有逻辑：从做货编辑读取
    months = conn.execute("""
        SELECT year, month FROM work_records WHERE emp_id=?
        UNION
        SELECT year, month FROM salary_adjustments WHERE emp_id=?
        ORDER BY year DESC, month DESC
    """, (emp_id, emp_id)).fetchall()

    history = []
    for m in months:
        year, month = m["year"], m["month"]

        # 该月所有做货记录（含订单号、型号）
        records = conn.execute("""
            SELECT wr.*, o.order_no,
                   mp.unit_price,
                   (wr.quantity * mp.unit_price) AS line_wage,
                   m.model_no
            FROM work_records wr
            LEFT JOIN orders o ON wr.order_id=o.id
            LEFT JOIN model_prices mp ON wr.model_id=mp.model_id AND mp.sub_dept_id=?
            LEFT JOIN models m ON wr.model_id=m.id
            WHERE wr.emp_id=? AND wr.year=? AND wr.month=?
            ORDER BY o.order_no, m.model_no
        """, (emp["sub_dept_id"], emp_id, year, month)).fetchall()

        # 该月增扣
        adj_summary = _build_adjustment_summary(_get_adjustment_items(conn, emp_id, year, month))

        month_wage = round(sum(r["line_wage"] or 0 for r in records), 2)
        history.append({
            "year": year,
            "month": month,
            "records": [dict(r) for r in records],
            "month_wage": month_wage,
            "total_pairs": sum(r["quantity"] for r in records),
            "adj_quantity": adj_summary["adj_quantity"],
            "adj_amount": adj_summary["adj_amount"],
            "adj_reason": adj_summary["reason"],
            "adjustments": adj_summary["adjustments"],
            "total": round(month_wage + adj_summary["adj_amount"], 2),
        })

    conn.close()
    return {
        "employee": dict(emp),
        "history": history,
    }


def _get_employee_qc_history(conn, emp):
    """从快捷计算数据中获取单个员工的月度工资历史"""
    emp_id = emp["id"]
    dept_id = emp["dept_id"]
    sub_dept_id = str(emp["sub_dept_id"])

    # 获取所有有快捷计算数据的年月
    months = conn.execute("""
        SELECT year, month FROM quick_calc_saves
        UNION
        SELECT year, month FROM salary_adjustments WHERE emp_id=?
        ORDER BY year DESC, month DESC
    """, (emp_id,)).fetchall()

    history = []
    for m in months:
        year, month = m["year"], m["month"]
        saved = load_quick_calc(year, month)
        dept_rows = saved["dept_rows"] if saved and saved.get("dept_rows") else {}
        qty_data = saved["qty_data"] if saved and saved.get("qty_data") else {}

        # 计算该员工在该月快捷计算中的工资
        empWage = 0
        empPairs = 0
        records = []
        for rowKey, row in dept_rows.items():
            if not rowKey.startswith(str(dept_id) + "_"):
                continue
            qtyKey = f"{rowKey},{emp_id}"
            qty = qty_data.get(qtyKey, 0)
            if qty > 0:
                subPrice = row.get(sub_dept_id, 0)
                empWage += qty * subPrice
                empPairs += qty
                records.append({
                    "order_no": "来自快捷计算",
                    "model_no": "来自快捷计算",
                    "quantity": qty,
                    "unit_price": subPrice,
                    "line_wage": round(qty * subPrice, 2),
                })

        empWage = round(empWage, 2)

        # 该月增扣
        adj_summary = _build_adjustment_summary(_get_adjustment_items(conn, emp_id, year, month))

        history.append({
            "year": year,
            "month": month,
            "records": records,
            "month_wage": empWage,
            "total_pairs": empPairs,
            "adj_quantity": adj_summary["adj_quantity"],
            "adj_amount": adj_summary["adj_amount"],
            "adj_reason": adj_summary["reason"],
            "adjustments": adj_summary["adjustments"],
            "total": round(empWage + adj_summary["adj_amount"], 2),
        })

    return {
        "employee": dict(emp),
        "history": history,
    }


# ── 订单管理 ────────────────────────────────────────────


def get_orders(year: int = None, month: int = None):
    conn = get_connection()
    if year and month:
        rows = conn.execute("""
            SELECT o.*,
                   (SELECT SUM(wr.quantity) FROM work_records wr WHERE wr.order_id=o.id) AS total_pairs
            FROM orders o
            WHERE o.year=? AND o.month=?
            ORDER BY o.id
        """, (year, month)).fetchall()
    else:
        rows = conn.execute("""
            SELECT o.*,
                   (SELECT SUM(wr.quantity) FROM work_records wr WHERE wr.order_id=o.id) AS total_pairs
            FROM orders o
            ORDER BY o.year DESC, o.month DESC, o.id
        """).fetchall()

    result = []
    for r in rows:
        d = dict(r)
        # 获取关联的型号
        models = conn.execute("""
            SELECT m.id, m.model_no FROM order_models om
            JOIN models m ON om.model_id=m.id
            WHERE om.order_id=?
        """, (d["id"],)).fetchall()
        d["models"] = [dict(m) for m in models]
        result.append(d)
    conn.close()
    return result


def add_order(order_no: str, year: int, month: int, model_ids: list[int] = None, remark: str = ""):
    conn = get_connection()
    try:
        oid = conn.execute(
            "INSERT INTO orders (order_no, year, month, remark) VALUES (?,?,?,?)",
            (order_no, year, month, remark or "")
        ).lastrowid
        if model_ids:
            for mid in model_ids:
                conn.execute("INSERT OR IGNORE INTO order_models (order_id, model_id) VALUES (?,?)", (oid, mid))
        conn.commit()
        conn.close()
        return {"ok": True, "order_id": oid}
    except Exception as e:
        conn.close()
        return {"ok": False, "error": str(e)}


def update_order(order_id: int, order_no: str = None, model_ids: list[int] = None, remark: str = None):
    conn = get_connection()
    if order_no is not None:
        conn.execute("UPDATE orders SET order_no=? WHERE id=?", (order_no, order_id))
    if remark is not None:
        conn.execute("UPDATE orders SET remark=? WHERE id=?", (remark, order_id))
    if model_ids is not None:
        conn.execute("DELETE FROM order_models WHERE order_id=?", (order_id,))
        for mid in model_ids:
            conn.execute("INSERT OR IGNORE INTO order_models (order_id, model_id) VALUES (?,?)", (order_id, mid))
    conn.commit()
    conn.close()
    return {"ok": True}


def delete_order(order_id: int):
    conn = get_connection()
    conn.execute("DELETE FROM orders WHERE id=?", (order_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


def get_order_wage_detail(year: int, month: int):
    """返回工资明细：每个格子 = 对数 × 单价"""
    conn = get_connection()

    orders = conn.execute("""
        SELECT o.id, o.order_no,
               (SELECT SUM(wr.quantity) FROM work_records wr WHERE wr.order_id=o.id) AS total_pairs
        FROM orders o
        WHERE o.year=? AND o.month=?
        ORDER BY o.id
    """, (year, month)).fetchall()

    emps = conn.execute("""
        SELECT e.id, e.name, e.sub_dept_id, sd.name AS sub_dept_name
        FROM employees e
        JOIN sub_departments sd ON e.sub_dept_id=sd.id
        ORDER BY e.id
    """).fetchall()

    models = conn.execute("SELECT id, model_no FROM models ORDER BY id").fetchall()

    # 单价映射：model_id, sub_dept_id -> unit_price
    prices_raw = conn.execute("SELECT model_id, sub_dept_id, unit_price FROM model_prices").fetchall()
    price_map = {f"{p['model_id']},{p['sub_dept_id']}": p["unit_price"] for p in prices_raw}

    # 每个订单的型号列表
    order_models = {}
    for o in orders:
        rows = conn.execute("""
            SELECT m.id, m.model_no FROM order_models om
            JOIN models m ON om.model_id=m.id
            WHERE om.order_id=?
        """, (o["id"],)).fetchall()
        order_models[o["id"]] = [dict(r) for r in rows]

    # 做货记录
    records_raw = conn.execute("""
        SELECT order_id, model_id, emp_id, quantity FROM work_records
        WHERE year=? AND month=?
    """, (year, month)).fetchall()

    # 构建数据
    rec_map = {}
    for r in records_raw:
        key = f"{r['order_id']},{r['model_id']},{r['emp_id']}"
        rec_map[key] = r["quantity"]

    # 每个格子工资 = qty × unit_price
    wage_map = {}
    for key, qty in rec_map.items():
        parts = key.split(",")
        order_id, model_id, emp_id = int(parts[0]), int(parts[1]), int(parts[2])
        # 查找员工的 sub_dept_id
        emp_row = next((e for e in emps if e["id"] == emp_id), None)
        if emp_row:
            price = price_map.get(f"{model_id},{emp_row['sub_dept_id']}", 0)
            wage_map[key] = round(qty * price, 2)

    conn.close()
    return {
        "orders": [dict(o) for o in orders],
        "employees": [dict(e) for e in emps],
        "models": [dict(m) for m in models],
        "order_models": {str(k): v for k, v in order_models.items()},
        "quantities": rec_map,
        "wages": wage_map,
        "price_map": price_map,
    }


# ── 型号管理 ────────────────────────────────────────────


def get_models():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM models ORDER BY id").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def add_model(model_no: str):
    conn = get_connection()
    try:
        mid = conn.execute(
            "INSERT INTO models (model_no) VALUES (?)", (model_no,)
        ).lastrowid
        conn.commit()
        # 自动为所有小部门创建默认单价行
        subs = conn.execute("SELECT id FROM sub_departments").fetchall()
        for s in subs:
            conn.execute(
                "INSERT INTO model_prices (model_id, sub_dept_id, unit_price) VALUES (?,?,0)",
                (mid, s[0])
            )
        conn.commit()
        conn.close()
        return {"ok": True, "model_id": mid}
    except Exception:
        conn.close()
        return {"ok": False, "error": "该型号已存在"}


def update_model(model_id: int, model_no: str):
    conn = get_connection()
    try:
        conn.execute("UPDATE models SET model_no = ? WHERE id = ?", (model_no, model_id))
        conn.commit()
        conn.close()
        return {"ok": True}
    except Exception:
        conn.close()
        return {"ok": False, "error": str(e)}


def delete_model(model_id: int):
    conn = get_connection()
    conn.execute("DELETE FROM models WHERE id = ?", (model_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


def get_price_table():
    """返回 {models, sub_departments, prices}"""
    conn = get_connection()
    models = conn.execute("SELECT * FROM models ORDER BY id").fetchall()
    subs = conn.execute(
        "SELECT sd.*, d.name AS dept_name FROM sub_departments sd "
        "JOIN departments d ON sd.dept_id=d.id ORDER BY sd.dept_id, sd.id"
    ).fetchall()
    prices = conn.execute("SELECT * FROM model_prices").fetchall()
    conn.close()

    price_map = {}
    for p in prices:
        # 用字符串 key（FastAPI JSON 序列化需要 hashable type）
        price_map[f"{p['model_id']},{p['sub_dept_id']}"] = p["unit_price"]

    return {
        "models": [dict(m) for m in models],
        "sub_departments": [dict(s) for s in subs],
        "prices": price_map
    }


def update_price(model_id: int, sub_dept_id: int, unit_price: float):
    conn = get_connection()
    conn.execute(
        "INSERT OR REPLACE INTO model_prices (model_id, sub_dept_id, unit_price) VALUES (?,?,?)",
        (model_id, sub_dept_id, float(unit_price))
    )
    conn.commit()
    conn.close()
    return {"ok": True}


# ── 做货编辑 ────────────────────────────────────────────


def get_work_records(year: int, month: int):
    conn = get_connection()
    rows = conn.execute("""
        SELECT wr.*, m.model_no, e.name AS emp_name, e.sub_dept_id
        FROM work_records wr
        LEFT JOIN models m ON wr.model_id=m.id
        JOIN employees e ON wr.emp_id=e.id
        WHERE wr.year=? AND wr.month=?
        ORDER BY wr.line_id ASC, wr.id ASC
    """, (year, month)).fetchall()

    # 所有员工（用于表格列）
    emps = conn.execute("""
        SELECT e.id, e.name, e.dept_id, e.sub_dept_id,
               d.name AS dept_name, sd.name AS sub_dept_name
        FROM employees e
        JOIN departments d ON e.dept_id=d.id
        JOIN sub_departments sd ON e.sub_dept_id=sd.id
        ORDER BY d.id, COALESCE(NULLIF(e.sort_order, 0), e.id), e.id
    """).fetchall()

    # 所有订单
    orders = conn.execute("SELECT id, order_no FROM orders ORDER BY id").fetchall()

    # 所有型号
    models = conn.execute("SELECT id, model_no FROM models ORDER BY id").fetchall()

    # 订单-型号关联
    order_model_rows = conn.execute("SELECT order_id, model_id FROM order_models").fetchall()
    order_models = {}
    for r in order_model_rows:
        oid = str(r["order_id"])
        if oid not in order_models:
            order_models[oid] = []
        order_models[oid].append({"id": r["model_id"]})
    # 补充型号名称
    model_map = {m["id"]: m["model_no"] for m in models}
    for oid in order_models:
        for item in order_models[oid]:
            item["model_no"] = model_map.get(item["id"], "")

    conn.close()
    return {
        "records": [dict(r) for r in rows],
        "employees": [dict(e) for e in emps],
        "orders": [dict(o) for o in orders],
        "models": [dict(m) for m in models],
        "order_models": order_models
    }


def save_work_record(year: int, month: int, order_id: int, model_id: int,
                      emp_id: int, quantity: int, line_id: int = 0):
    conn = get_connection()
    qty = int(quantity) if quantity else 0
    line_id = int(line_id) if line_id else 0
    # 获取 order_no
    order_row = conn.execute("SELECT order_no FROM orders WHERE id=?", (order_id,)).fetchone()
    order_no = order_row["order_no"] if order_row else ""
    # qty < 0 时删除
    if qty < 0:
        conn.execute(
            "DELETE FROM work_records WHERE year=? AND month=? AND order_id=? AND model_id=? AND emp_id=? AND line_id=?",
            (year, month, order_id, model_id, emp_id, line_id)
        )
    else:
        conn.execute("""
            INSERT INTO work_records (year, month, order_id, order_no, model_id, emp_id, quantity, line_id)
            VALUES (?,?,?,?,?,?,?,?)
            ON CONFLICT(year, month, line_id, order_id, model_id, emp_id)
            DO UPDATE SET quantity=excluded.quantity, order_no=excluded.order_no
        """, (year, month, order_id, order_no, model_id, emp_id, qty, line_id))
    conn.commit()
    saved_row = conn.execute(
        "SELECT id FROM work_records WHERE year=? AND month=? AND order_id=? AND model_id=? AND emp_id=? AND line_id=?",
        (year, month, order_id, model_id, emp_id, line_id)
    ).fetchone()
    saved_id = saved_row["id"] if saved_row else None
    conn.close()
    return {"ok": True, "id": saved_id, "line_id": line_id}


def delete_work_record(year: int, month: int, order_id: int, model_id: int, emp_id: int, line_id: int = 0):
    conn = get_connection()
    conn.execute(
        "DELETE FROM work_records WHERE year=? AND month=? AND order_id=? AND model_id=? AND emp_id=? AND line_id=?",
        (year, month, order_id, model_id, emp_id, line_id)
    )
    conn.commit()
    conn.close()
    return {"ok": True}


def delete_work_row(year: int, month: int, order_id: int, model_id: int, line_id: int = 0):
    """批量删除一整行（同一订单+型号+line_id的所有员工记录）"""
    conn = get_connection()
    conn.execute(
        "DELETE FROM work_records WHERE year=? AND month=? AND order_id=? AND model_id=? AND line_id=?",
        (year, month, order_id, model_id, line_id)
    )
    conn.commit()
    conn.close()
    return {"ok": True}


# ── 人工增扣 ────────────────────────────────────────────


def save_adjustment(emp_id: int, year: int, month: int, adj_date: str, adj_quantity: float, adj_amount: float, reason: str):
    conn = get_connection()
    adj_date = (adj_date or f"{int(year):04d}-{int(month):02d}-01").strip()
    try:
        parsed_date = datetime.strptime(adj_date, "%Y-%m-%d")
    except ValueError:
        conn.close()
        return {"ok": False, "error": "增扣日期格式不正确"}
    year = parsed_date.year
    month = parsed_date.month
    cur = conn.execute("""
        INSERT INTO salary_adjustments (emp_id, year, month, adj_date, adj_quantity, adj_amount, reason)
        VALUES (?,?,?,?,?,?,?)
    """, (emp_id, year, month, adj_date, float(adj_quantity), float(adj_amount), reason or ""))
    conn.commit()
    item_id = cur.lastrowid
    conn.close()
    return {"ok": True, "id": item_id}


def delete_adjustments(ids: list[int]):
    clean_ids = [int(item_id) for item_id in ids if item_id]
    if not clean_ids:
        return {"ok": True, "deleted": 0}

    conn = get_connection()
    placeholders = ",".join("?" for _ in clean_ids)
    cur = conn.execute(
        f"DELETE FROM salary_adjustments WHERE id IN ({placeholders})",
        clean_ids
    )
    conn.commit()
    deleted = cur.rowcount
    conn.close()
    return {"ok": True, "deleted": deleted}


# ── 单价模板管理 ──────────────────────────────────────

def get_price_templates():
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM price_templates ORDER BY id"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def save_price_template(name: str, items: list[dict]):
    """创建或覆盖模板：name + [(model_id, sub_dept_id, unit_price), ...]"""
    conn = get_connection()
    try:
        # 删除旧模板（如果存在同名）
        old = conn.execute(
            "SELECT id FROM price_templates WHERE name=?", (name,)
        ).fetchone()
        if old:
            conn.execute("DELETE FROM price_templates WHERE id=?", (old["id"],))
        # 插入新模板
        tid = conn.execute(
            "INSERT INTO price_templates (name) VALUES (?)", (name,)
        ).lastrowid
        for item in items:
            conn.execute(
                "INSERT INTO price_template_items (template_id, model_id, sub_dept_id, unit_price) "
                "VALUES (?,?,?,?)",
                (tid, item["model_id"], item["sub_dept_id"], float(item["unit_price"]))
            )
        conn.commit()
        conn.close()
        return {"ok": True, "template_id": tid}
    except Exception as e:
        conn.close()
        return {"ok": False, "error": str(e)}


def load_price_template(template_id: int):
    """加载模板，返回 {models, sub_departments, prices}"""
    conn = get_connection()
    tpl = conn.execute(
        "SELECT * FROM price_templates WHERE id=?", (template_id,)
    ).fetchone()
    if not tpl:
        conn.close()
        return None
    rows = conn.execute(
        "SELECT * FROM price_template_items WHERE template_id=?", (template_id,)
    ).fetchall()
    conn.close()
    price_map = {}
    for r in rows:
        price_map[f"{r['model_id']},{r['sub_dept_id']}"] = r["unit_price"]
    return {
        "name": tpl["name"],
        "prices": price_map,
    }


def delete_price_template(template_id: int):
    conn = get_connection()
    conn.execute("DELETE FROM price_templates WHERE id=?", (template_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


# ── 数据清理 ────────────────────────────────────────────


def delete_data_by_filter(emp_id: int = None, year: int = None, month: int = None):
    """
    按条件删除做货记录、人工增扣、快捷计算保存。
    - emp_id=None, year=None, month=None  → 清空全部
    - emp_id=X                            → 删除该员工所有数据
    - year=Y, month=M                     → 删除指定年月所有数据
    - emp_id=X, year=Y, month=M           → 删除该员工指定年月数据
    year/month 需同时指定才生效；仅传一个视为不指定。
    """
    conn = get_connection()
    has_emp = emp_id is not None
    has_ym = year is not None and month is not None

    if has_emp and has_ym:
        # 指定成员 + 指定月份
        conn.execute(
            "DELETE FROM work_records WHERE emp_id=? AND year=? AND month=?",
            (emp_id, year, month)
        )
        conn.execute(
            "DELETE FROM salary_adjustments WHERE emp_id=? AND year=? AND month=?",
            (emp_id, year, month)
        )
        # 快捷计算是按年月整体存储，无法按成员删除，跳过
    elif has_emp:
        # 仅指定成员
        conn.execute("DELETE FROM work_records WHERE emp_id=?", (emp_id,))
        conn.execute("DELETE FROM salary_adjustments WHERE emp_id=?", (emp_id,))
    elif has_ym:
        # 仅指定年月
        conn.execute(
            "DELETE FROM work_records WHERE year=? AND month=?", (year, month)
        )
        conn.execute(
            "DELETE FROM salary_adjustments WHERE year=? AND month=?", (year, month)
        )
        conn.execute(
            "DELETE FROM quick_calc_saves WHERE year=? AND month=?", (year, month)
        )
    else:
        # 全部清空
        conn.execute("DELETE FROM work_records")
        conn.execute("DELETE FROM salary_adjustments")
        conn.execute("DELETE FROM quick_calc_saves")

    conn.commit()
    conn.close()
    return {"ok": True}


# ── 快捷计算自动保存 ──────────────────────────────────────

def save_quick_calc(year: int, month: int, dept_rows: dict, qty_data: dict):
    """保存快捷计算大部门分组表格的填写状态（按年月覆盖）"""
    import json
    conn = get_connection()
    conn.execute("""
        INSERT INTO quick_calc_saves (year, month, dept_rows, qty_data)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(year, month) DO UPDATE SET
            dept_rows = excluded.dept_rows,
            qty_data = excluded.qty_data,
            updated_at = CURRENT_TIMESTAMP
    """, (year, month,
          json.dumps(dept_rows, ensure_ascii=False),
          json.dumps(qty_data, ensure_ascii=False)))
    conn.commit()
    conn.close()
    return {"ok": True}


def load_quick_calc(year: int, month: int):
    """加载快捷计算上次保存的状态"""
    import json
    conn = get_connection()
    cur = conn.execute(
        "SELECT dept_rows, qty_data FROM quick_calc_saves WHERE year=? AND month=?",
        (year, month)
    )
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    return {
        "dept_rows": json.loads(row[0]),
        "qty_data": json.loads(row[1]),
    }


# ── 总工资表 ────────────────────────────────────────────


def get_salary_summary(year: int, month: int):
    conn = get_connection()
    employees = conn.execute("""
        SELECT e.id, e.name, e.dept_id, e.sub_dept_id,
               d.name AS dept_name, sd.name AS sub_dept_name
        FROM employees e
        JOIN departments d ON e.dept_id=d.id
        JOIN sub_departments sd ON e.sub_dept_id=sd.id
        ORDER BY d.id, sd.id, e.id
    """).fetchall()

    # 获取每个员工的做货工资与小部门单价映射
    wages_raw = conn.execute("""
        SELECT wr.emp_id,
               (SELECT sub_dept_id FROM employees WHERE id=wr.emp_id) AS sub_dept_id,
               SUM(wr.quantity) AS pairs
        FROM work_records wr
        WHERE wr.year=? AND wr.month=?
        GROUP BY wr.emp_id
    """, (year, month)).fetchall()

    # 每个员工的做货工资
    emp_wages = {}
    for w in wages_raw:
        wage = conn.execute("""
            SELECT COALESCE(SUM(wr.quantity * mp.unit_price), 0) AS wage
            FROM work_records wr
            JOIN model_prices mp ON wr.model_id=mp.model_id AND mp.sub_dept_id=?
            WHERE wr.emp_id=? AND wr.year=? AND wr.month=?
        """, (w["sub_dept_id"], w["emp_id"], year, month)).fetchone()
        emp_wages[w["emp_id"]] = {
            "wage": round(wage["wage"], 2) if wage else 0,
            "pairs": w["pairs"]
        }

    # 增扣
    adj_raw = conn.execute("""
        SELECT emp_id, COALESCE(SUM(adj_amount), 0) AS adj_amount
        FROM salary_adjustments
        WHERE year=? AND month=?
        GROUP BY emp_id
    """, (year, month)).fetchall()
    adj_map = {r["emp_id"]: r["adj_amount"] for r in adj_raw}

    conn.close()

    # 按大部门分组
    departments = {}
    for emp in employees:
        did = emp["dept_id"]
        if did not in departments:
            departments[did] = {
                "dept_id": did,
                "dept_name": emp["dept_name"],
                "employees": [],
                "total_pairs": 0,
                "total_wage": 0
            }
        wage = emp_wages.get(emp["id"], {"wage": 0, "pairs": 0})
        adj = adj_map.get(emp["id"], 0)
        total = round(wage["wage"] + adj, 2)
        departments[did]["employees"].append({
            "emp_id": emp["id"],
            "name": emp["name"],
            "sub_dept_name": emp["sub_dept_name"],
            "pairs": wage["pairs"],
            "wage": wage["wage"],
            "adj_amount": adj,
            "total": total
        })
        departments[did]["total_pairs"] += wage["pairs"]
        departments[did]["total_wage"] += total

    for d in departments.values():
        d["total_wage"] = round(d["total_wage"], 2)

    return list(departments.values())


def get_qc_salary_summary(year: int, month: int):
    """快捷计算总工资表：从 quick_calc_saves 读取数据，按大部门分组计算每个员工的工资"""
    saved = load_quick_calc(year, month)
    if not saved or not saved.get("dept_rows"):
        return []

    dept_rows = saved["dept_rows"]  # { "deptId_rowIdx": { subDeptId: 单价 } }
    qty_data = saved["qty_data"]    # { "rowKey,empId": 对数 }

    conn = get_connection()
    employees = conn.execute("""
        SELECT e.id, e.name, e.dept_id, e.sub_dept_id,
               d.name AS dept_name, sd.name AS sub_dept_name
        FROM employees e
        JOIN departments d ON e.dept_id=d.id
        JOIN sub_departments sd ON e.sub_dept_id=sd.id
        ORDER BY d.id, sd.id, e.id
    """).fetchall()

    # 获取人工增扣
    adj_raw = conn.execute("""
        SELECT emp_id, COALESCE(SUM(adj_amount), 0) AS adj_amount
        FROM salary_adjustments
        WHERE year=? AND month=?
        GROUP BY emp_id
    """, (year, month)).fetchall()
    adj_map = {r["emp_id"]: r["adj_amount"] for r in adj_raw}
    conn.close()

    # 按大部门分组
    departments = {}
    for emp in employees:
        did = emp["dept_id"]
        if did not in departments:
            departments[did] = {
                "dept_id": did,
                "dept_name": emp["dept_name"],
                "employees": [],
                "total_pairs": 0,
                "total_wage": 0
            }

        # 计算该员工在该月快捷计算中的工资
        empWage = 0
        empPairs = 0
        # 遍历该大部门的所有行
        for rowKey, row in dept_rows.items():
            if not rowKey.startswith(str(did) + "_"):
                continue
            qtyKey = f"{rowKey},{emp['id']}"
            qty = qty_data.get(qtyKey, 0)
            if qty > 0:
                # 该员工所属小部门的单价（JSON反序列化后key为字符串）
                subPrice = row.get(str(emp["sub_dept_id"]), 0)
                empWage += qty * subPrice
                empPairs += qty

        empWage = round(empWage, 2)
        adj = adj_map.get(emp["id"], 0)
        total = round(empWage + adj, 2)

        departments[did]["employees"].append({
            "emp_id": emp["id"],
            "name": emp["name"],
            "sub_dept_name": emp["sub_dept_name"],
            "pairs": empPairs,
            "wage": empWage,
            "adj_amount": adj,
            "total": total
        })
        departments[did]["total_pairs"] += empPairs
        departments[did]["total_wage"] += total

    for d in departments.values():
        d["total_wage"] = round(d["total_wage"], 2)

    return list(departments.values())
