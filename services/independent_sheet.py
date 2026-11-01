"""独立表共享行结构及固定列；指定置空列按稳定行标识分别保存。"""
import copy
import json


def identify(data):
    data = json.loads(json.dumps(data))
    for r in range(data['rowCount']):
        row = data.setdefault('rowData', {}).setdefault(str(r), {})
        row.setdefault('custom', {}).setdefault('lmsRowId', f'original-{r}')
    return data


def default_state(conn, key):
    row = conn.execute('SELECT state FROM independent_sheet_defaults WHERE sheet_key=?', (key,)).fetchone()
    return json.loads(row[0]) if row else None


def blank_columns(conn, key):
    setting = 'bank_blank_columns' if key == 'bank-cards' else f'{key}_blank_columns'
    row = conn.execute('SELECT value FROM app_settings WHERE key=?', (setting,)).fetchone()
    return json.loads(row[0]) if row else ([3] if key == 'bank-cards' else [])


def merge(shared, monthly, columns):
    """行插入/删除后按行身份取月度值，不能按变动后的行号串位。"""
    shared = identify(shared)
    monthly = identify(monthly) if monthly else None
    rows = {v['custom']['lmsRowId']: k for k, v in (monthly or {}).get('rowData', {}).items()}
    result = copy.deepcopy(shared)
    for r in range(1, result['rowCount']):
        old_r = rows.get(result['rowData'][str(r)]['custom']['lmsRowId'])
        for c in columns:
            cell = result.setdefault('cellData', {}).setdefault(str(r), {}).setdefault(str(c), {})
            old = (monthly or {}).get('cellData', {}).get(str(old_r), {}).get(str(c), {}) if old_r is not None else {}
            # 保留目标月份的值/公式/富文本，采用当前共享结构的样式。
            for field in ('v', 't', 'p', 'f', 'si'):
                cell.pop(field, None)
                if field in old:
                    cell[field] = copy.deepcopy(old[field])
            if not any(field in cell for field in ('v', 'p', 'f')):
                cell.update(v='', t=1)
    return result


def save(conn, key, year, month, state):
    state = identify(state)
    conn.execute('INSERT OR REPLACE INTO independent_sheet_defaults VALUES (?,?)',
                 (key, json.dumps(state, ensure_ascii=False)))
    if key == 'bank-cards':
        conn.execute('INSERT OR REPLACE INTO independent_bank_periods VALUES (?,?,?)',
                     (year, month, json.dumps(state, ensure_ascii=False)))
    else:
        conn.execute('UPDATE custom_grid_periods SET state=? WHERE sheet_id=? AND year=? AND month=?',
                     (json.dumps(state, ensure_ascii=False), int(key.removeprefix('custom-grid-')), year, month))
    return state


def validate(state, bank=False):
    if not isinstance(state, dict) or type(state.get('rowCount')) is not int or type(state.get('columnCount')) is not int:
        raise ValueError('独立表行列结构无效')
    if not (2 if bank else 1) <= state['rowCount'] <= 5000 or not 1 <= state['columnCount'] <= 100:
        raise ValueError('独立表支持2至5000行、1至100列')
    if not isinstance(state.get('cellData', {}), dict):
        raise ValueError('独立表单元格数据无效')
    return identify(state)
