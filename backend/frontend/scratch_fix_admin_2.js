const fs = require('fs');
const file = 's:/Machine learning/Startup/Shubham xerox/backend/frontend/assets/js/script.js';
let content = fs.readFileSync(file, 'utf8');

// 1. Rewrite renderAdminList with insertAdjacentHTML
const renderAdminListRegex = /let adminProgressiveTimer = null;[\s\S]*?async function renderAdminUsers/g;

const newRenderAdminList = `let adminProgressiveTimer = null;
let adminLastRenderedCount = 0;
let adminLastSearchValue = null;

async function renderAdminList() {
  const container = document.getElementById('adminProductsList');
  if (!container) return;

  const searchInput = document.getElementById('adminSearchInput');
  const searchValue = searchInput ? searchInput.value : '';

  if (adminLastSearchValue !== searchValue) {
    container.innerHTML = '';
    adminLastRenderedCount = 0;
    adminLastSearchValue = searchValue;
  }

  let filtered = getFilteredProducts([], searchValue);

  if (filtered.length === 0) {
    if (adminLastRenderedCount === 0) {
      container.innerHTML = '<div style="padding: 24px; color: var(--text-muted);">No products found.</div>';
    }
    setAdminProductsLoadMoreIndicator('hidden');
    
    if (typeof productsServerHasMore !== 'undefined' && productsServerHasMore) {
      if (adminProgressiveTimer) clearTimeout(adminProgressiveTimer);
      adminProgressiveTimer = setTimeout(renderAdminList, 1000);
    }
    return;
  }

  if (adminLastRenderedCount === 0 && container.innerHTML.includes('No products found')) {
    container.innerHTML = '';
  }

  const itemsToAppend = filtered.slice(adminLastRenderedCount, adminLastRenderedCount + 10);

  if (itemsToAppend.length > 0) {
    const html = itemsToAppend.map(p => \`
      <div class="admin-list-item" id="admin-product-\${p.id}">
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

    container.insertAdjacentHTML('beforeend', html);
    adminLastRenderedCount += itemsToAppend.length;
  }

  if (adminProgressiveTimer) clearTimeout(adminProgressiveTimer);

  if (adminLastRenderedCount >= filtered.length) {
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
      renderAdminList();
    }, 50);
  }
}

async function renderAdminUsers`;

content = content.replace(renderAdminListRegex, newRenderAdminList);

// 2. Fix removeProduct
const oldRemove = /await apiFetch\(\`\/admin\/products\/\$\{id\}\`, \{ method: "DELETE" \}\);\s*\} catch \(err\)/g;
const newRemove = `await apiFetch(\`/admin/products/\${id}\`, { method: "DELETE" });
    const idx = products.findIndex(p => p.id === id);
    if (idx > -1) products.splice(idx, 1);
    if (typeof adminLastSearchValue !== 'undefined') adminLastSearchValue = null;
  } catch (err)`;
content = content.replace(oldRemove, newRemove);

// 3. Fix handleEditProduct
const oldEdit = /await apiFetch\(\`\/admin\/products\/\$\{id\}\`, \{ method: "PUT", body: payload \}\);\s*showToast\("Product updated successfully!"\);\s*closeEditModal\(\);\s*await renderAdminList\(\);\s*\}/g;
const newEdit = `await apiFetch(\`/admin/products/\${id}\`, { method: "PUT", body: payload });
      const idx = products.findIndex(p => p.id === id);
      if (idx > -1) products[idx] = { ...products[idx], ...payload };
      if (typeof adminLastSearchValue !== 'undefined') adminLastSearchValue = null;
      showToast("Product updated successfully!");
      closeEditModal();
      await renderAdminList();
    }`;
content = content.replace(oldEdit, newEdit);

fs.writeFileSync(file, content);
console.log('Successfully rewrote script.js!');
