"""只打包程序及公共资源，禁止将本机数据库和私人模板作为 Release 附件。"""
import argparse
import hashlib
import re
import zipfile
from pathlib import Path

import xlrd


def package(version):
    if not re.fullmatch(r'v\d+\.\d+\.\d+', version):
        raise ValueError('版本号格式必须为 v主版本.次版本.修订号')
    root = Path(__file__).resolve().parents[1]
    app = root / 'dist' / '立杰工资管理系统'
    assert (app / '立杰工资管理系统.exe').is_file(), '请先运行 python build.py'
    public = root / 'resources' / 'bank-card-template.xls'
    assert (app / '_internal/resources/bank-card-template.xls').read_bytes() == public.read_bytes()
    sheet = xlrd.open_workbook(str(public), formatting_info=True).sheet_by_index(0)
    assert all(sheet.cell_value(r, c) == '' for r in range(1, sheet.nrows) for c in range(sheet.ncols)), '公共模板必须为空'
    assets = root / 'release-assets'
    assets.mkdir(exist_ok=True)
    archive = assets / f'LMS-ResourceManage-{version}-windows-x64.zip'
    excluded = {'data.db', 'data_personal.db', 'window_settings.json', 'bank-card-template.xls', '工资表模板-9月工资.xls'}
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as output:
        for path in sorted(app.rglob('*')):
            if not path.is_file():
                continue
            relative = path.relative_to(app)
            if '__pycache__' in relative.parts or path.suffix.lower() in {'.db', '.sqlite', '.sqlite3', '.pyc', '.pyo'}:
                continue
            if relative.parts[0] == 'fonts' or (len(relative.parts) == 1 and path.name in excluded):
                continue
            assert path.resolve().is_relative_to(app.resolve()), '程序目录不能含外部链接'
            output.write(path, f'{app.name}/{relative.as_posix()}')
        output.writestr(f'{app.name}/使用与升级说明.txt',
            '立杰工资管理系统 ' + version + '\n\n'
            '首次使用：完整解压 ZIP 后运行“立杰工资管理系统.exe”，不要单独移动 EXE。\n'
            '需要 Windows 10/11 x64 和 Microsoft Edge WebView2 Runtime。\n'
            '程序首次启动会在软件目录创建本地数据库。银行卡初始为空白公共模板。\n\n'
            '升级：先保存并关闭旧软件，备份旧目录，再解压新版到新目录。\n'
            '将旧目录的 data.db、bank-card-template.xls、window_settings.json 和 fonts 文件夹（如存在）复制到新目录后启动。\n'
            '请保留自己的银行卡模板，不要用公共空白模板替换私人模板。\n'
            '本发行包不含任何用户数据库、人员工资、银行卡账号或本机设置。\n')
    with zipfile.ZipFile(archive) as output:
        assert output.testzip() is None, 'ZIP 校验失败'
        assert f'{app.name}/立杰工资管理系统.exe' in output.namelist()
        assert not any(Path(name).suffix.lower() in {'.db', '.sqlite', '.sqlite3', '.pyc'} for name in output.namelist())
    checksum = assets / 'SHA256SUMS.txt'
    checksum.write_text(f'{hashlib.sha256(archive.read_bytes()).hexdigest()}  {archive.name}\n', encoding='utf-8')
    print(f'Release ZIP: {archive.name} ({archive.stat().st_size} bytes)')
    print('SHA256:', hashlib.sha256(archive.read_bytes()).hexdigest())


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('version')
    package(parser.parse_args().version)
