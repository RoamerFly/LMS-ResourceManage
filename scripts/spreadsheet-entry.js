import { createUniver, LocaleType } from '@univerjs/presets';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import zhCN from '@univerjs/preset-sheets-core/locales/zh-CN';
import '@univerjs/preset-sheets-core/lib/index.css';

// 只把依赖构建成离线资源；业务适配器仍保留为可读的项目源码。
window.LmsSheetEngine = { createUniver, LocaleType, UniverSheetsCorePreset, zhCN };
