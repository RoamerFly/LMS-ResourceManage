// ============================================================
// 资源总览
// ============================================================

const OVERVIEW_FAVORITES_KEY = 'li_jie_overview_favorites';
const OVERVIEW_ORDER_KEY = 'li_jie_overview_order';
const DEFAULT_OVERVIEW_FAVORITES = ['members', 'quickcalc', 'salary'];
let overviewDraggingView = '';
let overviewSuppressClickUntil = 0;

const OVERVIEW_FEATURES = [
  {
    view: 'members',
    title: '人员管理',
    desc: '维护人员档案与部门结构',
    iconBg: '#dbeafe',
    iconColor: '#2563eb',
    icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  },
  {
    view: 'quickcalc',
    title: '快捷计算',
    desc: '按部门快速录入数量和单价',
    iconBg: '#d1fae5',
    iconColor: '#059669',
    icon: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  },
  {
    view: 'salary',
    title: '总工资表',
    desc: '汇总部门工资并支持打印',
    iconBg: '#fee2e2',
    iconColor: '#dc2626',
    icon: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  },
  {
    view: 'banking',
    title: '银行卡管理',
    desc: '维护成员银行卡与开户行信息',
    iconBg: '#e0f2fe',
    iconColor: '#0284c7',
    icon: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><path d="M6 15h5"/><path d="M15 15h3"/>',
  },
  {
    view: 'orders',
    title: '订单管理',
    desc: '管理订单、型号与部门单价',
    iconBg: '#fef3c7',
    iconColor: '#d97706',
    icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  },
  {
    view: 'work',
    title: '做货编辑',
    desc: 'Excel 风格录入做货对数',
    iconBg: '#fce7f3',
    iconColor: '#db2777',
    icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  },
  {
    view: 'settings',
    title: '系统设置',
    desc: '调整主题、字体、窗口和数据',
    iconBg: '#ecfdf5',
    iconColor: '#047857',
    icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 16 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.28.35.42.78.4 1.22V12c0 .43-.14.85-.4 1.2z"/>',
  },
];

function getOverviewFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(OVERVIEW_FAVORITES_KEY) || 'null');
    const featureViews = getOverviewFeatureViewSet();
    const source = Array.isArray(saved) ? saved : DEFAULT_OVERVIEW_FAVORITES;
    return uniqueOverviewViews(source).filter(view => featureViews.has(view));
  } catch (e) {
    return [...DEFAULT_OVERVIEW_FAVORITES];
  }
}

function getOverviewFeatureViewSet() {
  return new Set(OVERVIEW_FEATURES.map(item => item.view));
}

function uniqueOverviewViews(views) {
  return [...new Set(views)];
}

function getOverviewOrder() {
  const defaultOrder = OVERVIEW_FEATURES.map(feature => feature.view);
  try {
    const saved = JSON.parse(localStorage.getItem(OVERVIEW_ORDER_KEY) || 'null');
    if (!Array.isArray(saved)) return defaultOrder;

    const featureViews = getOverviewFeatureViewSet();
    const ordered = uniqueOverviewViews(saved).filter(view => featureViews.has(view));
    defaultOrder.forEach(view => {
      if (!ordered.includes(view)) ordered.push(view);
    });
    return ordered;
  } catch (e) {
    return defaultOrder;
  }
}

function saveOverviewFavorites(favorites) {
  localStorage.setItem(OVERVIEW_FAVORITES_KEY, JSON.stringify(uniqueOverviewViews(favorites)));
}

function saveOverviewOrder(order) {
  const featureViews = getOverviewFeatureViewSet();
  const normalized = uniqueOverviewViews(order).filter(view => featureViews.has(view));
  OVERVIEW_FEATURES.forEach(feature => {
    if (!normalized.includes(feature.view)) normalized.push(feature.view);
  });
  localStorage.setItem(OVERVIEW_ORDER_KEY, JSON.stringify(normalized));
}

function moveOverviewItem(list, view, beforeView) {
  const next = list.filter(item => item !== view);
  if (beforeView && beforeView !== view) {
    const index = next.indexOf(beforeView);
    if (index >= 0) {
      next.splice(index, 0, view);
      return next;
    }
  }
  next.push(view);
  return next;
}

function getOverviewSplitLists() {
  const favorites = getOverviewFavorites();
  const favoriteSet = new Set(favorites);
  const others = getOverviewOrder().filter(view => !favoriteSet.has(view));
  return { favorites, others };
}

function persistOverviewSplitLists(favorites, others) {
  const normalizedFavorites = uniqueOverviewViews(favorites);
  const favoriteSet = new Set(normalizedFavorites);
  const normalizedOthers = uniqueOverviewViews(others).filter(view => !favoriteSet.has(view));
  saveOverviewFavorites(normalizedFavorites);
  saveOverviewOrder([...normalizedFavorites, ...normalizedOthers]);
}

function toggleOverviewFavorite(view, event) {
  if (event) event.stopPropagation();
  const { favorites, others } = getOverviewSplitLists();
  const nextFavorites = favorites.includes(view)
    ? favorites.filter(item => item !== view)
    : [...favorites, view];
  const nextOthers = favorites.includes(view)
    ? moveOverviewItem(others, view)
    : others.filter(item => item !== view);
  persistOverviewSplitLists(nextFavorites, nextOthers);
  renderOverviewCards();
}

