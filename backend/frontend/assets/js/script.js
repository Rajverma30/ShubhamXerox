// Theme Initialization (Instant to prevent flash)
(function () {
  const savedTheme = localStorage.getItem('shubham_theme') || 'light';
  if (savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme'); // light is default
  }
})();

// Supabase Init
let _supabaseInstance = null;

function getSupabase() {
  if (_supabaseInstance) return _supabaseInstance;
  const sb = window.supabase || window.supabaseJs;
  const url = window.ENV_SUPABASE_URL;
  const key = window.ENV_SUPABASE_KEY;
  if (sb && sb.createClient && url && key) {
    try {
      _supabaseInstance = sb.createClient(url, key);
      console.log('Supabase connected');
    } catch (e) {
      console.error("Supabase init error:", e);
    }
  } else if (!url || !key) {
    console.error("Supabase config not found! Did config.js load?");
  }
  return _supabaseInstance;
}

// Constants
const ADMIN_PHONE = "6265660387";
const WHATSAPP_NUMBER = "919826462963";
const DELIVERY_FEE = 70;
const CE_BINDING_FEES = { none: 0, spiral: 30, pin: 20 };
const API_BASE = window.API_BASE_URL || (
  window.location.protocol === "http:" || window.location.protocol === "https:"
    ? window.location.origin
    : "https://shubhamxerox-production.up.railway.app"
);
window.API_BASE_URL = API_BASE;
const AUTH_TOKEN_KEY = "shubham_auth_token";
let products = [];
try {
  const cachedProductsStr = localStorage.getItem('shubham_products_cache');
  if (cachedProductsStr) {
    const cachedProducts = JSON.parse(cachedProductsStr);
    if (Array.isArray(cachedProducts) && cachedProducts.length > 0) {
      products = cachedProducts;
    }
  }
} catch (e) {
  console.warn("Invalid initial products cache", e);
}

let isProductsLoading = false;

let cart = [];
let currentUser = null;
let reviews = {};
let selectedCategories = [];
let featuredSelectedCategories = [];
const PRODUCTS_BATCH_SIZE = 20;
let isLoadingMoreProducts = false;
const ADMIN_PRODUCTS_BATCH_SIZE = 20;
let productsServerOffset = 0;
let productsServerHasMore = true;
let productsServerLoading = false;
const PRODUCTS_SERVER_PAGE_SIZE = 10;
/** When set, /products requests are scoped to this category (from products.html?category=…). */
let productsServerCategoryFilter = '';
let featuredRevealCount = 0;
let featuredRevealTimer = null;
let featuredRevealKey = "";

function getProductsGridColumns(containerId = 'allProductsContainer') {
  const container = document.getElementById(containerId);
  if (!container) return 1;
  const containerWidth = container.clientWidth || window.innerWidth || 360;
  // 1200px container with 20px side paddings supports 5 cards.
  if (containerWidth >= 1130) return 5;
  if (containerWidth >= 1024) return 4;
  if (containerWidth >= 768) return 3;
  if (containerWidth >= 520) return 2;
  return 1;
}

function getDynamicProductsBatchSize(containerId = 'allProductsContainer') {
  // Keep first paint to exactly one visual row (no initial scroll requirement).
  return Math.max(1, getProductsGridColumns(containerId));
}

function getDynamicProductsStepSize(containerId = 'allProductsContainer') {
  // Reveal by one full row per scroll chunk.
  return Math.max(1, getProductsGridColumns(containerId));
}

function getDynamicAdminBatchSize() {
  // Admin list is mostly single-column cards; keep 2-row feel.
  return 2;
}

function smoothRevealProductCards(container) {
  if (!container) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cards = container.querySelectorAll('.product-card');
  if (!cards || cards.length === 0) return;
  cards.forEach((card, idx) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(10px)';
    card.style.willChange = 'opacity, transform';
    card.style.transition = `opacity 220ms ease ${Math.min(idx * 20, 180)}ms, transform 220ms ease ${Math.min(idx * 20, 180)}ms`;
  });
  requestAnimationFrame(() => {
    cards.forEach((card) => {
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    });
  });
}

function smoothRevealNodes(nodes, staggerMs = 16) {
  if (!nodes || nodes.length === 0) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  nodes.forEach((node, idx) => {
    node.style.opacity = '0';
    node.style.transform = 'translateY(10px)';
    node.style.willChange = 'opacity, transform';
    const delay = Math.min(idx * staggerMs, 140);
    node.style.transition = `opacity 200ms ease ${delay}ms, transform 200ms ease ${delay}ms`;
  });
  requestAnimationFrame(() => {
    nodes.forEach((node) => {
      node.style.opacity = '1';
      node.style.transform = 'translateY(0)';
    });
  });
}

function resetProductsInfiniteScroll() {
  window.productsGridBootstrapped = false;
  window.productsGridTotalFilteredCount = 0;
  isLoadingMoreProducts = false;
}

function resetProductsServerPagination() {
  productsServerOffset = 0;
  productsServerHasMore = true;
  productsServerLoading = false;
}

function resetAdminProductsPagination() {
  window.adminProductsOffset = 0;
  window.adminProductsHasMore = true;
  window.adminProductsLoading = false;
  window.adminProductsData = [];
  window.adminProductsPageSize = getDynamicAdminBatchSize();
}

function resetAdminCategoriesPagination() {
  window.adminCategoriesCurrentCount = 20;
  window.adminCategoriesTotalCount = 0;
}

function setAdminProductsLoadMoreIndicator(state = 'hidden') {
  const indicator = document.getElementById('adminProductsLoadMoreIndicator');
  if (!indicator) return;
  if (indicator.dataset.state === state) return;
  indicator.dataset.state = state;
  if (state === 'loading') {
    indicator.style.display = 'flex';
    indicator.innerHTML = `
      <div class="products-load-spinner" aria-hidden="true"></div>
      <span>Loading more books...</span>
    `;
    return;
  }
  if (state === 'end') {
    indicator.style.display = 'flex';
    indicator.innerHTML = '<span>All books loaded.</span>';
    return;
  }
  indicator.style.display = 'none';
  indicator.innerHTML = '';
}

function setAdminCategoriesLoadMoreIndicator(state = 'hidden') {
  const indicator = document.getElementById('adminCategoriesLoadMoreIndicator');
  if (!indicator) return;
  if (state === 'loading') {
    indicator.style.display = 'block';
    indicator.textContent = 'Loading more categories...';
    return;
  }
  if (state === 'end') {
    indicator.style.display = 'block';
    indicator.textContent = 'All categories loaded.';
    return;
  }
  indicator.style.display = 'none';
  indicator.textContent = '';
}

function setProductsLoadMoreIndicator(state = 'hidden') {
  const indicator = document.getElementById('productsLoadMoreIndicator');
  if (!indicator) return;

  if (state === 'loading') {
    indicator.style.display = 'flex';
    indicator.innerHTML = `
      <div class="products-load-spinner" aria-hidden="true"></div>
      <span>Loading more books...</span>
    `;
    return;
  }

  if (state === 'end') {
    indicator.style.display = 'flex';
    indicator.innerHTML = '<span>All books loaded.</span>';
    return;
  }

  indicator.style.display = 'none';
  indicator.innerHTML = '';
}

function generateSkeletonHTML(count = 4) {
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `
      <div class="skeleton-card">
        <div class="skeleton-img"></div>
        <div class="skeleton-text"></div>
        <div class="skeleton-text short"></div>
      </div>
    `;
  }
  return html;
}

function getAllProductCategories() {
  let safeSiteCategories = Array.isArray(siteCategories) ? siteCategories : defaultSiteCategories;
  return [...new Set([...safeSiteCategories, ...products.map(p => p.category).filter(Boolean)])].sort();
}

let globalDbSearchTimeout = null;

async function performDatabaseSearch(query, categories, isFeatured, skipRender = false) {
  try {
    const supabase = getSupabase();
    if (!supabase) return [];

    let dbQuery = supabase.from('products').select('*');

    const q = (query || '').trim().toLowerCase();
    const hasQuery = q.length >= 2;
    const hasCats = Array.isArray(categories) && categories.length > 0;

    if (!hasQuery && !hasCats) return [];

    if (hasQuery) {
      const tokens = q.split(/\s+/).filter(Boolean);
      tokens.forEach(token => {
        dbQuery = dbQuery.ilike('name', `%${token}%`);
      });
    }
    if (hasCats) {
      dbQuery = dbQuery.in('category', categories);
    }

    const { data, error } = await dbQuery.limit(100);
    if (error) {
      console.error("Database search error:", error);
      return [];
    }

    if (data && data.length > 0) {
      const existingIds = new Set((products || []).map(p => String(p?.id)));
      let added = false;

      data.forEach(item => {
        if (!existingIds.has(String(item.id))) {
          products.push(item);
          added = true;
        }
      });

      if (added && !skipRender) {
        products.sort((a, b) => (Number(b?.id) || 0) - (Number(a?.id) || 0));
        if (isFeatured) {
          if (typeof renderFeaturedProducts === 'function') renderFeaturedProducts();
        } else {
          if (typeof resetProductsInfiniteScroll === 'function') resetProductsInfiniteScroll();
          if (typeof renderProductsGrid === 'function') renderProductsGrid('allProductsContainer', null, selectedCategories);
          if (typeof renderFilteredFreeNotes === 'function') renderFilteredFreeNotes();
        }
      }
    }
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("Database search error:", err);
    return [];
  }
}

function getFilteredProducts(filterCategories = [], searchValue = '', includeStationery = false) {
  let filtered = [...products];
  const selectedCats = Array.isArray(filterCategories) ? filterCategories.filter(Boolean) : [];

  if (selectedCats.length > 0) {
    const categorySet = new Set(selectedCats);
    filtered = filtered.filter(p => categorySet.has(p.category));
  } else {
    // Hide 'Stationery' by default if no category is explicitly selected
    if (!includeStationery) {
      filtered = filtered.filter(p => p.category !== 'Stationery');
      filtered = filtered.filter(p => p.category !== 'Spiral Copies');
    }
  }

  if (searchValue && searchValue.trim()) {
    const normalize = (s) => String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const queryTokens = normalize(searchValue).split(' ').filter(t => t);
    filtered = filtered.filter((p) => {
      const searchableStr = normalize(`${p.name || ''} ${p.exam || ''} ${p.category || ''}`);
      const words = searchableStr.split(' ').filter(Boolean);

      // Every typed word must match somewhere in product fields.
      return queryTokens.every((token) => {
        if (!token) return true;
        if (searchableStr.includes(token)) return true;
        return words.some((w) => w.startsWith(token));
      });
    });
  }

  return filtered;
}

function renderFeaturedMultiSelect() {
  const container = document.getElementById('featuredMultiSelectOptionsList');
  if (!container) return;

  const allCats = getAllProductCategories();
  container.innerHTML = allCats.map(c => `
    <label class="multi-select-option">
      <input type="checkbox" value="${c}" ${featuredSelectedCategories.includes(c) ? "checked" : ""} onchange="handleFeaturedCategoryToggle(this)">
      <span>${c}</span>
    </label>
  `).join('');

  updateFeaturedActiveCategoryTags();
}

function updateFeaturedActiveCategoryTags() {
  const container = document.getElementById('featuredActiveCategoryTags');
  if (container) {
    container.innerHTML = featuredSelectedCategories.map(c => `
      <div class="active-cat-tag">
        ${c} <span style="cursor:pointer; margin-left:4px;" onclick="uncheckFeaturedCategory('${c.replace(/'/g, "\\'")}')">×</span>
      </div>
    `).join('');
  }

  const label = document.getElementById('featuredMultiSelectLabel');
  if (label) {
    label.textContent = featuredSelectedCategories.length > 0 ? `${featuredSelectedCategories.length} Selected` : "Select Categories...";
  }
}

function renderFeaturedProducts() {
  const container = document.getElementById('featuredProducts');
  if (!container) return;

  const searchInput = document.getElementById('featuredSearchInput') || document.getElementById('heroQuickSearchInput');
  const searchValue = searchInput ? searchInput.value : '';
  const filtered = getFilteredProducts(featuredSelectedCategories, searchValue).slice(0, 10);

  if (featuredRevealTimer) {
    clearTimeout(featuredRevealTimer);
    featuredRevealTimer = null;
  }

  if (filtered.length === 0) {
    featuredRevealCount = 0;
    featuredRevealKey = "";
    if (products.length === 0) {
      if (isProductsLoading) {
        container.innerHTML = generateSkeletonHTML(getProductsGridColumns('featuredProducts'));
      } else {
        container.innerHTML = '';
      }
    } else {
      container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 36px 20px; color: var(--text-muted); background: var(--card-bg); border-radius: var(--radius-md); border: 1px solid var(--border-color);">No matching books found.</div>';
    }
    return;
  }

  const nextKey = JSON.stringify({
    q: (searchValue || '').trim().toLowerCase(),
    cats: [...featuredSelectedCategories].sort(),
    ids: filtered.map((p) => String(p?.id ?? '')),
  });
  if (nextKey !== featuredRevealKey) {
    featuredRevealKey = nextKey;
    featuredRevealCount = 1;
  }

  // Disable staggered rendering for featured products
  featuredRevealCount = filtered.length;
  const visibleCount = filtered.length;
  container.innerHTML = filtered.slice(0, visibleCount).map(createProductCard).join('');
  smoothRevealProductCards(container);
}

function populateProductNameSuggestions() {
  const list = document.getElementById('productNameSuggestions');
  if (!list) return;

  const uniqueNames = [...new Set(products.map(p => (p.name || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  list.innerHTML = uniqueNames.map(name => `<option value="${name.replace(/"/g, '&quot;')}"></option>`).join('');
}

function initHeroQuickSearch() {
  const input = document.getElementById('heroQuickSearchInput');
  const panel = document.getElementById('heroQuickSuggestions');
  if (!input || !panel) return;

  const closePanel = () => {
    panel.style.display = 'none';
    panel.innerHTML = '';
  };

  const openPanel = () => {
    panel.style.display = 'block';
  };

  const applySearch = async (q) => {
    const query = String(q || '').trim();
    input.value = query;
    closePanel();

    const featuredSearchInput = document.getElementById('featuredSearchInput');
    if (featuredSearchInput) {
      featuredSearchInput.value = query;
    }
    if (typeof performDatabaseSearch === 'function') {
      await performDatabaseSearch(query, typeof featuredSelectedCategories !== 'undefined' ? featuredSelectedCategories : [], true, true);
    }
    if (typeof renderFeaturedProducts === 'function') renderFeaturedProducts();

    const section = document.getElementById('featuredProducts');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const goToAllProducts = (q) => {
    const query = String(q || '').trim();
    const url = query ? `products.html?q=${encodeURIComponent(query)}` : 'products.html';
    window.location.href = url;
  };

  let heroQuickSearchTimer = null;

  input.addEventListener('input', () => {
    const q = String(input.value || '').trim().toLowerCase();
    if (!q) {
      closePanel();
      return;
    }
    panel.innerHTML = `
      <div style="padding:10px 14px; color:var(--text-muted); border-bottom:1px solid var(--border-color);">Searching books...</div>
      <button type="button" id="heroQuickSearchAllBtn" style="display:block; width:100%; text-align:left; padding:14px; border:0; background:rgba(0,0,0,0.03); color:var(--text-main); font-weight:700; cursor:pointer;">
        Search all for "${input.value.trim()}"
      </button>
    `;
    openPanel();
    const searchAllBtnInit = document.getElementById('heroQuickSearchAllBtn');
    if (searchAllBtnInit) searchAllBtnInit.onclick = () => goToAllProducts(input.value);

    if (heroQuickSearchTimer) clearTimeout(heroQuickSearchTimer);
    heroQuickSearchTimer = setTimeout(async () => {
      const latestQ = String(input.value || '').trim().toLowerCase();
      if (!latestQ) {
        closePanel();
        return;
      }

      if (typeof performDatabaseSearch === 'function' && latestQ.length >= 2) {
        await performDatabaseSearch(latestQ, [], true, true);
      }

      const seen = new Set();
      const tokens = latestQ.split(/\s+/).filter(Boolean);
      const matches = (products || [])
        .filter((p) => {
          const nameL = String(p?.name || '').trim().toLowerCase();
          return tokens.every(t => nameL.includes(t));
        })
        .filter((p) => {
          const key = String(p?.name || '').trim();
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 12);

      panel.innerHTML = `
        <div style="padding:10px 14px; font-weight:600; color:var(--text-main); border-bottom:1px solid var(--border-color);">Product Suggestions</div>
        ${matches.map((p) => {
          const name = String(p?.name || '').trim();
          const img = String(p?.img || '').split('|')[0] || 'images/logo.png';
          const selling = formatPrice(p?.price || 0);
          const original = (p?.original_price && Number(p.original_price) > Number(p.price || 0)) ? formatPrice(p.original_price) : '';
          return `
            <button type="button" class="hero-quick-suggest-item" data-name="${name.replace(/"/g, '&quot;')}" style="display:flex; gap:12px; align-items:center; width:100%; text-align:left; padding:10px 14px; border:0; border-bottom:1px solid var(--border-color); background:transparent; color:var(--text-main); cursor:pointer;">
              <img src="${img}" alt="${name}" width="52" height="64" style="width:52px; height:64px; object-fit:cover; border-radius:4px; border:1px solid var(--border-color); flex:0 0 auto;">
              <div style="min-width:0;">
                <div style="font-size:0.95rem; line-height:1.25; white-space:normal;">${name}</div>
                <div style="margin-top:4px; font-size:0.9rem; color:var(--text-muted);">
                  <strong style="color:var(--text-main);">${selling}</strong>
                  ${original ? `<span style="margin-left:8px; text-decoration:line-through;">${original}</span>` : ''}
                </div>
              </div>
            </button>
          `;
        }).join('')}
        <button type="button" id="heroQuickSearchAllBtn" style="display:block; width:100%; text-align:left; padding:14px; border:0; background:rgba(0,0,0,0.03); color:var(--text-main); font-weight:700; cursor:pointer;">
          Search all for "${input.value.trim()}"
        </button>
      `;
      openPanel();

      const searchAllBtn = document.getElementById('heroQuickSearchAllBtn');
      if (searchAllBtn) searchAllBtn.onclick = () => goToAllProducts(input.value);
    }, 260);
  });

  panel.addEventListener('click', async (e) => {
    const target = e.target.closest('.hero-quick-suggest-item');
    if (!target) return;
    const name = target.getAttribute('data-name') || '';
    await applySearch(name);
  });

  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      goToAllProducts(input.value);
    }
  });

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !panel.contains(e.target)) {
      closePanel();
    }
  });
}

function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || "";
}

