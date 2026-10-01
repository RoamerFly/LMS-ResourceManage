-- ============================================================
-- SQLite schema
-- ============================================================

CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS sub_departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dept_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    FOREIGN KEY (dept_id) REFERENCES departments(id) ON DELETE CASCADE,
    UNIQUE(dept_id, name)
);

CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    gender TEXT NOT NULL CHECK(gender IN ('男', '女')),
    dept_id INTEGER NOT NULL,
    sub_dept_id INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (dept_id) REFERENCES departments(id) ON DELETE CASCADE,
    FOREIGN KEY (sub_dept_id) REFERENCES sub_departments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS employee_bank_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_id INTEGER NOT NULL UNIQUE,
    account_name TEXT NOT NULL DEFAULT '',
    bank_name TEXT NOT NULL DEFAULT '',
    card_no TEXT NOT NULL DEFAULT '',
    reserved_phone TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (emp_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_no TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS model_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_id INTEGER NOT NULL,
    sub_dept_id INTEGER NOT NULL,
    unit_price REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
    FOREIGN KEY (sub_dept_id) REFERENCES sub_departments(id) ON DELETE CASCADE,
    UNIQUE(model_id, sub_dept_id)
);

CREATE TABLE IF NOT EXISTS price_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS price_template_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL,
    model_id INTEGER NOT NULL,
    sub_dept_id INTEGER NOT NULL,
    unit_price REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (template_id) REFERENCES price_templates(id) ON DELETE CASCADE,
    FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
    FOREIGN KEY (sub_dept_id) REFERENCES sub_departments(id) ON DELETE CASCADE,
    UNIQUE(template_id, model_id, sub_dept_id)
);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no TEXT NOT NULL UNIQUE,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    remark TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS order_models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    model_id INTEGER NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
    UNIQUE(order_id, model_id)
);

CREATE TABLE IF NOT EXISTS work_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    order_id INTEGER NOT NULL DEFAULT 1,
    order_no TEXT NOT NULL DEFAULT '未知',
    model_id INTEGER NOT NULL DEFAULT 0,
    emp_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    line_id INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (emp_id) REFERENCES employees(id) ON DELETE CASCADE,
    UNIQUE(year, month, line_id, order_id, model_id, emp_id)
);

CREATE TABLE IF NOT EXISTS salary_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_id INTEGER NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    adj_date TEXT NOT NULL DEFAULT '',
    adj_quantity REAL NOT NULL DEFAULT 0,
    adj_amount REAL NOT NULL DEFAULT 0,
    reason TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (emp_id) REFERENCES employees(id) ON DELETE CASCADE,
    CHECK(adj_date <> '')
);

CREATE TABLE IF NOT EXISTS quick_calc_saves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    dept_rows TEXT NOT NULL DEFAULT '{}',
    qty_data TEXT NOT NULL DEFAULT '{}',
    row_meta TEXT NOT NULL DEFAULT '{}',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(year, month)
);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
);

INSERT OR IGNORE INTO departments (id, name) VALUES (1, '面部');
INSERT OR IGNORE INTO departments (id, name) VALUES (2, '底部');

INSERT OR IGNORE INTO sub_departments (id, dept_id, name) VALUES (1, 1, '衣车');
INSERT OR IGNORE INTO sub_departments (id, dept_id, name) VALUES (2, 1, '折面');
INSERT OR IGNORE INTO sub_departments (id, dept_id, name) VALUES (3, 1, '折边');
INSERT OR IGNORE INTO sub_departments (id, dept_id, name) VALUES (4, 2, '底部');
