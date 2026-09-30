#!/usr/bin/env python3
"""
立杰工资管理系统 - PyInstaller 打包脚本
使用方法: python build.py [--debug] [--clean]
"""

import os
import sys
import shutil
import subprocess

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))


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

    # Clean old builds
    clean_build()
    
    # Build command (use --onedir instead of --onefile for data persistence)
    cmd = [
        build_python, '-m', 'PyInstaller',
        'main.py',
        '--name', '立杰工资管理系统',
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
        clean_build()
        return
    
    debug = '--debug' in args
    build(debug=debug)


if __name__ == '__main__':
    main()