function setAuthToken(token) {
  if (!token) return;
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

function parseJwtPayload(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(atob(payload).split("").map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join(""));
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

function loadCurrentUserFromToken() {
  const token = getAuthToken();
  const payload = parseJwtPayload(token);
  if (!payload || !payload.phone) return null;
  return { phone: payload.phone, role: payload.role || "user", name: payload.name || "" };
}

async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const method = options.method || "GET";
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const auth = options.auth !== false;
  if (auth) {
    const token = getAuthToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(url, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
  if (!res.ok) {
    const detail = (data && (data.detail || data.message)) || `Request failed (${res.status})`;
    throw new Error(detail);
  }
  return data;
}

const defaultSiteCategories = [
  "AKAR IAS HINDI MEDIUM PRE", "Arihant", "ARIHANT PUBLICATION UGC NTA", "Champion Square English Medium", "Champion Square Hindi Medium", "CIVIL JOB", "Combos", "Cosmos Publication", "Darpan Civil Services", "DEVANAGARI", "Disha Publication", "DRISHTI IAS NOTES", "Exam Pedia", "Gagan Pratap Sir", "Ghatna Chakra", "IGNITE UPSC ARIHANT PUBLICATION", "KARMA IAS", "lucent", "MAINSWALA", "MGICS", "MPGK (SPECIAL COLLECTION)", "MPPSC MAINS TEST SERIES", "MPPSC PRE TEST 2026", "NEW BOOKS 📚", "NIRMAN IAS", "Omkar Publication", "Pariksha Portal", "Parikshadham", "Parmar SSC", "PEB (व्यापम) सभी परीक्षो बुक्स", "PT 365", "Punekar Publication", "Rakesh Yadav", "Saransh Ics", "Satyamev Jayate institute", "Selection Tak", "Shivaan Educations", "SHREE KABIR PUBLICATION", "SHUBHAM GUPTA SIR", "Stationery", "Tathyabaan", "Upsc Test Series", "UTKARSH CLASSESS", "Winners Institute", "XEROX", "Youth Competition Publication"
];

let siteCategories = [];
let categoryMeta = {};

// Safe Storage Initialization
try {
  cart = JSON.parse(localStorage.getItem('shubham_cart')) || [];
  currentUser = loadCurrentUserFromToken();
  reviews = JSON.parse(localStorage.getItem('shubham_reviews')) || {};
  siteCategories = JSON.parse(localStorage.getItem('shubham_categories')) || defaultSiteCategories;
  categoryMeta = JSON.parse(localStorage.getItem('shubham_category_meta')) || {};
} catch (e) {
  console.error("Storage parse error:", e);
}


// --- Migration: Merge new publisher categories ---
const newPublishers = {
  "Shree Sundaram Academy": "https://img.clevup.in/285520/cat/291313_cat-1776534680454.jpg?height=92&format=webp",
  "MAHAVEER PUBLICATION": "https://img.clevup.in/285520/cat/291313_cat-1775153493786.png?height=92&format=webp",
  "Exampedia Publication": "https://img.clevup.in/285520/cat/291313_cat-1774347850124.jpg?height=92&format=webp",
  "MPPSC SPECIAL TEST SERIES": "https://img.clevup.in/285520/cat/291313_cat-1774378106919.jpg?height=92&format=webp",
  "Parikshavani Publication": "https://img.clevup.in/285520/cat/291313_cat-1770058144723.png?height=92&format=webp",
  "Champion Squre Notes": "https://img.clevup.in/285520/cat/291313_cat-1763837117023.jpg?height=92&format=webp",
  "NIRMAN IAS NOTES": "https://img.clevup.in/285520/cat/291313_cat-1743326431204.jpg?height=92&format=webp",
  "TATHYABAAN PUBLICATION": "https://img.clevup.in/285520/cat/291313_cat-1774379294511.jpg?height=92&format=webp",
  "PARIKSHAMDHAM PUBLICATION": "https://img.clevup.in/285520/cat/291313_cat-1754810090869.jpg?height=92&format=webp",
  "AAKAR IAS HINDI MEDIUM": "https://img.clevup.in/285520/cat/291313_cat-1774377869798.jpg?height=92&format=webp",
  "AAKAR IAS MAINS HINDI MEDIUM": "https://img.clevup.in/285520/cat/291313_cat-1774378056536.jpg?height=92&format=webp",
  "AAKAR IAS ENGLISH MEDIUM NOTES": "https://img.clevup.in/285520/cat/291313_cat-1774378083942.jpg?height=92&format=webp",
  "DRISHTI IAS NOTES": "https://img.clevup.in/285520/cat/291313_cat-1743660506891.jpg?height=92&format=webp",
  "Drishti Ias English Medium": "https://img.clevup.in/285520/cat/291313_cat-1776364323653.jpg?height=92&format=webp",
  "PARMAR SSC": "https://img.clevup.in/285520/cat/291313_cat-1750098700556.jpg?height=92&format=webp",
  "SELECTION TAK PUBLICATION": "https://img.clevup.in/285520/cat/291313_cat-1744048996571.jpg?height=92&format=webp",
  "CIVIL JOBS COCHING NOTES": "https://img.clevup.in/285520/cat/291313_cat-1774379316585.jpg?height=92&format=webp",
  "DEVNAGARI PUBLICATION": "https://img.clevup.in/285520/cat/291313_cat-1776364346866.jpg?height=92&format=webp",
  "DARPAN PUBLICATION": "https://img.clevup.in/285520/cat/291313_cat-1774379341258.jpg?height=92&format=webp",
  "WINNERS INSTITUTE": "https://img.clevup.in/285520/cat/291313_cat-1745547472874.jpg?height=92&format=webp",
  "Shree Kabir Publication": "https://img.clevup.in/285520/cat/291313_cat-1774379863295.jpg?height=92&format=webp",
  "UTKARSH CLASSES NOTES": "https://img.clevup.in/285520/cat/291313_cat-1743483680701.jpg?height=92&format=webp",
  "MP TET ALL PUBLICATION BOOKS": "https://img.clevup.in/285520/cat/291313_cat-1746119040041.jpg?height=92&format=webp",
  "Pinnacle Publication": "https://img.clevup.in/285520/cat/291313_cat-1747238181495.jpg?height=92&format=webp",
  "Youth Compition Publication": "https://img.clevup.in/285520/cat/291313_cat-1745255575383.jpg?height=92&format=webp",
  "Arihant Pub. Capsule Series": "https://img.clevup.in/285520/cat/291313_cat-1753374313517.jpg?height=92&format=webp",
  "IGNITE UPSC ARIHANT PUBLICATION": "https://img.clevup.in/285520/cat/291313_cat-1746725555972.jpg?height=92&format=webp",
  "ARIHANT PUBLICATION UGC NTA": "https://img.clevup.in/285520/cat/291313_cat-1746204168875.jpg?height=92&format=webp",
  "PEB (\u0935\u094d\u092f\u093e\u092a\u092e) \u0938\u092d\u0940 \u092a\u0930\u0940\u0915\u094d\u0937\u093e \u092c\u0941\u0915\u094d\u0938": "https://img.clevup.in/285520/cat/291313_cat-1745490441191.jpg?height=92&format=webp",
  "Satyadhi Sharma Classes Notes": "https://img.clevup.in/285520/cat/291313_cat-1753980988074.png?height=92&format=webp",
  "ARIHANT PUBLICATION SSC": "https://img.clevup.in/285520/cat/291313_cat-1745647649162.jpg?height=92&format=webp",
  "Railway Special Books": "https://img.clevup.in/285520/cat/291313_cat-1745308239913.jpg?height=92&format=webp",
  "ARIHANT PUBLICATION": "https://img.clevup.in/285520/cat/291313_cat-1743609051295.jpg?height=92&format=webp",
  "Disha Publication": "https://img.clevup.in/285520/cat/291313_cat-1744770532535.jpg?height=92&format=webp",
  "MPPSC PRELIMS HAND WRITTEN 2.0": "https://img.clevup.in/285520/cat/291313_cat-1769624090137.jpg?height=92&format=webp",
  "MPGK (SPECIAL COLLECTION )": "https://img.clevup.in/285520/cat/291313_cat-1743705430138.jpg?height=92&format=webp",
  "Ghatna Chakra Publication": "https://img.clevup.in/285520/cat/291313_cat-1774380204236.jpg?height=92&format=webp",
  "UPSC SEPICIAL BOOKS": "https://img.clevup.in/285520/cat/291313_cat-1774380262222.jpg?height=92&format=webp",
  "TMH PUBLICATION": "https://img.clevup.in/285520/cat/291313_cat-1776364531772.png?height=92&format=webp",
  "PUNEKAR PUBLICATION": "https://img.clevup.in/285520/cat/291313_cat-1748020109775.jpg?height=92&format=webp",
  "GAGAN PRATAP Sir All Books": "https://img.clevup.in/285520/cat/291313_cat-1747539300152.jpg?height=92&format=webp"
};
let __categoriesChanged = false;
for (const [catName, catImg] of Object.entries(newPublishers)) {
  if (!siteCategories.includes(catName)) {
    siteCategories.push(catName);
    __categoriesChanged = true;
  }

  let section = 'general';
  const lowerName = catName.toLowerCase();
  if (lowerName.includes('mppsc') || lowerName.includes('vyapam') || lowerName.includes('nirman') || lowerName.includes('aakar') || lowerName.includes('akar') || lowerName.includes('parikshadham') || lowerName.includes('tathyabaan') || lowerName.includes('punekar') || lowerName.includes('mgics') || lowerName.includes('darpan') || lowerName.includes('mahaveer') || lowerName.includes('peb')) {
    section = 'mppsc';
  } else if (lowerName.includes('upsc') || lowerName.includes('drishti') || lowerName.includes('ignite')) {
    section = 'upsc';
  } else if (lowerName.includes('ssc') || lowerName.includes('gagan') || lowerName.includes('rakesh') || lowerName.includes('parmar') || lowerName.includes('railway') || lowerName.includes('pinnacle')) {
    section = 'ssc';
  }

  if (!categoryMeta[catName] || categoryMeta[catName].image !== catImg || categoryMeta[catName].section !== section) {
    categoryMeta[catName] = categoryMeta[catName] || {};
    categoryMeta[catName].image = catImg;
    categoryMeta[catName].section = section;
    __categoriesChanged = true;
  }
}
if (__categoriesChanged) {
  localStorage.setItem('shubham_categories', JSON.stringify(siteCategories));
  localStorage.setItem('shubham_category_meta', JSON.stringify(categoryMeta));
}
// -------------------------------------------------


const formatPrice = (price) => `₹${Number(price).toFixed(2)}`;

// --- Toast Notification ---
function showToast(message) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> ${message}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// --- Reusable Confirm Popup (UI based, no browser confirm) ---
function showConfirmDialog(message, title = 'Please Confirm') {
  return new Promise((resolve) => {
    let overlay = document.getElementById('customConfirmOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'customConfirmOverlay';
      overlay.className = 'custom-confirm-overlay';
      overlay.innerHTML = `
        <div class="custom-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="customConfirmTitle">
          <h3 id="customConfirmTitle" class="custom-confirm-title"></h3>
          <p id="customConfirmMessage" class="custom-confirm-message"></p>
          <div class="custom-confirm-actions">
            <button type="button" id="customConfirmCancel" class="btn btn-outline-purple">Cancel</button>
            <button type="button" id="customConfirmOk" class="btn remove-btn">Yes, Delete</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    const titleEl = document.getElementById('customConfirmTitle');
    const messageEl = document.getElementById('customConfirmMessage');
    const cancelBtn = document.getElementById('customConfirmCancel');
    const okBtn = document.getElementById('customConfirmOk');

    titleEl.textContent = title;
    messageEl.textContent = message;
    overlay.classList.add('show');

    const cleanup = () => {
      overlay.classList.remove('show');
      cancelBtn.removeEventListener('click', onCancel);
      okBtn.removeEventListener('click', onConfirm);
      overlay.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onEsc);
    };

    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    const onConfirm = () => {
      cleanup();
      resolve(true);
    };

    const onOverlayClick = (event) => {
      if (event.target === overlay) {
        onCancel();
      }
    };

    const onEsc = (event) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };

    cancelBtn.addEventListener('click', onCancel);
    okBtn.addEventListener('click', onConfirm);
    overlay.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onEsc);
  });
}

// --- Data Fetching logic ---
function normalizeProductRecord(raw, index = 0) {
  const rawId = raw?.id;
  const idNum = Number(raw?.id);
  const priceNum = Number(raw?.price);
  const originalPriceNum = Number(raw?.original_price);
  return {
    id: rawId !== undefined && rawId !== null && rawId !== ''
      ? (Number.isFinite(idNum) ? idNum : String(rawId))
      : index + 1,
    name: (raw?.name || "").toString().trim() || `Product ${index + 1}`,
    category: (raw?.category || "").toString().trim() || "General",
    price: Number.isFinite(priceNum) ? priceNum : 0,
    original_price: Number.isFinite(originalPriceNum) ? originalPriceNum : null,
    img: (raw?.img || "").toString(),
    desc: (raw?.desc || "").toString(),
    exam: (raw?.exam || "").toString(),
    free_note_id: raw?.free_note_id ?? null,
  };
}

function getProductsEndpoint() {
  return `${supabaseUrl}/rest/v1/products?select=id,name,category,price,img,desc,original_price,exam,free_note_id&order=id.desc`;
}

function parseProductsCategoryParams() {
  const params = new URLSearchParams(window.location.search);
  const categoryRaw = params.get('category');
  if (!categoryRaw) return [];
  return categoryRaw
    .split(',')
    .map(v => decodeURIComponent(v).trim())
    .filter(Boolean);
}

/** Single category in URL on products page → server filters so older IDs in that category still load. */
function getProductsPageServerCategoryFilter() {
  const path = (window.location.pathname || '').replace(/\\/g, '/').toLowerCase();
  if (!path.includes('products')) return '';
  const cats = parseProductsCategoryParams();
  if (cats.length === 1) return cats[0];
  return '';
}

function renderStoreProducts() {
  if (document.getElementById('featuredProducts')) {
    renderFeaturedMultiSelect();
    renderFeaturedProducts();
  }
  if (document.getElementById('allProductsContainer') || document.getElementById('adminProductsList')) {
    renderMultiSelect();
    renderProductsGrid('allProductsContainer', null, selectedCategories);
  }
  populateProductNameSuggestions();
}

/** Persist product list for fast reload; strips extra gallery images to reduce quota use. */
function saveProductsToCache(productList) {
  if (!Array.isArray(productList)) return;
  try {
    const forCache = productList.map((p) => ({
      ...p,
      img: p.img ? String(p.img).split('|')[0] : '',
    }));
    localStorage.setItem('shubham_products_cache', JSON.stringify(forCache));
  } catch (e) {
    console.warn('LocalStorage quota exceeded or cache save failed:', e);
  }
}

function preloadFirstFoldProductImages(productList, count = 4) {
  if (!Array.isArray(productList) || productList.length === 0) return;
  const head = document.head || document.getElementsByTagName('head')[0];
  if (!head) return;

  const seen = new Set();
  const urls = [];
  for (const p of productList) {
    const src = String(p?.img || '').split('|')[0]?.trim();
    if (!src || src.startsWith('data:') || seen.has(src)) continue;
    seen.add(src);
    urls.push(src);
    if (urls.length >= count) break;
  }

  urls.forEach((href) => {
    if (document.querySelector(`link[data-product-preload="1"][href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = href;
    link.setAttribute('data-product-preload', '1');
    head.appendChild(link);
  });
}

async function fetchProducts() {
  const sortProductsByLatest = (arr) => {
    if (!Array.isArray(arr)) return [];
    // Ensure "latest" is always on top across cache/merge/fetch.
    return [...arr].sort((a, b) => (Number(b?.id) || 0) - (Number(a?.id) || 0));
  };

  let hasLocalCache = false;

  let ssrProducts = [];
  if (window.__INITIAL_PRODUCTS__ && Array.isArray(window.__INITIAL_PRODUCTS__)) {
    ssrProducts = window.__INITIAL_PRODUCTS__;
  }

  // Try to load from static JSON first for 0-delay rendering of static catalog
  try {
    let res;
    try {
      res = await fetch(`${API_BASE}/assets/products.json?v=${new Date().getTime()}`);
    } catch (err) {
      // Fallback if local backend is not running
      res = await fetch(`assets/products.json?v=${new Date().getTime()}`);
    }
    if (res && res.ok) {
      const staticProducts = await res.json();
      if (Array.isArray(staticProducts) && staticProducts.length > 0) {
        const byId = new Map();
        staticProducts.forEach(p => byId.set(String(p.id), p));
        ssrProducts.forEach(p => byId.set(String(p.id), p));
        products = sortProductsByLatest(Array.from(byId.values()));
        hasLocalCache = true;
        isProductsLoading = false; // We have data, so stop skeleton
        preloadFirstFoldProductImages(products, 4);
        renderStoreProducts(); // Render instantly
        saveProductsToCache(products);
      }
    }
  } catch (e) {
    console.warn("Failed to load products.json, falling back", e);
  }

  // If static JSON failed or was empty but we have SSR, use SSR
  if (!hasLocalCache && ssrProducts.length > 0) {
    products = sortProductsByLatest(ssrProducts);
    hasLocalCache = true;
    isProductsLoading = false;
    preloadFirstFoldProductImages(products, 4);
    renderStoreProducts();
    saveProductsToCache(products);
  }

    if (!hasLocalCache) {
      // Fallback to localStorage
      const cachedProductsStr = localStorage.getItem('shubham_products_cache');
      if (cachedProductsStr) {
        try {
          const cachedProducts = JSON.parse(cachedProductsStr);
          if (Array.isArray(cachedProducts) && cachedProducts.length > 0) {
            products = sortProductsByLatest(cachedProducts);
            hasLocalCache = true;
            isProductsLoading = false; 
            preloadFirstFoldProductImages(products, 4);
            renderStoreProducts(); 
          }
        } catch (e) {
          console.warn("Invalid products cache", e);
        }
      }
    }

  if (!hasLocalCache) {
    isProductsLoading = true;
    renderStoreProducts();
  }

  resetProductsServerPagination();
  productsServerCategoryFilter = getProductsPageServerCategoryFilter();
  const isHomeFeaturedOnlyPage = !!document.getElementById('featuredProducts') && !document.getElementById('allProductsContainer');
  const hasUrlQuery = !!((new URLSearchParams(window.location.search).get('q') || '').trim());
  const qFromUrl = new URLSearchParams(window.location.search).get('q');
  const searchQuery = qFromUrl ? `&q=${encodeURIComponent(qFromUrl.trim())}` : '';
  const firstPageLimit = productsServerCategoryFilter ? 100 : (hasUrlQuery ? 100 : (isHomeFeaturedOnlyPage ? 24 : PRODUCTS_SERVER_PAGE_SIZE));
  const categoryQuery = productsServerCategoryFilter
    ? `&category=${encodeURIComponent(productsServerCategoryFilter)}`
    : '';

  try {
    // Prefer backend endpoint with server cache to reduce Supabase egress.
    // Progressive 1-by-1 card reveal still works via renderProductsGrid logic.
    try {
      const fetchPromise = apiFetch(
        `/products?limit=${firstPageLimit}&offset=0${categoryQuery}${searchQuery}`,
        { auth: false }
      );
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2500));
      const res = await Promise.race([fetchPromise, timeoutPromise]);
      loaded = Array.isArray(res?.products) ? res.products : null;
      productsServerOffset = Array.isArray(loaded) ? loaded.length : 0;
      productsServerHasMore = !!res?.has_more;
    } catch (e) {
      loaded = null; // Timeout or error, fallback to Supabase
    }

    if (!Array.isArray(loaded)) {
      const supabase = getSupabase();
      if (!supabase) return;
      let q = supabase
        .from('products')
        .select('*')
        .order('id', { ascending: false })
        .range(0, firstPageLimit - 1);
      if (productsServerCategoryFilter) {
        q = q.eq('category', productsServerCategoryFilter);
      }
      if (qFromUrl) {
        q = q.ilike('name', `%${qFromUrl.trim()}%`);
      }
      const { data, error } = await q;
      loaded = Array.isArray(data) ? data : [];
      productsServerHasMore = loaded.length >= firstPageLimit;
      productsServerOffset = loaded.length;
    }

    if (Array.isArray(loaded) && loaded.length > 0) {
        // Always strip extra images for the main list view to save memory/cache
        const strippedProducts = loaded.map(p => ({
          ...p,
          img: p.img ? String(p.img).split('|')[0] : ''
        }));
        // MERGE DB products with static products based on ID
        const byId = new Map();
        products.forEach(p => byId.set(String(p.id), p));
        strippedProducts.forEach(p => byId.set(String(p.id), p));
        
        const mergedProducts = Array.from(byId.values());
        const newProducts = sortProductsByLatest(mergedProducts);
        try {
          saveProductsToCache(newProducts);
        } catch (cacheErr) {
          console.warn('LocalStorage quota exceeded or cache save failed:', cacheErr);
        }
        products = newProducts;
        preloadFirstFoldProductImages(products, 4);
      } else {
        // Keep static products if DB is empty for this category
        if (!products.length && (productsServerCategoryFilter || !hasLocalCache)) products = [];
      }
  } catch (e) {
    console.error("Products fetch exception:", e);
    if (!products.length) {
      products = [];
    }
  } finally {
    isProductsLoading = false;
    renderStoreProducts();
  }
}

async function fetchMoreProductsPage(limitOverride = null) {
  if (productsServerLoading || !productsServerHasMore) return false;
  productsServerLoading = true;
  try {
    const isHomeFeaturedOnlyPage = !!document.getElementById('featuredProducts') && !document.getElementById('allProductsContainer');
    const hasUrlQuery = !!((new URLSearchParams(window.location.search).get('q') || '').trim());
    const defaultLimit = productsServerCategoryFilter ? 100 : (hasUrlQuery ? 100 : (isHomeFeaturedOnlyPage ? 24 : PRODUCTS_SERVER_PAGE_SIZE));
    const limitToUse = limitOverride != null ? limitOverride : defaultLimit;
    const categoryQuery = productsServerCategoryFilter
      ? `&category=${encodeURIComponent(productsServerCategoryFilter)}`
      : '';

    const fetchPromise = apiFetch(
      `/products?limit=${limitToUse}&offset=${encodeURIComponent(productsServerOffset)}${categoryQuery}`,
      { auth: false }
    );
    // Background fetches shouldn't timeout aggressively, let them finish naturally.
    const res = await fetchPromise;
    const rows = Array.isArray(res?.products) ? res.products : [];

    if (rows.length > 0) {
      productsServerOffset += rows.length;
    }
    productsServerHasMore = !!res?.has_more;

    const byId = new Set((products || []).map((p) => String(p?.id)));
    const toAdd = rows.filter((p) => !byId.has(String(p?.id)));

    return toAdd;
  } catch (e) {
    console.error("Fetch more products failed:", e);
    return [];
  } finally {
    productsServerLoading = false;
  }
}

let backgroundRenderQueue = [];
let adminProductsEnsurePromise = null;

async function ensureAllProductsLoadedForAdmin() {
  if (!productsServerHasMore) return;
  if (adminProductsEnsurePromise) return adminProductsEnsurePromise;

  adminProductsEnsurePromise = (async () => {
    try {
      let guard = 0;
      while (productsServerHasMore && guard < 200) {
        const newItems = await fetchMoreProductsPage(50);
        if (Array.isArray(newItems) && newItems.length > 0) {
          products = [...products, ...newItems].sort((a, b) => (Number(b?.id) || 0) - (Number(a?.id) || 0));
        }
        guard += 1;
      }
      saveProductsToCache(products);
    } catch (e) {
      console.error("Failed to fully load products for admin categories:", e);
    } finally {
      adminProductsEnsurePromise = null;
    }
  })();

  return adminProductsEnsurePromise;
}

async function backgroundFetchLoop() {
  while (productsServerHasMore) {
    if (productsServerLoading) {
      await new Promise(r => setTimeout(r, 100));
      continue;
    }

    // Fetch in batches of 10 for efficiency
    const newItems = await fetchMoreProductsPage(10);

    if (newItems && newItems.length > 0) {
      backgroundRenderQueue.push(...newItems);
    }

    // Yield to let render loop process
    await new Promise(r => setTimeout(r, 50));
  }
}

async function backgroundRenderLoop() {
  const allProductsContainer = document.getElementById('allProductsContainer');
  const adminProductsContainer = document.getElementById('adminProductsList'); // used for both books and stationery since they share the same layout ID
  if (!allProductsContainer && !adminProductsContainer) return;

  while (productsServerHasMore || backgroundRenderQueue.length > 0) {
    if (backgroundRenderQueue.length > 0) {
      // Pop one item and render it to create a real-time, one-by-one feel
      const item = backgroundRenderQueue.shift();
      products = [...products, item].sort((a, b) => (Number(b?.id) || 0) - (Number(a?.id) || 0));
      
      if (allProductsContainer) {
        const searchInput = document.getElementById('searchInput');
        const isSearching = !!(searchInput && String(searchInput.value || '').trim());
        // While searching, avoid live re-renders from background stream to prevent hover jitter.
        if (!isSearching) {
          renderProductsGrid('allProductsContainer', null, selectedCategories);
        } else {
          const now = Date.now();
          if (!window.lastSearchGridRefreshAt || now - window.lastSearchGridRefreshAt > 600) {
            window.lastSearchGridRefreshAt = now;
            renderProductsGrid('allProductsContainer', null, selectedCategories);
          }
        }
      }

      // Fast stagger for smooth perception without feeling slow.
      await new Promise(r => setTimeout(r, 60));
    } else {
      // Wait for more items to be fetched
      await new Promise(r => setTimeout(r, 100));
    }
  }
}

function startBackgroundAutoFetch() {
  backgroundFetchLoop();
  backgroundRenderLoop();
}

// --- Authentication Logic ---
function updateNavForUser() {
  const navContainers = document.querySelectorAll('.nav-links');
  if (navContainers.length === 0) return;

  navContainers.forEach(navContainer => {
    if (navContainer.id === 'adminNavLinks') return;
    let authLink = navContainer.querySelector('.dynamic-auth-link');
    if (!authLink) {
      if (document.getElementById('authLink')) authLink = document.getElementById('authLink');
      else {
        authLink = document.createElement('a');
        authLink.className = 'dynamic-auth-link';
        authLink.id = 'authLink';
        navContainer.appendChild(authLink);
      }
    }

    if (currentUser) {
      if (currentUser.role === "admin") {
        authLink.href = "admin.html";
        authLink.textContent = "Dashboard";
        authLink.style.color = "var(--primary)";
        authLink.onclick = null;
      } else {
        let myOrdersLink = navContainer.querySelector('.my-orders-link');
        if (!myOrdersLink) {
          myOrdersLink = document.createElement('a');
          myOrdersLink.className = 'my-orders-link';
          myOrdersLink.href = "my-orders.html";
          myOrdersLink.textContent = "My Orders";
          navContainer.insertBefore(myOrdersLink, authLink);
        }
        authLink.href = "#";
        authLink.textContent = "Logout";
        authLink.style.color = "#ff3b30";
        authLink.onclick = (e) => { e.preventDefault(); logout(); };
      }
    } else {
      authLink.href = "login.html";
      authLink.textContent = "Login";
      authLink.style.color = "var(--primary)";
      authLink.onclick = null;
    }
  });
}

async function requestRegisterOTP(btn) {
  const email = (document.getElementById('regEmail') || {}).value || '';
  if (!email || !email.includes('@')) {
    showToast("Enter a valid email address first.");
    return;
  }

  const originalText = btn.innerHTML;
  btn.classList.remove('loading'); // remove default loading class if any
  btn.disabled = true;

  // Start countdown IMMEDIATELY upon click
  let timeLeft = 30;
  btn.innerText = `OTP Sent (${timeLeft}s)`;

  const interval = setInterval(() => {
    timeLeft--;
    if (timeLeft <= 0) {
      clearInterval(interval);
      btn.disabled = false;
      btn.innerHTML = originalText;
    } else {
      btn.innerText = `OTP Sent (${timeLeft}s)`;
    }
  }, 1000);

  try {
    await apiFetch("/send-otp", { method: "POST", body: { email }, auth: false });
    showToast("OTP sent successfully.");
  } catch (err) {
    showToast(err.message || "Failed to send OTP");
    // We do NOT clear the interval here, we force them to wait 30s before retrying
  }
}

async function requestForgotPasswordOTP(btn) {
  const email = (document.getElementById('forgotEmail') || {}).value || '';
  if (!email || !email.includes('@')) {
    showToast("Enter a valid email address first.");
    return;
  }

  const originalText = btn.innerHTML;
  btn.classList.remove('loading');
  btn.disabled = true;

  // Start countdown IMMEDIATELY upon click
  let timeLeft = 30;
  btn.innerText = `OTP Sent (${timeLeft}s)`;

  const interval = setInterval(() => {
    timeLeft--;
    if (timeLeft <= 0) {
      clearInterval(interval);
      btn.disabled = false;
      btn.innerHTML = originalText;
    } else {
      btn.innerText = `OTP Sent (${timeLeft}s)`;
    }
  }, 1000);

  try {
    await apiFetch("/send-otp", { method: "POST", body: { email }, auth: false });
    showToast("OTP sent successfully.");
  } catch (err) {
    showToast(err.message || "Failed to send OTP");
    // Force them to wait 30s even if it fails, to prevent spam
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  let originalBtnText = "";
  if (btn) {
    originalBtnText = btn.innerHTML;
    btn.classList.add('loading');
    btn.innerHTML = '<span class="spinner"></span> Logging in...';
  }
  const identifier = document.getElementById('phone').value;
  const password = document.getElementById('loginPassword').value;
  try {
    const data = await apiFetch("/login", { method: "POST", body: { identifier, password }, auth: false });
    setAuthToken(data.token);
    currentUser = data.user || loadCurrentUserFromToken();
    window.location.href = (currentUser && currentUser.role === "admin") ? "admin.html" : "index.html";
  } catch (err) {
    showToast("Login failed");
    if (btn) {
      btn.classList.remove('loading');
      btn.innerHTML = originalBtnText;
    }
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const btn = document.getElementById('registerBtn');
  let originalBtnText = "";
  if (btn) {
    originalBtnText = btn.innerHTML;
    btn.classList.add('loading');
    btn.innerHTML = '<span class="spinner"></span> Registering...';
  }
  const name = document.getElementById('regName').value;
  const phone = document.getElementById('regPhone').value;
  const password = document.getElementById('regPassword').value;
  const confirmPassword = document.getElementById('regConfirmPassword').value;
  const generatedEmail = `${phone}@shubhamxerox.local`;
  try {
    const data = await apiFetch("/register", { method: "POST", body: { phone, name, password, email: generatedEmail }, auth: false });
    setAuthToken(data.token);
    currentUser = data.user || loadCurrentUserFromToken();
    window.location.href = "index.html";
  } catch (err) {
    showToast(err.message || "Registration failed");
    if (btn) {
      btn.classList.remove('loading');
      btn.innerHTML = originalBtnText;
    }
  }
}

async function handleForgotPassword(e) {
  e.preventDefault();
  const btn = document.getElementById('resetBtn');
  if (btn) btn.classList.add('loading');
  const email = document.getElementById('forgotEmail').value;
  const otp = document.getElementById('forgotOtp').value;
  const newPassword = document.getElementById('forgotNewPassword').value;
  const confirmPassword = document.getElementById('forgotConfirmPassword').value;

  try {
    await apiFetch("/verify-otp", { method: "POST", body: { email, otp }, auth: false });
  } catch (err) {
    showToast(err.message || "Invalid OTP");
    if (btn) btn.classList.remove('loading');
    return;
  }
  try {
    await apiFetch("/reset-password", { method: "POST", body: { email, otp, new_password: newPassword }, auth: false });
    showToast("Password reset successful. Login now.");
    const forgotForm = document.getElementById('forgotPasswordForm');
    if (forgotForm) forgotForm.reset();
  } catch (err) {
    showToast(err.message || "Reset failed");
  } finally {
    if (btn) btn.classList.remove('loading');
  }
}

function logout() {
  clearAuthToken();
  currentUser = null;
  window.location.href = "index.html";
}

// --- Secure Full-Stack Razorpay Integration ---
async function processSecureRazorpayPayment(amount, orderData, orderType, onComplete) {
  try {
    // 1. Create order on backend
    const createRes = await fetch(`${API_BASE}/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getAuthToken()}` },
      body: JSON.stringify({ amount: amount, currency: "INR" })
    });

    if (!createRes.ok) {
      const err = await createRes.json();
      throw new Error(err.detail || "Failed to create payment order");
    }

    const { order_id, key_id, amount: rzpAmount } = await createRes.json();

    // 2. Open Razorpay Checkout Widget
    const options = {
      key: key_id,
      amount: rzpAmount,
      currency: "INR",
      name: "Shubham Xerox",
      description: "Secure Payment",
      order_id: order_id,
      handler: async function (response) {
        // 3. Send signature to backend for verification and insertion
        try {
          showToast("Payment captured. Verifying securely...");
          const verifyRes = await fetch(`${API_BASE}/verify-payment`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getAuthToken()}` },
            body: JSON.stringify({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
              order_type: orderType,
              order_data: orderData
            })
          });

          if (verifyRes.ok) {
            onComplete(true, response.razorpay_payment_id);
          } else {
            const err = await verifyRes.json();
            showToast("Payment Verification Failed: " + (err.detail || "Unknown error"));
            onComplete(false);
          }
        } catch (e) {
          console.error("Verification Error:", e);
          showToast("Payment Network Error during verification");
          onComplete(false);
        }
      },
      prefill: {
        name: orderData.customer_name || orderData.customer || "Customer",
        contact: orderData.customer_phone || orderData.customerphone || ""
      },
      theme: { color: "#3399cc" },
      modal: {
        ondismiss: function () {
          showToast("Payment interface closed safely.");
          onComplete(false);
        }
      }
    };

    const rzp = new Razorpay(options);
    rzp.on('payment.failed', function (response) {
      console.error("Payment failed", response.error);
      showToast("Payment Failed: " + response.error.description);
      onComplete(false);
    });
    rzp.open();

  } catch (error) {
    console.error("Payment initialization error:", error);
    showToast("Error initializing secure payment: " + error.message);
    onComplete(false);
  }
}

// --- Cart Management ---
function updateCartBadge() {
  const badges = document.querySelectorAll('.cart-badge');
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  badges.forEach(badge => {
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  });
}

function addToCart(productId) {
  const id = String(productId);
  const product = products.find(p => String(p.id) === id);
  if (!product) return;

  const existingItem = cart.find(item => String(item.id) === id);
  if (existingItem) { existingItem.quantity += 1; }
  else { cart.push({ ...product, quantity: 1 }); }

  saveCart();
  showToast(`${product.name} added to cart!`);
}

function jsArg(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function isMissingStorageBucketError(error) {
  const message = String(error?.message || error?.error || error || '').toLowerCase();
  return message.includes('bucket') && (message.includes('not found') || message.includes('missing'));
}

async function uploadPdfToAvailableBucket(supabase, file, pathPrefix) {
  if (!supabase) throw new Error('Supabase config not loaded.');
  if (!file) throw new Error('PDF file missing.');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const buckets = ['free-notes', 'products'];
  const errors = [];

  for (const bucket of buckets) {
    const fileName = `${pathPrefix}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;
    const { error } = await supabase.storage.from(bucket).upload(fileName, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type || 'application/pdf'
    });

    if (!error) {
      const { data: pubData } = supabase.storage.from(bucket).getPublicUrl(fileName);
      return { bucket, fileName, publicUrl: pubData.publicUrl };
    }

    errors.push(`${bucket}: ${error.message || error}`);
    if (!isMissingStorageBucketError(error)) break;
  }

  throw new Error(errors.join(' | ') || 'PDF upload failed.');
}

async function uploadBookPdfAttachment(file, { name, pdfType, pdfPrice }) {
  const params = new URLSearchParams({
    filename: file.name || 'book.pdf',
    title: name,
    pdf_type: pdfType || 'free',
    price: String(Number.isFinite(Number(pdfPrice)) ? Number(pdfPrice) : 0)
  });
  const headers = { 'Content-Type': file.type || 'application/pdf' };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}/admin/book-pdf?${params.toString()}`, {
    method: 'POST',
    headers,
    body: file
  });
  const text = await response.text();
  let res = null;
  try { res = text ? JSON.parse(text) : null; } catch (e) { res = null; }
  if (!response.ok) {
    const detail = (res && (res.detail || res.message)) || text || `PDF upload failed (${response.status})`;
    throw new Error(detail);
  }
  if (!res?.free_note_id) {
    throw new Error('PDF uploaded, but note link was not returned.');
  }
  return res;
}

async function uploadPhotocopyPdf(file, { orderId, index }) {
  const params = new URLSearchParams({
    order_id: orderId,
    index: String(index || 1),
    filename: file.name || 'document.pdf'
  });
  const response = await fetch(`${API_BASE}/photocopy-doc?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'application/pdf' },
    body: file
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
  if (!response.ok) {
    const detail = (data && (data.detail || data.message)) || text || `PDF upload failed (${response.status})`;
    throw new Error(detail);
  }
  if (!data?.public_url || !data?.file_name) {
    throw new Error('PDF uploaded, but file link was not returned.');
  }
  return data;
}

function removeFromCart(productId) {
  const id = String(productId);
  cart = cart.filter(item => String(item.id) !== id);
  saveCart();
  if (document.getElementById('cartItems')) renderCart();
}

function updateQuantity(productId, delta) {
  const id = String(productId);
  const item = cart.find(i => String(i.id) === id);
  if (item) {
    item.quantity += delta;
    if (item.quantity <= 0) removeFromCart(productId);
    else {
      saveCart();
      if (document.getElementById('cartItems')) renderCart();
    }
  }
}

function saveCart() {
  localStorage.setItem('shubham_cart', JSON.stringify(cart));
  updateCartBadge();
}

function getCartTotal() {
  return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
}

function getCheckoutItems() {
  try {
    const buyNowItem = sessionStorage.getItem('shubham_buy_now_item');
    if (buyNowItem) {
      const parsed = JSON.parse(buyNowItem);
      if (parsed) return [parsed];
    }
  } catch (e) {
    console.error("Failed to load buy now item", e);
  }
  return cart;
}

function getCheckoutTotal() {
  const items = getCheckoutItems();
  return items.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0);
}

const SAVED_ADDR_PREFIX = 'shubham_delivery_addr_';

function getSavedDeliveryDetails() {
  if (!currentUser || !currentUser.phone) return {};
  try {
    return JSON.parse(localStorage.getItem(SAVED_ADDR_PREFIX + currentUser.phone) || '{}');
  } catch (e) {
    return {};
  }
}

function saveSavedDeliveryDetails(partial) {
  if (!currentUser || !currentUser.phone || !partial || typeof partial !== 'object') return;
  const cur = getSavedDeliveryDetails();
  const next = { ...cur };
  Object.keys(partial).forEach((k) => {
    const v = partial[k];
    if (v != null && String(v).trim() !== '') next[k] = String(v).trim();
  });
  localStorage.setItem(SAVED_ADDR_PREFIX + currentUser.phone, JSON.stringify(next));
}

function normalizeOrderItems(items) {
  if (Array.isArray(items)) return items;
  if (typeof items === 'string') {
    try {
      const p = JSON.parse(items);
      return Array.isArray(p) ? p : [];
    } catch (e) {
      return [];
    }
  }
  return [];
}

const ORDER_TRACKING_DURATION_MS = 48 * 60 * 60 * 1000;
const ORDER_TRACK_LABELS = ['Order placed', 'Printing', 'Ready', 'Out for delivery', 'Delivered'];

function getBookOrderPlacedAtMs(o) {
  if (o.created_at) {
    const t = new Date(o.created_at).getTime();
    if (!isNaN(t)) return t;
  }
  const d = new Date(o.date);
  if (!isNaN(d.getTime())) return d.getTime();
  const m = String(o.id || '').match(/ORD(\d{10,})/);
  if (m) return parseInt(m[1], 10);
  return Date.now();
}

function computeBookTrackingCompletedSteps(o) {
  const placed = getBookOrderPlacedAtMs(o);
  const elapsed = Math.max(0, Date.now() - placed);
  const phaseMs = ORDER_TRACKING_DURATION_MS / 4;
  let completed = 1 + Math.floor(elapsed / phaseMs);
  completed = Math.min(5, Math.max(1, completed));
  const st = String(o.status || 'Pending').trim();
  if (st === 'Delivered') completed = 5;
  else if (st === 'Shipped' || /^out for delivery$/i.test(st)) completed = Math.max(completed, 4);
  return completed;
}

function getPhotocopyPlacedAtMs(o) {
  if (o.created_at) {
    const t = new Date(o.created_at).getTime();
    if (!isNaN(t)) return t;
  }
  const m = String(o.id || '').match(/COPY(\d{10,})/);
  if (m) return parseInt(m[1], 10);
  return Date.now();
}

function computePhotocopyTrackingCompletedSteps(o) {
  const st = String(o.status || 'Pending').trim();
  if (st === 'Cancelled') return -1;
  const placed = getPhotocopyPlacedAtMs(o);
  const elapsed = Math.max(0, Date.now() - placed);
  const phaseMs = ORDER_TRACKING_DURATION_MS / 4;
  let completed = 1 + Math.floor(elapsed / phaseMs);

  if (o.delivery_mode === 'collect') {
    completed = Math.min(4, Math.max(1, completed));
    if (st === 'Completed' || st === 'Ready') completed = 4;
    else if (st === 'Processing') completed = Math.max(completed, 2);
  } else {
    completed = Math.min(5, Math.max(1, completed));
    if (st === 'Completed') completed = 5;
    else if (st === 'Ready' || st === 'Shipped') completed = Math.max(completed, 3);
    else if (st === 'Processing') completed = Math.max(completed, 2);
  }
  return completed;
}

function getTrackingLabelsArray(o) {
  if (o && o.delivery_mode === 'collect') {
    return ['Order Received', 'Printing', 'Completed', 'Collect at store'];
  }
  return ORDER_TRACK_LABELS;
}

function buildOrderTrackingTimelineHTML(completedSteps, opts, orderObj) {
  const hint = (opts && opts.hint) || 'Status moves forward automatically over about 48 hours. We also update when your order ships.';
  if (completedSteps < 0) {
    return `
      <div class="order-tracking order-tracking--cancelled">
        <div class="order-tracking-title">Order status</div>
        <p class="order-tracking-cancel-msg">This order was cancelled.</p>
      </div>`;
  }
  const labels = getTrackingLabelsArray(orderObj);
  const items = labels.map((label, i) => {
    const done = i < completedSteps;
    const current = i === completedSteps && completedSteps < labels.length;
    const pending = i > completedSteps;
    let cls = 'order-tracking-step';
    if (done) cls += ' is-done';
    if (current) cls += ' is-current';
    if (pending) cls += ' is-pending';
    return `
      <li class="${cls}">
        <span class="order-tracking-dot" aria-hidden="true"></span>
        <div class="order-tracking-step-body">
          <span class="order-tracking-label">${label}</span>
          ${current ? '<span class="order-tracking-badge">In progress</span>' : ''}
        </div>
      </li>`;
  }).join('');
  return `
    <div class="order-tracking">
      <div class="order-tracking-title">Track your order</div>
      <p class="order-tracking-hint">${hint}</p>
      <ol class="order-tracking-steps" aria-label="Order progress">${items}</ol>
    </div>`;
}

// --- Checkout Logic ---
async function handleCheckout(e) {
  e.preventDefault();

  const items = getCheckoutItems();

  if (items.length === 0) {
    showToast("Your checkout is empty!");
    setTimeout(() => window.location.href = "products.html", 1500);
    return;
  }

  const name = document.getElementById('fullName').value.trim();
  const phone = ((document.getElementById('phoneNumber') || {}).value || '').trim();
  const street = (document.getElementById('address').value || '').trim();
  const cityEl = document.getElementById('city');
  const pinEl = document.getElementById('pincode');
  const city = cityEl ? cityEl.value.trim() : '';
  const pincode = pinEl ? pinEl.value.trim() : '';
  const cityPinLine = [city, pincode].filter(Boolean).join(', ');
  const address = [street, cityPinLine].filter(Boolean).join('\n');
  const paymentMethod = "Online";

  const orderData = {
    id: "ORD" + Date.now(),
    customer: name,
    customerphone: phone,
    address: address,
    items: items,
    total: getCheckoutTotal() + DELIVERY_FEE,
    method: paymentMethod,
    status: "Pending",
    date: new Date().toLocaleString()
  };

  const btn = document.querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Processing Secure Payment...'; }

  processSecureRazorpayPayment(orderData.total, orderData, 'books', (success, txnId) => {
    if (success) {
      sessionStorage.removeItem('shubham_buy_now_item');
      if (items === cart) {
        cart = [];
        saveCart();
      }
      const cityEl = document.getElementById('city');
      const pinEl = document.getElementById('pincode');
      saveSavedDeliveryDetails({
        street: orderData.address,
        city: cityEl ? cityEl.value.trim() : '',
        pincode: pinEl ? pinEl.value.trim() : ''
      });
      sessionStorage.setItem("orderBanner", "success");
      window.location.href = "my-orders.html";
    } else {
      if (btn) { btn.disabled = false; btn.textContent = 'Pay Online & Place Order'; }
    }
  });
}

// --- Rendering Data UI ---
const DEFAULT_BOOK_SVG = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='260' viewBox='0 0 200 260'><rect width='200' height='260' fill='%23f3f4f6'/><path d='M40 40h120v180H40z' fill='%23e5e7eb'/><rect x='60' y='60' width='80' height='15' fill='%23d1d5db' rx='4'/><rect x='60' y='90' width='60' height='15' fill='%23d1d5db' rx='4'/><rect x='60' y='120' width='70' height='15' fill='%23d1d5db' rx='4'/></svg>`;

function createProductCard(product) {
  const fixImgPath = (imgString) => {
    let str = imgString || '';
    if (str.includes('./MPPSC') || str.includes('./Products -')) {
      return str.split('|').map(path => {
        if (path.includes('./')) {
          const parts = path.split('/');
          return 'images/books_new/' + parts[parts.length - 1];
        }
        return path;
      }).join('|');
    }
    return str;
  };

  let imgStr = fixImgPath(product.img);
  const images = imgStr ? imgStr.split('|').filter(i => i.trim() !== '') : [];
  const hasDiscount = product.original_price && product.original_price > product.price;
  const discountPct = hasDiscount
    ? Math.round(((product.original_price - product.price) / product.original_price) * 100)
    : 0;
  
  let imagesHtml = '';
  const isCombo = (product.category || '').toLowerCase() === 'combos';
  
  if (isCombo && (!images[0] || images[0].includes('unsplash.com'))) {
    let comboImages = [];
    if (product.desc && product.desc.startsWith('COMBO_DETAILS:')) {
      try {
        const details = JSON.parse(product.desc.replace('COMBO_DETAILS:', ''));
        if (details.combo_books && details.combo_books.length > 0) {
          details.combo_books.forEach(b => {
            const firstImg = b.img ? fixImgPath(b.img).split('|')[0] : null;
            if (firstImg) {
              comboImages.push(firstImg);
            } else {
              const matched = products.find(p => String(p.id) === String(b.id));
              if (matched && matched.img) {
                const matchedImg = fixImgPath(matched.img).split('|')[0];
                if (matchedImg) comboImages.push(matchedImg);
              }
            }
          });
        }
      } catch(e) {
        // Fallback: use regex to extract img paths if JSON parsing fails
        const imgRegex = /"img":"([^"]+)"/g;
        let match;
        while ((match = imgRegex.exec(product.desc)) !== null) {
          const matchedImg = fixImgPath(match[1]).split('|')[0];
          if (matchedImg) comboImages.push(matchedImg);
        }
      }
    }
    
    if (comboImages.length > 0) {
      const gridImages = comboImages.slice(0, 4);
      imagesHtml = `<div class="combo-image-grid">`;
      gridImages.forEach(img => {
        imagesHtml += `<img src="${img}" alt="${product.name}" loading="lazy" decoding="async" fetchpriority="low">`;
      });
      imagesHtml += `</div>`;
    } else {
      const imgSrc = DEFAULT_BOOK_SVG;
      imagesHtml = `<img src="${imgSrc}" alt="${product.name}" width="320" height="420" loading="lazy" decoding="async" fetchpriority="low">`;
    }
  } else {
    const imgSrc = images[0] || DEFAULT_BOOK_SVG;
    imagesHtml = `<img src="${imgSrc}" alt="${product.name}" width="320" height="420" loading="lazy" decoding="async" fetchpriority="low">`;
  }

  return `
    <div class="product-card catalog-card">
      <a href="product.html?id=${product.id}" class="product-link-wrapper" style="display:block;">
        <div class="product-img-wrapper" style="position:relative; overflow: hidden;">
          ${hasDiscount ? `<div class="catalog-discount-ribbon">${discountPct}% OFF</div>` : ``}
          ${imagesHtml}
        </div>
        <div class="catalog-card-body">
          <div class="catalog-card-title">${product.name}</div>
          <div class="catalog-card-prices">
            <span class="catalog-price-selling">${formatPrice(product.price)}</span>
            ${hasDiscount ? `<span class="catalog-price-original">${formatPrice(product.original_price)}</span>` : ``}
          </div>
        </div>
      </a>
      <button class="catalog-add-btn" onclick="addToCart(${jsArg(product.id)})" aria-label="Add to cart">
        Add to cart
      </button>
    </div>
  `;
}

// --- Storefront Multi-Select Filter ---
window.toggleMultiSelect = function () {
  const dropdown = document.getElementById('multiSelectDropdown');
  if (dropdown) dropdown.classList.toggle('active');
};

window.filterMultiSelect = function () {
  const q = document.getElementById('multiSelectSearch').value.toLowerCase();
  const options = document.querySelectorAll('.multi-select-option');
  options.forEach(opt => {
    const text = opt.querySelector('span').textContent.toLowerCase();
    opt.style.display = text.includes(q) ? 'flex' : 'none';
  });
};

function renderMultiSelect() {
  const container = document.getElementById('multiSelectOptionsList');
  if (!container) return;
  const allCats = getAllProductCategories();

  container.innerHTML = allCats.map(c => `
    <label class="multi-select-option">
      <input type="checkbox" value="${c}" ${selectedCategories.includes(c) ? "checked" : ""} onchange="handleCategoryToggle(this)">
      <span>${c}</span>
    </label>
  `).join('');
  updateActiveCategoryTags();
}

window.handleCategoryToggle = function (checkbox) {
  const val = checkbox.value;
  if (checkbox.checked) {
    if (!selectedCategories.includes(val)) selectedCategories.push(val);
  } else {
    selectedCategories = selectedCategories.filter(c => c !== val);
  }
  resetProductsInfiniteScroll();
  updateActiveCategoryTags();
  renderProductsGrid('allProductsContainer', null, selectedCategories);
};

window.resetCategories = function () {
  selectedCategories = [];
  const checkboxes = document.querySelectorAll('.multi-select-option input[type="checkbox"]');
  checkboxes.forEach(cb => cb.checked = false);
  resetProductsInfiniteScroll();
  updateActiveCategoryTags();
  renderProductsGrid('allProductsContainer', null, selectedCategories);

  const dropdown = document.getElementById('multiSelectDropdown');
  if (dropdown) dropdown.classList.remove('active');
};

function updateActiveCategoryTags() {
  const container = document.getElementById('activeCategoryTags');
  if (!container) return;
  container.innerHTML = selectedCategories.map(c => `
    <div class="active-cat-tag">
      ${c} <span style="cursor:pointer; margin-left:4px;" onclick="uncheckCategory('${c}')">×</span>
    </div>
  `).join('');

  const label = document.getElementById('multiSelectLabel');
  if (label) {
    label.textContent = selectedCategories.length > 0 ? `${selectedCategories.length} Selected` : "Select Categories...";
  }
}

window.uncheckCategory = function (cat) {
  const checkbox = document.querySelector(`.multi-select-option input[value="${cat}"]`);
  if (checkbox) {
    checkbox.checked = false;
    handleCategoryToggle(checkbox);
  }
};

window.toggleFeaturedMultiSelect = function () {
  const dropdown = document.getElementById('featuredMultiSelectDropdown');
  if (dropdown) dropdown.classList.toggle('active');
};

window.filterFeaturedMultiSelect = function () {
  const input = document.getElementById('featuredMultiSelectSearch');
  const q = input ? input.value.toLowerCase() : '';
  const options = document.querySelectorAll('#featuredMultiSelectOptionsList .multi-select-option');
  options.forEach(opt => {
    const text = opt.querySelector('span').textContent.toLowerCase();
    opt.style.display = text.includes(q) ? 'flex' : 'none';
  });
};

window.handleFeaturedCategoryToggle = function (checkbox) {
  const val = checkbox.value;
  if (checkbox.checked) {
    if (!featuredSelectedCategories.includes(val)) featuredSelectedCategories.push(val);
  } else {
    featuredSelectedCategories = featuredSelectedCategories.filter(c => c !== val);
  }
  updateFeaturedActiveCategoryTags();
  renderFeaturedProducts();
};

window.uncheckFeaturedCategory = function (cat) {
  const checkbox = document.querySelector(`#featuredMultiSelectOptionsList input[value="${cat}"]`);
  if (checkbox) {
    checkbox.checked = false;
    handleFeaturedCategoryToggle(checkbox);
  }
};

window.scrollSimilarProducts = function (direction) {
  const container = document.getElementById('similarProductsContainer');
  if (!container) return;
  const amount = Math.min(container.clientWidth * 0.9, 900);
  container.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
};

function renderProductsGrid(containerId, limit = null, filterCategories = []) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const searchInput = document.getElementById('searchInput');
  let filtered = getFilteredProducts(filterCategories, searchInput ? searchInput.value : '');

  const urlParams = new URLSearchParams(window.location.search);
  const examFilter = urlParams.get('exam');
  const formatFilter = urlParams.get('format');

  if (examFilter) {
    const originalExam = examFilter.toLowerCase();
    const qExams = originalExam.split(/[\s/]+/).filter(t => t);
    filtered = filtered.filter(p => {
      if (p.exam && p.exam.toLowerCase().includes(originalExam)) return true;
      const nameL = (p.name || '').toLowerCase();
      return qExams.some(token => nameL.includes(token));
    });
  }

  if (formatFilter) {
    if (formatFilter === 'pdf') {
      filtered = filtered.filter(p => {
        const cat = (p.category || '').toLowerCase();
        const nameL = (p.name || '').toLowerCase();
        return cat.includes('pdf') || cat.includes('notes') || cat.includes('syllabus') || nameL.includes('pdf') || nameL.includes('syllabus');
      });
    } else if (formatFilter === 'book') {
      filtered = filtered.filter(p => {
        const cat = (p.category || '').toLowerCase();
        const nameL = (p.name || '').toLowerCase();
        return !cat.includes('pdf') && !cat.includes('notes') && !cat.includes('syllabus') && !nameL.includes('pdf') && !nameL.includes('syllabus');
      });
    }
  }

  // Infinite Scroll Pagination logic for All Products page
  const isInfiniteScroll = (limit === null);
  let activeLimit = limit;
  const totalFilteredCount = filtered.length;
  if (isInfiniteScroll) {
    window.productsGridTotalFilteredCount = totalFilteredCount;
  }

  if (activeLimit) filtered = filtered.slice(0, activeLimit);
  const gridStateKey = JSON.stringify({
    containerId,
    categories: Array.isArray(filterCategories) ? [...filterCategories].sort() : [],
    search: (searchInput ? searchInput.value : '') || '',
    exam: examFilter || '',
    format: formatFilter || '',
    strict: new URLSearchParams(window.location.search).get('strict') || '',
  });

  if (filtered.length === 0) {
    if (products.length === 0) {
      if (isProductsLoading) {
        container.innerHTML = generateSkeletonHTML(getProductsGridColumns(containerId) * 2);
      } else {
        container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: var(--text-muted); font-size: 1.1rem;"></div>';
      }
      return;
    }
    container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: var(--text-muted); font-size: 1.1rem; background: var(--card-bg); border-radius: var(--radius-md); border: 1px solid var(--border-color);"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 16px; opacity: 0.5;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg><br>No books or notes found for your selection.</div>';
    setProductsLoadMoreIndicator('hidden');
    window.productsGridLastKey = gridStateKey;
    window.productsGridLastRenderedCount = 0;
  } else {
    const prevKey = window.productsGridLastKey || '';
    const prevCount = Number(window.productsGridLastRenderedCount || 0);
    const canAppend =
      isInfiniteScroll &&
      containerId === 'allProductsContainer' &&
      prevKey === gridStateKey &&
      prevCount > 0 &&
      filtered.length > prevCount &&
      container.querySelector('.product-card');

    if (canAppend) {
      const nextItems = filtered.slice(prevCount);
      if (nextItems.length > 0) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = nextItems.map(createProductCard).join('');
        const newNodes = Array.from(wrapper.children);
        newNodes.forEach(node => container.appendChild(node));
        smoothRevealNodes(newNodes, 12);
      }
    } else {
      container.innerHTML = filtered.map(createProductCard).join('');
      if (!window.productsGridBootstrapped) {
        smoothRevealProductCards(container);
      }
    }
    window.productsGridLastKey = gridStateKey;
    window.productsGridLastRenderedCount = filtered.length;

    if (isInfiniteScroll) {
      const hasMoreProducts = (typeof productsServerHasMore !== 'undefined' && productsServerHasMore);
      // Keep infinite loading visually silent to avoid blinking/jumping.
      if (!hasMoreProducts) {
        setProductsLoadMoreIndicator('end');
      } else {
        setProductsLoadMoreIndicator('hidden');
      }
    } else {
      setProductsLoadMoreIndicator('hidden');
    }

    // Removed bootstrap logic to render everything instantly
    window.productsGridBootstrapped = true;
  }
}

