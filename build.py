#!/usr/bin/env python3
"""
立杰工资管理系统 - PyInstaller 打包脚本
使用方法: python build.py [--debug] [--clean]
"""

import os
import sys
import shutil
import subprocess
import tempfile

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
APP_NAME = '立杰工资管理系统'
USER_DATA_NAMES = ('data.db', 'window_settings.json', 'fonts')


def find_build_python():
    """优先使用项目虚拟环境，并确保打包环境含有运行时依赖。"""
    venv_python = os.path.join(
        PROJECT_DIR, 'venv', 'Scripts' if os.name == 'nt' else 'bin',
        'python.exe' if os.name == 'nt' else 'python',
    )
    candidates = [venv_python, sys.executable]
    checked = []
    for python in candidates:
        if not os.path.isfile(python) or python in checked:
            continue
        checked.append(python)
        result = subprocess.run(
            [python, '-c', 'import PyInstaller, fastapi, uvicorn, starlette, multipart, webview'],
            cwd=PROJECT_DIR, capture_output=True, text=True,
        )
        if result.returncode == 0:
            return python
        print(f"[Build] Interpreter missing dependencies: {python}")
        print(result.stderr.strip().splitlines()[-1] if result.stderr.strip() else 'Import failed')

    raise RuntimeError(
        '没有可用的完整打包环境。请在项目 venv 中安装 requirements.txt 和 PyInstaller。'
    )


def backup_user_data():
    """在清理 dist 前保存应用运行时数据。"""
    app_dir = os.path.join(PROJECT_DIR, 'dist', APP_NAME)
    existing = [name for name in USER_DATA_NAMES if os.path.exists(os.path.join(app_dir, name))]
    if not existing:
        return None
    backup_dir = tempfile.mkdtemp(prefix='lms-build-data-')
    try:
        for name in existing:
            source = os.path.join(app_dir, name)
            target = os.path.join(backup_dir, name)
            if os.path.isdir(source):
                shutil.copytree(source, target)
            else:
                shutil.copy2(source, target)
            print(f"[Build] Preserved user data: {name}")
    except Exception:
        print(f"[Build] User data backup retained at: {backup_dir}")
        raise
    return backup_dir


def restore_user_data(backup_dir):
    """无论构建成功与否，都把用户数据放回 dist。"""
    if not backup_dir:
        return
    app_dir = os.path.join(PROJECT_DIR, 'dist', APP_NAME)
    try:
        os.makedirs(app_dir, exist_ok=True)
        for name in os.listdir(backup_dir):
            source = os.path.join(backup_dir, name)
            target = os.path.join(app_dir, name)
            if os.path.isdir(source):
                shutil.copytree(source, target, dirs_exist_ok=True)
            else:
                shutil.copy2(source, target)
    except Exception:
        print(f"[Build] User data restore failed; backup retained at: {backup_dir}")
        raise
    temp_root = os.path.realpath(tempfile.gettempdir())
    backup_path = os.path.realpath(backup_dir)
    if (os.path.commonpath((temp_root, backup_path)) != temp_root or
            not os.path.basename(backup_path).startswith('lms-build-data-')):
        raise RuntimeError(f'拒绝删除非临时备份目录: {backup_dir}')
    shutil.rmtree(backup_dir)
    print('[Build] User data restored')


def clean_build():
    """清理构建文件"""
    print("[Clean] Removing build files...")
    dirs_to_remove = ['build', 'dist']
    for d in dirs_to_remove:
        target = os.path.join(PROJECT_DIR, d)
        if os.path.exists(target):
            shutil.rmtree(target)
            print(f"  Removed: {d}")

    print("[Clean] Done!")


def build(debug=False):
    """打包应用程序"""
    print("=" * 50)
    print("  立杰工资管理系统 - 打包")
    print("=" * 50)
    print()
    
    # 缺依赖时保留上一次可用的 dist，不生成缺少服务模块的 exe。
    build_python = find_build_python()
    print(f"[Build] Python: {build_python}")

    backup_dir = backup_user_data()
    try:
        # Clean old builds
        clean_build()
    
        # Build command (use --onedir instead of --onefile for data persistence)
        cmd = [
            build_python, '-m', 'PyInstaller',
            'main.py',
            '--name', APP_NAME,
            '--onedir',  # Directory mode: data persists in the folder
            '--icon', '立杰鞋业工资管理系统.ico',
            '--add-data', 'web;web',
            '--add-data', 'database;database',
            '--add-data', 'services;services',
            '--add-data', 'b.json;.',
            '--add-data', 'api.py;.',
            '--add-data', 'api_server.py;.',
            '--hidden-import', 'webview',
            '--hidden-import', 'webview.platforms.winforms',
            '--clean',
            '--noconfirm',
        ]
    
        if debug:
            cmd.append('--console')
            print("[Build] Debug mode (with console window)")
        else:
            cmd.append('--windowed')
            print("[Build] Normal mode (no console window)")
    
        print()
        print("[Build] Starting...")
        print("[Build] This may take a few minutes, please wait...")
        print()
    
        result = subprocess.run(cmd, cwd=PROJECT_DIR)
    finally:
        restore_user_data(backup_dir)
    
    if result.returncode == 0:
        print()
        print("=" * 50)
        print("  Build Successful!")
        print("=" * 50)
        print()
        print("Output: dist\\立杰工资管理系统\\立杰工资管理系统.exe")
        print()
        print("You can distribute the 'dist' folder to other machines.")
        print("No Python installation required on target machines.")
    else:
        print()
        print("[Error] Build failed!")
        sys.exit(1)


def main():
    args = sys.argv[1:]
    
    if '--clean' in args:
        backup_dir = backup_user_data()
        try:
            clean_build()
        finally:
            restore_user_data(backup_dir)
        return
    
    debug = '--debug' in args
    build(debug=debug)


if __name__ == '__main__':
    main()
