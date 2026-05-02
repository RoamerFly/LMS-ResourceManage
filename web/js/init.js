// ============================================================
// 初始化
// ============================================================
(async function init() {
  try {
    await loadSettings(); // 加载用户设置到 _currentSettings（从数据库优先）
    initMonthPickers();
    await initQcSwitch();
    // 预加载自定义字体的 @font-face（确保 applyAllSettings 时字体已可用）
    try { await loadCustomFontsList(); } catch(e) { console.log('预加载字体失败:', e); }
    await loadMembers();
    document.getElementById('topbarHint').textContent = '立杰工资管理系统 v4.0';
    // 应用已加载的设置（触发 CSS 变量生效）
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => applyAllSettings());
    } else {
      applyAllSettings();
    }
  } catch (err) {
    console.error('初始化失败:', err);
    document.getElementById('topbarHint').textContent = '系统初始化失败，请刷新重试';
  } finally {
    // 无论成功失败都隐藏加载遮罩
    hideLoadingOverlay();
  }
})();

// 隐藏加载遮罩
function hideLoadingOverlay() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 300);
  }
}