// --- Exam Bot Logic ---
const examList = [
  "MPPSC", "UPSC/IAS", "SSC CGL", "SSC CHSL", "Banking PO",
  "Banking Clerk", "Patwari", "Railway RRB NTPC", "Railway Group D",
  "MPSI", "MP Police Constable", "CTET/TET", "NDA/CDS", "State PSC",
  "GATE", "JEE/NEET"
];

let selectedBotExam = "";

function typeBotText() {
  const el = document.getElementById('examBotTypingText');
  if (!el) return;
  const text = "I am your exam prep bot, how can I help you?";
  let i = 0;
  el.innerHTML = '';
  function typeChar() {
    if (i < text.length) {
      el.innerHTML += text.charAt(i);
      i++;
      setTimeout(typeChar, 50);
    } else {
      el.style.borderRight = 'none';
    }
  }
  setTimeout(typeChar, 500);
}

document.addEventListener('DOMContentLoaded', () => {
  typeBotText();
  const botInput = document.getElementById('examBotInput');
  const suggestionsBox = document.getElementById('examBotSuggestions');

  if (botInput && suggestionsBox) {
    botInput.addEventListener('input', (e) => {
      const val = e.target.value.trim().toLowerCase();
      if (!val) {
        suggestionsBox.style.display = 'none';
        return;
      }

      const matches = examList.filter(ex => ex.toLowerCase().includes(val));

      if (matches.length > 0) {
        suggestionsBox.innerHTML = matches.map(m =>
          `<div class="exam-suggestion" style="padding: 12px 24px; cursor: pointer; color: var(--text-main); border-bottom: 1px solid var(--border-color); transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'" onclick="selectBotExam('${m}')">${m}</div>`
        ).join('');
        suggestionsBox.style.display = 'block';
      } else {
        suggestionsBox.innerHTML = `<div style="padding: 12px 24px; color: var(--text-muted); font-style: italic;">Search for '${val}'</div>`;
        suggestionsBox.style.display = 'block';
      }
    });

    botInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = botInput.value.trim();
        if (val) selectBotExam(val);
      }
    });

    document.addEventListener('click', (e) => {
      if (!botInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
        suggestionsBox.style.display = 'none';
      }
    });
  }
});

window.selectBotExam = function (exam) {
  const botInput = document.getElementById('examBotInput');
  const suggestionsBox = document.getElementById('examBotSuggestions');
  const formatOptions = document.getElementById('examBotFormatOptions');

  botInput.value = exam;
  selectedBotExam = exam;
  suggestionsBox.style.display = 'none';
  formatOptions.style.display = 'flex';
};

window.selectExamFormat = function (format) {
  if (!selectedBotExam) {
    const val = document.getElementById('examBotInput').value.trim();
    if (val) selectedBotExam = val;
    else return;
  }
  window.location.href = `products.html?exam=${encodeURIComponent(selectedBotExam)}&format=${format}`;
};

function renderCart() {
  const itemsContainer = document.getElementById('cartItems');
  const detailsContainer = document.getElementById('cartSummaryDetails');
  if (!itemsContainer || !detailsContainer) return;

  if (cart.length === 0) {
    itemsContainer.innerHTML = '<p>Your cart is empty.</p>';
    detailsContainer.innerHTML = '';
    return;
  }

  itemsContainer.innerHTML = cart.map(item => `
    <div class="cart-item">
      <img src="${(item.img && item.img.split('|')[0]) || ''}" class="cart-item-img" alt="${item.name}">
      <div class="cart-item-details">
        <div class="cart-item-title">${item.name}</div>
        <div class="cart-item-price">${formatPrice(item.price)}</div>
      </div>
      <div class="quantity-selector">
        <button class="quantity-btn" onclick="updateQuantity(${jsArg(item.id)}, -1)">-</button>
        <span>${item.quantity}</span>
        <button class="quantity-btn" onclick="updateQuantity(${jsArg(item.id)}, 1)">+</button>
      </div>
      <button class="remove-btn" onclick="removeFromCart(${jsArg(item.id)})">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
      </button>
    </div>
  `).join('');

  detailsContainer.innerHTML = `
    <div class="summary-row"><span>Subtotal</span><span>${formatPrice(getCartTotal())}</span></div>
    <div class="summary-total"><span>Total</span><span>${formatPrice(getCartTotal())}</span></div>
    <a href="checkout.html" onclick="sessionStorage.removeItem('shubham_buy_now_item');" class="btn btn-primary" style="width: 100%; margin-top: 24px; text-align:center;">Proceed to Checkout</a>
  `;
}

// --- Admin ---
function renderAdminCategories() {
  const container = document.getElementById('adminCategoriesList');
  if (container) {
    const isPaged = container.dataset && container.dataset.paged === '1';
    const allCats = [...(Array.isArray(siteCategories) ? siteCategories : [])].sort((a, b) => a.localeCompare(b));
    window.adminCategoriesTotalCount = allCats.length;

    let activeCats = allCats;
    if (isPaged) {
      window.adminCategoriesCurrentCount = window.adminCategoriesCurrentCount || 20;
      activeCats = allCats.slice(0, Math.min(window.adminCategoriesCurrentCount, allCats.length));
    }

    container.innerHTML = activeCats.map(cat => `
      <div style="display:flex; justify-content:space-between; align-items:center; background:var(--card-bg); padding:12px; border-radius:6px; border:1px solid var(--border-color);">
        <div style="display:flex; align-items:center; gap:10px;">
          ${categoryMeta[cat] && categoryMeta[cat].image ? `<img src="${categoryMeta[cat].image}" alt="${cat}" style="width:34px; height:34px; border-radius:50%; object-fit:cover; border:1px solid var(--border-color);">` : `<div style="width:34px; height:34px; border-radius:50%; border:1px solid var(--border-color); display:grid; place-items:center; font-size:0.7rem; color:var(--text-muted);">CAT</div>`}
          <div>
            <div style="font-weight: 500; color: var(--text-main);">${cat}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">${(categoryMeta[cat] && categoryMeta[cat].section) ? categoryMeta[cat].section.toUpperCase() : 'GENERAL'}</div>
          </div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-outline-purple" style="padding:6px 10px; font-size:0.8rem; background: transparent; border-color: var(--primary); color: var(--primary);" onclick="openManageCategoryModal('${cat.replace(/'/g, "\\'")}')">Manage Items</button>
          <button class="btn btn-secondary" style="padding:6px 10px; font-size:0.8rem;" onclick="openEditCategory('${cat.replace(/'/g, "\\'")}')">Edit</button>
          <button class="remove-btn" onclick="removeAdminCategory('${cat.replace(/'/g, "\\'")}')">Remove</button>
        </div>
      </div>
    `).join('');

    if (isPaged) {
      const hasMore = (window.adminCategoriesCurrentCount || 20) < allCats.length;
      setAdminCategoriesLoadMoreIndicator(hasMore ? 'hidden' : 'end');
    } else {
      setAdminCategoriesLoadMoreIndicator('hidden');
    }
  }


  // Also update datalist for Add / Edit Product (merge saved categories + categories from loaded products)
  const dataList = document.getElementById('categoryOptions');
  if (dataList) {
    const opts = getAllProductCategories();
    dataList.innerHTML = opts.map(cat => `<option value="${String(cat).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">`).join('');
  }
}

function applyAdminCategoryPrefill() {
  const categoryInput = document.getElementById('category');
  if (!categoryInput) return;
  const params = new URLSearchParams(window.location.search);
  const prefillCategory = (params.get('category') || '').trim();
  if (!prefillCategory) return;
  categoryInput.value = prefillCategory;
}

window.removeAdminCategory = function (cat) {
  siteCategories = siteCategories.filter(c => c !== cat);
  localStorage.setItem('shubham_categories', JSON.stringify(siteCategories));
  if (categoryMeta[cat]) {
    delete categoryMeta[cat];
    localStorage.setItem('shubham_category_meta', JSON.stringify(categoryMeta));
  }
  renderAdminCategories();
  showToast(`Category removed`);
};

window.openEditCategory = function (cat) {
  const oldNameInput = document.getElementById('editingCategoryOldName');
  const nameInput = document.getElementById('newCategoryName');
  const sectionInput = document.getElementById('newCategorySection');
  const imageUrlInput = document.getElementById('newCategoryImageUrl');
  const submitBtn = document.getElementById('addCategorySubmitBtn');
  const cancelBtn = document.getElementById('cancelCategoryEditBtn');
  if (!oldNameInput || !nameInput) return;

  oldNameInput.value = cat;
  nameInput.value = cat;
  if (sectionInput) sectionInput.value = (categoryMeta[cat] && categoryMeta[cat].section) || '';
  if (imageUrlInput) imageUrlInput.value = (categoryMeta[cat] && categoryMeta[cat].image) || '';
  if (submitBtn) submitBtn.textContent = 'Update';
  if (cancelBtn) cancelBtn.style.display = 'inline-flex';
};

function resetCategoryFormMode() {
  const oldNameInput = document.getElementById('editingCategoryOldName');
  const submitBtn = document.getElementById('addCategorySubmitBtn');
  const cancelBtn = document.getElementById('cancelCategoryEditBtn');
  const imageFileInput = document.getElementById('newCategoryImageFile');
  if (oldNameInput) oldNameInput.value = '';
  if (submitBtn) submitBtn.textContent = 'Add';
  if (cancelBtn) cancelBtn.style.display = 'none';
  if (imageFileInput) imageFileInput.value = '';
}

async function handleAddCategory(e) {
  e.preventDefault();
  const newCat = document.getElementById('newCategoryName').value.trim();
  if (!newCat) return;
  const oldCat = (document.getElementById('editingCategoryOldName')?.value || '').trim();
  const section = (document.getElementById('newCategorySection')?.value || '').trim();
  const imgUrlInput = (document.getElementById('newCategoryImageUrl')?.value || '').trim();
  const imgFile = document.getElementById('newCategoryImageFile')?.files?.[0] || null;
  const compressedImg = await compressImageFileToDataUrl(imgFile);
  const prevMeta = oldCat ? (categoryMeta[oldCat] || {}) : (categoryMeta[newCat] || {});
  const image = compressedImg || imgUrlInput || prevMeta.image || '';

  if (oldCat && oldCat !== newCat) {
    siteCategories = siteCategories.map(c => c === oldCat ? newCat : c);
    if (categoryMeta[oldCat]) delete categoryMeta[oldCat];
    showToast(`Category renamed`);
  } else if (!siteCategories.includes(newCat)) {
    siteCategories.push(newCat);
    showToast(`Category added!`);
  } else {
    showToast(`Category updated`);
  }

  localStorage.setItem('shubham_categories', JSON.stringify(siteCategories));

  categoryMeta[newCat] = {
    ...(prevMeta || {}),
    section,
    image
  };
  localStorage.setItem('shubham_category_meta', JSON.stringify(categoryMeta));

  document.getElementById('addCategoryForm').reset();
  resetCategoryFormMode();
  renderAdminCategories();
}
function checkAdminAccess() {
  if (!currentUser || currentUser.phone !== ADMIN_PHONE) {
    showToast("Access Denied");
    setTimeout(() => window.location.href = "index.html", 1000);
  } else {
    const navLinks = document.getElementById('adminNavLinks');
    if (navLinks) {
      navLinks.style.display = 'flex';
      const path = window.location.pathname.split('/').pop() || 'admin.html';
      const links = navLinks.querySelectorAll('a');
      links.forEach(link => {
        if (link.getAttribute('href') === path) {
          link.style.color = 'var(--primary)';
        }
      });
    }
  }
}

async function ensurePdfJsForAdmin() {
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    return true;
  }
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.body.appendChild(script);
  });
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    return true;
  }
  return false;
}

async function generatePreviewImagesFromPdf(file, pageLimit = 3) {
  if (!file) return [];
  const ok = await ensurePdfJsForAdmin();
  if (!ok) return [];
  const buffer = await file.arrayBuffer();
  const pdfDoc = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  const maxPages = Math.min(pageLimit, pdfDoc.numPages);
  const images = [];
  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.2 });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;

    // Compress and resize the extracted image to max 1200x1200
    const MAX_WIDTH = 1200;
    const MAX_HEIGHT = 1200;
    let width = canvas.width;
    let height = canvas.height;

    if (width > MAX_WIDTH || height > MAX_HEIGHT) {
      if (width > height) {
        height *= MAX_WIDTH / width;
        width = MAX_WIDTH;
      } else {
        width *= MAX_HEIGHT / height;
        height = MAX_HEIGHT;
      }
      const compressedCanvas = document.createElement('canvas');
      compressedCanvas.width = width;
      compressedCanvas.height = height;
      const compressedCtx = compressedCanvas.getContext('2d');
      compressedCtx.drawImage(canvas, 0, 0, width, height);
      images.push(compressedCanvas.toDataURL('image/jpeg', 0.8));
    } else {
      images.push(canvas.toDataURL('image/jpeg', 0.8));
    }
  }
  return images;
}

function compressImageFileToDataUrl(file) {
  return new Promise((resolve) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 900;
        const MAX_HEIGHT = 900;
        let width = img.width;
        let height = img.height;
        if (width > height && width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        } else if (height >= width && height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/webp', 0.75));
      };
      img.onerror = () => resolve(null);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function addComboManualItemRow(name = '', qty = 1) {
  const container = document.getElementById('comboManualItems');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'combo-manual-item-row';
  row.style.cssText = 'display:grid; grid-template-columns: 1fr 110px auto; gap:8px; margin-bottom:8px;';
  row.innerHTML = `
    <input type="text" class="form-control combo-manual-name" placeholder="Item name" value="${name}">
    <input type="number" class="form-control combo-manual-qty" min="1" step="1" value="${qty}">
    <button type="button" class="btn btn-outline-purple combo-manual-remove">x</button>
  `;
  row.querySelector('.combo-manual-remove').addEventListener('click', () => row.remove());
  container.appendChild(row);
}

function renderComboBooksOptions() {
  const list = document.getElementById('comboBooksList');
  if (!list) return;
  const baseProducts = (products || []).filter(p => {
    const cat = (p.category || '').toLowerCase();
    return !cat.includes('combo');
  });
  if (!baseProducts.length) {
    list.innerHTML = '<div style="padding:8px; color:var(--text-muted);">No books found yet.</div>';
    return;
  }

  list.innerHTML = baseProducts.map(p => `
    <label style="display:grid; grid-template-columns: auto 1fr 90px; gap:10px; align-items:center; padding:8px; border-bottom:1px solid var(--border-color);">
      <input type="checkbox" class="combo-book-check" value="${p.id}">
      <span style="font-size:0.92rem;">${p.name}</span>
      <input type="number" class="form-control combo-book-qty" data-book-id="${p.id}" min="1" step="1" value="1" style="padding:6px 8px;">
    </label>
  `).join('');
}

async function handleAddStationeryItem(e) {
  e.preventDefault();
  const form = e.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Adding...';
  try {
    const name = document.getElementById('stationeryName').value.trim();
    const price = parseFloat(document.getElementById('stationeryPrice').value);
    const imgUrlInput = document.getElementById('stationeryImageUrl').value.trim();
    const imgFile = document.getElementById('stationeryImageFile').files[0];
    const imgCompressed = await compressImageFileToDataUrl(imgFile);
    const categoryEl = document.getElementById('stationeryCategory');
    const category = categoryEl && categoryEl.value ? categoryEl.value : "Stationery";
    const spiralPagesEl = document.getElementById('spiralPages');
    const spiralPages = spiralPagesEl ? parseInt(spiralPagesEl.value, 10) : 0;
    if (category === "Spiral Copies" && (!Number.isFinite(spiralPages) || spiralPages <= 0)) {
      throw new Error('Please enter spiral copy pages.');
    }
    const img = imgCompressed || imgUrlInput || "https://images.unsplash.com/photo-1456086272160-b28b0645b729?auto=format&fit=crop&w=800&q=80";
    const body = { name, price, category, img };
    if (category === "Spiral Copies") {
      body.desc = `Pages: ${spiralPages}`;
    }
    await apiFetch("/admin/products", {
      method: "POST",
      body
    });
    showToast(category === "Spiral Copies" ? 'Spiral copy added.' : 'Stationery item added.');
    form.reset();
  } catch (err) {
    showToast(err.message || 'Failed to add stationery item');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = document.getElementById('stationeryCategory')?.value === "Spiral Copies" ? 'Add Spiral Copy' : 'Add Stationery Item';
  }
}

async function handleAddComboDeal(e) {
  e.preventDefault();
  const form = e.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Adding...';
  try {
    const name = document.getElementById('comboName').value.trim();
    const price = parseFloat(document.getElementById('comboPrice').value);
    const imgUrlInput = document.getElementById('comboImageUrl').value.trim();
    const imgFile = document.getElementById('comboImageFile').files[0];
    let imgCompressed = null;
    if (imgFile) {
      imgCompressed = await compressImageFileToDataUrl(imgFile);
    }
    const img = imgCompressed || imgUrlInput || "";

    const selectedBooks = Array.from(document.querySelectorAll('.combo-book-check:checked')).map(chk => {
      const pid = Number(chk.value);
      const qtyEl = document.querySelector(`.combo-book-qty[data-book-id="${pid}"]`);
      const qty = Math.max(1, parseInt(qtyEl ? qtyEl.value : '1', 10) || 1);
      const p = (products || []).find(x => Number(x.id) === pid);
      return p ? { id: p.id, name: p.name, qty, price: p.price, img: p.img } : null;
    }).filter(Boolean);

    const manualItems = Array.from(document.querySelectorAll('.combo-manual-item-row')).map(row => {
      const itemName = row.querySelector('.combo-manual-name')?.value.trim();
      const qtyRaw = row.querySelector('.combo-manual-qty')?.value;
      const qty = Math.max(1, parseInt(qtyRaw || '1', 10) || 1);
      if (!itemName) return null;
      return { name: itemName, qty };
    }).filter(Boolean);

    const descPayload = {
      combo_books: selectedBooks,
      manual_items: manualItems
    };

    const calculatedOriginalPrice = selectedBooks.reduce((sum, b) => sum + (b.price * b.qty), 0);
    const originalPrice = calculatedOriginalPrice > price ? calculatedOriginalPrice : null;

    await apiFetch("/admin/products", {
      method: "POST",
      body: {
        name,
        price,
        original_price: originalPrice,
        category: "Combos",
        img,
        desc: `COMBO_DETAILS:${JSON.stringify(descPayload)}`
      }
    });

    showToast('Combo deal added.');
    form.reset();
    document.getElementById('comboManualItems').innerHTML = '';
    addComboManualItemRow();
    renderComboBooksOptions();
  } catch (err) {
    showToast(err.message || 'Failed to add combo deal');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Add Combo Deal';
  }
}

async function handleAddProduct(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.classList.add('is-loading');
    submitBtn.dataset.originalText = submitBtn.dataset.originalText || submitBtn.textContent;
    submitBtn.innerHTML = '<span class="btn-loader"></span><span>Uploading...</span>';
  }

  try {
    const name = document.getElementById('name').value;
    const price = parseFloat(document.getElementById('price').value);
    const rawOriginal = document.getElementById('originalPrice').value;
    const original_price = rawOriginal ? parseFloat(rawOriginal) : null;
    const category = document.getElementById('category').value;

    const examCheckboxes = document.querySelectorAll('input[name="exam_opts"]:checked');
    const examValues = Array.from(examCheckboxes).map(cb => cb.value);
    const exam = examValues.length > 0 ? examValues.join(', ') : null;

    let imgUrl = document.getElementById('img').value;
    const pdfAttachedInput = document.getElementById('bookAttachedPdf');
    const previewPdfFile = pdfAttachedInput && pdfAttachedInput.files ? pdfAttachedInput.files[0] : null;
    const pdfType = document.getElementById('bookPdfType') ? document.getElementById('bookPdfType').value : 'free';
    const pdfPrice = document.getElementById('bookPdfPrice') ? parseFloat(document.getElementById('bookPdfPrice').value) : 0;

    const pdfImagesInput = document.getElementById('bookPdfPreview');
    const imagesPdfFile = pdfImagesInput && pdfImagesInput.files ? pdfImagesInput.files[0] : null;

    window.compressImage = function (file) {
      return new Promise((resolve) => {
        if (!file) {
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 800;
            const MAX_HEIGHT = 800;
            let width = img.width;
            let height = img.height;
            if (width > height) {
              if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
              }
            } else {
              if (height > MAX_HEIGHT) {
                width *= MAX_HEIGHT / height;
                height = MAX_HEIGHT;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/webp', 0.7));
          };
          img.onerror = () => resolve(null);
          img.src = e.target.result;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      });
    };

    const readImage = async (input) => {
      if (input && input.files && input.files[0]) {
        return await window.compressImage(input.files[0]);
      }
      return null;
    };

    const images = await Promise.all([
      readImage(document.getElementById('imgUpload1')),
      readImage(document.getElementById('imgUpload2')),
      readImage(document.getElementById('imgUpload3'))
    ]);

    let finalImages = images.filter(Boolean);
    if (finalImages.length === 0) {
      if (imgUrl) {
        finalImages = [imgUrl];
      } else if (imagesPdfFile) {
        finalImages = await generatePreviewImagesFromPdf(imagesPdfFile, 3);
        if (finalImages.length) {
          showToast('Created 3 preview images from PDF.');
        }
      }
      if (finalImages.length === 0) {
        finalImages = ["https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=400&q=80"];
      }
    }

    const finalImg = finalImages.join('|');

    const addNode = async (imageSrc) => {
      const payload = { name, price, category, img: imageSrc };
      if (original_price) payload.original_price = original_price;
      if (exam) payload.exam = exam;

      try {
        let pdfWarning = '';
        if (previewPdfFile) {
          if (submitBtn) submitBtn.innerHTML = '<span class="btn-loader"></span><span>Uploading PDF...</span>';
          try {
            const upload = await uploadBookPdfAttachment(previewPdfFile, { name, pdfType, pdfPrice });
            payload.free_note_id = upload.free_note_id;
          } catch (pdfErr) {
            console.error("PDF upload/link error:", pdfErr);
            pdfWarning = `PDF attach failed: ${pdfErr.message || pdfErr}`;
          }
          if (submitBtn) submitBtn.innerHTML = '<span class="btn-loader"></span><span>Saving Product...</span>';
        }

        const addRes = await apiFetch("/admin/products", { method: "POST", body: payload });
        if (addRes?.product) {
          products = [normalizeProductRecord(addRes.product, 0), ...products.filter(p => String(p.id) !== String(addRes.product.id))];
          saveProductsToCache(products);
        }
        adminProductsDbLoaded = false;
        showToast(pdfWarning ? `Product added. ${pdfWarning}` : "Product added successfully!");
      } catch (err) {
        showToast(err.message || "Failed to add product");
        console.error(err);
        return;
      }
      e.target.reset();
      if (document.getElementById('adminProductsList')) await renderAdminList();
    };

    await addNode(finalImg);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('is-loading');
      submitBtn.textContent = submitBtn.dataset.originalText || 'Add Product';
    }
  }
}

async function removeProduct(id, name) {
  const shouldDelete = await showConfirmDialog(`Are you sure you want to delete "${name || 'this book'}"?`, 'Delete Book');
  if (!shouldDelete) return;

  showGlobalLoader(true, name ? `Say bye bye to ${name} 👋` : 'Deleting...');
  try {
    await apiFetch(`/admin/products/${id}`, { method: "DELETE" });
    const idx = products.findIndex(p => String(p.id) === String(id));
    if (idx > -1) products.splice(idx, 1);
    saveProductsToCache(products);

    if (typeof adminLastSearchValue !== 'undefined') adminLastSearchValue = null;
  } catch (err) {
    showGlobalLoader(false);
    showToast(err.message || "Delete failed");
    return;
  }
  adminLastRenderedCount = 0;
  const container = document.getElementById('adminProductsList');
  if (container) container.innerHTML = '';
  await renderAdminList();
  showGlobalLoader(false);
}

function updateBulkDeleteBtn() {
  const checkboxes = document.querySelectorAll('.product-select-checkbox:checked');
  const btn = document.getElementById('bulkDeleteBtn');
  if (!btn) return;
  if (checkboxes.length > 0) {
    btn.style.display = 'inline-block';
    btn.textContent = `Delete Selected (${checkboxes.length})`;
  } else {
    btn.style.display = 'none';
  }
}

async function bulkDeleteProducts() {
  const checkboxes = document.querySelectorAll('.product-select-checkbox:checked');
  const ids = Array.from(checkboxes).map(cb => Number(cb.value));
  if (ids.length === 0) return;

  const shouldDelete = await showConfirmDialog(`Are you sure you want to delete ${ids.length} products?`, 'Bulk Delete');
  if (!shouldDelete) return;

  showGlobalLoader(true, `Deleting ${ids.length} products...`);
  try {
    await apiFetch('/admin/products/bulk-delete', {
      method: 'POST',
      body: { product_ids: ids }
    });
    products = products.filter(p => !ids.includes(p.id));
    saveProductsToCache(products);

    if (typeof adminLastSearchValue !== 'undefined') adminLastSearchValue = null;
    
    // Uncheck all just in case
    const allCheckboxes = document.querySelectorAll('.product-select-checkbox');
    allCheckboxes.forEach(cb => cb.checked = false);
    updateBulkDeleteBtn();

    adminLastRenderedCount = 0;
    const container = document.getElementById('adminProductsList');
    if (container) container.innerHTML = '';

    await renderAdminList();
  } catch (err) {
    showToast(err.message || "Bulk delete failed");
  } finally {
    showGlobalLoader(false);
  }
}

let adminProgressiveTimer = null;
let adminLastRenderedCount = 0;
let adminLastSearchValue = null;
let adminProductsDbLoaded = false;

async function refreshAdminProductsFromServer() {
  if (!document.getElementById('adminProductsList')) return;
  let offset = 0;
  const limit = 100;
  const rows = [];

  while (true) {
    const res = await apiFetch(`/admin/products?limit=${limit}&offset=${offset}`, { method: "GET" });
    const batch = Array.isArray(res?.products) ? res.products : [];
    rows.push(...batch);
    if (!res?.has_more || batch.length === 0) break;
    offset += batch.length;
  }

  if (rows.length) {
    const normalized = rows.map((p, index) => normalizeProductRecord(p, index));
    const staticRows = (products || []).filter(p => !normalized.some(db => String(db.id) === String(p.id)));
    products = [...normalized, ...staticRows].sort((a, b) => (Number(b?.id) || 0) - (Number(a?.id) || 0));
    saveProductsToCache(products);
  } else {
    products = [];
  }
  adminProductsDbLoaded = true;
}

async function renderAdminList() {
  const container = document.getElementById('adminProductsList');
  if (!container) return;

  if (window.location.pathname.includes('admin-products') && !adminProductsDbLoaded) {
    container.innerHTML = '<div style="padding: 24px; color: var(--text-muted);">Loading latest products from database...</div>';
    try {
      await refreshAdminProductsFromServer();
    } catch (err) {
      console.error('Admin products refresh failed:', err);
      showToast(err.message || 'Failed to load latest products');
      adminProductsDbLoaded = true;
    }
    container.innerHTML = '';
    adminLastRenderedCount = 0;
    adminLastSearchValue = null;
  }

  const searchInput = document.getElementById('adminSearchInput');
  const searchValue = searchInput ? searchInput.value : '';

  if (adminLastSearchValue !== searchValue) {
    container.innerHTML = '';
    adminLastRenderedCount = 0;
    adminLastSearchValue = searchValue;
  }

    let filtered;
  if (window.location.pathname.includes('admin-stationery.html')) {
    filtered = getFilteredProducts(['Stationery'], searchValue);
  } else {
    filtered = getFilteredProducts([], searchValue, true);
  }

  if (filtered.length === 0) {
    if (adminLastRenderedCount === 0) {
      container.innerHTML = '<div style="padding: 24px; color: var(--text-muted);">No products found.</div>';
    }
    setAdminProductsLoadMoreIndicator('hidden');
    
    if (typeof productsServerHasMore !== 'undefined' && productsServerHasMore) {
      if (adminProgressiveTimer) clearTimeout(adminProgressiveTimer);
      adminProgressiveTimer = setTimeout(renderAdminList, 200);
    }
    return;
  }

  if (adminLastRenderedCount === 0 && container.innerHTML.includes('No products found')) {
    container.innerHTML = '';
  }

  const itemsToAppend = filtered.slice(adminLastRenderedCount, adminLastRenderedCount + 10);

  if (itemsToAppend.length > 0) {
    const html = itemsToAppend.map(p => `
      <div class="admin-list-item" id="admin-product-${p.id}">
        <div style="display:flex; gap:12px; align-items:center;">
          <input type="checkbox" class="product-select-checkbox" value="${p.id}" style="width: 20px; height: 20px; cursor: pointer; accent-color: var(--primary);" onchange="updateBulkDeleteBtn()">
          <img src="${(p.img && p.img.split('|')[0]) || ''}" style="width:40px; height:40px; border-radius:4px; object-fit:cover;">
          <div>
            <strong>${p.name}</strong> <br>
            <span style="color: var(--text-muted); font-size: 0.85rem;">${p.category} | ${formatPrice(p.price)}</span>
          </div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-primary" style="padding: 6px 12px; font-size: 0.85rem;" onclick="openEditModal(${jsArg(p.id)})">Edit</button>
          <button class="remove-btn" onclick="removeProduct(${jsArg(p.id)}, ${jsArg(p.name || '')})">Delete</button>
        </div>
      </div>
    `).join('');

    container.insertAdjacentHTML('beforeend', html);
    adminLastRenderedCount += itemsToAppend.length;
  }

  if (adminProgressiveTimer) clearTimeout(adminProgressiveTimer);

  if (adminLastRenderedCount >= filtered.length) {
    if (typeof productsServerHasMore !== 'undefined' && productsServerHasMore) {
      setAdminProductsLoadMoreIndicator('loading');
      adminProgressiveTimer = setTimeout(() => {
        renderAdminList();
      }, 200);
    } else {
      setAdminProductsLoadMoreIndicator('end');
    }
  } else {
    setAdminProductsLoadMoreIndicator('loading');
    adminProgressiveTimer = setTimeout(() => {
      renderAdminList();
    }, 50);
  }
}

async function renderAdminUsers() {
  const userContainer = document.getElementById('adminUsersList');
  if (userContainer) {
    let dbUsers = [];
    try {
      const res = await apiFetch("/admin/users", { method: "GET" });
      dbUsers = (res && res.users) || [];
    } catch (err) {
      dbUsers = [];
      showToast(err.message || "Failed to load users");
    }
    if (dbUsers.length === 0) {
      userContainer.innerHTML = '<div style="padding: 24px; color: var(--text-muted);">No users found. Wait for users to register.</div>';
    } else {
      userContainer.innerHTML = dbUsers.map(u => `
        <div class="admin-list-item">
          <div><strong>${u.name}</strong> <span style="font-size:0.8rem; background:var(--bg-color); padding:2px 6px; border-radius:4px;">${u.role}</span></div>
          <div style="color:var(--text-muted);">${u.phone}</div>
          <button class="remove-btn" onclick="deleteUser('${u.phone}')" ${u.phone === ADMIN_PHONE ? 'disabled style="opacity:0.6; cursor:not-allowed;"' : ''}>Delete</button>
        </div>
      `).join('');
    }
  }
}

window.deleteUser = async function (phone) {
  if (phone === ADMIN_PHONE) {
    showToast("Admin user cannot be deleted.");
    return;
  }
  const shouldDelete = await showConfirmDialog('Are you sure you want to delete this user?', 'Delete User');
  if (!shouldDelete) return;
  try {
    await apiFetch(`/admin/users/${encodeURIComponent(phone)}`, { method: "DELETE" });
  } catch (err) {
    showToast(err.message || "Error deleting user");
    return;
  }
  showToast("User deleted.");
  await renderAdminUsers();
};

// Edit Modal Logic
window.openEditModal = function (id) {
  const product = products.find(p => String(p.id) === String(id));
  if (!product) return;

  document.getElementById('editProductId').value = product.id;
  document.getElementById('editName').value = product.name;
  document.getElementById('editPrice').value = product.price;
  document.getElementById('editOriginalPrice').value = product.original_price || '';
  document.getElementById('editCategory').value = product.category;

  const examBoxes = document.querySelectorAll('input[name="edit_exam_opts"]');
  examBoxes.forEach(cb => cb.checked = false);
  if (product.exam) {
    const pExams = product.exam.split(',').map(e => e.trim());
    examBoxes.forEach(cb => {
      if (pExams.includes(cb.value)) cb.checked = true;
    });
  }

  document.getElementById('editImg').value = product.img;

  const modal = document.getElementById('editProductModal');
  if (modal) modal.style.display = 'flex';
};

window.closeEditModal = function () {
  const modal = document.getElementById('editProductModal');
  if (modal) modal.style.display = 'none';
};

async function handleEditProduct(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.classList.add('is-loading');
    submitBtn.dataset.originalText = submitBtn.dataset.originalText || submitBtn.textContent;
    submitBtn.innerHTML = '<span class="btn-loader"></span><span>Saving...</span>';
  }
  const idRaw = document.getElementById('editProductId').value;
  const idNum = Number(idRaw);
  const id = Number.isFinite(idNum) ? idNum : idRaw;
  const name = document.getElementById('editName').value;
  const price = parseFloat(document.getElementById('editPrice').value);
  const rawOriginal = document.getElementById('editOriginalPrice').value;
  const original_price = rawOriginal ? parseFloat(rawOriginal) : null;
  const category = document.getElementById('editCategory').value;

  const examCheckboxes = document.querySelectorAll('input[name="edit_exam_opts"]:checked');
  const examValues = Array.from(examCheckboxes).map(cb => cb.value);
  const exam = examValues.length > 0 ? examValues.join(', ') : null;

  let imgUrl = document.getElementById('editImg').value;
  const fileInput = document.getElementById('editImgUpload');
  const editPdfPreviewInput = document.getElementById('editBookPdfPreview');
  const editPreviewPdfFile = editPdfPreviewInput && editPdfPreviewInput.files ? editPdfPreviewInput.files[0] : null;

  const updateNode = async (imageSrc) => {
    let finalImg = imageSrc;
    if (!finalImg && editPreviewPdfFile) {
      const generated = await generatePreviewImagesFromPdf(editPreviewPdfFile, 3);
      if (generated && generated.length > 0) {
        finalImg = generated.join('|');
        showToast('Created 3 preview images from PDF.');
      }
    }
    finalImg = finalImg || "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=400&q=80";

    const payload = { name, price, category, img: finalImg, original_price: original_price || null };
    if (exam) payload.exam = exam;
    try {
      await apiFetch(`/admin/products/${id}`, { method: "PUT", body: payload });
      const idx = products.findIndex(p => String(p.id) === String(id));
      if (idx > -1) products[idx] = { ...products[idx], ...payload };
      if (typeof adminLastSearchValue !== 'undefined') adminLastSearchValue = null;
      showToast("Product updated successfully!");
      closeEditModal();
      await renderAdminList();
    } catch (err) {
      showToast(err.message || "Update failed");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('is-loading');
        submitBtn.textContent = submitBtn.dataset.originalText || 'Save Changes';
      }
    }
  };

  if (fileInput.files && fileInput.files[0]) {
    const compressed = await window.compressImage(fileInput.files[0]);
    updateNode(compressed);
  } else {
    updateNode(imgUrl);
  }
}


