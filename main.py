"""pywebview 入口 - 启动 FastAPI 后台服务 + 渲染窗口"""
import atexit
import ctypes
import webview
import threading
import time
import sys
import os
import json
import webbrowser
from urllib import request
from ctypes import wintypes

# 解决 Windows 上的 stdout 缓冲问题
sys.stdout.reconfigure(line_buffering=True)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SINGLE_INSTANCE_MUTEX_NAME = "Local\\LiJieWageSystemSingleton"
_single_instance_mutex = None


def ensure_single_instance():
    """Prevent launching multiple app instances at the same time."""
    global _single_instance_mutex
    if os.name != "nt":
        return True

    kernel32 = ctypes.windll.kernel32
    user32 = ctypes.windll.user32
    kernel32.CreateMutexW.argtypes = [ctypes.c_void_p, wintypes.BOOL, wintypes.LPCWSTR]
    kernel32.CreateMutexW.restype = wintypes.HANDLE
    kernel32.GetLastError.restype = wintypes.DWORD
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel32.CloseHandle.restype = wintypes.BOOL
    user32.MessageBoxW.argtypes = [wintypes.HWND, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.UINT]
    user32.MessageBoxW.restype = ctypes.c_int

    _single_instance_mutex = kernel32.CreateMutexW(None, False, SINGLE_INSTANCE_MUTEX_NAME)
    if not _single_instance_mutex:
        return True

    if kernel32.GetLastError() == 183:  # ERROR_ALREADY_EXISTS
        user32.MessageBoxW(
            None,
            "立杰工资管理系统已经在运行，请不要重复打开。",
            "立杰工资管理系统",
            0x00000030,
        )
        kernel32.CloseHandle(_single_instance_mutex)
        _single_instance_mutex = None
        return False

    return True


def release_single_instance():
    """Release the single-instance lock on app exit."""
    global _single_instance_mutex
    if os.name != "nt" or not _single_instance_mutex:
        return
    try:
        ctypes.windll.kernel32.CloseHandle(_single_instance_mutex)
    except Exception:
        pass
    _single_instance_mutex = None


def get_window_settings():
    """读取窗口设置配置文件"""
    try:
        # 获取配置文件路径（支持 PyInstaller 打包后的环境）
        if getattr(sys, 'frozen', False):
            config_path = os.path.join(os.path.dirname(sys.executable), 'window_settings.json')
        else:
            config_path = os.path.join(BASE_DIR, 'window_settings.json')
        
        if os.path.exists(config_path):
            with open(config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception:
        pass
    
    # 返回默认设置
    return {
        "width": 1400,
        "height": 900,
        "fullscreen": False,
        "maximized": True
    }


def start_fastapi():
    """在独立线程中启动 FastAPI（uvicorn）"""
    import uvicorn
    # 使用 --reload 会开启文件监控，不适合打包场景
    # 直接用 uvicorn API 启动，避免子进程问题
    from api_server import app
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8765,
        log_level="error",
        access_log=False,
    )


def wait_for_server(url="http://127.0.0.1:8765", timeout=20):
    """Wait until the local FastAPI server is ready."""
    deadline = time.time() + timeout
    last_error = None
    while time.time() < deadline:
        try:
            with request.urlopen(url, timeout=1):
                return True, None
        except Exception as exc:
            last_error = exc
            time.sleep(0.2)
    return False, last_error


