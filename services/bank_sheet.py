"""独立银行卡表：读取原 XLS，保留 BIFF 格式记录，仅替换导出值。"""
import copy
import hashlib
import json
import math
import struct
from contextlib import closing
from pathlib import Path

import olefile
import xlrd

from services.db import get_base_dir, get_connection
from services import independent_sheet

TEMPLATE_NAMES = ('bank-card-template.xls', '工资表模板-9月工资.xls')
_cache = {}


def template_path():
    for name in TEMPLATE_NAMES:
        path = Path(get_base_dir()) / name
        if path.is_file():
            return path
    raise ValueError('未找到银行卡 XLS 模板，请将 bank-card-template.xls 放在软件目录')


def _records(data):
    pos = 0
    while pos + 4 <= len(data):
        code, size = struct.unpack_from('<HH', data, pos)
        if code == 0 and size == 0:
            break
        yield code, data[pos + 4:pos + 4 + size]
        pos += size + 4


def _record(code, data):
    return struct.pack('<HH', code, len(data)) + data


def _template():
    path = template_path()
    raw = path.read_bytes()
    key = hashlib.sha256(raw).hexdigest()
    if key in _cache:
        return _cache[key]
    book = xlrd.open_workbook(file_contents=raw, formatting_info=True)
    if book.nsheets != 1:
        raise ValueError('银行卡模板须为单工作表 XLS 文件')
    sheet = book.sheet_by_index(0)
    def rgb(index, fallback):
        value = book.colour_map.get(index)
        return '#' + ''.join(f'{v:02x}' for v in value) if value else fallback
    cells, styles = {}, {}
    for r in range(sheet.nrows):
        for c in range(sheet.ncols):
            xf_id = sheet.cell_xf_index(r, c)
            if xf_id not in styles:
                xf = book.xf_list[xf_id]
                font = book.font_list[xf.font_index]
                style = {'ff': font.name, 'fs': font.height / 20, 'bl': int(font.bold), 'it': int(font.italic),
                    'cl': {'rgb': rgb(font.colour_index, '#000000')},
                    'ht': {0:0, 1:1, 2:2, 3:3}.get(xf.alignment.hor_align, 0),
                    'vt': {0:1, 1:2, 2:3}.get(xf.alignment.vert_align, 2),
                    'tb': 3 if xf.alignment.text_wrapped else 0,
                    'n': {'pattern': book.format_map[xf.format_key].format_str}}
                if xf.background.fill_pattern == 1:
                    style['bg'] = {'rgb': rgb(xf.background.pattern_colour_index, '#ffffff')}
                border = {}
                for side, short in [('left','l'),('right','r'),('top','t'),('bottom','b')]:
                    line = getattr(xf.border, side + '_line_style')
                    if line:
                        border[short] = {'s': line, 'cl': {'rgb': rgb(getattr(xf.border, side + '_colour_index'), '#000000')}}
                if border:
                    style['bd'] = border
                styles[xf_id] = style
            cell = sheet.cell(r, c)
            value = cell.value if cell.ctype in (xlrd.XL_CELL_TEXT, xlrd.XL_CELL_NUMBER) else ''
            cells.setdefault(r, {})[c] = {'v': value, 't': 2 if isinstance(value, (int,float)) else 1, 's': copy.deepcopy(styles[xf_id])}
            # 编辑器使用文本语义保存长账号；导出仍使用原模板 XF，不改模板数字格式。
            if r > 0 and c in (0,1,6):
                cells[r][c]['s']['n']={'pattern':'@'}
    result = {'raw': raw, 'book': book, 'sheet': sheet, 'hash': key,
        'data': {'id': 'bank-cards', 'name': '银行卡', 'rowCount': sheet.nrows, 'columnCount': sheet.ncols,
            'cellData': cells, 'mergeData': [{'startRow':a,'endRow':b-1,'startColumn':c,'endColumn':d-1} for a,b,c,d in sheet.merged_cells],
            'rowData': {r:{'h':i.height / 20 * 96 / 72} for r,i in sheet.rowinfo_map.items()},
            'columnData': {c:{'w':i.width / 256 * 7 + 5} for c,i in sheet.colinfo_map.items()},
            'defaultRowHeight':20, 'defaultColumnWidth':90,
            'rowHeader':{'width':42}, 'columnHeader':{'height':25},
            'freeze':{'startRow':1,'startColumn':0,'ySplit':1,'xSplit':0}}}
    _cache.clear()
    _cache[key] = result
    return result


def blank_columns():
    with closing(get_connection()) as conn:
        row = conn.execute("SELECT value FROM app_settings WHERE key='bank_blank_columns'").fetchone()
    return json.loads(row[0]) if row else [3]


def set_blank_columns(columns):
    cols = sorted(set(columns))
    if any(type(c) is not int or not 0 <= c < _template()['sheet'].ncols for c in cols):
        raise ValueError('列编号无效')
    with closing(get_connection()) as conn, conn:
        conn.execute("INSERT OR REPLACE INTO app_settings(key,value) VALUES('bank_blank_columns',?)", (json.dumps(cols),))
    return {'ok': True, 'columns': cols}