function getTrimmedInputValue(id) {
  const el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

function adminEscapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Full delivery block for book orders (supports multiline address from checkout). */
function formatAdminBookOrderDeliveryHtml(o) {
  const name = adminEscapeHtml((o.customer || o.customer_name || '').trim() || '—');
  const rawPhone = String(o.customerphone || o.customer_phone || '').replace(/\D/g, '');
  const phoneDisplay = adminEscapeHtml((o.customerphone || o.customer_phone || '').trim() || '—');
  const telHref = rawPhone.length >= 10 ? `tel:+91${rawPhone.slice(-10)}` : '';
  const addr = adminEscapeHtml((o.address || '').trim() || '—');
  
  // Combine shiprocket and zippee tracking for display
  const tracking = (o.tracking_link || o.tracking_url || '').trim();
  const shipNote = (o.tracking_id || o.shiprocket_order_id || o.shipment_id)
    ? `<div style="font-size:0.8rem; color:var(--text-muted); margin-top:8px;">Tracking ID: ${adminEscapeHtml(String(o.tracking_id || o.shiprocket_order_id || ''))}</div>`
    : '';
  const trackLink = tracking
    ? `<a href="${adminEscapeHtml(tracking)}" target="_blank" rel="noopener" style="display:inline-block; margin-top:8px; font-size:0.85rem; font-weight:600; color:var(--primary);">Open tracking link</a>`
    : '';
    
  let deliveryStatusBadge = '';
  if (o.delivery_status) {
      const bColor = o.delivery_status === 'Delivered' ? '#10b981' : (o.delivery_status === 'Out For Delivery' ? '#f59e0b' : '#3b82f6');
      deliveryStatusBadge = `<div style="margin-top: 8px;"><span style="background:${bColor}15; color:${bColor}; border:1px solid ${bColor}40; padding:4px 8px; border-radius:4px; font-size:0.75rem; font-weight:700;">Partner: ${o.delivery_status}</span></div>`;
  }
  
  return `
    <div style="display:flex; flex-direction:column; gap:10px;">
      <div><span style="font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-muted);">Name</span><div style="font-size:0.95rem; font-weight:600; margin-top:2px;">${name}</div></div>
      <div><span style="font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-muted);">Phone</span><div style="font-size:0.95rem; margin-top:2px;">${telHref ? `<a href="${telHref}" style="color:var(--primary); font-weight:600;">${phoneDisplay}</a>` : phoneDisplay}</div></div>
      <div><span style="font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-muted);">Full address</span><div style="font-size:0.92rem; margin-top:4px; line-height:1.45; white-space:pre-line; color:var(--text-main);">${addr}</div></div>
      ${deliveryStatusBadge}
      ${trackLink}
      ${shipNote}
    </div>`;
}

async function renderAdminOrders(useCache = false) {
  const container = document.getElementById('adminOrdersList');
  if (!container) return;

  const countLabel = document.getElementById('adminOrdersCountLabel');
  let dbOrders = [];
  if (useCache && Array.isArray(window._adminOrdersRaw)) {
    dbOrders = window._adminOrdersRaw;
  } else {
    try {
      const res = await apiFetch("/admin/orders?order_type=books", { method: "GET" });
      dbOrders = (res && res.orders) || [];
    } catch (err) {
      dbOrders = [];
      showToast(err.message || "Failed to load orders");
    }
    window._adminOrdersRaw = dbOrders;
  }

  if (countLabel) {
    countLabel.textContent = 'Total book orders: ' + dbOrders.length;
  }

  if (dbOrders.length === 0) {
    container.innerHTML = `<div style="padding: 24px;">No orders yet.</div>`;
    return;
  }

  window.ordersListContext = dbOrders;

  const q = getTrimmedInputValue('adminOrdersSearch').toLowerCase();

  // Filter out any orders that are ONLY PDFs
  const physicalOrders = dbOrders.filter(o => {
    if (!o.items || !Array.isArray(o.items)) return true; // Assume physical if unknown
    // Check if there is at least one physical 'book' item
    let hasPhysical = false;
    o.items.forEach(item => {
      if (item.type !== 'note') hasPhysical = true;
    });
    return hasPhysical;
  });

  if (physicalOrders.length === 0) {
    container.innerHTML = `<div style="padding: 24px;">No book orders yet.</div>`;
    return;
  }

  const filteredOrders = q
    ? physicalOrders.filter((o) => {
        const idM = String(o.id || '').toLowerCase().includes(q);
        const phoneM = String(o.customerphone || o.customer_phone || '').toLowerCase().includes(q);
        const nameM = String(o.customer || o.customer_name || '').toLowerCase().includes(q);
        return idM || phoneM || nameM;
      })
    : physicalOrders;
  if (!filteredOrders.length) {
    container.innerHTML = `<div style="padding: 24px; color: var(--text-muted); text-align:center;">No orders match this Order ID.</div>`;
    return;
  }

  const activeOrders = filteredOrders.filter(o => o.status !== 'Delivered' && o.status !== 'Cancelled' && !String(o.status || '').includes('Return'));
  const completedOrders = filteredOrders.filter(o => o.status === 'Delivered' || o.status === 'Cancelled' || String(o.status || '').includes('Return'));

  const renderList = (list) => {
    if (!list.length) return `<div style="padding: 12px; color: var(--text-muted);">No orders in this category.</div>`;
    return list.map(o => {
      const statusClass = `status-${String(o.status || 'Pending').toLowerCase()}`;
      return `
      <div style="background: var(--card-bg); border: 1px solid var(--border-color); margin-bottom: 20px; border-radius: var(--radius-md); box-shadow: var(--shadow-sm); padding: 24px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px; margin-bottom: 16px; border-bottom: 1px solid var(--border-color); padding-bottom: 16px;">
          <div>
            <strong style="font-size: 1.1rem;">${o.id}</strong><br>
            <span style="color: var(--text-muted); font-size: 0.9rem;">${o.date}</span>
          </div>
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            ${o.status === 'Cancelled' ? `<span style="background:#ff3b3020; color:#ff3b30; padding:4px 12px; border-radius:20px; font-size:0.8rem; font-weight:700;">Cancelled</span>` : `<span style="background:var(--bg-color); color:var(--text-main); border:1px solid var(--border-color); padding:4px 12px; border-radius:20px; font-size:0.8rem; font-weight:700;">${o.status || 'Pending'}</span>`}
            
            ${(o.status !== 'Delivered' && o.status !== 'Cancelled' && o.status !== 'Rider Assigned' && o.status !== 'Out For Delivery' && !String(o.status || '').includes('Return')) ? `<button type="button" onclick="startDelivery('${String(o.id).replace(/'/g, "\\'")}')" style="background:#3b82f615; color:#2563eb; border:1px solid #3b82f640; padding:6px 14px; border-radius:6px; font-size:0.8rem; font-weight:700; cursor:pointer;" onmouseover="this.style.background='#3b82f625'" onmouseout="this.style.background='#3b82f615'">Start Delivery</button>` : ''}
            ${(o.status !== 'Delivered' && o.status !== 'Cancelled' && !String(o.status || '').includes('Return')) ? `<button type="button" onclick="updateOrderStatus('${String(o.id).replace(/'/g, "\\'")}', 'Delivered')" style="background:#10b98115; color:#10b981; border:1px solid #10b98140; padding:5px 12px; border-radius:6px; font-size:0.8rem; font-weight:600; cursor:pointer;" onmouseover="this.style.background='#10b98125'" onmouseout="this.style.background='#10b98115'">Mark Delivered</button>` : ''}
            
            <button type="button" onclick="deleteOrder('${String(o.id).replace(/'/g, "\\'")}')" style="background:#ff3b3015; color:#ff3b30; border:1px solid #ff3b3040; padding:5px 12px; border-radius:6px; font-size:0.8rem; font-weight:600; cursor:pointer;" onmouseover="this.style.background='#ff3b3025'" onmouseout="this.style.background='#ff3b3015'">Delete</button>
          </div>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 20px;">
          <div style="background:var(--bg-color); border:1px solid var(--border-color); border-radius:var(--radius-sm); padding:16px;">
            <strong style="display:block; margin-bottom:10px;">Delivery details</strong>
            ${formatAdminBookOrderDeliveryHtml(o)}
          </div>
          <div style="background:var(--bg-color); border:1px solid var(--border-color); border-radius:var(--radius-sm); padding:16px;">
            <strong style="display:block; margin-bottom:10px;">Payment</strong>
            <p style="font-size: 0.9rem; margin-top: 4px;">Method: ${adminEscapeHtml(o.method || '—')}</p>
            <p style="font-size: 0.9rem; font-weight: 700; margin-top:8px;">Total: ${formatPrice(o.total)}</p>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 10px;">Order ID: ${adminEscapeHtml(o.id)}</p>
          </div>
        </div>

        <div style="background: var(--bg-color); border-radius: var(--radius-sm); padding: 12px;">
          <strong style="display:block; margin-bottom: 8px;">Order Items</strong>
          ${normalizeOrderItems(o.items).map(i => `<div style="font-size: 0.9rem; display:flex; justify-content:space-between;"><span>${i.name} (x${i.quantity})</span> <span>${formatPrice(i.price * i.quantity)}</span></div>`).join('')}
        </div>
      </div>
      `;
    }).join('');
  };

  container.innerHTML = `
    <div style="background:var(--primary); color:#fff; padding:12px 20px; border-radius:var(--radius-md) var(--radius-md) 0 0; font-size:1.15rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; display:flex; align-items:center; gap:8px;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Active Orders
    </div>
    <div style="background:rgba(0,0,0, 0.02); border:1px solid var(--border-color); border-top:none; border-radius:0 0 var(--radius-md) var(--radius-md); padding:20px; margin-bottom:32px; box-shadow:var(--shadow-sm);">
      ${renderList(activeOrders)}
    </div>
    <div style="background:#10b981; color:#fff; padding:12px 20px; border-radius:var(--radius-md) var(--radius-md) 0 0; font-size:1.15rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; display:flex; align-items:center; gap:8px;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Completed & Cancelled
    </div>
    <div style="background:rgba(16,185,129,0.02); border:1px solid var(--border-color); border-top:none; border-radius:0 0 var(--radius-md) var(--radius-md); padding:20px; box-shadow:var(--shadow-sm);">
      ${renderList(completedOrders)}
    </div>
  `;
}

async function renderAdminReturns(useCache = false) {
  const container = document.getElementById('adminReturnsList');
  if (!container) return;

  let merged = [];
  if (useCache && Array.isArray(window._adminReturnsMerged)) {
    merged = window._adminReturnsMerged;
  } else {
    let dbOrders = [];
    let dbCopies = [];
    try {
      const booksRes = await apiFetch("/admin/orders?order_type=books", { method: "GET" });
      const copyRes = await apiFetch("/admin/orders?order_type=photocopy", { method: "GET" });
      dbOrders = ((booksRes && booksRes.orders) || []).filter(o => o.status === "Return Requested");
      dbCopies = ((copyRes && copyRes.orders) || []).filter(o => o.status === "Return Requested");
    } catch (err) {
      dbOrders = [];
      dbCopies = [];
      showToast(err.message || "Failed to load returns");
    }

    merged = [
      ...dbOrders.map((o) => ({ kind: 'book', o, t: getBookOrderPlacedAtMs(o) })),
      ...dbCopies.map((o) => ({ kind: 'photocopy', o, t: getPhotocopyPlacedAtMs(o) }))
    ].sort((a, b) => b.t - a.t);
    window._adminReturnsMerged = merged;
  }

  const q = getTrimmedInputValue('adminReturnsSearch').toLowerCase();
  const filtered = q ? merged.filter(({ o }) => String(o.id || '').toLowerCase().includes(q)) : merged;

  const countLabel = document.getElementById('adminReturnsCountLabel');
  if (countLabel) countLabel.textContent = 'Total returned orders: ' + merged.length;

  if (merged.length === 0) {
    container.innerHTML = `<div style="padding: 24px;">No returned orders.</div>`;
    return;
  }
  if (!filtered.length) {
    container.innerHTML = `<div style="padding: 24px; color: var(--text-muted); text-align:center;">No returns match this Order ID.</div>`;
    return;
  }

  container.innerHTML = filtered.map(({ kind, o }) => {
    return `
      <div style="background: var(--card-bg); border: 1px solid var(--border-color); margin-bottom: 20px; border-radius: var(--radius-md); box-shadow: var(--shadow-sm); padding: 24px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px; margin-bottom: 16px; border-bottom: 1px solid var(--border-color); padding-bottom: 16px;">
          <div>
            <span style="font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--primary);">${kind === 'book' ? 'Books' : 'Photocopy'}</span>
            <strong style="display:block; margin-top:4px; font-size: 1.1rem;">${o.id}</strong>
            <span style="color: var(--text-muted); font-size: 0.9rem;">${o.date || new Date(o.created_at).toLocaleString('en-IN')}</span>
          </div>
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <span style="background:#ff980020; color:#ff9800; border:1px solid #ff980040; padding:4px 12px; border-radius:20px; font-size:0.8rem; font-weight:700;">Return Requested</span>
            <button onclick="handleReturnAction('${o.id}', '${kind === 'book' ? 'orders' : 'photocopy_orders'}', 'Return Accepted')" style="background:#10b98115; color:#10b981; border:1px solid #10b98140; padding:5px 12px; border-radius:6px; font-size:0.8rem; font-weight:600; cursor:pointer;" onmouseover="this.style.background='#10b98125'" onmouseout="this.style.background='#10b98115'">Accept</button>
            <button onclick="handleReturnAction('${o.id}', '${kind === 'book' ? 'orders' : 'photocopy_orders'}', 'Return Rejected')" style="background:#ff3b3015; color:#ff3b30; border:1px solid #ff3b3040; padding:5px 12px; border-radius:6px; font-size:0.8rem; font-weight:600; cursor:pointer;" onmouseover="this.style.background='#ff3b3025'" onmouseout="this.style.background='#ff3b3015'">Reject</button>
          </div>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
          <div>
            <strong>Customer Details</strong>
            <p style="font-size: 0.9rem; margin-top: 4px;">${o.customer !== undefined ? o.customer : 'User'} (${o.customerphone || o.customer_phone})</p>
            <p style="font-size: 0.9rem; color: var(--text-muted);">${o.address || ''}</p>
          </div>
          <div>
            <strong>Total Amount</strong>
            <p style="font-size: 0.9rem; margin-top: 4px; font-weight: 700;">${formatPrice(o.total || o.total_cost || 0)}</p>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

window.deleteOrder = async function (orderId) {
  if (!confirm('Delete this order? This cannot be undone.')) return;
  showGlobalLoader(true, `Say bye bye to ${orderId} 👋`);
  try {
    await apiFetch(`/admin/orders/${encodeURIComponent(orderId)}?order_type=books`, { method: "DELETE" });
  } catch (err) {
    showGlobalLoader(false);
    showToast(err.message || "Delete failed");
    return;
  }
  showToast('Order deleted.');
  await renderAdminOrders();
  showGlobalLoader(false);
};

window.updateOrderStatus = async function (orderId, newStatus) {
  try {
    await apiFetch(`/admin/orders/${encodeURIComponent(orderId)}?order_type=books`, { method: "PATCH", body: { status: newStatus } });
  } catch (err) {
    showToast(err.message || "Update failed");
    return;
  }
  await renderAdminOrders();
};

window.startDelivery = async function (orderId) {
  if (!orderId) return;
  showGlobalLoader(true, 'Assigning rider...');
  try {
    await apiFetch(`/admin/orders/${encodeURIComponent(orderId)}/start-delivery`, { method: "POST" });
    showToast('Delivery started! Rider assigned.');
    window._adminOrdersRaw = null;
    await renderAdminOrders();
  } catch (err) {
    showToast(err.message || 'Could not start delivery');
  } finally {
    showGlobalLoader(false);
  }
};

window.handleReturnAction = async function (orderId, table, action) {
  if (!confirm(`Are you sure you want to ${action === 'Return Accepted' ? 'Accept' : 'Reject'} this return?`)) return;
  const orderType = table === "orders" ? "books" : "photocopy";
  try {
    await apiFetch(`/admin/orders/${encodeURIComponent(orderId)}?order_type=${orderType}`, { method: "PATCH", body: { status: action } });
  } catch (err) {
    showToast(err.message || "Action failed");
    return;
  }
  showToast(action);
  await renderAdminReturns();
};

window.returnUserOrder = async function (orderId, type) {
  if (!confirm("Are you sure you want to return this order?")) return;
  const table = type === 'book' ? 'orders' : 'photocopy_orders';
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from(table).update({ status: 'Return Requested' }).eq('id', orderId);
    } catch (e) { console.error('Return error:', e); }
  } else {
    try {
      let local = JSON.parse(localStorage.getItem(table) || '[]');
      local = local.map(o => o.id === orderId ? { ...o, status: 'Return Requested' } : o);
      localStorage.setItem(table, JSON.stringify(local));
    } catch (e) { }
  }
  showToast("Return Requested");
  await renderMyOrders();
};

window.cancelUserOrder = async function (orderId, type) {
  if (!confirm("Are you sure you want to cancel this order?")) return;
  const table = type === 'book' ? 'orders' : 'photocopy_orders';
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from(table).update({ status: 'Cancelled' }).eq('id', orderId);
    } catch (e) { console.error('Cancel error:', e); }
  } else {
    try {
      let local = JSON.parse(localStorage.getItem(table) || '[]');
      local = local.map(o => o.id === orderId ? { ...o, status: 'Cancelled' } : o);
      localStorage.setItem(table, JSON.stringify(local));
    } catch (e) { }
  }
  showToast("Order Cancelled");
  await renderMyOrders();
};

async function renderMyOrders() {
  const container = document.getElementById('myOrdersList');
  if (!container) return;

  if (!currentUser) {
    window.location.href = "login.html";
    return;
  }

  let dbOrders = [];
  let photoOrders = [];
  const supabase = getSupabase();
  if (supabase) {
    const { data: books } = await supabase.from('orders').select('*').eq('customerphone', currentUser.phone).order('date', { ascending: false });
    dbOrders = books || [];
    const { data: copies } = await supabase
      .from('photocopy_orders')
      .select('*')
      .eq('customer_phone', currentUser.phone)
      .order('created_at', { ascending: false });
    photoOrders = copies || [];
  } else {
    try {
      dbOrders = JSON.parse(localStorage.getItem('orders') || '[]').filter(o => o.customerphone === currentUser.phone);
      photoOrders = JSON.parse(localStorage.getItem('photocopy_orders') || '[]').filter(o => o.customer_phone === currentUser.phone);
    } catch (e) { }
  }

  const merged = [
    ...dbOrders.map((o) => ({ kind: 'book', o, t: getBookOrderPlacedAtMs(o) })),
    ...photoOrders.map((o) => ({ kind: 'photocopy', o, t: getPhotocopyPlacedAtMs(o) }))
  ].sort((a, b) => b.t - a.t);

  if (merged.length === 0) {
    container.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-muted);">You have not placed any orders yet.</div>`;
    return;
  }

  container.innerHTML = merged.map(({ kind, o }) => {
    if (kind === 'book') {
      const statusStr = String(o.status || 'Pending').trim();
      const hasTracking = o.tracking_link || o.tracking_url;
      const trackingBtn = hasTracking
        ? `<a href="${hasTracking}" target="_blank" style="display:inline-block; margin-top: 12px; background:var(--primary); color:#000; padding:8px 16px; border-radius:6px; text-decoration:none; font-weight:600; font-size:0.9rem; display:flex; align-items:center; gap:8px; width:fit-content;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"></path></svg> Track Order</a>`
        : `<p style="color:var(--text-muted); font-size:0.85rem; margin-top:12px;">Tracking will be available shortly.</p>`;

      let timelineStepsHtml = '';
      if (statusStr !== 'Cancelled' && statusStr.indexOf('Return') === -1) {
          const steps = ['Order Confirmed', 'Rider Assigned', 'Out For Delivery', 'Delivered'];
          let currentStepIdx = 0;
          if (o.delivery_status === 'Rider Assigned') currentStepIdx = 1;
          if (o.delivery_status === 'Out For Delivery' || o.status === 'Out For Delivery') currentStepIdx = 2;
          if (o.delivery_status === 'Delivered' || o.status === 'Delivered') currentStepIdx = 3;
          
          const stepNodes = steps.map((s, idx) => {
              const isDone = idx <= currentStepIdx;
              const isLast = idx === steps.length - 1;
              const color = isDone ? '#10b981' : 'var(--border-color)';
              return `
                  <div style="display:flex; align-items:center; gap:8px;">
                      <div style="width:24px; height:24px; border-radius:50%; background:${isDone ? '#10b981' : 'transparent'}; border:2px solid ${color}; display:flex; justify-content:center; align-items:center; color:#fff;">
                          ${isDone ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
                      </div>
                      <span style="font-size:0.85rem; font-weight:${isDone ? '600' : '400'}; color:${isDone ? 'var(--text-main)' : 'var(--text-muted)'};">${s}</span>
                  </div>
                  ${!isLast ? `<div style="height:2px; flex:1; background:${idx < currentStepIdx ? '#10b981' : 'var(--border-color)'}; margin: 0 4px;"></div>` : ''}
              `;
          }).join('');
          
          timelineStepsHtml = `<div style="display:flex; align-items:center; margin: 16px 0; overflow-x:auto;">${stepNodes}</div>`;
      }

      const timeline = `
        <div style="background:var(--bg-color); padding: 16px; border-radius:8px; margin: 16px 0; border: 1px solid var(--border-color);">
           <strong style="display:block; margin-bottom:4px; font-size:1.1rem;">Status: <span style="color: ${statusStr === 'Delivered' ? '#10b981' : 'var(--primary)'};">${o.delivery_status || statusStr}</span></strong>
           ${timelineStepsHtml}
           ${statusStr !== 'Cancelled' && statusStr.indexOf('Return') === -1 ? trackingBtn : ''}
        </div>
      `;

      return `
      <div style="background: var(--card-bg); border: 1px solid var(--border-color); margin-bottom: 24px; border-radius: var(--radius-md); box-shadow: var(--shadow-sm); padding: 24px;">
        <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom: 16px; border-bottom: 1px solid var(--border-color); padding-bottom: 16px;">
          <div>
            <span style="font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--primary);">Books</span>
            <strong style="font-size: 1.1rem; display:block; margin-top:4px;">${o.id}</strong>
            <span style="color: var(--text-muted); font-size: 0.9rem;">${o.date || ''}</span>
          </div>
          <div style="text-align: right;">
            ${statusStr === 'Cancelled' ? `<span style="color: #ff3b30; font-weight: bold; font-size: 0.9rem;">Cancelled</span>`
          : statusStr === 'Return Requested' ? `<span style="color: #ff9800; font-weight: bold; font-size: 0.9rem;">Return Requested</span>`
            : statusStr === 'Return Accepted' ? `<span style="color: #10b981; font-weight: bold; font-size: 0.9rem;">Return Accepted</span>`
              : statusStr === 'Return Rejected' ? `<span style="color: #ff3b30; font-weight: bold; font-size: 0.9rem;">Return Rejected</span>`
                : statusStr === 'Delivered' ? (Date.now() - getBookOrderPlacedAtMs(o) < 5 * 24 * 60 * 60 * 1000 ? `<button onclick="returnUserOrder('${o.id}', 'book')" style="background:#ff980015; color:#ff9800; border:1px solid #ff980040; padding:6px 14px; border-radius:6px; font-size:0.85rem; font-weight:600; cursor:pointer;">Return Order</button>` : `<span style="color:var(--text-muted); font-size:0.85rem;">Return Window Expired</span>`)
                  : (statusStr === 'Pending' ? `<button onclick="cancelUserOrder('${o.id}', 'book')" style="background:#ff3b3015; color:#ff3b30; border:1px solid #ff3b3040; padding:6px 14px; border-radius:6px; font-size:0.85rem; font-weight:600; cursor:pointer;">Cancel Order</button>` : `<span style="color: #10b981; font-weight: 600; font-size: 0.9rem;">Processing</span>`)}
          </div>
        </div>

        ${timeline}

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; margin-bottom: 20px;">
          <div>
            <strong>Delivery Address</strong>
            <p style="font-size: 0.9rem; margin-top: 4px; color: var(--text-muted); white-space: pre-line;">${adminEscapeHtml(o.address || '')}</p>
          </div>
          <div>
            <strong>Payment Info</strong>
            <p style="font-size: 0.9rem; margin-top: 4px; color: var(--text-muted);">Method: ${o.method || ''}</p>
            <p style="font-size: 0.9rem; font-weight: 700;">Total: ${formatPrice(o.total)}</p>
          </div>
        </div>

        <div style="background: var(--bg-color); border-radius: var(--radius-sm); padding: 12px;">
          <strong style="display:block; margin-bottom: 8px;">Order Items</strong>
          ${normalizeOrderItems(o.items).map(i => `<div style="font-size: 0.9rem; display:flex; justify-content:space-between; color: var(--text-main);"><span>${i.name} (x${i.quantity})</span> <span>${formatPrice(i.price * i.quantity)}</span></div>`).join('')}
        </div>
      </div>`;
    }

    const steps = computePhotocopyTrackingCompletedSteps(o);
    const st = o.status || 'Pending';
    const timeline = buildOrderTrackingTimelineHTML(steps, {
      hint: 'Photocopy progress updates over about 48 hours. Shop status (Processing / Ready) can move you forward faster.'
    }, o);
    const when = o.created_at ? new Date(o.created_at).toLocaleString('en-IN') : '';
    return `
      <div style="background: var(--card-bg); border: 1px solid var(--border-color); margin-bottom: 24px; border-radius: var(--radius-md); box-shadow: var(--shadow-sm); padding: 24px;">
        <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom: 16px; border-bottom: 1px solid var(--border-color); padding-bottom: 16px;">
          <div>
            <span style="font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--primary);">Photocopy</span>
            <strong style="font-size: 1.1rem; display:block; margin-top:4px;">${o.id}</strong>
            <span style="color: var(--text-muted); font-size: 0.9rem;">${when}</span>
          </div>
          <div style="text-align: right;">
            ${st === 'Cancelled' ? `<span style="color: #ff3b30; font-weight: bold; font-size: 0.9rem;">Cancelled</span>`
        : (st === 'Delivered' || st === 'Completed') ? `<span style="color: #10b981; font-weight: bold; font-size: 0.9rem;">${st}</span>`
          : (computePhotocopyTrackingCompletedSteps(o) < 2 ? `<button onclick="cancelUserOrder('${o.id}', 'photocopy_orders')" style="background:#ff3b3015; color:#ff3b30; border:1px solid #ff3b3040; padding:6px 14px; border-radius:6px; font-size:0.85rem; font-weight:600; cursor:pointer;">Cancel Order</button>` : `<span style="color: #10b981; font-weight: 600; font-size: 0.9rem;">Processing</span>`)}
          </div>
        </div>

        ${timeline}

        ${o.tracking_url ? `<div style="margin-top:16px; padding: 16px; background:var(--bg-color); border:1px solid var(--border-color); border-radius:8px;">
          <strong style="display:block; margin-bottom:8px; font-size:1.05rem;">Delivery Tracking:</strong>
          <a href="${o.tracking_url}" target="_blank" style="display:inline-flex; align-items:center; gap:8px; background:var(--primary); color:#000; padding:8px 16px; border-radius:6px; text-decoration:none; font-weight:600; font-size:0.9rem;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"></path></svg> Track via Shiprocket
          </a>
        </div>` : ''}

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
          <div>
            <strong>Address</strong>
            <p style="font-size: 0.9rem; margin-top: 4px; color: var(--text-muted);">${o.address || ''}</p>
          </div>
          <div>
            <strong>Total</strong>
            <p style="font-size: 0.9rem; font-weight: 700; margin-top: 4px;">${formatPrice(Number(o.total_cost))}</p>
            <p style="font-size: 0.85rem; color: var(--text-muted);">${o.pages || 0} pages × ${o.copies || 1} copy</p>
          </div>
        </div>
      </div>`;
  }).join('');
}

