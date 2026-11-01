# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[('web', 'web'), ('database', 'database'), ('services', 'services'), ('b.json', '.'), ('resources', 'resources'), ('api.py', '.'), ('api_server.py', '.')],
    hiddenimports=['webview', 'webview.platforms.winforms', 'xlrd', 'olefile'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='立杰工资管理系统',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['立杰鞋业工资管理系统.ico'],
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='立杰工资管理系统',
)
