const fs = require('fs');
const file = 's:/Machine learning/Startup/Shubham xerox/backend/frontend/assets/js/script.js';
let content = fs.readFileSync(file, 'utf8');

// Fix backgroundRenderLoop
const renderLoopRegex = /async function backgroundRenderLoop\(\) \{[\s\S]*?async function updateNavForUser/g;

const newRenderLoop = `async function backgroundRenderLoop() {
  const allProductsContainer = document.getElementById('allProductsContainer');
  const adminProductsContainer = document.getElementById('adminProductsList');
  if (!allProductsContainer && !adminProductsContainer) return;

  while (productsServerHasMore || backgroundRenderQueue.length > 0) {
    if (backgroundRenderQueue.length > 0) {
      // Pop one item and render it to create a real-time, one-by-one feel
      const item = backgroundRenderQueue.shift();
      products = [...products, item].sort((a, b) => (Number(b?.id) || 0) - (Number(a?.id) || 0));
      
      if (allProductsContainer) {
        renderProductsGrid('allProductsContainer', null, selectedCategories);
      }

      // 150ms delay perfectly balances speed with a visible "arriving" animation
      await new Promise(r => setTimeout(r, 150));
    } else {
      // Wait for more items to be fetched
      await new Promise(r => setTimeout(r, 100));
    }
  }
}

// --- Authentication Logic ---
async function updateNavForUser`;

content = content.replace(renderLoopRegex, newRenderLoop);

// Fix renderAdminList polling interval from 1000 to 200 for smoother 1-by-1 loading
content = content.replace(/adminProgressiveTimer = setTimeout\(renderAdminList, 1000\);/g, 'adminProgressiveTimer = setTimeout(renderAdminList, 200);');
content = content.replace(/adminProgressiveTimer = setTimeout\(\(\) => \{\n\s*renderAdminList\(\);\n\s*\}, 1000\);/g, `adminProgressiveTimer = setTimeout(() => {
        renderAdminList();
      }, 200);`);

fs.writeFileSync(file, content);
console.log('Fixed backgroundRenderLoop and polling interval!');