function renderCheckoutSummary() {
  const container = document.getElementById('checkoutSummaryItems');
  if (!container) return;

  const items = getCheckoutItems();

  container.innerHTML = items.map(item => `
    <div style="display:flex; justify-content:space-between; margin-bottom:12px; font-size:0.9rem;">
      <div style="color:var(--text-main); font-weight:500; display:flex; gap:8px;">
        <span style="color:var(--text-muted);">x${item.quantity}</span>
        ${item.name}
      </div>
      <span>${formatPrice(item.price * item.quantity)}</span>
    </div>
  `).join('');

  const rawSubtotal = getCheckoutTotal();
  document.getElementById('checkoutSubtotal').textContent = formatPrice(rawSubtotal);
  document.getElementById('checkoutTotal').textContent = formatPrice(rawSubtotal + DELIVERY_FEE);
}

async function renderTopSellingBooks() {
  const container = document.getElementById('topSellingBooks');
  if (!container) return;

  const supabase = getSupabase();
  if (!supabase) {
    container.innerHTML = '<p style="padding:20px;color:var(--text-muted);margin:0;">Connect Supabase to see bestselling books.</p>';
    return;
  }

  const { data: orders, error } = await supabase.from('orders').select('items');
  if (error) {
    container.innerHTML = '<p style="padding:20px;color:var(--text-muted);margin:0;">Could not load sales data.</p>';
    return;
  }

  const qtyByKey = new Map();
  (orders || []).forEach((o) => {
    normalizeOrderItems(o.items).forEach((i) => {
      const name = (i.name || 'Book').trim() || 'Book';
      const key = i.id != null && i.id !== '' ? String(i.id) : name;
      const q = Number(i.quantity) || 0;
      const prev = qtyByKey.get(key) || { name, qty: 0 };
      prev.qty += q;
      prev.name = name;
      qtyByKey.set(key, prev);
    });
  });

  const ranked = [...qtyByKey.values()].sort((a, b) => b.qty - a.qty).slice(0, 3);
  if (!ranked.length) {
    container.innerHTML = '<p style="padding:20px;color:var(--text-muted);margin:0;">No book orders yet — stats will appear after customers buy books.</p>';
    return;
  }

  container.innerHTML = `<ol style="margin:0;padding-left:22px;line-height:1.75;color:var(--text-main);">
    ${ranked.map((r, idx) => `<li style="margin-bottom:10px;"><strong>${idx + 1}. ${r.name}</strong> <span style="color:var(--text-muted);font-weight:500;">— ${r.qty} units sold</span></li>`).join('')}
  </ol>`;
}

// Excel CSV Exporter
window.exportOrdersToCSV = async function (filterType = 'all') {
  const supabase = getSupabase();
  if (!supabase) return alert("Database not connected!");

  try {
    let stdFilter = '*';
    let photoFilter = '*';

    const { data: stdOrders } = await supabase.from('orders').select(stdFilter);
    const { data: photoOrders } = await supabase.from('photocopy_orders').select(photoFilter);

    let csvRows = [];
    csvRows.push(['Order ID', 'Type', 'Customer Name', 'Phone No.', 'Items/Details', 'Total (Rs)', 'Status', 'Date', 'Time']);

    if (stdOrders) {
      stdOrders.forEach(o => {
        let isPending = o.status !== 'Delivered' && o.status !== 'Cancelled' && o.status !== 'Returned';
        if (filterType === 'pending' && !isPending) return;
        if (filterType === 'completed' && o.status !== 'Delivered') return;

        let type = 'Book';
        let itemsStr = '';
        if (o.items && Array.isArray(o.items)) {
          o.items.forEach(i => {
            if (i.type === 'note') type = 'PDF';
            itemsStr += (i.name || 'Item') + ' (x' + (i.quantity || 1) + ') | ';
          });
        }
        const cDate = o.created_at || o.date || new Date().toISOString();
        const dObj = new Date(cDate);
        const dateStr = !isNaN(dObj.getTime()) ? dObj.toLocaleDateString() : '';
        const timeStr = !isNaN(dObj.getTime()) ? dObj.toLocaleTimeString() : '';

        csvRows.push([
          o.id || '',
          type,
          `"${String(o.customer || 'Unknown').replace(/"/g, '""')}"`,
          o.customerphone || '',
          `"${String(itemsStr || '').replace(/"/g, '""')}"`,
          o.total || 0,
          o.status || '',
          dateStr,
          timeStr
        ]);
      });
    }

    if (photoOrders) {
      photoOrders.forEach(po => {
        let isPending = po.status !== 'Completed' && po.status !== 'Delivered' && po.status !== 'Cancelled' && po.status !== 'Returned';
        if (filterType === 'pending' && !isPending) return;
        if (filterType === 'completed' && po.status !== 'Completed' && po.status !== 'Delivered') return;

        const cDate = po.created_at || new Date().toISOString();
        const dObj = new Date(cDate);
        const dateStr = !isNaN(dObj.getTime()) ? dObj.toLocaleDateString() : '';
        const timeStr = !isNaN(dObj.getTime()) ? dObj.toLocaleTimeString() : '';

        csvRows.push([
          po.id || '',
          'Photocopy',
          `"${String(po.customer_name || po.customer || 'Unknown').replace(/"/g, '""')}"`,
          po.phone || po.customerphone || '',
          `"${String(po.details || 'Photocopy Doc').replace(/"/g, '""')}"`,
          po.total_cost || po.total || 0,
          po.status || '',
          dateStr,
          timeStr
        ]);
      });
    }

    let fName = "All";
    if (filterType === 'pending') fName = "Pending";
    if (filterType === 'completed') fName = "Completed";
    const dateStringForFile = new Date().toLocaleDateString('en-GB').split('/').join('-');
    const fileName = `Shubham_Xerox_${fName}_Orders_${dateStringForFile}.xlsx`;

    if (typeof XLSX !== 'undefined') {
      const worksheet = XLSX.utils.aoa_to_sheet(csvRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");
      XLSX.writeFile(workbook, fileName);
    } else {
      // Fallback to CSV if library failed to load
      let csvContent = csvRows.map(row => row.join(',')).join('\n');
      let blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      let link = document.createElement("a");
      if (link.download !== undefined) {
        let url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", fileName.replace('.xlsx', '.csv'));
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    }
  } catch (e) {
    console.error("Export error", e);
    alert("Failed to export data.");
  }
};

window.renderPaidPDFLog = function (pdfOrders) {
  const container = document.getElementById('paidPdfOrdersList');
  if (!container) return;
  if (!pdfOrders || pdfOrders.length === 0) {
    container.innerHTML = '<div style="padding: 24px; color: var(--text-muted); text-align: center;">No PDF purchases yet.</div>';
    return;
  }

  window._adminPaidPdfOrders = pdfOrders;
  const q = getTrimmedInputValue('adminPdfOrdersSearch').toLowerCase();
  const filtered = q ? pdfOrders.filter(o => String(o.id || '').toLowerCase().includes(q)) : pdfOrders;
  if (!filtered.length) {
    container.innerHTML = '<div style="padding: 24px; color: var(--text-muted); text-align: center;">No PDF orders match this Order ID.</div>';
    return;
  }

  // Sort descending by date
  filtered.sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date));

  container.innerHTML = filtered.map(o => {
    let pdfNames = '';
    if (o.items && Array.isArray(o.items)) {
      pdfNames = o.items.filter(i => i.type === 'note').map(i => i.name).join(', ');
    }
    const d = new Date(o.created_at || o.date);
    return `
    <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-color); padding:16px; border-radius:8px; border:1px solid var(--border-color); margin-bottom:12px;">
      <div style="display: flex; gap: 16px; align-items: center;">
        <div style="background: rgba(128,42,126,0.1); color: var(--primary); width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.2rem;">
          ${(o.customer || 'U').charAt(0).toUpperCase()}
        </div>
        <div>
          <div style="font-weight:600; color:var(--text-main); margin-bottom:2px; font-size:1.05rem;">${o.customer} <span style="font-size:0.85rem; color:var(--text-muted); font-weight:normal; margin-left:8px;">${o.customerphone}</span></div>
          <div style="font-size:0.9rem; color:var(--text-main);">Bought: <strong style="color:var(--primary);">${pdfNames}</strong></div>
        </div>
      </div>
      <div style="text-align: right;">
        <div style="font-weight:700; color:#10b981; font-size:1.1rem;">₹${o.total}</div>
        <div style="font-size:0.8rem; color:var(--text-muted);">${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
      </div>
    </div>`;
  }).join('');
};

async function renderAdminDashboard() {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data: standardOrders } = await supabase.from('orders').select('*');
      const { data: photocopyOrders } = await supabase.from('photocopy_orders').select('*');

      let totalRevenue = 0;
      let pendingRevenue = 0;
      let deliveredBooks = 0;
      let paidPdfsSold = 0;
      let pdfOrders = [];

      if (standardOrders) {
        standardOrders.forEach(o => {
          let hasPdf = false;
          let hasBook = false;
          if (o.items && Array.isArray(o.items)) {
            o.items.forEach(item => {
              if (item.type === 'note') hasPdf = true;
              else hasBook = true;
            });
          }
          if (hasPdf) {
            paidPdfsSold++;
            totalRevenue += Number(o.total) || 0;
            pdfOrders.push(o);
          } else if (hasBook) {
            if (o.status === 'Delivered') {
              totalRevenue += Number(o.total) || 0;
              deliveredBooks++;
            } else if (o.status !== 'Cancelled' && o.status !== 'Returned') {
              pendingRevenue += Number(o.total) || 0;
            }
          } else {
            if (o.status === 'Delivered') {
              totalRevenue += Number(o.total) || 0;
              deliveredBooks++;
            } else if (o.status !== 'Cancelled' && o.status !== 'Returned') {
              pendingRevenue += Number(o.total) || 0;
            }
          }
        });
      }

      if (photocopyOrders) {
        photocopyOrders.forEach(po => {
          if (po.status === 'Completed' || po.status === 'Delivered') {
            totalRevenue += Number(po.total_cost || po.total) || 0;
          } else if (po.status !== 'Cancelled' && po.status !== 'Returned') {
            pendingRevenue += Number(po.total_cost || po.total) || 0;
          }
        });
      }

      const revEl = document.getElementById('statRevenue');
      const penEl = document.getElementById('statPendingRevenue');
      const pdfEl = document.getElementById('statPdfSold');
      const bkEl = document.getElementById('statDeliveredBooks');

      if (revEl) revEl.innerText = '₹' + Math.floor(totalRevenue).toLocaleString('en-IN');
      if (penEl) penEl.innerText = '₹' + Math.floor(pendingRevenue).toLocaleString('en-IN');
      if (pdfEl) pdfEl.innerText = String(paidPdfsSold);
      if (bkEl) bkEl.innerText = String(deliveredBooks);

      renderPaidPDFLog(pdfOrders);

    } catch (e) {
      console.warn('Error fetching dashboard stats:', e);
    }
  }

  await renderTopSellingBooks();

  const ctx = document.getElementById('visitsChart');
  if (ctx && window.Chart) {
    // Generate dates for the last 7 days
    const last7Days = [];
    const labels = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      last7Days.push(d.toISOString().split('T')[0]);
      labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
    }

    let chartData = new Array(7).fill(0);
    let totalVisits = 0;

    if (supabase) {
      const { data: visits } = await supabase.from('site_visits').select('created_at');
      if (visits) {
        totalVisits = visits.length;
        visits.forEach(v => {
          const vDate = v.created_at.split('T')[0];
          const idx = last7Days.indexOf(vDate);
          if (idx !== -1) {
            chartData[idx]++;
          }
        });
      }
    }

    if (document.getElementById('statVisitors')) {
      document.getElementById('statVisitors').innerText = totalVisits;
    }

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const textColor = isLight ? '#333' : '#e0e0e0';
    const gridColor = isLight ? '#ddd' : '#333';

    window.adminChartObj = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'People Count',
          data: chartData,
          backgroundColor: '#802a7e',
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: textColor } }
        },
        scales: {
          x: { ticks: { color: textColor }, grid: { color: gridColor, drawBorder: false } },
          y: { ticks: { color: textColor }, grid: { color: gridColor, drawBorder: false }, beginAtZero: true }
        }
      }
    });
  }
}

// Slider
let currentSlide = 0;
let slideInterval;

function initSlider() {
  const slides = document.querySelectorAll('.slide');
  const dots = document.querySelectorAll('.dot');
  if (slides.length === 0) return;

  function setSlide(index) {
    slides.forEach(s => s.classList.remove('active'));
    dots.forEach(d => d.classList.remove('active'));
    slides[index].classList.add('active');
    dots[index].classList.add('active');
    currentSlide = index;
  }
  window.goToSlide = (index) => {
    setSlide(index);
    resetInterval();
  };
  function nextSlide() {
    let next = (currentSlide + 1) % slides.length;
    setSlide(next);
  }
  function resetInterval() {
    clearInterval(slideInterval);
    slideInterval = setInterval(nextSlide, 4000);
  }
  resetInterval();
}

function initCategoryMobileSlider() {
  const desktopGrid = document.querySelector('.category-tiles-grid');
  const track = document.getElementById('categoryMobileTrack');
  const prevBtn = document.getElementById('categoryMobilePrev');
  const nextBtn = document.getElementById('categoryMobileNext');
  const pager = document.getElementById('categoryMobilePagination');
  if (!desktopGrid || !track || !prevBtn || !nextBtn || !pager) return;

  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  if (!isMobile) {
    track.innerHTML = '';
    pager.textContent = '';
    return;
  }

  if (track.children.length > 0) return; // already built

  const cards = Array.from(desktopGrid.querySelectorAll('.category-tile'));
  const chunkSize = 4; // 4 cards per slide
  const slides = [];
  for (let i = 0; i < cards.length; i += chunkSize) {
    slides.push(cards.slice(i, i + chunkSize));
  }

  track.innerHTML = slides.map(group => `
    <div class="category-mobile-slide">
      ${group.map(card => card.outerHTML).join('')}
    </div>
  `).join('');

  let current = 0;
  const total = slides.length || 1;

  const update = () => {
    track.style.transform = `translateX(calc(${current * -100}% - ${current * 20}px))`;
    pager.textContent = `${current + 1}/${total}`;
    prevBtn.style.opacity = current === 0 ? '0.45' : '1';
    nextBtn.style.opacity = current === total - 1 ? '0.45' : '1';
  };

  prevBtn.onclick = () => {
    if (current > 0) {
      current -= 1;
      update();
    }
  };
  nextBtn.onclick = () => {
    if (current < total - 1) {
      current += 1;
      update();
    }
  };

  update();
}

function initPremiumCategoryTileInteractions() {
  let activeEl = null;

  const clearPressed = () => {
    if (activeEl) activeEl.classList.remove('is-pressed');
    activeEl = null;
  };

  const spawnRipple = (el, clientX, clientY) => {
    if (!el) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const rect = el.getBoundingClientRect();
    const size = Math.ceil(Math.max(rect.width, rect.height) * 1.25);
    const x = clientX - rect.left - size / 2;
    const y = clientY - rect.top - size / 2;

    const ripple = document.createElement('span');
    ripple.className = 'tap-ripple';
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    ripple.style.position = 'absolute';

    el.appendChild(ripple);

    const cleanup = () => ripple.remove();
    ripple.addEventListener('animationend', cleanup, { once: true });
    window.setTimeout(cleanup, 900);
  };

  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return; // left click / primary touch
    const el = e.target && e.target.closest ? e.target.closest('.category-tile, .product-card, .catalog-card, .note-card') : null;
    if (!el) return;
    activeEl = el;
    el.classList.add('is-pressed');
    spawnRipple(el, e.clientX, e.clientY);
  }, { passive: true });

  document.addEventListener('pointerup', clearPressed, { passive: true });
  document.addEventListener('pointercancel', clearPressed, { passive: true });
  window.addEventListener('blur', clearPressed);
}

window.addEventListener('resize', () => {
  const track = document.getElementById('categoryMobileTrack');
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  if (!track) return;
  if (!isMobile) {
    track.innerHTML = '';
  }
  if (isMobile && track.children.length === 0) {
    initCategoryMobileSlider();
  }
});

function initMobileNavDrawer() {
  const navbarContainer = document.querySelector('.navbar .container');
  const navLinks = document.querySelector('.navbar .nav-links');
  if (!navbarContainer || !navLinks) return;

  let menuBtn = navbarContainer.querySelector('.mobile-menu-btn');
  if (!menuBtn) {
    menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'mobile-menu-btn';
    menuBtn.setAttribute('aria-label', 'Open navigation menu');
    menuBtn.innerHTML = '<span></span>';
    const navIcons = navbarContainer.querySelector('.nav-icons');
    if (navIcons) {
      navbarContainer.insertBefore(menuBtn, navIcons);
    } else {
      navbarContainer.appendChild(menuBtn);
    }
  }

  let backdrop = document.querySelector('.mobile-nav-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'mobile-nav-backdrop';
    document.body.appendChild(backdrop);
  }

  const closeDrawer = () => {
    navLinks.classList.remove('mobile-open');
    backdrop.classList.remove('show');
    document.body.style.overflow = '';
  };

  menuBtn.onclick = () => {
    const isOpen = navLinks.classList.contains('mobile-open');
    if (isOpen) {
      closeDrawer();
      return;
    }
    navLinks.classList.add('mobile-open');
    backdrop.classList.add('show');
    document.body.style.overflow = 'hidden';
  };

  backdrop.onclick = closeDrawer;
  navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', closeDrawer));
  window.addEventListener('resize', () => {
    if (!window.matchMedia('(max-width: 768px)').matches) closeDrawer();
  });

  // Guard: some admin pages keep nav hidden inline until auth check.
  // On mobile, ensure drawer stays operable once links are available.
  if (window.matchMedia('(max-width: 768px)').matches && navLinks.children.length > 0 && navLinks.style.display === 'none') {
    navLinks.style.display = 'flex';
  }
}

async function renderReviews(productId) {
  const container = document.getElementById('existingReviews');
  if (!container) return;
  let revs = [];
  const supabase = getSupabase();
  if (supabase) {
    const { data } = await supabase.from('reviews').select('*').eq('product_id', productId).order('created_at', { ascending: false });
    if (data) revs = data;
  }
  if (!revs || revs.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);">No reviews yet. Be the first to review!</p>';
    return;
  }
  container.innerHTML = revs.map(r => `
    <div style="background:var(--bg-color); padding:16px; border-radius:8px; margin-bottom:12px;">
      <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
        <strong style="color:var(--primary);">${r.user_name}</strong>
        <span style="color:#ffc107;">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
      </div>
      <p style="margin:0; font-size:0.95rem; color:#444;">${r.review_text}</p>
    </div>
  `).join('');
}