if __name__ == "__main__":
    if not ensure_single_instance():
        sys.exit(0)
    atexit.register(release_single_instance)

    # 初始化数据库
    from services.db import init_database
    init_database()

    # 后台启动 FastAPI
    server_thread = threading.Thread(target=start_fastapi, daemon=True)
    server_thread.start()
    server_ready, server_error = wait_for_server()

    # 读取窗口设置
    win_settings = get_window_settings()
    
    # 全屏模式和最大化窗口互斥
    is_fullscreen = win_settings.get('fullscreen', False)
    is_maximized = win_settings.get('maximized', True)
    
    # 如果两者都为 True，优先使用全屏模式（避免冲突）
    if is_fullscreen and is_maximized:
        is_maximized = False
    
    # 创建 pywebview 窗口
    # 计算窗口位置：水平居中，垂直顶部对齐（避免被任务栏遮挡）
    import ctypes
    try:
        # 获取主屏幕分辨率
        user32 = ctypes.windll.user32
        screen_width = user32.GetSystemMetrics(0)
        screen_height = user32.GetSystemMetrics(1)
        
        win_width = win_settings.get('width', 1400)
        win_height = win_settings.get('height', 900)
        
        # 计算居中位置
        x = max(0, (screen_width - win_width) // 2)
        y = 0  # 从屏幕顶部开始，避免被任务栏遮挡
    except Exception:
        x = 100
        y = 0
    
    if server_ready:
        window = webview.create_window(
            title="立杰工资管理系统",
            url="http://127.0.0.1:8765",
            width=win_settings.get('width', 1400),
            height=win_settings.get('height', 900),
            x=x,
            y=y,
            fullscreen=is_fullscreen,
            maximized=is_maximized,
            min_size=(1000, 680),
            resizable=True,
        )
    else:
        error_text = str(server_error or "未知错误").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        error_html = f"""
        <!doctype html>
        <html lang="zh-CN">
        <head>
          <meta charset="utf-8">
          <title>立杰工资管理系统</title>
          <style>
            body {{
              margin: 0;
              font-family: "Microsoft YaHei", sans-serif;
              background: #f7f8fb;
              color: #1f2937;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
            }}
            .card {{
              width: min(760px, calc(100vw - 48px));
              background: #fff;
              border-radius: 18px;
              box-shadow: 0 18px 48px rgba(15, 23, 42, 0.12);
              padding: 32px;
            }}
            h1 {{
              margin: 0 0 12px;
              font-size: 28px;
            }}
            p {{
              line-height: 1.7;
              margin: 10px 0;
            }}
            code {{
              display: block;
              margin-top: 16px;
              padding: 14px 16px;
              border-radius: 12px;
              background: #f3f4f6;
              color: #b91c1c;
              white-space: pre-wrap;
              word-break: break-all;
            }}
          </style>
        </head>
        <body>
          <div class="card">
            <h1>本地服务启动失败</h1>
            <p>程序窗口已经打开，但内置的本地页面服务没有成功启动，所以暂时无法加载主界面。</p>
            <p>请优先使用调试打包，或在项目目录里直接运行 <code>python main.py</code> 查看详细报错。</p>
            <code>{error_text}</code>
          </div>
        </body>
        </html>
        """
        window = webview.create_window(
            title="立杰工资管理系统",
            html=error_html,
            width=win_settings.get('width', 1400),
            height=win_settings.get('height', 900),
            x=x,
            y=y,
            fullscreen=is_fullscreen,
            maximized=is_maximized,
            min_size=(1000, 680),
            resizable=True,
        )
    
    # 暴露 Python 函数给 JS 调用（用于运行时切换全屏/最大化）
    def _toggle_fullscreen():
        """切换全屏模式"""
        try:
            window.toggle_fullscreen()
            return True
        except Exception as e:
            print(f"切换全屏失败: {e}")
            return False

    def _toggle_maximize():
        """切换最大化模式"""
        try:
            if window.attributes.fullscreen:
                window.toggle_fullscreen()
            else:
                if window.ui_state['inactive'] or not window.ui_state['maximized']:
                    window.maximize()
                else:
                    window.restore()
            return True
        except Exception as e:
            print(f"切换最大化失败: {e}")
            return False

    def _open_external_url(url: str):
        """在系统默认浏览器中打开网页链接。"""
        try:
            target = str(url or "").strip()
            if not target.startswith(("http://", "https://")):
                return False
            webbrowser.open(target)
            return True
        except Exception as e:
            print(f"打开外部链接失败: {e}")
            return False

    class ApiBridge:
        def toggle_fullscreen(self):
            return _toggle_fullscreen()

        def toggle_maximize(self):
            return _toggle_maximize()

        def open_external_url(self, url: str):
            return _open_external_url(url)

    # 将函数暴露给 JS: pywebview.api.toggle_fullscreen()
    webview.api = ApiBridge()
    
    # 如果设置了最大化（且不是全屏），在窗口加载完成后最大化
    if is_maximized and not is_fullscreen:
        def on_loaded():
            try:
                window.maximize()
            except Exception as e:
                print(f"最大化窗口失败: {e}")
        window.events.loaded += on_loaded

    # 窗口关闭前保存设置（使用线程非阻塞方式）
    def on_closing():
        try:
            def save_in_thread():
                try:
                    window.evaluate_js("""
                        if (typeof saveSettings === 'function') {
                            try { saveSettings(true); } catch(e) { console.error(e); }
                        }
                    """)
                except Exception:
                    pass
            threading.Thread(target=save_in_thread, daemon=True).start()
        except Exception:
            pass

    window.events.closing += on_closing

    webview.start(debug=False)