def validate_cells(cells, row_count=None):
    if not isinstance(cells, dict):
        raise ValueError('银行卡数据格式无效')
    sheet = _template()['sheet']
    result = {}
    for key, value in cells.items():
        try:
            r, c = map(int, key.split(','))
        except (ValueError, AttributeError):
            raise ValueError('银行卡单元格坐标无效')
        if not 1 <= r < (row_count or sheet.nrows) or not 0 <= c < sheet.ncols:
            raise ValueError('银行卡单元格超出已保存的行列范围')
        if value is None:
            value = ''
        if isinstance(value, bool) or not isinstance(value, (str, int, float)):
            raise ValueError('仅支持文本和数值')
        if isinstance(value, float) and not math.isfinite(value):
            raise ValueError('数值无效')
        if len(str(value)) > 2000:
            raise ValueError('单元格文本过长')
        if c in (0,1,6):
            if isinstance(value,(int,float)) and abs(value)>9007199254740991:
                raise ValueError('长账号请使用文本格式')
            value=str(value)
        result[f'{r},{c}'] = value
    return result


def load_sheet(year, month):
    template = _template()
    with closing(get_connection()) as conn, conn:
        saved = conn.execute('SELECT state FROM independent_bank_periods WHERE year=? AND month=?', (year,month)).fetchone()
        monthly = json.loads(saved[0]) if saved else None
        if monthly is None:
            legacy = conn.execute('SELECT cells FROM quick_calc_bank_cells WHERE year=? AND month=?', (year,month)).fetchone()
            if legacy:
                monthly = independent_sheet.identify(template['data'])
                for key,value in json.loads(legacy[0]).items():
                    r,c = key.split(',')
                    if int(r)<monthly['rowCount']:
                        monthly['cellData'].setdefault(r,{})[c] = {**monthly['cellData'].get(r,{}).get(c,{}),'v':value,'t':2 if isinstance(value,(int,float)) else 1}
        shared = independent_sheet.default_state(conn,'bank-cards') or template['data']
        data = independent_sheet.merge(shared, monthly, independent_sheet.blank_columns(conn,'bank-cards'))
        conn.execute('INSERT OR REPLACE INTO independent_bank_periods VALUES (?,?,?)', (year,month,json.dumps(data,ensure_ascii=False)))
        values = {f'{r},{c}':cell.get('v','') for r,cols in data['cellData'].items() if int(r)>0 for c,cell in cols.items()}
        conn.execute('INSERT OR REPLACE INTO quick_calc_bank_cells VALUES (?,?,?)',(year,month,json.dumps(values,ensure_ascii=False)))
    return {'data':data, 'cells':values, 'template_hash':template['hash'], 'blank_columns':blank_columns()}


def save_sheet(conn, year, month, cells, state=None):
    if state is None:
        row = conn.execute('SELECT state FROM independent_bank_periods WHERE year=? AND month=?',(year,month)).fetchone()
        state = json.loads(row[0]) if row else independent_sheet.identify(_template()['data'])
    state = independent_sheet.validate(state, bank=True)
    if state['columnCount'] != _template()['sheet'].ncols:
        raise ValueError('银行卡表保留原模板列结构')
    cells = validate_cells(cells or {}, state['rowCount'])
    for key,value in cells.items():
        r,c = key.split(',')
        state.setdefault('cellData',{}).setdefault(r,{}).setdefault(c,{}).update(v=value,t=2 if isinstance(value,(int,float)) else 1)
    independent_sheet.save(conn,'bank-cards',year,month,state)
    conn.execute('INSERT OR REPLACE INTO quick_calc_bank_cells VALUES (?,?,?)',(year,month,json.dumps(cells,ensure_ascii=False)))