// --- Main Bootstrap ---
document.addEventListener('DOMContentLoaded', async () => {
  // Kick off products fetch as early as possible.
  let fetchPromise = Promise.resolve();
  const needsBooksForCategoryList =
    document.getElementById('adminForm') &&
    document.getElementById('category') &&
    document.getElementById('categoryOptions');
  if (
    document.getElementById('featuredProducts') ||
    document.getElementById('allProductsContainer') ||
    document.getElementById('productDetailContainer') ||
    document.getElementById('adminProductsList') ||
    document.getElementById('spiralCopiesGrid') ||
    needsBooksForCategoryList
  ) {
    fetchPromise = fetchProducts().catch(e => console.error("fetchProducts error", e));
    fetchPromise.then(() => {
      if (document.getElementById('spiralCopiesGrid') && typeof renderSpiralCopies === 'function') {
        renderSpiralCopies();
      }
      if (document.getElementById('allProductsContainer') || document.getElementById('adminProductsList')) {
        startBackgroundAutoFetch();
      }
      if (needsBooksForCategoryList && typeof renderAdminCategories === 'function') {
        renderAdminCategories();
      }
    });
  }

  // --- Global Loader Injection Removed (Using Skeletons Instead) ---

  // --- Click toggle for nav dropdowns ---
  document.querySelectorAll('.nav-dropdown-trigger').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const dropdown = e.target.closest('.nav-dropdown');
      const wasOpen = dropdown.classList.contains('is-open') || dropdown.classList.contains('mobile-open');
      
      document.querySelectorAll('.nav-dropdown').forEach(d => {
        d.classList.remove('is-open');
        d.classList.remove('mobile-open');
      });

      if (!wasOpen) {
        dropdown.classList.add('is-open');
        dropdown.classList.add('mobile-open');
      }
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-dropdown')) {
      document.querySelectorAll('.nav-dropdown').forEach(d => {
        d.classList.remove('is-open');
        d.classList.remove('mobile-open');
      });
    }
  });

  // --- Automatic Background Fetch for Products Page replaces infinite scroll ---
  // Started via startBackgroundAutoFetch() after fetchProducts().

  // --- Log Visit ---
  const todayDate = new Date().toISOString().split('T')[0];
  if (localStorage.getItem('shubham_last_visit') !== todayDate) {
    const supabase = getSupabase();
    if (supabase) {
      supabase.from('site_visits').insert({}).then(({ error }) => {
        if (!error) {
          localStorage.setItem('shubham_last_visit', todayDate);
        }
      });
    }
  }

  // Inject Theme Toggle Switch into Navbar
  const navIcons = document.querySelector('.nav-icons');
  if (navIcons) {
    const themeSwitchWrapper = document.createElement('div');
    themeSwitchWrapper.className = 'theme-switch-wrapper';

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    themeSwitchWrapper.innerHTML = `
      <span class="theme-switch-label" id="themeLabel">${isDark ? 'DARK' : 'LIGHT'}</span>
      <label class="theme-switch">
        <input type="checkbox" id="themeToggleCheckbox" ${isDark ? 'checked' : ''}>
        <span class="theme-slider"></span>
      </label>
    `;
    navIcons.appendChild(themeSwitchWrapper);

    const checkbox = themeSwitchWrapper.querySelector('#themeToggleCheckbox');
    const label = themeSwitchWrapper.querySelector('#themeLabel');

    checkbox.addEventListener('change', (e) => {
      const root = document.documentElement;
      let textColor = '#333';
      let gridColor = '#ddd';

      if (e.target.checked) {
        root.setAttribute('data-theme', 'dark');
        localStorage.setItem('shubham_theme', 'dark');
        label.innerText = 'DARK';
        textColor = '#e0e0e0';
        gridColor = '#333';
      } else {
        root.removeAttribute('data-theme');
        localStorage.setItem('shubham_theme', 'light');
        label.innerText = 'LIGHT';
      }

      // Update Chart Colors if present
      if (window.adminChartObj) {
        window.adminChartObj.options.plugins.legend.labels.color = textColor;
        window.adminChartObj.options.scales.x.ticks.color = textColor;
        window.adminChartObj.options.scales.x.grid.color = gridColor;
        window.adminChartObj.options.scales.y.ticks.color = textColor;
        window.adminChartObj.options.scales.y.grid.color = gridColor;
        window.adminChartObj.update();
      }
    });
  }

  updateCartBadge();
  updateNavForUser();
  initMobileNavDrawer();
  initSlider();
  initCategoryMobileSlider();
  initPremiumCategoryTileInteractions();

  // Handle mobile nav dropdown toggle (now handled by unified listener above)

  // Attach priority listeners BEFORE blocking network fetches
  if (document.getElementById('loginForm')) document.getElementById('loginForm').addEventListener('submit', handleLogin);
  if (document.getElementById('registerForm')) document.getElementById('registerForm').addEventListener('submit', handleRegister);
  if (document.getElementById('forgotPasswordForm')) document.getElementById('forgotPasswordForm').addEventListener('submit', handleForgotPassword);

  const forgotToggleBtn = document.getElementById('forgotToggleBtn');
  const forgotPasswordForm = document.getElementById('forgotPasswordForm');
  if (forgotToggleBtn && forgotPasswordForm) {
    forgotToggleBtn.addEventListener('click', () => {
      const isHidden = forgotPasswordForm.style.display === 'none';
      forgotPasswordForm.style.display = isHidden ? 'block' : 'none';
    });
  }

  if (document.getElementById('checkoutForm')) {
    renderCheckoutSummary();
    if (currentUser) {
      document.getElementById('fullName').value = currentUser.name || "";
      const phoneEl = document.getElementById('phoneNumber');
      if (phoneEl && currentUser.phone) phoneEl.value = currentUser.phone;
      const d = getSavedDeliveryDetails();
      const ad = document.getElementById('address');
      const ct = document.getElementById('city');
      const pc = document.getElementById('pincode');
      if (ad && d.street) ad.value = d.street;
      if (ct && d.city) ct.value = d.city;
      if (pc && d.pincode) pc.value = d.pincode;
    }
    document.getElementById('checkoutForm').addEventListener('submit', handleCheckout);
  } else {
    sessionStorage.removeItem('shubham_buy_now_item');
  }

  window.requestRegisterOTP = requestRegisterOTP;
  window.requestForgotPasswordOTP = requestForgotPasswordOTP;

  if (document.getElementById('featuredProducts')) {
    renderFeaturedMultiSelect();
    renderFeaturedProducts();
    initHeroQuickSearch();

    const featuredSearchInput = document.getElementById('featuredSearchInput');
    if (featuredSearchInput) {
      let featuredSearchTimeout;
      featuredSearchInput.addEventListener('input', () => {
        if (featuredSearchTimeout) clearTimeout(featuredSearchTimeout);
        featuredSearchTimeout = setTimeout(async () => {
          if (typeof performDatabaseSearch === 'function') {
            await performDatabaseSearch(featuredSearchInput.value, typeof featuredSelectedCategories !== 'undefined' ? featuredSelectedCategories : [], true, true);
          }
          renderFeaturedProducts();
        }, 400);
      });
    }

    document.addEventListener('click', (e) => {
      const container = document.getElementById('featuredCategoryMultiSelect');
      if (container && !container.contains(e.target)) {
        const dropdown = document.getElementById('featuredMultiSelectDropdown');
        if (dropdown) dropdown.classList.remove('active');
      }
    });
  }

  if (document.getElementById('allProductsContainer') || document.getElementById('adminProductsList')) {
    resetProductsInfiniteScroll();
    selectedCategories = parseProductsCategoryParams();

    try {
      renderMultiSelect();
    } catch (e) {
      console.error("renderMultiSelect error:", e);
    }
    renderProductsGrid('allProductsContainer', null, selectedCategories);

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      const qFromUrl = (new URLSearchParams(window.location.search).get('q') || '').trim();
      if (qFromUrl) {
        searchInput.value = qFromUrl;
        if (typeof performDatabaseSearch === 'function') {
          await performDatabaseSearch(qFromUrl, typeof selectedCategories !== 'undefined' ? selectedCategories : [], false, true);
        }
        resetProductsInfiniteScroll();
        renderProductsGrid('allProductsContainer', null, selectedCategories);
        if (typeof renderFilteredFreeNotes === 'function') renderFilteredFreeNotes();
      }
      let localSearchTimeout;
      searchInput.addEventListener('input', () => {
        if (localSearchTimeout) clearTimeout(localSearchTimeout);
        localSearchTimeout = setTimeout(async () => {
          if (typeof performDatabaseSearch === 'function') {
            await performDatabaseSearch(searchInput.value, typeof selectedCategories !== 'undefined' ? selectedCategories : [], false, true);
          }
          resetProductsInfiniteScroll();
          renderProductsGrid('allProductsContainer', null, selectedCategories);
          if (typeof renderFilteredFreeNotes === 'function') renderFilteredFreeNotes();
        }, 400);
      });
    }

    // Close multi-select when clicking outside
    document.addEventListener('click', (e) => {
      const container = document.getElementById('categoryMultiSelect');
      if (container && !container.contains(e.target)) {
        const dropdown = document.getElementById('multiSelectDropdown');
        if (dropdown) dropdown.classList.remove('active');
      }
    });
  }

  if (document.getElementById('cartItems')) renderCart();

  const path = window.location.pathname;

  if (path.includes('admin.html') || path.endsWith('/admin')) {
    checkAdminAccess();
    await renderAdminDashboard();
    await renderAdminUsers();
  }

  // Add Books page only (not admin-add-stationery / admin-add-combo — those also match path "admin-add")
  if (document.getElementById('adminForm') && document.getElementById('category') && document.getElementById('categoryOptions')) {
    checkAdminAccess();
    applyAdminCategoryPrefill();
    document.getElementById('adminForm').addEventListener('submit', handleAddProduct);
    if (document.getElementById('addCategoryForm')) {
      document.getElementById('addCategoryForm').addEventListener('submit', handleAddCategory);
      const cancelEditBtn = document.getElementById('cancelCategoryEditBtn');
      if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', () => {
          document.getElementById('addCategoryForm').reset();
          resetCategoryFormMode();
        });
      }
    }
    await fetchPromise;
    renderAdminCategories();
  }

  if (path.includes('admin-categories')) {
    checkAdminAccess();
    resetAdminCategoriesPagination();
    await fetchPromise;
    ensureAllProductsLoadedForAdmin().catch((e) => console.error("Admin full-load warmup failed:", e));
    const form = document.getElementById('addCategoryForm');
    if (form) {
      form.addEventListener('submit', handleAddCategory);
      const cancelEditBtn = document.getElementById('cancelCategoryEditBtn');
      if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', () => {
          document.getElementById('addCategoryForm').reset();
          resetCategoryFormMode();
        });
      }
    }
    renderAdminCategories();
    const list = document.getElementById('adminCategoriesList');
    if (list) {
      list.addEventListener('scroll', () => {
        const nearBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 120;
        if (!nearBottom) return;
        const total = window.adminCategoriesTotalCount || (Array.isArray(siteCategories) ? siteCategories.length : 0);
        const current = window.adminCategoriesCurrentCount || 20;
        if (current < total) {
          setAdminCategoriesLoadMoreIndicator('loading');
          window.adminCategoriesCurrentCount = current + 20;
          renderAdminCategories();
        } else {
          setAdminCategoriesLoadMoreIndicator('end');
        }
      }, { passive: true });
    }
  }

  if (path.includes('admin-add-stationery') || path.includes('admin-add-spiral')) {
    checkAdminAccess();
    const form = document.getElementById('adminStationeryForm');
    if (form) form.addEventListener('submit', handleAddStationeryItem);
  }

  if (path.includes('admin-add-combo')) {
    checkAdminAccess();
    await fetchPromise;
    renderComboBooksOptions();
    addComboManualItemRow();
    const addManualBtn = document.getElementById('addComboManualItemBtn');
    if (addManualBtn) addManualBtn.addEventListener('click', () => addComboManualItemRow());
    const form = document.getElementById('adminComboForm');
    if (form) form.addEventListener('submit', handleAddComboDeal);
  }

  if (path.includes('admin-products')) {
    checkAdminAccess();

    const editForm = document.getElementById('editProductForm');
    if (editForm) {
      editForm.addEventListener('submit', handleEditProduct);
    }

    const adminSearchInput = document.getElementById('adminSearchInput');
    if (adminSearchInput) {
      let adminSearchTimeout;
      adminSearchInput.addEventListener('input', () => {
        if (adminSearchTimeout) clearTimeout(adminSearchTimeout);
        adminSearchTimeout = setTimeout(async () => {
          if (typeof performDatabaseSearch === 'function') {
            await performDatabaseSearch(adminSearchInput.value, [], false, true);
          }
          window.adminProductsCurrentPage = 1;
          renderAdminList();
        }, 400);
      });
    }

    renderAdminCategories();
    window.adminProductsCurrentPage = 1;
    adminProductsDbLoaded = false;
    await renderAdminList();
  }

  if (path.includes('admin-ebooks')) {
    checkAdminAccess();
    // Free notes admin UI binds itself by element presence; ensure list loads
    setTimeout(() => {
      if (document.getElementById('adminFreeNotesList') && currentUser && currentUser.phone === ADMIN_PHONE) {
        loadAdminFreeNotes();
      }
    }, 900);
  }

  if (path.includes('admin-orders')) {
    checkAdminAccess();
    await renderAdminOrders();
  }

  if (path.includes('admin-photocopy')) {
    checkAdminAccess();
  }

  if (path.includes('admin') || path.includes('admin-photocopy')) {
    const pricingForm = document.getElementById('pricingForm');
    if (pricingForm) {
      await syncCeRatesFromServer();
      const currentRates = getCeRates();
      document.getElementById('bwRateInput').value = currentRates.bw;
      document.getElementById('colorRateInput').value = currentRates.color;
      pricingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const bw = Number(parseFloat(document.getElementById('bwRateInput').value).toFixed(2));
        const color = Number(parseFloat(document.getElementById('colorRateInput').value).toFixed(2));

        const ratesObj = { bw, color };
        localStorage.setItem('shubham_ce_rates', JSON.stringify(ratesObj));
        if (window.globalRates) window.globalRates = ratesObj;
        try {
          await apiFetch("/admin/settings/rates", { method: "PUT", body: ratesObj });
        } catch (err) {
          console.error("Failed to sync rates to backend", err);
          showToast("Saved locally. Cloud sync failed.");
          return;
        }

        showToast('Pricing settings saved globally!');
      });
    }
  }

  if (path.includes('admin-returns')) {
    checkAdminAccess();
    await renderAdminReturns();
  }

  if (path.includes('my-orders')) {
    if (!currentUser) {
      window.location.href = "login.html";
      return;
    }
    await renderMyOrders();
  }

  const detailContainer = document.getElementById('productDetailContainer');
  if (detailContainer) {
    const urlParams = new URLSearchParams(window.location.search);
    const productIdRaw = urlParams.get('id') || '';
    const productId = /^\d+$/.test(productIdRaw) ? Number(productIdRaw) : productIdRaw;
    let product = products.find(p => String(p.id) === String(productIdRaw));

    if (!product && typeof fetchPromise !== 'undefined') {
      detailContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);">Loading product...</div>';
      await fetchPromise;
      product = products.find(p => String(p.id) === String(productIdRaw));
    }

    // Always fetch the FULL product details directly from Supabase so we get ALL images 
    // instead of just the main thumbnail from the list API
    try {
      const supabase = getSupabase();
      if (supabase && productIdRaw) {
        if (!product) detailContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);">Loading product details...</div>';
        const { data, error } = await supabase.from('products').select('*').eq('id', productId).single();
        if (data && !error) {
          if (!product) {
            product = data;
          } else {
            product.img = data.img; // Get all images
            product.desc = data.desc; // Get full description
            product.free_note_id = data.free_note_id;
            product.original_price = data.original_price;
            product.exam = data.exam;
          }
        }
      }
    } catch (e) {
      console.error("Failed to load full product images", e);
    }

    if (product) {
      window.buyNow = function (pid) {
        const productToBuy = products.find(p => String(p.id) === String(pid));
        if (productToBuy) {
          sessionStorage.setItem('shubham_buy_now_item', JSON.stringify({ ...productToBuy, quantity: 1 }));
          window.location.href = "checkout.html";
        } else {
          showToast("Product not found");
        }
      };
      const pDesc = product.desc || `Premium quality ${product.category.toLowerCase()} available for you at Shubham Xerox. Perfect for your exam preparation with clear printing and accurate content.`;

      let attachedPdfHtml = '';
      if (product.free_note_id) {
        try {
          const supabase = getSupabase();
          if (supabase) {
            const { data: noteData } = await supabase.from('free_notes').select('*').eq('id', product.free_note_id).single();
            if (noteData) {
              const pdfTitle = noteData.title || product.name;
              const isPaid = noteData.is_paid || (noteData.price && noteData.price > 0);
              const pdfPriceStr = isPaid ? `(₹${noteData.price})` : 'Free';

              attachedPdfHtml = `
                  <div style="margin-bottom: 40px; background: rgba(128, 42, 126, 0.05); border: 1px solid rgba(128, 42, 126, 0.2); padding: 20px; border-radius: 12px;">
                    <h3 style="font-size: 1.3rem; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                      Attached PDF Note
                    </h3>
                    <p style="margin-bottom: 16px; font-weight: 500; color: var(--text-main);">${pdfTitle} <span style="display:inline-block; margin-left:8px; font-size:0.8rem; padding:2px 8px; border-radius:12px; background:${isPaid ? 'var(--primary)' : '#10b981'}; color:${isPaid ? '#000' : '#fff'};">${pdfPriceStr}</span></p>
                    <div style="display: flex; gap: 12px;">
                      <button onclick="openPdfViewer('${noteData.file_url}', ${isPaid ? noteData.price : 0}, '${noteData.id}', '${pdfTitle.replace(/'/g, "\\'")}')" class="btn btn-outline-purple" style="text-decoration: none; display: flex; align-items: center;">
                        ${isPaid ? 'Preview & Buy Secure PDF' : 'Open Secure Viewer'}
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left: 6px;"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M9 9h6v6H9z"></path></svg>
                      </button>
                    </div>
                  </div>
                `;
            }
          }
        } catch (e) {
          console.error("Failed to fetch attached PDF:", e);
        }
      }

      const imgs = product.img ? product.img.split('|') : ["https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=400&q=80"];
      let imgGalleryHtml = '';
      if (imgs.length > 1) {
        imgGalleryHtml = `
          <div class="product-slider-container" style="position:relative; width:100%;">
            <div class="product-slider-main">
              <img id="mainProductImg" src="${imgs[0]}" alt="${product.name}" style="width: 100%; border-radius: var(--radius-md); object-fit: cover;">
            </div>
            <div class="product-slider-thumbs" style="display:flex; gap:10px; margin-top:15px; overflow-x:auto;">
              ${imgs.map((src, i) => `
                <img src="${src.trim()}" onclick="document.getElementById('mainProductImg').src='${src.trim()}'; document.querySelectorAll('.product-slider-thumbs img').forEach(el=>el.style.borderColor='transparent'); this.style.borderColor='var(--primary)';" style="width:80px; height:80px; object-fit:cover; border-radius:8px; cursor:pointer; border: 2px solid ${i === 0 ? 'var(--primary)' : 'transparent'};">
              `).join('')}
            </div>
          </div>
        `;
      } else {
        imgGalleryHtml = `<img src="${imgs[0]}" alt="${product.name}" style="width: 100%; border-radius: var(--radius-md); object-fit: cover;">`;
      }

      // The inner HTML is identical to what the user had, minus the dynamic DB load loop which we do via JS functions.
      detailContainer.innerHTML = `
        <div class="product-detail-layout">
          <div class="product-detail-img-card">
            ${imgGalleryHtml}
          </div>
          <div>
            <div class="category-tag" style="margin-bottom: 16px; font-size: 0.95rem; color: #802a7e;">${product.category}</div>
            <h1 style="font-size: 2.2rem; margin-bottom: 12px; font-weight: 800; letter-spacing: -0.02em; color: var(--text-main);">${product.name}</h1>
            <div style="margin-bottom: 24px;">
               ${(() => {
          if (product.original_price && product.original_price > product.price) {
            const disc = Math.round(((product.original_price - product.price) / product.original_price) * 100);
            return `<span style="font-size: 2.2rem; font-weight: 700; color: var(--text-main);">${formatPrice(product.price)}</span>
                           <span style="font-size: 1.4rem; color: var(--text-muted); text-decoration: line-through; margin-left: 12px; font-weight: 500;">${formatPrice(product.original_price)}</span>
                           <span style="font-size: 1.2rem; color: #00a676; margin-left: 12px; font-weight: 700;">${disc}% Off</span>`;
          }
          return `<span style="font-size: 2.2rem; font-weight: 700; color: var(--text-main);">${formatPrice(product.price)}</span>`;
        })()}
            </div>
            
            <div style="background: rgba(128, 42, 126, 0.1); border-left: 4px solid #802a7e; padding: 16px; margin-bottom: 32px; border-radius: 8px;">
              <p style="font-weight: 600; font-size: 1.05rem; display: flex; align-items: center; gap: 8px; margin-bottom: 6px; color: var(--text-main);">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#802a7e" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                Delivered in 3-5 Days
              </p>
              <p style="color: var(--text-muted); font-size: 0.95rem;">Flat delivery charge ₹70 on all orders.</p>
            </div>

            <div style="margin-bottom: 40px;">
              <h3 style="font-size: 1.5rem; margin-bottom: 16px;">Book Description</h3>
              <p style="color: var(--text-muted); font-size: 1.1rem; line-height: 1.8;">${pDesc}</p>
            </div>
            
            ${attachedPdfHtml}
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 40px;">
              <button class="btn btn-outline-purple" style="width: 100%; padding: 16px; font-size: 1.1rem;" onclick="addToCart(${jsArg(product.id)})">
                Add To Cart
              </button>
              <button class="btn btn-purple" style="width: 100%; padding: 16px; font-size: 1.1rem;" onclick="buyNow(${jsArg(product.id)})">
                Buy Now
              </button>
            </div>

            <div class="features-row">
              <div class="feature-item">
                <div class="feature-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg></div>
                <span>Secure Payments</span>
              </div>
              <div class="feature-item">
                <div class="feature-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg></div>
                <span>Assured Quality</span>
              </div>
              <div class="feature-item">
                <div class="feature-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg></div>
                <span>Made In India</span>
              </div>
              <div class="feature-item">
                <div class="feature-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg></div>
                <span>Timely Delivery</span>
              </div>
            </div>

            <!-- Reviews Section -->
            <div id="reviewsSection" style="margin-top: 60px; border-top: 1px solid var(--border-color); padding-top: 40px;">
              <h3 style="font-size: 1.5rem; margin-bottom: 24px; color: var(--text-main);">Customer Reviews</h3>
              <div id="existingReviews" style="margin-bottom: 40px;"></div>
              <h4 style="font-size: 1.2rem; margin-bottom: 16px;">Write a Review</h4>
              <form id="reviewForm" style="display: flex; flex-direction: column; gap: 16px;">
                <div>
                  <label for="rating" style="font-weight: 600; margin-bottom: 8px; display: block; color: var(--text-main);">Tap to Rate:</label>
                  <div id="starRatingContainer" style="display: flex; gap: 4px; font-size: 2rem; cursor: pointer; color: #ccc;">
                    <span class="star" data-value="1">★</span>
                    <span class="star" data-value="2">★</span>
                    <span class="star" data-value="3">★</span>
                    <span class="star" data-value="4">★</span>
                    <span class="star" data-value="5">★</span>
                  </div>
                  <input type="hidden" id="rating" value="5">
                </div>
                <div>
                  <label for="reviewText" style="font-weight: 600; margin-bottom: 8px; display: block; color: var(--text-main);">Your Review:</label>
                  <textarea id="reviewText" placeholder="Share your experience with this book..." required style="padding: 12px; border: 1px solid var(--border-color); background: var(--bg-color); color: var(--text-main); border-radius: 4px; width: 100%; min-height: 100px; resize: vertical;"></textarea>
                </div>
                <button type="submit" class="btn btn-purple" style="align-self: flex-start;">Submit Review</button>
              </form>
            </div>
          </div>
        </div>
      `;

      renderSimilarProducts(product);

      // Initialize reviews right away on page load
      await renderReviews(productId);

      const stars = document.querySelectorAll('#starRatingContainer .star');
      const ratingInput = document.getElementById('rating');
      stars.forEach(star => {
        star.addEventListener('click', () => {
          let val = parseInt(star.getAttribute('data-value'));
          ratingInput.value = val;
          stars.forEach(s => {
            if (parseInt(s.getAttribute('data-value')) <= val) {
              s.style.color = '#ffc107';
            } else {
              s.style.color = '#ccc';
            }
          });
        });
      });
      // Initial 5 star select
      if (stars.length > 4) stars[4].click();

      document.getElementById('reviewForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser) { showToast("Login required to review"); setTimeout(() => window.location.href = "login.html", 1500); return; }
        const rVal = document.getElementById('rating').value;
        const tVal = document.getElementById('reviewText').value;
        const supabase = getSupabase();
        if (supabase) {
          const { error } = await supabase.from('reviews').insert({
            product_id: productId,
            user_name: currentUser.name || "Anonymous",
            rating: parseInt(rVal),
            review_text: tVal
          });
          if (error) {
            console.error("Supabase Error on Review Submit:", error);
            showToast("Failed to submit: " + (error.message || "Network Error"));
            return;
          }
        } else {
          const newReview = {
            user: currentUser.name || "Anonymous",
            rating: parseInt(rVal),
            text: tVal,
            date: new Date().toLocaleDateString()
          };
          if (!reviews[productId]) reviews[productId] = [];
          reviews[productId].push(newReview);
          localStorage.setItem('shubham_reviews', JSON.stringify(reviews));
        }
        document.getElementById('reviewForm').reset();
        await renderReviews(productId);
        showToast("Review submitted successfully!");
      });
    } else {
      detailContainer.innerHTML = '<div style="text-align: center; font-size: 1.2rem;">Product not found. <a href="products.html">Browse all products</a></div>';
    }
  }

  // --- Loader Teardown Removed ---

});

function renderSimilarProducts(product) {
  const section = document.getElementById('similarProductsSection');
  const container = document.getElementById('similarProductsContainer');
  if (!section || !container || !product) return;

  const similarProducts = products
    .filter(p => p.id !== product.id && p.category === product.category)
    .slice(0, 10);

  if (!similarProducts.length) {
    section.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  container.innerHTML = similarProducts.map(createProductCard).join('');
  section.style.display = 'block';
}

// --- Reviews Functions ---
async function renderReviews(productId) {
  const existingReviewsDiv = document.getElementById('existingReviews');
  if (!existingReviewsDiv) return;

  let productReviews = [];
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase.from('reviews').select('*').eq('product_id', productId);
    if (!error) productReviews = data || [];
  } else {
    productReviews = reviews[productId] || [];
  }

  existingReviewsDiv.innerHTML = productReviews.map(review => `
    <div style="border-bottom: 1px solid #eee; padding: 20px 0; margin-bottom: 20px;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <span style="font-weight: 600;">${review.user_name || review.user}</span>
        <span style="color: #ffa500;">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</span>
      </div>
      <p style="color: #555; line-height: 1.6;">${review.review_text || review.text}</p>
      <small style="color: #888;">${review.created_at ? new Date(review.created_at).toLocaleDateString() : review.date}</small>
    </div>
  `).join('') || '<p style="color: #888;">No reviews yet. Be the first to review!</p>';
}

// ==========================================
// --- Real-time Chat System ---
// ==========================================

function checkChatLogin() {
  if (!currentUser) {
    showToast("Login required to start chat");
    setTimeout(() => { window.location.href = "login.html"; }, 1500);
  } else {
    window.location.href = "chat.html";
  }
}

window.handleChatFloatClick = function (e) {
  try {
    const btn = e && e.currentTarget ? e.currentTarget : null;
    const isTouch = (typeof window !== 'undefined') && (('ontouchstart' in window) || (navigator && navigator.maxTouchPoints > 0));
    if (!btn) {
      checkChatLogin();
      return false;
    }

    if (!isTouch) {
      checkChatLogin();
      return false;
    }

    const armed = btn.classList.contains('show-label');
    if (!armed) {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      btn.classList.add('show-label');
      window.clearTimeout(btn._tooltipTimer);
      btn._tooltipTimer = window.setTimeout(() => {
        btn.classList.remove('show-label');
      }, 1800);
      return false;
    }

    btn.classList.remove('show-label');
    checkChatLogin();
    return false;
  } catch (err) {
    checkChatLogin();
    return false;
  }
};

// User Chat Init
let chatSubscription = null;
let currentChatUserId = null;

async function initUserChat() {
  if (!currentUser) return;
  currentChatUserId = currentUser.phone;
  await loadMessages(currentChatUserId, 'chatMessagesArea');
  subscribeToMessages(currentChatUserId, 'chatMessagesArea');
}

// Admin Chat Center Init
async function initAdminChatCenter() {
  await fetchAdminChatUsers();
  // Listen for new messages globally to update sidebar
  const supabase = getSupabase();
  if (supabase) {
    supabase.channel('admin_global_msgs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        // Refresh user list to bubble up active chats
        fetchAdminChatUsers();
        // If we are currently viewing this user's chat, append message
        if (currentChatUserId && (payload.new.sender === currentChatUserId || payload.new.receiver === currentChatUserId)) {
          appendMessageToUI(payload.new, 'adminMessagesContainer', true);
        }
      })
      .subscribe();
  }
}

async function fetchAdminChatUsers() {
  const container = document.getElementById('adminChatUsersList');
  if (!container) return;

  const supabase = getSupabase();
  if (!supabase) return;

  // Fetch messages to get unique users who have chatted
  const { data: messages } = await supabase.from('messages').select('sender, receiver, created_at').order('created_at', { ascending: false });
  if (!messages) {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No messages yet.</div>';
    return;
  }

  const userPhones = new Set();
  messages.forEach(m => {
    if (m.sender !== ADMIN_PHONE) userPhones.add(m.sender);
    if (m.receiver !== ADMIN_PHONE) userPhones.add(m.receiver);
  });

  if (userPhones.size === 0) {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No active chats.</div>';
    return;
  }

  // Fetch user details
  const { data: users } = await supabase.from('users').select('name, phone').in('phone', Array.from(userPhones));
  const { data: orders } = await supabase.from('orders').select('customerphone');

  const usersMap = {};
  users?.forEach(u => usersMap[u.phone] = u.name);

  const orderCount = {};
  orders?.forEach(o => {
    if (!orderCount[o.customerphone]) orderCount[o.customerphone] = 0;
    orderCount[o.customerphone]++;
  });

  // Array from Set is not naturally ordered by recent message without extra logic, 
  // but keeping it simple for now or sorting by messages.
  const phoneArray = Array.from(userPhones);

  container.innerHTML = phoneArray.map(phone => {
    const name = usersMap[phone] || 'Unknown User';
    const ordersItem = orderCount[phone] || 0;
    const isActive = phone === currentChatUserId ? 'active' : '';
    return `
      <div class="admin-user-item ${isActive}" onclick="openAdminChatForUser('${phone}')">
        <div class="admin-user-item-avatar">${name.charAt(0).toUpperCase()}</div>
        <div style="flex:1;">
          <div style="font-weight:600; color:var(--text-main);">${name}</div>
          <div style="font-size:0.8rem; color:var(--text-muted);">${phone}</div>
        </div>
        <div style="font-size:0.75rem; background:var(--primary); color:#fff; padding:2px 6px; border-radius:12px;">${ordersItem} orders</div>
      </div>
    `;
  }).join('');
}

async function openAdminChatForUser(phone) {
  currentChatUserId = phone;
  // Update sidebar active state visually
  fetchAdminChatUsers();

  const mainArea = document.getElementById('adminChatMainArea');
  const user = await getUserNameByPhone(phone);

  // Render chat frame
  mainArea.innerHTML = `
    <header class="chat-header">
      <div class="chat-header-info">
        <div class="chat-avatar">
           <img src="images/logo.png" alt="Avatar" style="width:40px; height:40px; border-radius:50%; object-fit:cover; background:#fff; border: 1px solid var(--border-color);">
        </div>
        <div>
          <h2 style="font-size: 1.1rem; margin: 0; color: #fff;">${user} <span style="font-size:0.8rem; font-weight:400; opacity:0.8;">(${phone})</span></h2>
        </div>
      </div>
      <button onclick="deleteEntireChat('${phone}')" style="color:#ff3b30; background:rgba(255,59,48,0.1); padding:6px 12px; border-radius:4px; font-size:0.8rem; font-weight:600;">Delete Chat</button>
    </header>
    <main class="chat-messages" id="adminMessagesContainer" style="flex:1; overflow-y:auto; padding:20px;"></main>
    <footer class="chat-input-container">
      <input type="file" id="adminChatFileInput" accept="application/pdf" style="display: none;">
      <button class="chat-attach-btn" onclick="document.getElementById('adminChatFileInput').click();" aria-label="Attach File">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
      </button>
      <div class="chat-input-wrapper">
        <div id="adminChatFilePreview" class="chat-file-preview" style="display:none;">
          <span id="adminChatFileName" style="font-size:0.8rem; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></span>
          <button onclick="clearAdminChatFilePreview()" style="color:#ff3b30; background:transparent; border:none; cursor:pointer; font-size:1.2rem;">&times;</button>
        </div>
        <input type="text" id="adminChatInputMessage" class="chat-input" placeholder="Type a reply..." autocomplete="off">
      </div>
      <button class="chat-send-btn" onclick="handleSendChatMessage('admin')" aria-label="Send Message">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
      </button>
    </footer>
  `;

  await loadMessages(phone, 'adminMessagesContainer', true);
}

async function getUserNameByPhone(phone) {
  const supabase = getSupabase();
  if (!supabase) return "User";
  const { data } = await supabase.from('users').select('name').eq('phone', phone).single();
  return data ? data.name : "User";
}

// Shared Message Loading & Rendering
async function loadMessages(chatPhoneId, containerId, isAdminPanel = false) {
  const supabase = getSupabase();
  if (!supabase) return;

  const { data: messages } = await supabase.from('messages')
    .select('*')
    .or(`and(sender.eq.${chatPhoneId},receiver.eq.${ADMIN_PHONE}),and(sender.eq.${ADMIN_PHONE},receiver.eq.${chatPhoneId})`)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });

  const container = document.getElementById(containerId);
  if (!container) return;

  if (messages && messages.length > 0) {
    container.innerHTML = '';
    messages.forEach(msg => appendMessageToUI(msg, containerId, isAdminPanel));
  } else {
    // Keep empty state if user, clear if admin
    if (!isAdminPanel && document.getElementById('chatEmptyState')) {
      document.getElementById('chatEmptyState').style.display = 'flex';
      container.innerHTML = '';
      container.appendChild(document.getElementById('chatEmptyState'));
    } else {
      container.innerHTML = '<div style="text-align:center; color:var(--text-muted); margin-top:20px;" class="chat-placeholder-empty">No messages. Send a message to start!</div>';
    }
  }
}

function subscribeToMessages(chatPhoneId, containerId) {
  const supabase = getSupabase();
  if (!supabase) return;

  if (chatSubscription) supabase.removeChannel(chatSubscription);

  chatSubscription = supabase.channel('user_chat_updates')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
      const msg = payload.new;
      if (!msg.is_deleted && ((msg.sender === chatPhoneId && msg.receiver === ADMIN_PHONE) || (msg.sender === ADMIN_PHONE && msg.receiver === chatPhoneId))) {
        appendMessageToUI(msg, containerId, false);
      }
    })
    .subscribe();
}

function appendMessageToUI(msg, containerId, isAdminPanel) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (msg.id && document.getElementById(`msg-${msg.id}`)) return;
  const emptyState = container.querySelector('.chat-empty-state');
  if (emptyState) emptyState.style.display = 'none';

  const placeholderInfo = container.querySelector('.chat-placeholder-empty');
  if (placeholderInfo) placeholderInfo.remove();

  const isMe = isAdminPanel ? (msg.sender === ADMIN_PHONE) : (msg.sender !== ADMIN_PHONE);
  const bubbleClass = isMe ? 'chat-bubble-me' : 'chat-bubble-other';

  // Safe date parsing 
  const d = new Date(msg.created_at);
  const timeInfo = isNaN(d) ? 'Now' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let contentHtml = '';
  if (msg.message) {
    contentHtml += `<div class="chat-text">${msg.message}</div>`;
  }
  if (msg.file_url) {
    const fileName = msg.file_url.split('/').pop().split('?')[0] || "document.pdf";
    contentHtml += `
      <div class="chat-file-attachment">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        <span class="file-name">${fileName}</span>
        <a href="${msg.file_url}" target="_blank" download class="file-download-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></a>
      </div>
    `;
  }

  const msgDiv = document.createElement('div');
  msgDiv.id = `msg-${msg.id || Date.now()}`;
  msgDiv.className = `chat-bubble-wrapper ${bubbleClass}`;
  msgDiv.innerHTML = `
    <div class="chat-bubble">
      ${contentHtml}
      <div class="chat-meta">
        ${timeInfo}
        ${isMe ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="read-receipt" style="color:var(--primary); margin-left:4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
      </div>
    </div>
  `;
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

// Sending Logic
async function handleSendChatMessage(mode) {
  const isUser = mode === 'user';
  const fileInputId = isUser ? 'chatFileInput' : 'adminChatFileInput';
  const textInputId = isUser ? 'chatInputMessage' : 'adminChatInputMessage';
  const previewClearFunc = isUser ? window.clearChatFilePreview : window.clearAdminChatFilePreview;

  const textInput = document.getElementById(textInputId);
  const fileInput = document.getElementById(fileInputId);

  if (!textInput) return; // defensive

  const msgText = textInput.value.trim();
  const file = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;

  if (!msgText && !file) return; // Nothing to send

  const senderId = isUser ? currentUser.phone : ADMIN_PHONE;
  const receiverId = isUser ? ADMIN_PHONE : currentChatUserId;

  // Disable parsing while sending
  textInput.disabled = true;
  if (fileInput) fileInput.disabled = true;

  let uploadedFileUrl = null;

  if (file) {
    uploadedFileUrl = await uploadPdfToSupabase(file);
    if (!uploadedFileUrl) {
      showToast("File upload failed.");
      textInput.disabled = false;
      if (fileInput) fileInput.disabled = false;
      return;
    }
  }

  const supabase = getSupabase();
  if (supabase) {
    const { error, data: insertedMsg } = await supabase.from('messages').insert({
      sender: senderId,
      receiver: receiverId,
      message: msgText || null,
      file_url: uploadedFileUrl
    }).select().single();
    if (error) {
      console.error("Failed to send message:", error);
      showToast("Failed to send message.");
    } else {
      // If it's admin, and the local real-time listener is slow, we can forcibly append it visually now or wait for the subscription. 
      // Admin already has real-time listner active that covers this, wait! For Admin, the listener triggers on 'admin_global_msgs', which adds it to 'adminMessagesContainer'. 
      // Same for user: user listener 'user_chat_updates' adds to 'chatMessagesArea'. 
      // Local state update makes it feel completely instant
      const containerId = isUser ? 'chatMessagesArea' : 'adminMessagesContainer';
      if (insertedMsg) {
        appendMessageToUI(insertedMsg, containerId, !isUser);
      }
    }
  }

  // Cleanup
  textInput.value = '';
  textInput.disabled = false;
  if (fileInput) {
    fileInput.value = '';
    fileInput.disabled = false;
  }
  if (previewClearFunc) previewClearFunc();
  textInput.focus();
}

async function uploadPdfToSupabase(file) {
  const supabase = getSupabase();
  if (!supabase) return null;

  const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
  const { data, error } = await supabase.storage.from('chat-files').upload(fileName, file, { cacheControl: '3600', upsert: false });

  if (!error) {
    fetch(window.API_BASE_URL + "/compress-pdf", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucket: "chat-files", file_name: fileName })
    }).catch(e => console.error(e));
  }

  if (error) {
    console.error("Storage upload error:", error);
    showToast("Storage Error: " + error.message);
    return null;
  }

  const { data: pubData } = supabase.storage.from('chat-files').getPublicUrl(fileName);
  return pubData.publicUrl;
}

// Delete Chat (Admin)
async function deleteEntireChat(phone) {
  if (!confirm("Are you sure you want to delete all messages for this user? This cannot be undone.")) return;
  const supabase = getSupabase();
  if (supabase) {
    // Soft delete
    await supabase.from('messages')
      .update({ is_deleted: true })
      .or(`and(sender.eq.${phone},receiver.eq.${ADMIN_PHONE}),and(sender.eq.${ADMIN_PHONE},receiver.eq.${phone})`);

    showToast("Chat deleted.");
    document.getElementById('adminChatMainArea').innerHTML = `
      <div class="admin-chat-placeholder">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        <h3 style="margin-top: 16px; font-size: 1.2rem;">Select a chat to view</h3>
      </div>
    `;
    fetchAdminChatUsers(); // refresh list
  }
}

// ==========================================
// --- Free Notes System ---
// ==========================================

let freeNotesData = [];
const pdfThumbDataUrlCache = new Map();
const pdfThumbLoading = new Set();

// Index Page loading
async function loadFreeNotes() {
  const container = document.getElementById('freeNotesContainer');
  if (!container) return; // not index page

  const supabase = getSupabase();
  if (!supabase) {
    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">Database connection failed.</div>';
    return;
  }

  const { data: notes, error } = await supabase.from('free_notes').select('*').order('created_at', { ascending: false });
  
  if (error) {
    console.error("Supabase free_notes error:", error);
    container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: red; padding: 20px; font-weight: bold;">Database Error: ${error.message} (Hint: Check if the table name and column names like 'created_at' match exactly)</div>`;
    return;
  }
  
  freeNotesData = notes || [];

  renderFilteredFreeNotes();
}

window.renderFilteredFreeNotes = function () {
  let filtered = freeNotesData;
  const urlParams = new URLSearchParams(window.location.search);
  const examFilter = urlParams.get('exam');
  const formatFilter = urlParams.get('format');
  const searchInput = document.getElementById('searchInput');

  const isProductsPage = window.location.pathname.includes('products.html');
  const hasSearchIntent = examFilter || formatFilter === 'pdf' || (searchInput && searchInput.value);

  if (isProductsPage && !hasSearchIntent) {
    const wrapper = document.getElementById('freeNotesSectionWrapper');
    if (wrapper) wrapper.style.display = 'none';
    return;
  }

  if (examFilter) {
    const originalExam = examFilter.toLowerCase();
    const qExams = originalExam.split(/[\s/]+/).filter(t => t);
    filtered = filtered.filter(p => {
      const titleL = (p.title || '').toLowerCase();
      return qExams.some(token => titleL.includes(token));
    });
  }

  if (searchInput && searchInput.value) {
    const spaceTokens = searchInput.value.toLowerCase().split(/\s+/).filter(t => t);
    filtered = filtered.filter(p => {
      const searchableStr = (p.title || '').toLowerCase();
      return spaceTokens.every(spaceToken => {
        const slashTokens = spaceToken.split('/').filter(t => t);
        return slashTokens.some(slashToken => searchableStr.includes(slashToken));
      });
    });
  }

  renderFreeNotesGrid(filtered);
};

