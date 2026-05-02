const fs = require('fs');

const targetFile = 's:/Machine learning/Startup/Shubham xerox/backend/frontend/assets/js/script.js';
let content = fs.readFileSync(targetFile, 'utf8');

// 1. Update initApp fetchProducts condition
content = content.replace(
  /if \(document\.getElementById\('featuredProducts'\) \|\| document\.getElementById\('allProductsContainer'\) \|\| document\.getElementById\('productDetailContainer'\)\) \{/g,
  `if (document.getElementById('featuredProducts') || document.getElementById('allProductsContainer') || document.getElementById('productDetailContainer') || document.getElementById('adminProductsList')) {`
);

content = content.replace(
  /if \(document\.getElementById\('allProductsContainer'\)\) \{/g,
  `if (document.getElementById('allProductsContainer') || document.getElementById('adminProductsList')) {`
);

// 2. Replace Admin Infinite Scroll
const oldAdminScroll = `  // --- Infinite Scroll for Admin Products (Manage Books) ---
  const adminProductsContainer = document.getElementById('adminProductsList');
  if (adminProductsContainer) {
    window.addEventListener('scroll', () => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 900) {
        if (window.adminProductsLoading || !window.adminProductsHasMore) return;
        if (!isLoadingMoreProducts) {
          isLoadingMoreProducts = true;
          loadMoreAdminProducts().finally(() => isLoadingMoreProducts = false);
        }
      }
    }, { passive: true });
  }`;

const newAdminScroll = `  // --- Infinite Scroll for Admin Products (Manage Books) ---
  const adminProductsContainer = document.getElementById('adminProductsList');
  if (adminProductsContainer) {
    window.addEventListener('scroll', () => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 900) {
        if (window.adminProductsLoading) return;
        window.adminProductsLoading = true;
        window.adminProductsCurrentPage = (window.adminProductsCurrentPage || 1) + 1;
        renderAdminList();
        window.adminProductsLoading = false;
      }
    }, { passive: true });
  }`;

content = content.replace(oldAdminScroll, newAdminScroll);

// 3. Replace admin-products init block
const oldAdminProductsInitRegex = /if \(path\.includes\('admin-products'\)\) \{[\s\S]*?renderAdminCategories\(\);\s*await renderAdminList\(\);\s*\}/g;

const newAdminProductsInit = `if (path.includes('admin-products')) {
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
    await renderAdminList();
  }`;

content = content.replace(oldAdminProductsInitRegex, newAdminProductsInit);

// 4. Replace renderAdminList
const oldRenderAdminListRegex = /async function renderAdminList\(\) \{[\s\S]*?async function renderAdminUsers/g;

const newRenderAdminList = `async function renderAdminList() {
  const container = document.getElementById('adminProductsList');
  if (!container) return;

  const searchInput = document.getElementById('adminSearchInput');
  const searchValue = searchInput ? searchInput.value : '';

  let filtered = getFilteredProducts([], searchValue);

  const limit = 20;
  const page = window.adminProductsCurrentPage || 1;
  const activeLimit = limit * page;

  if (page === 1) {
    container.innerHTML = '';
  }

  const currentBatch = filtered.slice(0, activeLimit);

  if (currentBatch.length === 0) {
    container.innerHTML = '<div style="padding: 24px; color: var(--text-muted);">No products found.</div>';
    setAdminProductsLoadMoreIndicator('hidden');
    return;
  }

  const html = currentBatch.map(p => \`
    <div class="admin-list-item">
      <div style="display:flex; gap:12px; align-items:center;">
        <img src="\${(p.img && p.img.split('|')[0]) || ''}" style="width:40px; height:40px; border-radius:4px; object-fit:cover;">
        <div>
          <strong>\${p.name}</strong> <br>
          <span style="color: var(--text-muted); font-size: 0.85rem;">\${p.category} | \${formatPrice(p.price)}</span>
        </div>
      </div>
      <div style="display: flex; gap: 8px;">
        <button class="btn btn-primary" style="padding: 6px 12px; font-size: 0.85rem;" onclick="openEditModal(\${p.id})">Edit</button>
        <button class="remove-btn" onclick="removeProduct(\${p.id}, '\${p.name ? p.name.replace(/'/g, "\\\\'") : ''}')">Delete</button>
      </div>
    </div>
  \`).join('');

  container.innerHTML = html;

  if (activeLimit >= filtered.length) {
    setAdminProductsLoadMoreIndicator('hidden');
  } else {
    setAdminProductsLoadMoreIndicator('visible');
  }
}

async function renderAdminUsers`;

content = content.replace(oldRenderAdminListRegex, newRenderAdminList);

fs.writeFileSync(targetFile, content);
console.log('script.js updated successfully!');