def _compound_with_workbook(raw, workbook):
    """重建 CFB 容器，保留全部原始流（包括 WPS 扩展及文档属性）。"""
    free, end, fat_mark = 0xffffffff, 0xfffffffe, 0xfffffffd
    if struct.unpack_from('<H',raw,30)[0] != 9:
        raise ValueError('银行卡模板须为标准 BIFF8 XLS 文件')
    original_fat = []
    for sid in struct.unpack_from('<109I',raw,76):
        if sid != free:
            original_fat.extend(struct.unpack('<128I',raw[(sid+1)*512:(sid+2)*512]))
    def chain(start):
        out = bytearray(); seen = set()
        while start not in (end,free):
            if start in seen or start >= len(original_fat):
                raise ValueError('模板目录链无效')
            seen.add(start); out.extend(raw[(start+1)*512:(start+2)*512]); start=original_fat[start]
        return out
    directory = chain(struct.unpack_from('<I',raw,48)[0])
    chunks, fat = [], []
    def allocate(data):
        if not data:
            return end
        start=len(chunks); count=(len(data)+511)//512
        for n in range(count):
            chunks.append(data[n*512:(n+1)*512].ljust(512,b'\0'))
            fat.append(start+n+1 if n+1<count else end)
        return start
    mini=bytearray(); mini_fat=[]
    with olefile.OleFileIO(raw) as ole:
        for sid,entry in enumerate(ole.direntries):
            if not entry or entry.entry_type != 2:
                continue
            # 模板所有流均位于根目录；目录树、CLSID、名称及时间戳原样保留。
            data = workbook if entry.name == 'Workbook' else ole.openstream(entry.name).read()
            if len(data) >= 4096:
                start=allocate(data)
            elif data:
                start=len(mini_fat); count=(len(data)+63)//64
                mini.extend(data.ljust(count*64,b'\0'))
                mini_fat.extend(start+n+1 if n+1<count else end for n in range(count))
            else:
                start=end
            struct.pack_into('<IQ',directory,sid*128+116,start,len(data))
    root_start=allocate(bytes(mini)); struct.pack_into('<IQ',directory,116,root_start,len(mini))
    mini_data=struct.pack('<'+'I'*len(mini_fat),*mini_fat) if mini_fat else b''
    mini_data=mini_data.ljust((len(mini_data)+511)//512*512,b'\xff')
    mini_start=allocate(mini_data); directory_start=allocate(bytes(directory))
    count=1
    while count != (len(chunks)+count+127)//128:
        count=(len(chunks)+count+127)//128
    if count > 109:
        raise ValueError('导出内容超出银行卡模板容量')
    fat_ids=list(range(len(chunks),len(chunks)+count)); fat.extend([fat_mark]*count)
    fat.extend([free]*(count*128-len(fat)))
    fat_data=struct.pack('<'+'I'*len(fat),*fat)
    header=bytearray(raw[:512])
    struct.pack_into('<III',header,40,0,count,directory_start)
    struct.pack_into('<IIII',header,56,4096,mini_start,len(mini_data)//512,end)
    struct.pack_into('<I',header,72,0)
    struct.pack_into('<109I',header,76,*(fat_ids+[free]*(109-count)))
    return bytes(header)+b''.join(chunks)+fat_data


def export_sheet(year, month):
    template=_template(); loaded=load_sheet(year,month); values=loaded['cells']; data=loaded['data']; sheet=template['sheet']
    def source_row(r):
        custom=data.get('rowData',{}).get(str(r),{}).get('custom',{})
        identity=custom.get('lmsRowId',f'original-{r}')
        source=int(identity.removeprefix('original-')) if identity.startswith('original-') else custom.get('templateRow',sheet.nrows-1)
        return max(0,min(source,sheet.nrows-1))
    changed_structure=data['rowCount']!=sheet.nrows or any(source_row(r)!=r for r in range(data['rowCount']))
    with olefile.OleFileIO(template['raw']) as ole:
        stream=ole.openstream('Workbook').read()
    records=list(_records(stream)); globals_end=next(i for i,(code,_) in enumerate(records) if code==0x000a)
    global_records=records[:globals_end+1]; sheet_records=records[globals_end+1:]
    pending=dict(values)
    def cell_record(r,c,xf,value):
        head=struct.pack('<HHH',r,c,xf)
        if value is None or value=='':
            return _record(0x0201,head)
        if isinstance(value,(int,float)):
            return _record(0x0203,head+struct.pack('<d',value))
        encoded=str(value).encode('utf-16le')
        return _record(0x0204,head+struct.pack('<HB',len(encoded)//2,1)+encoded)
    output=[]
    original_rows={struct.unpack_from('<H',body)[0]:body for code,body in sheet_records if code==0x0208}
    for code,body in sheet_records:
        if code in (0x020b,0x00d7):
            continue
        if code==0x0200:  # DIMENSIONS，扩大有效行范围。
            body=struct.pack('<II',0,data['rowCount'])+body[8:]
        if code==0x0208 and changed_structure:
            continue
        if code in (0x00bd,0x00be):
            r,c=struct.unpack_from('<HH',body)
            if r>0:
                continue
        if code in (0x0203,0x027e,0x00fd,0x0204,0x0201,0x0205,0x0006) and len(body)>=6:
            r,c,xf=struct.unpack_from('<HHH',body)
            if r>0:
                continue
        if code==0x000a:
            if changed_structure:
                for r in range(data['rowCount']):
                    original=original_rows.get(source_row(r))
                    if original:
                        output.append(_record(0x0208,struct.pack('<H',r)+original[2:]))
            for r in range(1,data['rowCount']):
                for c in range(data['columnCount']):
                    output.append(cell_record(r,c,sheet.cell_xf_index(source_row(r),c),values.get(f'{r},{c}','')))
        output.append(_record(code,body))
    # 全局格式、字体、SST、PALETTE 等记录未重新生成，唯一工作表起点也保持原值。
    workbook=b''.join(_record(code,body) for code,body in global_records)+b''.join(output)
    return _compound_with_workbook(template['raw'],workbook)
