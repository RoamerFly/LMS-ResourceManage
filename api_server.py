"""FastAPI 后端 - 所有 HTTP API"""
from fastapi import FastAPI, Query, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel
from typing import Optional, List
import os
import json
import shutil
import uuid
from urllib import parse, request

from services.db import init_database, get_base_dir, get_resource_dir
from services import crud

DATA_DIR = get_base_dir()
RESOURCE_DIR = get_resource_dir()
WEB_DIR = os.path.join(RESOURCE_DIR, "web")
RESOURCE_FONTS_DIR = os.path.join(WEB_DIR, "fonts")
USER_FONTS_DIR = os.path.join(DATA_DIR, "fonts")
LEGACY_USER_FONTS_DIR = os.path.join(DATA_DIR, "web", "fonts")
BANK_MAP_PATH = os.path.join(RESOURCE_DIR, "b.json")

_bank_name_map = None

app = FastAPI(title="立杰HR API")

# CORS：允许 pywebview 本地窗口请求
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 挂载静态文件（前端页面） ───────────────────────────
# 挂载 JS 目录
app.mount("/js", StaticFiles(directory=os.path.join(WEB_DIR, "js")), name="js")
# 挂载 CSS 目录
app.mount("/css", StaticFiles(directory=os.path.join(WEB_DIR, "css")), name="css")

# 确保用户字体目录存在
os.makedirs(USER_FONTS_DIR, exist_ok=True)


# ── 挂载静态文件（前端页面） ───────────────────────────
@app.get("/")
async def root():
    return FileResponse(os.path.join(WEB_DIR, "index.html"))


def _resolve_font_path(filename: str):
    safe_name = os.path.basename(filename or "")
    if not safe_name:
        return None
    for directory in (USER_FONTS_DIR, LEGACY_USER_FONTS_DIR, RESOURCE_FONTS_DIR):
        candidate = os.path.join(directory, safe_name)
        if os.path.exists(candidate) and os.path.isfile(candidate):
            return candidate
    return None


@app.get("/fonts/{filename:path}")
async def serve_font(filename: str):
    font_path = _resolve_font_path(filename)
    if not font_path:
        raise HTTPException(status_code=404, detail="字体文件不存在")
    return FileResponse(font_path)


# ── 部门管理 ────────────────────────────────────────────

@app.get("/api/departments")
async def api_get_departments():
    return crud.get_departments()


@app.post("/api/departments")
async def api_add_department(body: dict):
    return crud.add_department(body.get("name", ""))


@app.delete("/api/departments/{dept_id}")
async def api_delete_department(dept_id: int):
    return crud.delete_department(dept_id)


@app.get("/api/sub-departments")
async def api_get_sub_departments(dept_id: Optional[int] = Query(None)):
    return crud.get_sub_departments(dept_id)


@app.post("/api/sub-departments")
async def api_add_sub_department(body: dict):
    return crud.add_sub_department(body.get("dept_id"), body.get("name", ""))


@app.delete("/api/sub-departments/{sub_dept_id}")
async def api_delete_sub_department(sub_dept_id: int):
    return crud.delete_sub_department(sub_dept_id)


# ── 员工管理 ────────────────────────────────────────────

@app.get("/api/employees")
async def api_get_employees():
    return crud.get_employees()


@app.get("/api/bank-accounts")
async def api_get_bank_accounts(
    year: int = Query(...), month: int = Query(...),
    source: Optional[str] = Query(None)
):
    return crud.get_employee_bank_accounts(year, month, source or "work")


@app.post("/api/bank-accounts/{emp_id}")
async def api_save_bank_account(emp_id: int, body: dict):
    return crud.save_employee_bank_account(
        emp_id,
        body.get("account_name", ""),
        body.get("bank_name", ""),
        body.get("card_no", ""),
        body.get("reserved_phone", ""),
        body.get("note", ""),
    )


@app.post("/api/bank-accounts/clear-all")
async def api_clear_all_bank_accounts():
    return crud.clear_all_bank_card_info()


def _load_bank_name_map():
    global _bank_name_map
    if _bank_name_map is not None:
        return _bank_name_map

    if not os.path.exists(BANK_MAP_PATH):
        _bank_name_map = {}
        return _bank_name_map

    with open(BANK_MAP_PATH, "r", encoding="utf-8") as f:
        _bank_name_map = json.load(f)
    return _bank_name_map