function navigateOverviewFeature(view, event) {
  if (Date.now() < overviewSuppressClickUntil) {
    if (event) event.preventDefault();
    return;
  }
  navigateWithHistory(view);
}

function onOverviewDragStart(event) {
  const card = event.currentTarget;
  overviewDraggingView = card.dataset.view || '';
  card.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', overviewDraggingView);
}

function onOverviewDragOver(event) {
  event.preventDefault();
  const card = event.currentTarget;
  if (card.dataset.view !== overviewDraggingView) {
    card.classList.add('drag-over');
  }
}

function onOverviewDragLeave(event) {
  event.currentTarget.classList.remove('drag-over');
}

function onOverviewDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  const card = event.currentTarget;
  const grid = card.closest('.overview-grid');
  applyOverviewDrop(grid ? grid.dataset.group : 'others', card.dataset.view);
}

function onOverviewGridDragOver(event) {
  event.preventDefault();
}

function onOverviewGridDrop(event) {
  if (event.target.closest && event.target.closest('.overview-card')) return;
  event.preventDefault();
  applyOverviewDrop(event.currentTarget.dataset.group || 'others', '');
}

function onOverviewDragEnd(event) {
  event.currentTarget.classList.remove('dragging');
  clearOverviewDragOverState();
  overviewDraggingView = '';
}

function clearOverviewDragOverState() {
  document.querySelectorAll('.overview-card.drag-over').forEach(card => {
    card.classList.remove('drag-over');
  });
}

function applyOverviewDrop(targetGroup, beforeView) {
  const view = overviewDraggingView;
  if (!view) return;
  if (beforeView === view) {
    overviewSuppressClickUntil = Date.now() + 300;
    return;
  }

  const { favorites, others } = getOverviewSplitLists();
  let nextFavorites = favorites;
  let nextOthers = others;

  if (targetGroup === 'favorites') {
    nextFavorites = moveOverviewItem(favorites, view, beforeView);
    nextOthers = others.filter(item => item !== view);
  } else {
    nextFavorites = favorites.filter(item => item !== view);
    nextOthers = moveOverviewItem(others, view, beforeView);
  }

  overviewSuppressClickUntil = Date.now() + 300;
  persistOverviewSplitLists(nextFavorites, nextOthers);
  renderOverviewCards();
}

function bindOverviewGridDrop(grid, group) {
  grid.dataset.group = group;
  grid.ondragover = onOverviewGridDragOver;
  grid.ondrop = onOverviewGridDrop;
}

function buildOverviewCard(feature, isFavorite, group) {
  const favoriteTitle = isFavorite ? '移出常用功能' : '设为常用功能';
  return `
    <div class="overview-card" data-view="${feature.view}" data-group="${group}" draggable="true"
      onclick="navigateOverviewFeature('${feature.view}', event)"
      ondragstart="onOverviewDragStart(event)"
      ondragover="onOverviewDragOver(event)"
      ondragleave="onOverviewDragLeave(event)"
      ondrop="onOverviewDrop(event)"
      ondragend="onOverviewDragEnd(event)">
      <button class="overview-favorite-btn${isFavorite ? ' active' : ''}"
        type="button"
        title="${favoriteTitle}"
        aria-label="${favoriteTitle}"
        onclick="toggleOverviewFavorite('${feature.view}', event)">
        <svg viewBox="0 0 24 24" fill="${isFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      </button>
      <div class="oc-icon" style="background:${feature.iconBg};">
        <svg viewBox="0 0 24 24" fill="none" stroke="${feature.iconColor}" stroke-width="2" width="26" height="26">${feature.icon}</svg>
      </div>
      <div class="oc-title">${escHtml(feature.title)}</div>
      <div class="oc-desc">${escHtml(feature.desc)}</div>
    </div>
  `;
}

function renderOverviewCards() {
  const favoriteGrid = document.getElementById('overviewFavoriteGrid');
  const allGrid = document.getElementById('overviewAllGrid');
  if (!favoriteGrid || !allGrid) return;

  const favorites = getOverviewFavorites();
  const favoriteSet = new Set(favorites);
  const favoriteFeatures = favorites
    .map(view => OVERVIEW_FEATURES.find(feature => feature.view === view))
    .filter(Boolean);
  const otherFeatures = getOverviewOrder()
    .filter(view => !favoriteSet.has(view))
    .map(view => OVERVIEW_FEATURES.find(feature => feature.view === view))
    .filter(Boolean);

  bindOverviewGridDrop(favoriteGrid, 'favorites');
  bindOverviewGridDrop(allGrid, 'others');

  favoriteGrid.innerHTML = favoriteFeatures.length
    ? favoriteFeatures.map(feature => buildOverviewCard(feature, true, 'favorites')).join('')
    : '<div class="overview-empty">暂无常用功能</div>';

  allGrid.innerHTML = otherFeatures.length
    ? otherFeatures.map(feature => buildOverviewCard(feature, false, 'others')).join('')
    : '<div class="overview-empty">暂无其他功能</div>';
}

renderOverviewCards();