function renderFreeNotesGrid(notesToDisplay) {
  const container = document.getElementById('freeNotesContainer');
  if (!container) return;

  const wrapper = document.getElementById('freeNotesSectionWrapper');
  if (wrapper) {
    wrapper.style.display = notesToDisplay.length > 0 ? 'block' : 'none';
  }

  if (notesToDisplay.length === 0) {
    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">No free notes available yet. Check back soon!</div>';
    return;
  }

  const colors = [
    'var(--primary)',
    '#0f5866',
    '#1b4b6b',
    '#5b0f5b',
    '#e67e22'
  ];

  container.innerHTML = notesToDisplay.map((note, index) => {
    const bg = colors[index % colors.length];
    return `
    <div class="note-card" style="border: none; background: transparent; box-shadow: none; padding: 10px; display: flex; flex-direction: column; align-items: center; position: relative;">
      
      <!-- Prominent Badge Overlay -->
      <div style="position: absolute; top: 5px; right: 5px; background: ${note.is_paid ? 'var(--primary)' : '#10b981'}; color: ${note.is_paid ? '#000' : '#fff'}; padding: 4px 12px; font-size: 0.8rem; font-weight: 800; border-radius: 20px; z-index: 10; box-shadow: 0 4px 8px rgba(0,0,0,0.3); border: 2px solid var(--card-bg);">
        ${note.is_paid ? `PAID (₹${note.price})` : 'FREE'}
      </div>

      <div class="note-icon" id="pdf-icon-${note.id}" style="width: 160px; height: 160px; margin: 0 auto 20px; background: ${bg}; border-radius: 50%; display: flex; flex-direction: column; justify-content: center; align-items: center; color: white; border: 4px solid var(--card-bg); box-shadow: var(--shadow-md); position: relative; overflow: hidden;">
        <div class="fallback-ui" style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; transition: opacity 0.3s; z-index: 1;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 8px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          <span style="font-size: 0.85rem; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">${note.is_paid ? 'PRO PDF' : 'FREE PDF'}</span>
        </div>
        <canvas id="pdf-canvas-${note.id}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 0.5s; z-index: 2; pointer-events: none;"></canvas>
      </div>
      <div class="note-details" style="text-align: center; width: 100%;">
        <h3 class="note-title" style="font-size: 1.1rem; line-height: 1.4; margin-bottom: 4px;">${note.title}</h3>
        <p class="note-meta" style="margin-bottom: 16px;">${new Date(note.created_at).toLocaleDateString()}</p>
      </div>
      ${note.is_paid && !hasUnlockedNote(note.id) ? `
      <button onclick="openPdfViewer('${note.file_url}', ${note.price}, '${note.id}', '${note.title.replace(/'/g, "\\'")}')" class="btn note-download-btn" aria-label="Preview & Buy ${note.title}" style="border-radius: var(--radius-full); width: auto; padding: 10px 20px; font-size: 0.95rem; background: var(--primary); color: #000;">
        Preview & Buy (₹${note.price}) <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left: 6px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
      </button>
      ` : `
      ${note.is_paid
        ? `<button onclick="openPdfViewer('${note.file_url}', ${note.price || 0}, '${note.id}', '${note.title.replace(/'/g, "\\'")}')" class="btn note-download-btn" aria-label="View ${note.title}" style="border-radius: var(--radius-full); width: auto; padding: 10px 20px; font-size: 0.95rem;">Open Secure Viewer <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left: 6px;"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M9 9h6v6H9z"></path></svg></button>`
        : `<a href="${note.file_url}" target="_blank" rel="noopener noreferrer" class="btn note-download-btn" aria-label="Open ${note.title}" style="border-radius: var(--radius-full); width: auto; padding: 10px 20px; font-size: 0.95rem;">Open PDF <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left: 6px;"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M9 9h6v6H9z"></path></svg></a>`
      }`}
    </div>
  `}).join('');

  setTimeout(() => schedulePdfThumbnailLoad(notesToDisplay), 100);
  setTimeout(updateFreeNotesNav, 120);
}

window.scrollFreeNotes = function (direction) {
  const slider = document.getElementById('freeNotesContainer');
  if (!slider) return;
  const card = slider.querySelector('.note-card');
  const jump = card ? (card.getBoundingClientRect().width + 24) : 300;
  slider.scrollBy({ left: direction === 'left' ? -jump : jump, behavior: 'smooth' });
  setTimeout(updateFreeNotesNav, 260);
};

function updateFreeNotesNav() {
  const slider = document.getElementById('freeNotesContainer');
  const prev = document.getElementById('freeNotesPrevBtn');
  const next = document.getElementById('freeNotesNextBtn');
  if (!slider || !prev || !next) return;
  const canScroll = slider.scrollWidth > slider.clientWidth + 2;
  prev.style.display = canScroll ? 'block' : 'none';
  next.style.display = canScroll ? 'block' : 'none';
  prev.style.opacity = slider.scrollLeft <= 4 ? '0.45' : '1';
  next.style.opacity = slider.scrollLeft + slider.clientWidth >= slider.scrollWidth - 4 ? '0.45' : '1';
}

function schedulePdfThumbnailLoad(notes) {
  if (!Array.isArray(notes) || notes.length === 0) return;
  if (!window.pdfjsLib) return;

  // Load thumbnails lazily for visible cards only.
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      observer.unobserve(el);
      const noteId = el.dataset.noteId;
      if (!noteId) return;
      const note = notes.find((n) => String(n.id) === String(noteId));
      if (!note) return;
      renderPdfThumbnailForNote(note);
    });
  }, { rootMargin: '120px' });

  notes.forEach((note) => {
    const canvas = document.getElementById(`pdf-canvas-${note.id}`);
    if (!canvas) return;
    canvas.dataset.noteId = String(note.id);
    observer.observe(canvas);
  });
}

async function renderPdfThumbnailForNote(note) {
  if (!window.pdfjsLib) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
  if (!note?.file_url) return;

  const canvas = document.getElementById(`pdf-canvas-${note.id}`);
  const iconContainer = document.getElementById(`pdf-icon-${note.id}`);
  if (!canvas || !iconContainer) return;

  const cachedThumb = pdfThumbDataUrlCache.get(String(note.id));
  if (cachedThumb) {
    const img = new Image();
    img.onload = () => {
      const context = canvas.getContext('2d');
      canvas.width = img.width;
      canvas.height = img.height;
      context.drawImage(img, 0, 0);
      canvas.style.opacity = '1';
      const fallback = iconContainer.querySelector('.fallback-ui');
      if (fallback) fallback.style.opacity = '0';
    };
    img.src = cachedThumb;
    return;
  }

  const key = String(note.id);
  if (pdfThumbLoading.has(key)) return;
  pdfThumbLoading.add(key);
  try {
    const loadingTask = pdfjsLib.getDocument(note.file_url);
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);

    const viewport = page.getViewport({ scale: 1 });
    const scale = 160 / viewport.width;
    const scaledViewport = page.getViewport({ scale });

    const context = canvas.getContext('2d');
    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;

    await page.render({
      canvasContext: context,
      viewport: scaledViewport
    }).promise;
    canvas.style.opacity = '1';
    const fallback = iconContainer.querySelector('.fallback-ui');
    if (fallback) fallback.style.opacity = '0';

    try {
      const thumbDataUrl = canvas.toDataURL('image/webp', 0.7);
      if (thumbDataUrl) pdfThumbDataUrlCache.set(key, thumbDataUrl);
    } catch (e) {
      // Non-fatal: if canvas export fails, keep rendered frame only.
    }
  } catch (err) {
    console.warn("Failed to load PDF thumbnail for note:", note.id, err);
  } finally {
    pdfThumbLoading.delete(key);
  }
}

window.filterFreeNotes = function () {
  const q = document.getElementById('freeNotesSearch').value.toLowerCase();
  const filtered = freeNotesData.filter(note => note.title.toLowerCase().includes(q));
  renderFreeNotesGrid(filtered);
};

// Admin Page logic
async function loadAdminFreeNotes() {
  const container = document.getElementById('adminFreeNotesList');
  if (!container) return;

  const supabase = getSupabase();
  if (!supabase) return;

  const { data: notes } = await supabase.from('free_notes').select('*').order('created_at', { ascending: false });

  if (!notes || notes.length === 0) {
    container.innerHTML = '<div style="color: var(--text-muted); padding: 20px;">No free notes uploaded yet.</div>';
    return;
  }

  container.innerHTML = notes.map(note => `
    <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-color); padding:16px; border-radius:8px; border:1px solid var(--border-color);">
      <div>
        <div style="font-weight:600; color:var(--text-main); margin-bottom:4px;">
          ${note.title}
          ${note.is_paid ? `<span style="background:var(--primary); color:#000; font-size:0.7rem; padding:2px 6px; border-radius:4px; margin-left:8px;">Paid (₹${note.price})</span>` : `<span style="background:#10b981; color:#fff; font-size:0.7rem; padding:2px 6px; border-radius:4px; margin-left:8px;">Free</span>`}
        </div>
        <div style="font-size:0.8rem; color:var(--text-muted);"><a href="${note.file_url}" target="_blank" style="color:var(--primary); text-decoration:underline;">View PDF</a> • Added: ${new Date(note.created_at).toLocaleDateString()}</div>
      </div>
      <button class="remove-btn" onclick="deleteFreeNote('${note.id}', '${note.title ? note.title.replace(/'/g, "\\'") : ''}')" style="padding:8px 16px;">Delete</button>
    </div>
  `).join('');
}

// Add note submit handler
const addFreeNoteForm = document.getElementById('addFreeNoteForm');
if (addFreeNoteForm) {
  addFreeNoteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const titleInput = document.getElementById('newNoteTitle');
    const fileInput = document.getElementById('newNoteFile');
    const typeInput = document.getElementById('newNoteType');
    const priceInput = document.getElementById('newNotePrice');
    const btn = document.getElementById('btnUploadNote');
    const btnText = document.getElementById('btnUploadNoteText');

    if (!titleInput.value || !fileInput.files.length) return;

    btn.disabled = true;
    btnText.textContent = 'Uploading...';

    const isPaid = typeInput && typeInput.value === 'paid';
    const price = isPaid && priceInput ? parseFloat(priceInput.value) || 0 : 0;

    try {
      const file = fileInput.files[0];
      await uploadBookPdfAttachment(file, {
        name: titleInput.value,
        pdfType: isPaid ? 'paid' : 'free',
        pdfPrice: price
      });
      showToast("Note published!");
      addFreeNoteForm.reset();
      loadAdminFreeNotes();
    } catch (err) {
      showToast(err.message || "PDF upload failed");
    }

    btn.disabled = false;
    btnText.textContent = 'Upload Note';
  });
}

window.deleteFreeNote = async function (id, title) {
  const shouldDelete = await showConfirmDialog(`Are you sure you want to delete "${title || 'this note'}"?`, 'Delete Note');
  if (!shouldDelete) return;

  showGlobalLoader(true, title ? `Say bye bye to ${title} 👋` : 'Deleting...');
  const supabase = getSupabase();
  if (supabase) {
    try {
      // 1. Fetch note to get the file URL
      const { data: noteData } = await supabase.from('free_notes').select('file_url').eq('id', id).single();
      if (noteData && noteData.file_url) {
        // Extract the filename from the public URL
        const fileUrl = noteData.file_url;
        const parts = fileUrl.split('/');
        const fileName = parts[parts.length - 1];

        if (fileName) {
          // 2. Delete from Storage bucket
          await supabase.storage.from('free-notes').remove([fileName]);
        }
      }
    } catch (e) {
      console.warn("Could not delete PDF from storage:", e);
    }

    // 3. Delete from DB
    const { error } = await supabase.from('free_notes').delete().eq('id', id);
    if (error) showToast("Error deleting note.");
    else {
      showToast("Note deleted.");
      loadAdminFreeNotes();
    }
  }
  showGlobalLoader(false);
}

function showGlobalLoader(show, msg) {
  let loader = document.getElementById('globalFullscreenLoader');
  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'globalFullscreenLoader';
    loader.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:20px;">
        <span class="spinner" style="width: 50px; height: 50px; border-width: 4px;"></span>
        <div id="globalLoaderText" style="color: white; font-size: 1.4rem; font-weight: 700; text-align: center; text-shadow: 0 2px 10px rgba(0,0,0,0.5);"></div>
      </div>
    `;
    loader.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.75); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 999999; display: flex; align-items: center; justify-content: center; transition: opacity 0.3s ease;';
    document.body.appendChild(loader);
  }

  const textEl = document.getElementById('globalLoaderText');
  if (textEl) {
    if (msg) {
      textEl.textContent = msg;
      textEl.style.display = 'block';
    } else {
      textEl.style.display = 'none';
    }
  }

  loader.style.display = show ? 'flex' : 'none';
}

// Hook them into DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (document.getElementById('freeNotesContainer')) {
      loadFreeNotes();
      const slider = document.getElementById('freeNotesContainer');
      if (slider) slider.addEventListener('scroll', updateFreeNotesNav, { passive: true });
      window.addEventListener('resize', updateFreeNotesNav);
    }
    if (document.getElementById('adminFreeNotesList') && currentUser && currentUser.phone === ADMIN_PHONE) {
      loadAdminFreeNotes();
    }
  }, 1000); // Give supabase a second to boot up
});

// --- Admin order search bindings ---
document.addEventListener('DOMContentLoaded', () => {
  const ordersSearch = document.getElementById('adminOrdersSearch');
  if (ordersSearch) {
    ordersSearch.addEventListener('input', () => renderAdminOrders(true));
  }
  const returnsSearch = document.getElementById('adminReturnsSearch');
  if (returnsSearch) {
    returnsSearch.addEventListener('input', () => renderAdminReturns(true));
  }
  const copySearch = document.getElementById('adminPhotocopySearch');
  if (copySearch) {
    copySearch.addEventListener('input', () => renderAdminPhotocopyOrders(true));
  }
  const pdfSearch = document.getElementById('adminPdfOrdersSearch');
  if (pdfSearch) {
    pdfSearch.addEventListener('input', () => {
      if (Array.isArray(window._adminPaidPdfOrders)) window.renderPaidPDFLog(window._adminPaidPdfOrders);
    });
  }
});

// ==========================================
//  COST ESTIMATOR
// ==========================================
let ceState = {
  pages: 0,
  manualPages: 0,
  printType: 'bw',    // 'bw' | 'color'
  copies: 1,
  sides: 'single',    // 'single' | 'double'
  binding: 'none',    // 'none' | 'spiral' | 'pin'
  paperSize: 'a4',
  payment: 'Online',
  deliveryMode: 'delivery',
  totalCost: 0,
  fileName: '',
  pdfFiles: []
};

window.globalRates = null;
function getCeRates() {
  if (window.globalRates) return window.globalRates;
  try {
    return JSON.parse(localStorage.getItem('shubham_ce_rates')) || { bw: 1, color: 5 };
  } catch (e) {
    return { bw: 1, color: 5 };
  }
}

async function syncCeRatesFromServer() {
  try {
    const rates = await apiFetch("/settings/rates", { method: "GET", auth: false });
    if (rates && typeof rates.bw === 'number' && typeof rates.color === 'number') {
      window.globalRates = { bw: Number(rates.bw), color: Number(rates.color) };
      localStorage.setItem('shubham_ce_rates', JSON.stringify(window.globalRates));
      if (typeof updateHeroRates === 'function') updateHeroRates();
    }
  } catch (e) {
    // Ignore fetch errors; local cache will be used.
  }
}
// Kick off fetch
syncCeRatesFromServer();

window.openCostEstimatorModal = function () {
  const modal = document.getElementById('costEstimatorModal');
  if (!modal) return;
  // Reset state
  ceResetState();
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
};

window.closeCostEstimatorModal = function () {
  const modal = document.getElementById('costEstimatorModal');
  if (!modal) return;
  modal.style.display = 'none';
  document.body.style.overflow = '';
  ceResetState();
};

function ceResetState() {
  ceState = { pages: 0, manualPages: 0, printType: 'bw', copies: 1, sides: 'single', binding: 'none', paperSize: 'a4', payment: 'Online', deliveryMode: 'delivery', totalCost: 0, fileName: '', pdfFiles: [] };
  // Reset UI
  const steps = ['ceStepEstimate', 'ceStepOrder', 'ceStepSuccess'];
  steps.forEach(s => { const el = document.getElementById(s); if (el) el.style.display = 'none'; });
  const est = document.getElementById('ceStepEstimate');
  if (est) est.style.display = 'block';

  const uploadZone = document.getElementById('ceUploadZone');
  if (uploadZone) uploadZone.classList.remove('has-file');
  const uploadText = document.getElementById('ceUploadText');
  if (uploadText) uploadText.textContent = 'Click to upload PDF';
  const pageInfo = document.getElementById('cePageInfo');
  if (pageInfo) pageInfo.style.display = 'none';
  const pdfInput = document.getElementById('cePdfInput');
  if (pdfInput) pdfInput.value = '';
  const manualPages = document.getElementById('ceManualPages');
  if (manualPages) manualPages.value = '';
  const copies = document.getElementById('ceCopiesVal');
  if (copies) copies.textContent = '1';
  const paperSize = document.getElementById('cePaperSize');
  if (paperSize) paperSize.value = 'a4';
  // Reset toggles
  ['ceBwBtn', 'ceColorBtn', 'ceSingleBtn', 'ceDoubleBtn', 'ceNoBindingBtn', 'ceSpiralBtn', 'cePinBtn', 'ceDeliveryBtn', 'ceCollectBtn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.remove('active');
  });
  const bwBtn = document.getElementById('ceBwBtn');
  if (bwBtn) bwBtn.classList.add('active');
  const singleBtn = document.getElementById('ceSingleBtn');
  if (singleBtn) singleBtn.classList.add('active');
  const noBindingBtn = document.getElementById('ceNoBindingBtn');
  if (noBindingBtn) noBindingBtn.classList.add('active');
  const deliveryBtn = document.getElementById('ceDeliveryBtn');
  if (deliveryBtn) deliveryBtn.classList.add('active');
  // Reset estimate display
  ['ceResPages', 'ceResCopies', 'ceResRate'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = '\u2013';
  });
  const total = document.getElementById('ceResTotal');
  if (total) total.textContent = 'Upload PDF first';
  const ceHint = document.getElementById('ceLoggedInHint');
  if (ceHint) {
    ceHint.style.display = 'none';
    ceHint.textContent = '';
  }
  // Reset form
  const form = document.getElementById('ceOrderForm');
  if (form) form.reset();
}

window.handleCePdfUpload = async function (input) {
  if (!input.files || !input.files.length) return;
  const files = Array.from(input.files).filter(f => String(f.type || '').includes('pdf'));
  if (!files.length) return;
  ceState.pdfFiles = files;
  ceState.fileName = files.length === 1 ? files[0].name : `${files.length} PDFs selected`;
  ceState.manualPages = 0;
  const manualInput = document.getElementById('ceManualPages');
  if (manualInput) manualInput.value = '';

  const uploadZone = document.getElementById('ceUploadZone');
  const uploadText = document.getElementById('ceUploadText');
  const pageInfo = document.getElementById('cePageInfo');

  uploadText.textContent = 'Counting pages...';
  uploadZone.classList.add('has-file');

  try {
    if (!window.pdfjsLib) {
      // Fallback if pdf.js not loaded yet
      showToast('PDF reader loading, try again in a moment.');
      uploadText.textContent = ceState.fileName;
      return;
    }
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

    let totalPages = 0;
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      totalPages += pdfDoc.numPages;
    }
    ceState.pages = totalPages;
    uploadText.textContent = files.length === 1 ? `\u2705 ${files[0].name}` : `\u2705 ${files.length} PDFs selected`;
    document.getElementById('cePageCount').textContent = ceState.pages;
    document.getElementById('ceFileName').textContent = ceState.fileName;
    pageInfo.style.display = 'flex';
    recalcEstimate();
  } catch (err) {
    console.error('PDF error:', err);
    showToast('Could not read PDF. Try again.');
    uploadText.textContent = 'Click to upload PDF';
    uploadZone.classList.remove('has-file');
    ceState.pages = 0;
    ceState.fileName = '';
    ceState.pdfFiles = [];
  }
};

window.setCeManualPages = function (value) {
  const pages = parseInt(value, 10);
  ceState.manualPages = Number.isFinite(pages) && pages > 0 ? pages : 0;
  if (ceState.manualPages > 0) {
    ceState.pages = ceState.manualPages;
    ceState.fileName = 'Manual input';
    ceState.pdfFiles = [];
    const uploadZone = document.getElementById('ceUploadZone');
    const uploadText = document.getElementById('ceUploadText');
    const pageInfo = document.getElementById('cePageInfo');
    if (uploadZone) uploadZone.classList.remove('has-file');
    if (uploadText) uploadText.textContent = 'Using manual pages';
    if (pageInfo) pageInfo.style.display = 'flex';
    document.getElementById('cePageCount').textContent = ceState.pages;
    document.getElementById('ceFileName').textContent = 'Manual input';
  }
  recalcEstimate();
};

/* --- Scanner Camera Feature --- */
let scannerStream = null;
let scannerImages = [];

window.openScanner = async function () {
  if (!window.jspdf) {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    document.body.appendChild(script);
  }
  scannerImages = [];
  document.getElementById('scannerBadge').textContent = `Scanned: 0`;
  document.getElementById('scannerModal').style.display = 'flex';
  document.getElementById('scannerFinishBtn').style.display = 'none';

  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    const scannerVideo = document.getElementById('scannerVideo');
    scannerVideo.srcObject = scannerStream;
    try { await scannerVideo.play(); } catch (e) { console.debug('Autoplay needed mute/interaction'); }
    resetScannerUI();
  } catch (err) {
    console.error("Camera error:", err);
    showToast("Camera access denied or unavailable.");
    closeScanner();
  }
};

window.closeScanner = function () {
  if (scannerStream) {
    scannerStream.getTracks().forEach(track => track.stop());
  }
  document.getElementById('scannerModal').style.display = 'none';
};

function resetScannerUI() {
  document.getElementById('scannerVideo').style.display = 'block';
  document.getElementById('scannerPreviewContainer').style.display = 'none';
  document.getElementById('scannerCaptureBtn').style.display = 'flex';
  document.getElementById('scannerRetakeBtn').style.display = 'none';
  document.getElementById('scannerAcceptBtn').style.display = 'none';
}

window.captureScannerFrame = function () {
  const video = document.getElementById('scannerVideo');
  const canvas = document.getElementById('scannerPreviewCanvas');
  const ctx = canvas.getContext('2d');

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  // Capture the full raw feed that the user framed
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // Basic Enhancement (Grayscale & High Contrast)
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    let avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
    avg = avg < 128 ? avg * 0.8 : avg * 1.2;
    if (avg > 255) avg = 255;
    data[i] = avg;
    data[i + 1] = avg;
    data[i + 2] = avg;
  }
  ctx.putImageData(imgData, 0, 0);

  document.getElementById('scannerVideo').style.display = 'none';
  document.getElementById('scannerPreviewContainer').style.display = 'flex';
  document.getElementById('scannerCaptureBtn').style.display = 'none';
  document.getElementById('scannerRetakeBtn').style.display = 'block';
  document.getElementById('scannerAcceptBtn').style.display = 'block';
};

window.retakeScannerFrame = function () {
  resetScannerUI();
};

window.acceptScannerFrame = function () {
  const canvas = document.getElementById('scannerPreviewCanvas');
  scannerImages.push(canvas.toDataURL('image/jpeg', 0.8));
  document.getElementById('scannerBadge').textContent = `Scanned: ${scannerImages.length}`;
  document.getElementById('scannerFinishBtn').style.display = 'block';
  resetScannerUI();
};

window.finishScanner = function () {
  if (scannerImages.length === 0) return;

  const jsPDF = window.jspdf.jsPDF;
  if (!jsPDF) {
    showToast("Wait for PDF lib to load...");
    return;
  }

  const doc = new jsPDF({ format: 'a4', unit: 'mm' });
  const a4w = 210, a4h = 297;

  scannerImages.forEach((imgDataUrl, i) => {
    if (i > 0) doc.addPage();
    doc.addImage(imgDataUrl, 'JPEG', 0, 0, a4w, a4h);
  });

  const pdfBlob = doc.output('blob');
  ceState.pdfFiles = [new File([pdfBlob], "Scanned_Document.pdf", { type: "application/pdf" })];
  ceState.pages = scannerImages.length;
  ceState.manualPages = 0;

  document.getElementById('ceUploadText').textContent = `\u2705 Scanned_Document.pdf`;
  document.getElementById('ceUploadZone').classList.add('has-file');
  document.getElementById('cePageCount').textContent = ceState.pages;
  document.getElementById('ceFileName').textContent = "Scanned_Document.pdf";
  document.getElementById('cePageInfo').style.display = 'flex';

  closeScanner();
  recalcEstimate();
};

window.changeCopies = function (step) {
  const newVal = ceState.copies + step;
  if (newVal >= 1) {
    ceState.copies = newVal;
    recalcEstimate();
  }
};
window.setCePrintType = function (type) {
  ceState.printType = type;
  document.getElementById('ceBwBtn').classList.toggle('active', type === 'bw');
  document.getElementById('ceColorBtn').classList.toggle('active', type === 'color');
  recalcEstimate();
};

window.setCeSides = function (side) {
  ceState.sides = side;
  document.getElementById('ceSingleBtn').classList.toggle('active', side === 'single');
  document.getElementById('ceDoubleBtn').classList.toggle('active', side === 'double');
  recalcEstimate();
};

window.setCeBinding = function (binding) {
  ceState.binding = binding;
  const ids = {
    none: 'ceNoBindingBtn',
    spiral: 'ceSpiralBtn',
    pin: 'cePinBtn'
  };
  Object.keys(ids).forEach(option => {
    const btn = document.getElementById(ids[option]);
    if (btn) btn.classList.toggle('active', binding === option);
  });
  recalcEstimate();
};

window.changeCopies = function (delta) {
  ceState.copies = Math.max(1, ceState.copies + delta);
  document.getElementById('ceCopiesVal').textContent = ceState.copies;
  recalcEstimate();
};

window.setCePayment = function () {
  ceState.payment = 'Online';
};

window.setCeDelivery = function (mode) {
  ceState.deliveryMode = mode;
  document.getElementById('ceDeliveryBtn').classList.toggle('active', mode === 'delivery');
  document.getElementById('ceCollectBtn').classList.toggle('active', mode === 'collect');
  recalcEstimate();
};

window.recalcEstimate = function () {
  if (!ceState.pages) return;
  const paperSizeEl = document.getElementById('cePaperSize');
  if (paperSizeEl) ceState.paperSize = paperSizeEl.value;
  const bindingFee = CE_BINDING_FEES[ceState.binding] || 0;
  const bindingLabel = ceState.binding === 'spiral' ? 'Spiral binding' : ceState.binding === 'pin' ? 'Pin binding' : 'No binding';

  const rate = getCeRates()[ceState.printType];
  const billablePages = ceState.pages;
  let protoCost = billablePages * rate;
  if (ceState.sides === 'double') {
    protoCost = protoCost * 0.5;
  }
  ceState.totalCost = (protoCost * ceState.copies) + bindingFee;
  if (ceState.deliveryMode === 'delivery') {
    ceState.totalCost += DELIVERY_FEE;
  }

  document.getElementById('ceResPages').textContent = ceState.pages + (ceState.sides === 'double' ? ' pages (Double-Sided discounted)' : ' pages');
  document.getElementById('ceResCopies').textContent = ceState.copies;
  document.getElementById('ceResRate').textContent = `\u20B9${rate}/page (${ceState.printType === 'bw' ? 'B&W' : 'Colour'}) | ${bindingLabel}${bindingFee ? ` + \u20B9${bindingFee}` : ''}`;

  let totalDesc = `\u20B9${ceState.totalCost.toFixed(2)}`;
  const included = [];
  if (bindingFee) included.push(`\u20B9${bindingFee} ${ceState.binding === 'spiral' ? 'Spiral' : 'Pin'}`);
  if (ceState.deliveryMode === 'delivery') included.push(`\u20B9${DELIVERY_FEE} Delivery`);
  if (included.length) totalDesc += ` (incl. ${included.join(' + ')})`;
  document.getElementById('ceResTotal').textContent = totalDesc;
};

window.proceedToPayment = function () {
  if (!ceState.pages) {
    showToast('Please upload a PDF first!');
    return;
  }
  if (!currentUser) {
    showToast('Please log in to place a photocopy order.');
    window.location.href = 'login.html';
    return;
  }
  const hint = document.getElementById('ceLoggedInHint');
  if (hint) {
    hint.style.display = 'block';
    const ph = (currentUser.phone || '').trim();
    const nm = (currentUser.name || '').trim() || 'Account';
    hint.textContent = ph ? `Ordering as: ${nm} (${ph})` : `Ordering as: ${nm}`;
  }

  // Update order summary
  const summaryEl = document.getElementById('ceOrderSummaryText');
  if (summaryEl) {
    const sizeLabel = { a4: 'A4', a3: 'A3', legal: 'Legal', letter: 'Letter' };
    const bindingFee = CE_BINDING_FEES[ceState.binding] || 0;
    const bindingLabel = ceState.binding === 'spiral' ? `Spiral binding (+\u20B9${bindingFee})` : ceState.binding === 'pin' ? `Pin binding (+\u20B9${bindingFee})` : 'No binding';
    const deliveryLabel = ceState.deliveryMode === 'delivery' ? `Delivery (+\u20B9${DELIVERY_FEE})` : 'Collect at shop';
    summaryEl.textContent = `${ceState.pages} pages \u00D7 ${ceState.copies} cop${ceState.copies > 1 ? 'ies' : 'y'} | ${ceState.printType === 'bw' ? 'B&W' : 'Colour'} | ${sizeLabel[ceState.paperSize] || ceState.paperSize} | ${ceState.sides === 'double' ? 'Double' : 'Single'}-sided | ${bindingLabel} | ${deliveryLabel} \u2192 \u20B9${ceState.totalCost.toFixed(2)}`;
  }

  const ta = document.getElementById('ceCustomerAddress');
  if (ta && !ta.value.trim()) {
    const d = getSavedDeliveryDetails();
    const line2 = [d.city, d.pincode].filter(Boolean).join(' ');
    const parts = [d.street, line2].filter(Boolean);
    if (parts.length) ta.value = parts.join('\n');
  }

  document.getElementById('ceStepEstimate').style.display = 'none';
  document.getElementById('ceStepOrder').style.display = 'block';
};

window.ceGoBack = function () {
  document.getElementById('ceStepOrder').style.display = 'none';
  document.getElementById('ceStepEstimate').style.display = 'block';
};

window.placeCopyOrder = async function (e) {
  e.preventDefault();
  const btn = document.getElementById('cePlaceOrderBtn');
  if (!currentUser) {
    showToast('Please log in to place an order.');
    window.location.href = 'login.html';
    return;
  }
  const name = (currentUser.name || '').trim() || 'Customer';
  const phone = (currentUser.phone || '').trim();
  if (!phone) {
    showToast('Your account has no phone number. Update your profile after login.');
    return;
  }
  const address = document.getElementById('ceCustomerAddress').value.trim();
  if (!address) {
    showToast('Please enter pickup or delivery address.');
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Uploading doc & finalizing order...';
  const sizeLabel = { a4: 'A4', a3: 'A3', legal: 'Legal', letter: 'Letter' };
  const bindingFee = CE_BINDING_FEES[ceState.binding] || 0;
  const bindingLabel = ceState.binding === 'spiral' ? `Spiral binding (+\u20B9${bindingFee})` : ceState.binding === 'pin' ? `Pin binding (+\u20B9${bindingFee})` : 'No binding';
  const orderId = 'COPY' + Date.now();

  // --- Upload PDF through backend storage helper ---
  let docUrl = null;
  let storagePath = null;
  if (ceState.pdfFiles && ceState.pdfFiles.length) {
    try {
      const uploadedUrls = [];
      const uploadedPaths = [];
      for (let i = 0; i < ceState.pdfFiles.length; i++) {
        const file = ceState.pdfFiles[i];
        const upload = await uploadPhotocopyPdf(file, { orderId, index: i + 1 });
        uploadedUrls.push(upload.public_url);
        uploadedPaths.push(upload.file_name);
      }
      if (uploadedPaths.length) {
        storagePath = uploadedPaths.join('|');
        docUrl = uploadedUrls.join('|');
      } else {
        showToast('PDF upload failed (order will continue without files if DB allows).');
      }
    } catch (err) {
      console.error('Storage error:', err);
      showToast(err.message || 'PDF upload error.');
    }
  } else if (!(ceState.pdfFiles && ceState.pdfFiles.length) && ceState.pages && !ceState.manualPages) {
    showToast('PDF file missing — go back and upload the PDF again.');
  }

  const orderData = {
    id: orderId,
    customer_name: name,
    customer_phone: phone,
    address: address,
    pages: ceState.pages,
    copies: ceState.copies,
    print_type: ceState.printType === 'bw' ? 'B&W' : 'Colour',
    paper_size: sizeLabel[ceState.paperSize] || ceState.paperSize,
    sides: `${ceState.sides === 'double' ? 'Double-sided' : 'Single-sided'} | ${bindingLabel}`,
    delivery_mode: ceState.deliveryMode,
    total_cost: ceState.totalCost,
    payment_method: ceState.payment,
    doc_url: docUrl,
    doc_path: storagePath,
    status: 'Pending',
    created_at: new Date().toISOString()
  };

  processSecureRazorpayPayment(ceState.totalCost, orderData, 'photocopy', (success, txnId) => {
    btn.disabled = false;
    btn.textContent = 'Pay Online & Place Photocopy Order';

    if (success) {
      saveSavedDeliveryDetails({ street: address });
      sessionStorage.setItem("orderBanner", "success");
      window.location.href = 'my-orders.html';
    }
  });
};

// ---- Admin Photocopy Orders ----
function normalizePhotocopyOrderRow(o) {
  if (!o) return o;
  const doc_path = o.doc_path != null && o.doc_path !== '' ? o.doc_path : (o.docPath || null);
  const doc_url = o.doc_url != null && o.doc_url !== '' ? o.doc_url : (o.docUrl || null);
  return { ...o, doc_path, doc_url };
}

async function resolvePhotocopyPdfHref(supabase, o) {
  const path = (o.doc_path || '').split('|')[0];
  const fallbackPublic = (o.doc_url || '').split('|')[0];
  if (!path) return fallbackPublic || null;
  if (!supabase) return fallbackPublic || null;
  try {
    const { data, error } = await supabase.storage
      .from('photocopy-docs')
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    if (!error && data && data.signedUrl) return data.signedUrl;
  } catch (e) {
    console.warn('Photocopy signed URL:', e);
  }
  return fallbackPublic || null;
}

function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

window.createPhotocopyShiprocketOrder = async function (orderId) {
  if (!confirm('Create Shiprocket order and notify customer?')) return;
  const btn = document.getElementById(`btn-sr-photo-${orderId}`);
  if (btn) btn.innerHTML = 'Processing...';
  try {
    await apiFetch("/admin/photocopy-shiprocket", { method: "POST", body: { order_id: orderId } });
    showToast("Shiprocket Order Created!");
    await renderAdminPhotocopyOrders();
  } catch (err) {
    showToast(err.message || "Failed to create Shiprocket order");
    if (btn) btn.innerHTML = 'Shiprocket Error';
  }
};

async function renderAdminPhotocopyOrders(useCache = false) {
  const container = document.getElementById('adminPhotocopyOrdersList');
  if (!container) return;

  container.innerHTML = `<div style="padding:24px; color:var(--text-muted); text-align:center;">Loading photocopy orders...</div>`;

  let orders = [];
  const supabase = getSupabase();
  if (useCache && Array.isArray(window._adminPhotocopyRaw)) {
    orders = window._adminPhotocopyRaw;
  } else {
    try {
      const res = await apiFetch("/admin/orders?order_type=photocopy", { method: "GET" });
      orders = (res && res.orders) || [];
    } catch (err) {
      orders = [];
      showToast(err.message || "Failed to load photocopy orders");
    }
    window._adminPhotocopyRaw = orders;
  }

  const copyCountEl = document.getElementById('adminPhotocopyCountLabel');
  if (copyCountEl) copyCountEl.textContent = 'Total photocopy orders: ' + orders.length;

  if (!orders.length) {
    container.innerHTML = `<div style="padding:32px; text-align:center; color:var(--text-muted);">No photocopy orders yet.</div>`;
    return;
  }

  const q = getTrimmedInputValue('adminPhotocopySearch').toLowerCase();
  const baseList = q ? orders.filter(o => String(o.id || '').toLowerCase().includes(q)) : orders;
  if (!baseList.length) {
    container.innerHTML = `<div style="padding:32px; text-align:center; color:var(--text-muted);">No orders match this Order ID.</div>`;
    return;
  }

  const rows = await Promise.all(
    baseList.map(async (raw) => {
      const o = normalizePhotocopyOrderRow(raw);
      const pdfHref = await resolvePhotocopyPdfHref(supabase, o);
      return { ...o, tracking_url: raw.tracking_url, _pdfHref: pdfHref };
    })
  );

  const activeOrders = rows.filter(o => o.status !== 'Completed' && o.status !== 'Delivered' && o.status !== 'Cancelled' && !String(o.status || '').includes('Return'));
  const completedOrders = rows.filter(o => o.status === 'Completed' || o.status === 'Delivered' || o.status === 'Cancelled' || String(o.status || '').includes('Return'));

  const renderList = (list) => {
    if (!list.length) return `<div style="padding: 12px; color: var(--text-muted);">No orders in this category.</div>`;
    return list.map(o => {
      const date = o.created_at ? new Date(o.created_at).toLocaleString('en-IN') : '\u2013';
      const statusColor = { Pending: '#f59e0b', Processing: '#3b82f6', Ready: '#8b5cf6', Completed: '#10b981', Cancelled: '#ef4444' };
      const sc = statusColor[o.status] || '#888';
      const docPathForDel = o.doc_path || '';
      const docPathEncoded = docPathForDel ? encodeURIComponent(docPathForDel) : '';
      const hasStoredFile = !!(o.doc_path && String(o.doc_path).trim());
      const pdfLink = o._pdfHref;
      const pdfBlock = pdfLink ? `
          <div style="background:linear-gradient(90deg,rgba(37,117,252,0.08),rgba(106,17,203,0.08)); border:1px solid rgba(37,117,252,0.2); border-radius:10px; padding:10px 14px; margin-bottom:14px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2575fc" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span style="font-size:0.85rem; font-weight:600; color:var(--text-main);">Customer PDF attached</span>
            </div>
            <a href="${escAttr(pdfLink)}" target="_blank" rel="noopener noreferrer" style="background:#2575fc; color:#fff; padding:5px 14px; border-radius:6px; font-size:0.8rem; font-weight:700; text-decoration:none; display:inline-flex; align-items:center; gap:5px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              View / Download PDF
            </a>
          </div>` : (hasStoredFile ? `
          <div style="background:var(--card-bg); border:1px dashed var(--border-color); border-radius:8px; padding:8px 14px; margin-bottom:14px; font-size:0.8rem; color:var(--text-muted);">
            PDF path in storage: <code style="font-size:0.75rem;">${escAttr(o.doc_path)}</code> — link could not be created.
          </div>` : `
          <div style="background:var(--card-bg); border:1px dashed var(--border-color); border-radius:8px; padding:8px 14px; margin-bottom:14px; font-size:0.8rem; color:var(--text-muted);">
            No PDF attached to this order.
          </div>`);
      return `
        <div style="background:var(--card-bg); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:20px; margin-bottom:18px; box-shadow:var(--shadow-sm);">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px; margin-bottom:14px; border-bottom:1px solid var(--border-color); padding-bottom:14px;">
            <div>
              <div style="font-weight:700; font-size:1rem; color:var(--text-main);">${o.id}</div>
              <div style="font-size:0.82rem; color:var(--text-muted); margin-top:2px;">${date}</div>
            </div>
            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
              ${o.status === 'Cancelled' ? `<span style="background:#ff3b3020; color:#ff3b30; border:1px solid #ff3b30; padding:4px 12px; border-radius:20px; font-size:0.8rem; font-weight:700;">Cancelled</span>` : `<span style="background:${sc}20; color:${sc}; border:1px solid ${sc}; padding:4px 12px; border-radius:20px; font-size:0.8rem; font-weight:700;">${o.status || 'Pending'}</span>`}
              
              ${(o.status !== 'Completed' && o.status !== 'Cancelled' && !String(o.status || '').includes('Return')) ? `<button onclick="updatePhotocopyStatus('${o.id}', 'Completed')" style="background:#10b98115; color:#10b981; border:1px solid #10b98140; padding:5px 12px; border-radius:6px; font-size:0.8rem; font-weight:600; cursor:pointer;" onmouseover="this.style.background='#10b98125'" onmouseout="this.style.background='#10b98115'">Mark Completed</button>
              ${!o.tracking_url ? `<button id="btn-sr-photo-${o.id}" onclick="createPhotocopyShiprocketOrder('${o.id}')" style="background:#2575fc15; color:#2575fc; border:1px solid #2575fc40; padding:5px 12px; border-radius:6px; font-size:0.8rem; font-weight:600; cursor:pointer;" onmouseover="this.style.background='#2575fc25'" onmouseout="this.style.background='#2575fc15'">Create Shiprocket Order</button>` : `<a href="${o.tracking_url}" target="_blank" style="font-size:0.8rem; color:#2575fc; border:1px solid #2575fc; padding:4px 8px; border-radius:4px; text-decoration:none;">Track</a>`}` : ''}
              
              <button onclick="deletePhotocopyOrder('${o.id}', '${docPathEncoded}')" style="background:#ff3b3015; color:#ff3b30; border:1px solid #ff3b3040; padding:5px 12px; border-radius:6px; font-size:0.8rem; font-weight:600; cursor:pointer;" onmouseover="this.style.background='#ff3b3025'" onmouseout="this.style.background='#ff3b3015'">Delete</button>
            </div>
          </div>

          ${pdfBlock}

          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px,1fr)); gap:12px;">
            <div>
              <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Customer</div>
              <div style="font-weight:600; color:var(--text-main);">${o.customer_name}</div>
              <div style="font-size:0.85rem; color:var(--text-muted);">${o.customer_phone}</div>
            </div>
            <div>
              <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Print Details</div>
              <div style="font-weight:600; color:var(--text-main);">${o.pages} pages \u00D7 ${o.copies} cop${o.copies > 1 ? 'ies' : 'y'}</div>
              <div style="font-size:0.85rem; color:var(--text-muted);">${o.print_type} | ${o.paper_size} | ${o.sides}</div>
            </div>
            <div>
              <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Address</div>
              <div style="font-size:0.85rem; color:var(--text-main);">${o.address}</div>
            </div>
            <div>
              <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Payment</div>
              <div style="font-weight:700; color:var(--primary); font-size:1.1rem;">\u20B9${Number(o.total_cost).toFixed(2)}</div>
              <div style="font-size:0.82rem; color:var(--text-muted);">${o.payment_method}</div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  };

  container.innerHTML = `
    <div style="background:var(--primary); color:#fff; padding:12px 20px; border-radius:var(--radius-md) var(--radius-md) 0 0; font-size:1.15rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; display:flex; align-items:center; gap:8px;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Active Orders
    </div>
    <div style="background:rgba(0,0,0, 0.02); border:1px solid var(--border-color); border-top:none; border-radius:0 0 var(--radius-md) var(--radius-md); padding:20px; margin-bottom:32px; box-shadow:var(--shadow-sm);">
      ${renderList(activeOrders)}
    </div>
    <div style="background:#10b981; color:#fff; padding:12px 20px; border-radius:var(--radius-md) var(--radius-md) 0 0; font-size:1.15rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; display:flex; align-items:center; gap:8px;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Completed & Cancelled
    </div>
    <div style="background:rgba(16,185,129,0.02); border:1px solid var(--border-color); border-top:none; border-radius:0 0 var(--radius-md) var(--radius-md); padding:20px; box-shadow:var(--shadow-sm);">
      ${renderList(completedOrders)}
    </div>
  `;
}

