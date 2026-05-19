const fs = require('fs');

const file = 's:/Machine learning/Startup/Shubham xerox/backend/frontend/assets/js/script.js';
let content = fs.readFileSync(file, 'utf8');

const renderAdminListRegex = /async function renderAdminList\(\) \{[\s\S]*?async function renderAdminUsers/g;

const newRenderAdminList = `let adminProgressiveTimer = null;

async function renderAdminList() {
  const container = document.getElementById('adminProductsList');
  if (!container) return;

  const searchInput = document.getElementById('adminSearchInput');
  const searchValue = searchInput ? searchInput.value : '';

  let filtered = getFilteredProducts([], searchValue);

  const limit = 10;
  const page = window.adminProductsCurrentPage || 1;
  const activeLimit = limit * page;

  if (page === 1) {
    container.innerHTML = '';
    if (adminProgressiveTimer) clearTimeout(adminProgressiveTimer);
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
    if (typeof productsServerHasMore !== 'undefined' && productsServerHasMore) {
      setAdminProductsLoadMoreIndicator('loading');
      adminProgressiveTimer = setTimeout(() => {
        renderAdminList();
      }, 1000);
    } else {
      setAdminProductsLoadMoreIndicator('end');
    }
  } else {
    setAdminProductsLoadMoreIndicator('loading');
    adminProgressiveTimer = setTimeout(() => {
      window.adminProductsCurrentPage++;
      renderAdminList();
    }, 150);
  }
}

async function renderAdminUsers`;

if (content.match(renderAdminListRegex)) {
  content = content.replace(renderAdminListRegex, newRenderAdminList);
  fs.writeFileSync(file, content);
  console.log('Successfully rewrote renderAdminList for progressive loading.');
} else {
  console.log('Regex did not match.');
}