def _lookup_bank_info(card_no: str):
    clean_card = "".join(str(card_no or "").split())
    if not clean_card:
        return {"ok": False, "error": "银行卡号不能为空"}

    api_url = (
        "https://ccdcapi.alipay.com/validateAndCacheCardInfo.json?"
        + parse.urlencode({"cardNo": clean_card, "cardBinCheck": "true"})
    )
    req = request.Request(
        api_url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json,text/plain,*/*",
        },
    )

    try:
        with request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        return {"ok": False, "error": f"查询开户行失败：{exc}"}

    if not data.get("validated") or data.get("stat") != "ok":
        return {"ok": False, "error": "未查询到该银行卡的开户行信息", "raw": data}

    bank_code = str(data.get("bank") or "").strip()
    bank_name = _load_bank_name_map().get(bank_code, bank_code)
    return {
        "ok": True,
        "bank_code": bank_code,
        "bank_name": bank_name,
        "raw": data,
    }


@app.get("/api/bank-lookup")
async def api_lookup_bank(card_no: str = Query(...)):
    return await run_in_threadpool(_lookup_bank_info, card_no)


@app.post("/api/employees")
async def api_add_employee(body: dict):
    return crud.add_employee(
        body.get("name", ""), body.get("gender", "男"),
        body.get("dept_id"), body.get("sub_dept_id")
    )


@app.put("/api/employees/order")
async def api_update_employee_order(body: dict):
    return crud.update_employee_order(
        int(body.get("dept_id") or 0),
        body.get("emp_ids") or []
    )


@app.put("/api/employees/{emp_id}")
async def api_update_employee(emp_id: int, body: dict):
    return crud.update_employee(
        emp_id,
        body.get("name", ""), body.get("gender", "男"),
        body.get("dept_id"), body.get("sub_dept_id")
    )


@app.delete("/api/employees/{emp_id}")
async def api_delete_employee(emp_id: int):
    return crud.delete_employee(emp_id)


@app.get("/api/employees/{emp_id}/detail")
async def api_employee_detail(emp_id: int, year: int = Query(...), month: int = Query(...)):
    return crud.get_employee_detail(emp_id, year, month)


@app.get("/api/employees/{emp_id}/work-history")
async def api_employee_work_history(emp_id: int, source: str = "work"):
    return crud.get_employee_work_history(emp_id, source)


# ── 订单管理 ────────────────────────────────────────────

@app.get("/api/orders")
async def api_get_orders(
    year: Optional[int] = Query(None), month: Optional[int] = Query(None)
):
    return crud.get_orders(year, month)


@app.post("/api/orders")
async def api_add_order(body: dict):
    return crud.add_order(
        body.get("order_no", ""),
        body.get("year"),
        body.get("month"),
        body.get("model_ids", []),
        body.get("remark", ""),
    )


@app.put("/api/orders/{order_id}")
async def api_update_order(order_id: int, body: dict):
    return crud.update_order(
        order_id,
        order_no=body.get("order_no"),
        model_ids=body.get("model_ids"),
        remark=body.get("remark"),
    )


@app.delete("/api/orders/{order_id}")
async def api_delete_order(order_id: int):
    return crud.delete_order(order_id)


# ── 工资计算明细 ───────────────────────────────────────

@app.get("/api/wage-detail")
async def api_wage_detail(year: int = Query(...), month: int = Query(...)):
    return crud.get_order_wage_detail(year, month)


# ── 型号管理 ────────────────────────────────────────────

@app.get("/api/models")
async def api_get_models():
    return crud.get_models()


@app.post("/api/models")
async def api_add_model(body: dict):
    return crud.add_model(body.get("model_no", ""))


@app.put("/api/models/{model_id}")
async def api_update_model(model_id: int, body: dict):
    return crud.update_model(model_id, body.get("model_no", ""))


@app.delete("/api/models/{model_id}")
async def api_delete_model(model_id: int):
    return crud.delete_model(model_id)


# ── 型号单价表 ──────────────────────────────────────────

@app.get("/api/price-table")
async def api_get_price_table():
    return crud.get_price_table()


@app.put("/api/price-table")
async def api_update_price(body: dict):
    return crud.update_price(body.get("model_id"), body.get("sub_dept_id"), body.get("unit_price"))


@app.post("/api/model-prices")
async def api_save_model_prices(body: dict):
    """批量保存某型号所有小部门的单价"""
    model_id = body.get("model_id")
    items = body.get("items", [])
    results = []
    for item in items:
        r = crud.update_price(model_id, item["sub_dept_id"], item["unit_price"])
        results.append(r)
    return {"ok": True, "saved": len(results)}


# ── 做货编辑 ────────────────────────────────────────────

@app.get("/api/work-records")
async def api_get_work_records(year: int = Query(...), month: int = Query(...)):
    return crud.get_work_records(year, month)


class WorkRecordBody(BaseModel):
    year: int
    month: int
    order_id: int
    model_id: int
    emp_id: int
    quantity: int
    line_id: int = 0   # 逻辑行号，同 (order_id,model_id) 可有多行


@app.post("/api/work-records")
async def api_save_work_record(body: WorkRecordBody):
    return crud.save_work_record(
        body.year, body.month, body.order_id,
        body.model_id, body.emp_id, body.quantity,
        body.line_id
    )


@app.delete("/api/work-records")
async def api_delete_work_record(
    year: int = Query(...), month: int = Query(...),
    order_id: int = Query(...), model_id: int = Query(...),
    emp_id: int = Query(...), line_id: int = Query(0)
):
    return crud.delete_work_record(year, month, order_id, model_id, emp_id, line_id)


@app.delete("/api/work-row")
async def api_delete_work_row(
    year: int = Query(...), month: int = Query(...),
    order_id: int = Query(...), model_id: int = Query(...), line_id: int = Query(0)
):
    """批量删除一整行（同一订单+型号+line_id的所有员工记录）"""
    return crud.delete_work_row(year, month, order_id, model_id, line_id)


# ── 人工增扣 ────────────────────────────────────────────

@app.post("/api/adjustments")
async def api_save_adjustment(body: dict):
    return crud.save_adjustment(
        body.get("emp_id"), body.get("year"), body.get("month"),
        body.get("adj_date", ""), body.get("adj_quantity", 0), body.get("adj_amount", 0), body.get("reason", "")
    )


@app.post("/api/adjustments/batch-delete")
async def api_delete_adjustments(body: dict):
    return crud.delete_adjustments(body.get("ids", []))


# ── 总工资表 ────────────────────────────────────────────

@app.get("/api/salary-summary")
async def api_get_salary_summary(
    year: int = Query(...), month: int = Query(...),
    source: Optional[str] = Query(None)  # "work" 或 "qc"，默认 "work"
):
    if source == "qc":
        return crud.get_qc_salary_summary(year, month)
    return crud.get_salary_summary(year, month)


@app.get("/api/qc-salary-summary")
async def api_get_qc_salary_summary(year: int = Query(...), month: int = Query(...)):
    return crud.get_qc_salary_summary(year, month)


# ── 单价模板 ────────────────────────────────────────────

@app.get("/api/price-templates")
async def api_get_price_templates():
    return crud.get_price_templates()


class PriceTemplateBody(BaseModel):
    name: str
    items: List[dict]  # [{"model_id":1,"sub_dept_id":1,"unit_price":0.8}, ...]


@app.post("/api/price-templates")
async def api_save_price_template(body: PriceTemplateBody):
    return crud.save_price_template(body.name, body.items)


@app.get("/api/price-templates/{template_id}")
async def api_load_price_template(template_id: int):
    return crud.load_price_template(template_id)


@app.delete("/api/price-templates/{template_id}")
async def api_delete_price_template(template_id: int):
    return crud.delete_price_template(template_id)


# ── 快捷计算自动保存 ─────────────────────────────────────

@app.post("/api/quick-calc-save")
async def api_save_quick_calc(payload: dict):
    return crud.save_quick_calc(
        year=payload["year"],
        month=payload["month"],
        dept_rows=payload.get("dept_rows", {}),
        qty_data=payload.get("qty_data", {}),
    )


@app.get("/api/quick-calc-save")
async def api_load_quick_calc(year: int, month: int):
    return crud.load_quick_calc(year, month)


# ── 初始化 ────────────────────────────────────────────

@app.get("/api/init")
async def api_init():
    init_database()
    return {"ok": True}


@app.get("/api/app-settings/{key}")
async def api_get_app_setting(key: str):
    return crud.get_app_setting(key)


@app.post("/api/app-settings")
async def api_set_app_setting(body: dict):
    return crud.set_app_setting(body.get("key", ""), body.get("value", ""))


@app.get("/api/app-settings-all")
async def api_get_all_app_settings():
    """批量获取所有 UI 设置"""
    return crud.get_all_app_settings()


@app.post("/api/app-settings-all")
async def api_save_all_app_settings(body: dict):
    """批量保存所有 UI 设置"""
    return crud.save_all_app_settings(body)


# ── 数据库导入导出 ─────────────────────────────────────────

@app.get("/api/database/export")
async def api_export_database():
    """导出数据库文件为 base64 字符串"""
    import base64
    import sys
    
    # 获取数据库路径（支持 PyInstaller 打包后的环境）
    if getattr(sys, 'frozen', False):
        db_path = os.path.join(os.path.dirname(sys.executable), 'data.db')
    else:
        db_path = os.path.join(DATA_DIR, 'data.db')
    
    if not os.path.exists(db_path):
        return {"ok": False, "error": "数据库文件不存在"}
    
    with open(db_path, 'rb') as f:
        data = f.read()
    
    return {
        "ok": True,
        "data": base64.b64encode(data).decode('utf-8'),
        "filename": "li_jie_hr_backup.db"
    }


@app.post("/api/database/import")
async def api_import_database(body: dict):
    """从 base64 字符串导入数据库"""
    import base64
    import shutil
    import sqlite3
    import sys
    
    try:
        base64_data = body.get("data", "")
        if not base64_data:
            return {"ok": False, "error": "没有提供数据"}
        
        # 解码数据
        data = base64.b64decode(base64_data)
        
        # 验证是否为有效的 SQLite 数据库
        if not data.startswith(b'SQLite format 3'):
            return {"ok": False, "error": "无效的数据库文件格式"}
        
        # 获取数据库路径（支持 PyInstaller 打包后的环境）
        if getattr(sys, 'frozen', False):
            db_path = os.path.join(os.path.dirname(sys.executable), 'data.db')
        else:
            db_path = os.path.join(DATA_DIR, 'data.db')
        
        # 备份当前数据库
        backup_path = db_path + '.backup'
        
        if os.path.exists(db_path):
            shutil.copy2(db_path, backup_path)
        
        # 写入新数据库
        with open(db_path, 'wb') as f:
            f.write(data)
        
        # 验证新数据库可以正常打开
        try:
            conn = sqlite3.connect(db_path)
            conn.execute("SELECT 1 FROM departments LIMIT 1")
            conn.close()
        except sqlite3.Error as e:
            # 恢复备份
            if os.path.exists(backup_path):
                shutil.copy2(backup_path, db_path)
            return {"ok": False, "error": f"数据库验证失败: {str(e)}"}
        
        # 删除备份
        if os.path.exists(backup_path):
            os.remove(backup_path)
        
        return {"ok": True}
    
    except Exception as e:
        return {"ok": False, "error": f"导入失败: {str(e)}"}



# ── 数据清理 ────────────────────────────────────────────

@app.delete("/api/data/clean")
async def api_clean_data(
    emp_id: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
):
    """
    清理做货记录/增扣/快捷计算保存。
    参数均可选，不传则清空全部。
    """
    return crud.delete_data_by_filter(emp_id, year, month)


# ── 窗口设置 ──────────────────────────────────────────────

@app.post("/api/window/settings")
async def api_set_window_settings(body: dict):
    """保存窗口设置到配置文件"""
    import json
    import sys
    
    try:
        # 获取配置文件路径（与 main.py 保持一致）
        if getattr(sys, 'frozen', False):
            config_path = os.path.join(os.path.dirname(sys.executable), 'window_settings.json')
        else:
            config_path = os.path.join(DATA_DIR, 'window_settings.json')
        
        # 保存窗口设置
        config = {
            'width': body.get('width', 1400),
            'height': body.get('height', 900),
            'fullscreen': body.get('fullscreen', False),
            'maximized': body.get('maximized', False)
        }
        
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
        
        return {"ok": True}
    
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/api/window/settings")
async def api_get_window_settings():
    """获取窗口设置"""
    import json
    import sys
    
    try:
        # 获取配置文件路径（与 main.py 保持一致）
        if getattr(sys, 'frozen', False):
            config_path = os.path.join(os.path.dirname(sys.executable), 'window_settings.json')
        else:
            config_path = os.path.join(DATA_DIR, 'window_settings.json')
        
        # 读取窗口设置
        if os.path.exists(config_path):
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
            return {"ok": True, "config": config}
        else:
            # 返回默认设置
            return {
                "ok": True,
                "config": {
                    "width": 1400,
                    "height": 900,
                    "fullscreen": False,
                    "maximized": False
                }
            }
    
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ── 自定义字体管理 ────────────────────────────────────────

FONT_CUSTOM_SETTINGS_KEY = 'custom_fonts'


def _get_custom_fonts_list():
    """从数据库读取已保存的自定义字体列表"""
    try:
        result = crud.get_app_setting(FONT_CUSTOM_SETTINGS_KEY)
        if result and isinstance(result, str):
            return json.loads(result)
    except Exception:
        pass
    return []


def _save_custom_fonts_list(fonts_list):
    """保存自定义字体列表到数据库"""
    crud.set_app_setting(FONT_CUSTOM_SETTINGS_KEY, json.dumps(fonts_list, ensure_ascii=False))


def _get_safe_filename(original_name):
    """生成安全的文件名，保留原始扩展名"""
    _, ext = os.path.splitext(original_name)
    ext = ext.lower()
    if ext not in ('.ttf', '.ttc', '.woff', '.woff2', '.otf'):
        ext = '.ttf'
    return str(uuid.uuid4())[:8] + ext


@app.post("/api/fonts/upload")
async def api_upload_font(file: UploadFile = File(...)):
    """上传自定义字体文件"""
    if not file.filename:
        return {"ok": False, "error": "没有选择文件"}

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ('.ttf', '.ttc', '.woff', '.woff2', '.otf'):
        return {"ok": False, "error": "不支持的字体格式，仅支持 .ttf .ttc .woff .woff2 .otf"}

    try:
        content = await file.read()
        if len(content) > 50 * 1024 * 1024:
            return {"ok": False, "error": "字体文件过大（超过 50MB）"}

        safe_name = _get_safe_filename(file.filename)
        file_path = os.path.join(USER_FONTS_DIR, safe_name)

        with open(file_path, 'wb') as f:
            f.write(content)

        display_name = os.path.splitext(file.filename)[0]

        fonts_list = _get_custom_fonts_list()
        existing = next((f for f in fonts_list if f['display_name'] == display_name), None)
        if existing:
            for font_dir in (USER_FONTS_DIR, LEGACY_USER_FONTS_DIR):
                old_path = os.path.join(font_dir, existing['filename'])
                if os.path.exists(old_path):
                    os.remove(old_path)
            existing['filename'] = safe_name
        else:
            fonts_list.append({
                'display_name': display_name,
                'filename': safe_name
            })

        _save_custom_fonts_list(fonts_list)

        return {"ok": True, "display_name": display_name, "filename": safe_name}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/api/fonts/list")
async def api_list_fonts():
    """获取自定义字体列表"""
    fonts_list = _get_custom_fonts_list()
    return {"ok": True, "fonts": fonts_list}


@app.delete("/api/fonts/{filename}")
async def api_delete_font(filename: str):
    """删除自定义字体文件"""
    safe_name = os.path.basename(filename)
    delete_targets = [
        os.path.join(USER_FONTS_DIR, safe_name),
        os.path.join(LEGACY_USER_FONTS_DIR, safe_name),
    ]
    existing_targets = [path for path in delete_targets if os.path.exists(path)]
    if not existing_targets:
        return {"ok": False, "error": "字体文件不存在"}

    try:
        for safe_path in existing_targets:
            os.remove(safe_path)
        fonts_list = _get_custom_fonts_list()
        fonts_list = [f for f in fonts_list if f['filename'] != filename]
        _save_custom_fonts_list(fonts_list)
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}