window.deletePhotocopyOrder = async function (orderId, docPathEncoded) {
  if (!confirm('Delete this photocopy order and its attached PDF? This cannot be undone.')) return;

  showGlobalLoader(true, `Say bye bye to ${orderId} 👋`);
  const supabase = getSupabase();
  if (supabase) {
    // 1. Delete PDF from storage (if exists)
    if (docPathEncoded) {
      try {
        const decoded = decodeURIComponent(docPathEncoded);
        const allPaths = decoded.split('|').map(s => s.trim()).filter(Boolean);
        if (allPaths.length) await supabase.storage.from('photocopy-docs').remove(allPaths);
      } catch (e) { console.warn('Storage delete failed:', e); }
    }
  }
  // 2. Delete DB record (admin protected)
  try {
    await apiFetch(`/admin/orders/${encodeURIComponent(orderId)}?order_type=photocopy`, { method: "DELETE" });
  } catch (err) {
    showGlobalLoader(false);
    showToast(err.message || "Delete failed");
    return;
  }
  showToast('Order and PDF deleted successfully.');
  await renderAdminPhotocopyOrders();
  showGlobalLoader(false);
};

window.updatePhotocopyStatus = async function (orderId, newStatus) {
  try {
    await apiFetch(`/admin/orders/${encodeURIComponent(orderId)}?order_type=photocopy`, { method: "PATCH", body: { status: newStatus } });
  } catch (err) {
    showToast(err.message || "Update failed");
    return;
  }
  showToast('Status updated!');
};

// ==========================================
// PDF Viewer and Notes Checkout Logic
// ==========================================
function hasUnlockedNote(noteId) {
  if (!currentUser) return false;
  const purchases = JSON.parse(localStorage.getItem('shubham_note_purchases') || '[]');
  if (purchases.includes(`${currentUser.phone}_${noteId}`)) return true;
  return false;
}

let currentPdfDoc = null;
let currentPdfPage = 1;
let viewerNoteId = null;
let viewerNotePrice = 0;
let viewerNoteTitle = '';
let viewerSecureModeEnabled = false;
let viewerRequiresPurchase = false;
const MAX_PREVIEW_PAGES = 2;

let pdfViewerGuardBound = false;
const pdfViewerGuards = { onContextMenu: null, onKeydown: null, onDragStart: null, onVisibility: null, onBlur: null, onPageHide: null };
let displayCaptureHooked = false;

function hookDisplayCaptureDetection() {
  if (displayCaptureHooked) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    displayCaptureHooked = true;
    return;
  }
  const originalGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getDisplayMedia = async function (...args) {
    if (currentPdfDoc) {
      showToast('Screen capture detected. Viewer closed.');
      closePdfViewer();
      throw new Error('Screen capture blocked during secure viewing.');
    }
    return originalGetDisplayMedia(...args);
  };
  displayCaptureHooked = true;
}

function addPdfViewerGuards() {
  if (pdfViewerGuardBound) return;
  const modal = document.getElementById('pdfViewerModal');
  if (!modal) return;
  pdfViewerGuards.onContextMenu = (e) => {
    if (viewerSecureModeEnabled && modal.contains(e.target)) e.preventDefault();
  };
  pdfViewerGuards.onKeydown = (e) => {
    if (!viewerSecureModeEnabled) return;
    const k = String(e.key || '').toLowerCase();
    if (((e.ctrlKey || e.metaKey) && (k === 's' || k === 'p' || k === 'u')) || k === 'printscreen') {
      e.preventDefault();
      showToast('This PDF is view-only.');
    }
  };
  pdfViewerGuards.onDragStart = (e) => {
    if (viewerSecureModeEnabled && modal.contains(e.target)) e.preventDefault();
  };
  pdfViewerGuards.onVisibility = () => {
    if (currentPdfDoc && document.hidden) {
      showToast('Viewer closed for security.');
      closePdfViewer();
    }
  };
  pdfViewerGuards.onBlur = () => {
    if (currentPdfDoc) {
      showToast('Viewer closed for security.');
      closePdfViewer();
    }
  };
  pdfViewerGuards.onPageHide = () => {
    if (currentPdfDoc) closePdfViewer();
  };
  document.addEventListener('contextmenu', pdfViewerGuards.onContextMenu);
  document.addEventListener('keydown', pdfViewerGuards.onKeydown);
  document.addEventListener('dragstart', pdfViewerGuards.onDragStart);
  document.addEventListener('visibilitychange', pdfViewerGuards.onVisibility);
  window.addEventListener('blur', pdfViewerGuards.onBlur);
  window.addEventListener('pagehide', pdfViewerGuards.onPageHide);
  pdfViewerGuardBound = true;
}

function removePdfViewerGuards() {
  if (!pdfViewerGuardBound) return;
  document.removeEventListener('contextmenu', pdfViewerGuards.onContextMenu);
  document.removeEventListener('keydown', pdfViewerGuards.onKeydown);
  document.removeEventListener('dragstart', pdfViewerGuards.onDragStart);
  document.removeEventListener('visibilitychange', pdfViewerGuards.onVisibility);
  window.removeEventListener('blur', pdfViewerGuards.onBlur);
  window.removeEventListener('pagehide', pdfViewerGuards.onPageHide);
  pdfViewerGuardBound = false;
}

function addPdfWatermark(ctx, canvas) {
  if (!currentPdfDoc) return;
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = '#111827';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(-Math.PI / 6);
  ctx.font = 'bold 104px Inter, Arial, sans-serif';
  ctx.fillText('Shubham Xerox', 0, -36);
  ctx.font = 'bold 52px Inter, Arial, sans-serif';
  ctx.fillText('No:-9826462963', 0, 56);
  ctx.restore();
}

window.openPdfViewer = async function (url, price, id, title) {
  const modal = document.getElementById('pdfViewerModal');
  if (!modal) return;

  if (Number(price) > 0 && !currentUser) {
    showToast("Please login first to preview and purchase notes.");
    setTimeout(() => window.location.href = "login.html", 1500);
    return;
  }

  viewerNoteId = id;
  viewerNotePrice = price;
  viewerNoteTitle = title;
  viewerRequiresPurchase = Number(price) > 0;
  viewerSecureModeEnabled = hasUnlockedNote(id);

  document.getElementById('pdfViewerTitle').textContent = `${viewerRequiresPurchase ? (viewerSecureModeEnabled ? 'Secure View' : 'Preview') : 'Viewer'}: ${title}`;
  document.getElementById('pdfViewerLockScreen').style.display = 'none';
  document.getElementById('pdfPageNum').textContent = '1';
  document.getElementById('pdfPageCount').textContent = '-';
  const jumpInput = document.getElementById('pdfJumpInput');
  if (jumpInput) jumpInput.value = '';

  const canvas = document.getElementById('pdfViewerCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  hookDisplayCaptureDetection();
  addPdfViewerGuards();

  try {
    if (!window.pdfjsLib) throw new Error("PDF Library not loaded");
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

    currentPdfDoc = await pdfjsLib.getDocument(url).promise;
    document.getElementById('pdfPageCount').textContent = currentPdfDoc.numPages;
    currentPdfPage = 1;
    renderPdfPage(currentPdfPage);
  } catch (e) {
    showToast("Failed to load PDF preview.");
    console.error(e);
  }
};

window.closePdfViewer = function () {
  const modal = document.getElementById('pdfViewerModal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
  if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
  const fsBtn = document.getElementById('pdfFullscreenBtn');
  if (fsBtn) fsBtn.textContent = 'Fullscreen';
  currentPdfDoc = null;
  viewerSecureModeEnabled = false;
  viewerRequiresPurchase = false;
  removePdfViewerGuards();
};

window.togglePdfFullscreen = async function () {
  const modal = document.getElementById('pdfViewerModal');
  const fsBtn = document.getElementById('pdfFullscreenBtn');
  if (!modal) return;
  try {
    if (!document.fullscreenElement) {
      await modal.requestFullscreen();
      if (fsBtn) fsBtn.textContent = 'Exit Fullscreen';
    } else {
      await document.exitFullscreen();
      if (fsBtn) fsBtn.textContent = 'Fullscreen';
    }
  } catch (e) {
    showToast('Fullscreen not supported on this browser.');
  }
};

document.addEventListener('fullscreenchange', () => {
  const fsBtn = document.getElementById('pdfFullscreenBtn');
  if (fsBtn) fsBtn.textContent = document.fullscreenElement ? 'Exit Fullscreen' : 'Fullscreen';
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.getElementById('pdfViewerModal')?.style.display === 'flex') {
    const active = document.activeElement;
    if (active && active.id === 'pdfJumpInput') {
      e.preventDefault();
      goToPdfPage();
    }
  }
});

async function renderPdfPage(num) {
  if (!currentPdfDoc) return;

  const lockScreen = document.getElementById('pdfViewerLockScreen');
  if (viewerRequiresPurchase && num > MAX_PREVIEW_PAGES && !hasUnlockedNote(viewerNoteId)) {
    lockScreen.style.display = 'flex';
    document.getElementById('btnBuyPdfUnlock').onclick = () => purchaseNote(viewerNoteId, viewerNotePrice, viewerNoteTitle);
    return;
  } else {
    lockScreen.style.display = 'none';
  }

  try {
    const page = await currentPdfDoc.getPage(num);
    const canvas = document.getElementById('pdfViewerCanvas');
    const ctx = canvas.getContext('2d');

    const viewport = page.getViewport({ scale: window.innerWidth < 600 ? 1.0 : 1.5 });
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    addPdfWatermark(ctx, canvas);
    document.getElementById('pdfPageNum').textContent = Math.min(num, currentPdfDoc.numPages);
  } catch (e) {
    console.error("Render page err:", e);
  }
}

window.pdfPrevPage = function () {
  if (currentPdfPage <= 1) return;
  currentPdfPage--;
  renderPdfPage(currentPdfPage);
};

window.pdfNextPage = function () {
  if (!currentPdfDoc || currentPdfPage >= currentPdfDoc.numPages) return;
  if (viewerRequiresPurchase && currentPdfPage >= MAX_PREVIEW_PAGES && !hasUnlockedNote(viewerNoteId)) {
    currentPdfPage++;
    renderPdfPage(currentPdfPage);
    return;
  }
  currentPdfPage++;
  renderPdfPage(currentPdfPage);
};

window.goToPdfPage = function () {
  if (!currentPdfDoc) return;
  const jumpInput = document.getElementById('pdfJumpInput');
  if (!jumpInput) return;
  const targetPage = parseInt(jumpInput.value, 10);
  if (!targetPage || targetPage < 1 || targetPage > currentPdfDoc.numPages) {
    showToast('Enter valid page number.');
    return;
  }
  if (viewerRequiresPurchase && targetPage > MAX_PREVIEW_PAGES && !hasUnlockedNote(viewerNoteId)) {
    showToast('Purchase required for this page.');
    currentPdfPage = MAX_PREVIEW_PAGES + 1;
    renderPdfPage(currentPdfPage);
    return;
  }
  currentPdfPage = targetPage;
  renderPdfPage(currentPdfPage);
};

function purchaseNote(id, price, title) {
  const orderData = {
    id: "NORD" + Date.now(),
    customer: currentUser.name,
    customerphone: currentUser.phone,
    address: 'Digital Product',
    items: [{ id: id, name: title, price: price, quantity: 1, type: 'note' }],
    total: price,
    method: 'Online',
    status: 'Completed',
    date: new Date().toLocaleString()
  };

  const btn = document.getElementById('btnBuyPdfUnlock');
  btn.disabled = true;
  btn.textContent = "Processing...";

  processSecureRazorpayPayment(price, orderData, 'books', async (success, txnId) => {
    btn.disabled = false;
    btn.textContent = "Buy Now to Unlock";

    if (success) {
      const purchases = JSON.parse(localStorage.getItem('shubham_note_purchases') || '[]');
      purchases.push(`${currentUser.phone}_${id}`);
      localStorage.setItem('shubham_note_purchases', JSON.stringify(purchases));

      showToast("Payment Successful! PDF Unlocked.");
      closePdfViewer();
      if (document.getElementById('freeNotesContainer')) {
        renderFreeNotesGrid(freeNotesData);
      }
    }
  });
}

function updateHeroRates() {
  const bwEl = document.getElementById('heroRateBw');
  const colorEl = document.getElementById('heroRateColor');
  if (bwEl && colorEl) {
    const rates = getCeRates();
    bwEl.textContent = `₹${rates.bw}`;
    colorEl.textContent = `₹${rates.color}`;
  }
}
document.addEventListener('DOMContentLoaded', updateHeroRates);


// --- Spiral Copies Page ---
const defaultSpiralCopies = [
  { id: 'spiral-10-50', name: 'Spiral Copy 10-50 Pages', price: 50, category: 'Spiral Copies', pagesMin: 10, pagesMax: 50, img: 'images/about-books.png' },
  { id: 'spiral-51-100', name: 'Spiral Copy 50-100 Pages', price: 80, category: 'Spiral Copies', pagesMin: 51, pagesMax: 100, img: 'images/about-books.png' },
  { id: 'spiral-101-150', name: 'Spiral Copy 100-150 Pages', price: 110, category: 'Spiral Copies', pagesMin: 101, pagesMax: 150, img: 'images/about-books.png' },
  { id: 'spiral-151-200', name: 'Spiral Copy 150-200 Pages', price: 140, category: 'Spiral Copies', pagesMin: 151, pagesMax: 200, img: 'images/about-books.png' },
  { id: 'spiral-201-250', name: 'Spiral Copy 200-250 Pages', price: 170, category: 'Spiral Copies', pagesMin: 201, pagesMax: 250, img: 'images/about-books.png' },
  { id: 'spiral-251-300', name: 'Spiral Copy 250-300 Pages', price: 200, category: 'Spiral Copies', pagesMin: 251, pagesMax: 300, img: 'images/about-books.png' },
  { id: 'spiral-301-350', name: 'Spiral Copy 300-350 Pages', price: 230, category: 'Spiral Copies', pagesMin: 301, pagesMax: 350, img: 'images/about-books.png' },
  { id: 'spiral-351-400', name: 'Spiral Copy 350-400 Pages', price: 260, category: 'Spiral Copies', pagesMin: 351, pagesMax: 400, img: 'images/about-books.png' },
  { id: 'spiral-401-450', name: 'Spiral Copy 400-450 Pages', price: 290, category: 'Spiral Copies', pagesMin: 401, pagesMax: 450, img: 'images/about-books.png' },
  { id: 'spiral-451-500', name: 'Spiral Copy 450-500 Pages', price: 320, category: 'Spiral Copies', pagesMin: 451, pagesMax: 500, img: 'images/about-books.png' }
];

function getSpiralCopies() {
  const added = (products || []).filter(p => p.category === 'Spiral Copies');
  if (!added.length) return defaultSpiralCopies;
  return [...added, ...defaultSpiralCopies].map((p, index) => ({
    ...p,
    id: p.id || `spiral-added-${index}`,
    img: p.img || 'images/about-books.png'
  }));
}

function getSpiralCopyPages(item) {
  const text = `${item.name || ''} ${item.desc || ''}`;
  const explicit = String(item.desc || '').match(/pages?\s*:\s*(\d+)/i);
  if (explicit) {
    const pages = parseInt(explicit[1], 10);
    return { min: pages, max: pages, label: `${pages} Pages` };
  }
  const range = text.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (range) {
    const min = parseInt(range[1], 10);
    const max = parseInt(range[2], 10);
    return { min, max, label: `${min}-${max} Pages` };
  }
  const fallback = Number(item.pagesMin) || parseInt(String(item.name || '').match(/\d+/)?.[0] || '0', 10);
  const max = Number(item.pagesMax) || fallback;
  return { min: fallback, max, label: fallback && max && fallback !== max ? `${fallback}-${max} Pages` : (fallback ? `${fallback} Pages` : '') };
}

window.addSpiralCopyToCart = function (productId) {
  const item = getSpiralCopies().find(p => String(p.id) === String(productId));
  if (!item) return;
  const existingItem = cart.find(p => String(p.id) === String(item.id));
  if (existingItem) existingItem.quantity += 1;
  else cart.push({ ...item, quantity: 1 });
  saveCart();
  showToast(`${item.name} added to cart!`);
};

window.renderSpiralCopies = function (range = 'all') {
  const grid = document.getElementById('spiralCopiesGrid');
  if (!grid) return;
  const [min, max] = range === 'all' ? [0, Infinity] : range.split('-').map(Number);
  const visible = getSpiralCopies().filter(item => {
    const pages = getSpiralCopyPages(item);
    return range === 'all' || (pages.max >= min && pages.min <= max);
  });
  grid.innerHTML = visible.map(item => `
    <article class="product-card">
      <div class="product-image-container">
        <img src="${item.img}" alt="${item.name}" class="product-image" loading="lazy">
      </div>
      <div class="product-info">
        <h3 class="product-title">${item.name}</h3>
        ${getSpiralCopyPages(item).label ? `<p style="color:var(--text-muted); font-size:0.9rem; margin-top:6px;">${getSpiralCopyPages(item).label}</p>` : ''}
        <div class="product-price">${formatPrice(Number(item.price) || 0)}</div>
        <button class="btn btn-primary" style="width:100%; margin-top:14px;" onclick="addSpiralCopyToCart('${item.id}')">Add to Cart</button>
      </div>
    </article>
  `).join('');
};

document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('spiralCopiesGrid');
  if (!grid) return;
  const filterWrap = document.querySelector('.spiral-filter-wrap');
  const filterToggle = document.getElementById('spiralFilterToggle');
  const activeLabel = document.getElementById('spiralActiveFilterLabel');
  if (filterToggle && filterWrap) {
    filterToggle.addEventListener('click', () => {
      const isOpen = filterWrap.classList.toggle('is-open');
      filterToggle.setAttribute('aria-expanded', String(isOpen));
    });
    document.addEventListener('click', (event) => {
      if (!filterWrap.contains(event.target)) {
        filterWrap.classList.remove('is-open');
        filterToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }
  renderSpiralCopies();
  document.querySelectorAll('.spiral-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.spiral-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (activeLabel) activeLabel.textContent = btn.textContent.trim();
      if (filterWrap && filterToggle) {
        filterWrap.classList.remove('is-open');
        filterToggle.setAttribute('aria-expanded', 'false');
      }
      renderSpiralCopies(btn.dataset.range || 'all');
    });
  });
});


// --- Render Dynamic Home Categories ---
function renderHomeDynamicCategories() {
  const container = document.getElementById('homeDynamicCategoriesSlider');
  if (!container) return;

  // Exclude some base categories that might already be in the grid, or show all
  const excluded = ['Stationery', 'Spiral Copies', 'Combos'];
  let catsToShow = siteCategories.filter(c => !excluded.includes(c));

  // Sort categories: ones with an explicitly set image come first
  catsToShow.sort((a, b) => {
    const metaA = categoryMeta[a] || {};
    const metaB = categoryMeta[b] || {};
    const hasImageA = metaA.image && metaA.image !== 'images/logo.png' ? 1 : 0;
    const hasImageB = metaB.image && metaB.image !== 'images/logo.png' ? 1 : 0;
    return hasImageB - hasImageA;
  });

  container.innerHTML = catsToShow.map(cat => {
    const meta = categoryMeta[cat] || {};
    // Use a default placeholder icon if no image is set
    const imgSrc = meta.image || 'images/logo.png';
    const searchUrl = 'products.html?strict=1&category=' + encodeURIComponent(cat);

    return `
      <a class="dynamic-category-item" href="${searchUrl}">
        <div class="img-wrapper">
          <img src="${imgSrc}" alt="${cat}" loading="lazy">
        </div>
        <span class="category-label">${cat}</span>
      </a>
    `;
  }).join('');
}
document.addEventListener('DOMContentLoaded', renderHomeDynamicCategories);

// --- Dynamic Categories Slider Arrow Logic ---
window.scrollDynamicCategories = function (direction) {
  const container = document.getElementById('homeDynamicCategoriesSlider');
  if (container) {
    // Scroll by roughly 2 items width
    const scrollAmount = 200 * direction;
    container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  }
};

// --- Manage Category Products Modal ---
let activeManageCategoryName = '';

window.openManageCategoryModal = async function(categoryName) {
  activeManageCategoryName = categoryName;
  const modal = document.getElementById('manageCategoryModal');
  const titleEl = document.getElementById('manageCategoryTitle');
  const countEl = document.getElementById('manageCategoryCount');
  const searchInput = document.getElementById('manageCategorySearch');
  
  if (!modal) return;
  
  titleEl.textContent = categoryName;
  await ensureAllProductsLoadedForAdmin();
  
  // Count how many products currently have this category
  const inCategory = products.filter(p => p.category === categoryName);
  countEl.textContent = inCategory.length;
  
  // Reset search
  if (searchInput) searchInput.value = '';
  
  filterManageCategoryProducts();
  modal.style.display = 'flex';
};

window.closeManageCategoryModal = function() {
  const modal = document.getElementById('manageCategoryModal');
  if (modal) modal.style.display = 'none';
  activeManageCategoryName = '';
};

let manageCategorySearchTimer = null;

function renderManageCategoryList(productsToRender, listEl) {
  if (productsToRender.length === 0) {
    listEl.innerHTML = '<div style="padding: 12px; color: var(--text-muted); text-align: center;">No other products available.</div>';
  } else {
    listEl.innerHTML = productsToRender.map(p => `
      <label style="display: flex; gap: 12px; align-items: center; padding: 8px; background: var(--card-bg); border-radius: 4px; border: 1px solid var(--border-color); cursor: pointer;">
        <input type="checkbox" class="manage-category-product-cb" value="${p.id}" onchange="updateManageCategorySelectedCount()" style="width: 18px; height: 18px; accent-color: var(--primary);">
        <img src="${(p.img && p.img.split('|')[0]) || 'images/logo.png'}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">
        <div style="flex: 1;">
          <div style="font-weight: 500; font-size: 0.95rem; color: var(--text-main);">${p.name}</div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">Current Category: ${p.category} | ${formatPrice(p.price)}</div>
        </div>
      </label>
    `).join('');
  }
  updateManageCategorySelectedCount();
}

window.filterManageCategoryProducts = function() {
  const listEl = document.getElementById('manageCategoryProductList');
  const searchInput = document.getElementById('manageCategorySearch');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  
  // Get all matching products including stationery using standard search logic
  let availableProducts = getFilteredProducts([], query, true);
  availableProducts = availableProducts.filter(p => p.category !== activeManageCategoryName).slice(0, 100);
  
  renderManageCategoryList(availableProducts, listEl);

  // Background Database Fetch
  if (manageCategorySearchTimer) clearTimeout(manageCategorySearchTimer);
  manageCategorySearchTimer = setTimeout(async () => {
    if (query.length >= 2 && typeof performDatabaseSearch === 'function') {
      const result = await performDatabaseSearch(query, [], false, true);
      if (result && result.length >= 0) {
        let updatedProducts = getFilteredProducts([], query, true);
        updatedProducts = updatedProducts.filter(p => p.category !== activeManageCategoryName).slice(0, 100);
        renderManageCategoryList(updatedProducts, listEl);
      }
    }
  }, 400);
};

window.updateManageCategorySelectedCount = function() {
  const checkboxes = document.querySelectorAll('.manage-category-product-cb:checked');
  const countEl = document.getElementById('manageCategorySelectedCount');
  const btn = document.getElementById('manageCategoryAssignBtn');
  
  const count = checkboxes.length;
  if (countEl) countEl.textContent = count;
  
  if (btn) {
    if (count > 0) {
      btn.disabled = false;
      btn.textContent = `Add ${count} Selected to Category`;
    } else {
      btn.disabled = true;
      btn.textContent = `Add Selected to Category`;
    }
  }
};

window.bulkAssignCategory = async function() {
  if (!activeManageCategoryName) return;
  
  const checkboxes = document.querySelectorAll('.manage-category-product-cb:checked');
  const ids = Array.from(checkboxes).map(cb => Number(cb.value));
  
  if (ids.length === 0) return;
  
  const btn = document.getElementById('manageCategoryAssignBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Assigning...';
  }
  
  try {
    await apiFetch('/admin/products/bulk-update-category', {
      method: 'POST',
      body: {
        product_ids: ids,
        category: activeManageCategoryName
      }
    });
    
    // Update local products cache
    products = products.map(p => {
      if (ids.includes(p.id)) {
        return { ...p, category: activeManageCategoryName };
      }
      return p;
    });
    saveProductsToCache(products);
    
    showToast(`Successfully assigned ${ids.length} products to ${activeManageCategoryName}`);
    
    // Refresh modal and admin lists if visible
    openManageCategoryModal(activeManageCategoryName);
    
    if (document.getElementById('adminProductsList')) {
      await renderAdminList();
    }
    
  } catch (err) {
    showToast(err.message || 'Failed to assign products');
    if (btn) {
      btn.disabled = false;
      btn.textContent = `Add ${ids.length} Selected to Category`;
    }
  }
};














