const fs = require('fs');
const file = 's:/Machine learning/Startup/Shubham xerox/backend/frontend/assets/js/script.js';
let content = fs.readFileSync(file, 'utf8');

// The exact backgroundRenderLoop function in the restored script.js is:
const targetToReplace = `async function backgroundRenderLoop() {
  const container = document.getElementById('allProductsContainer');
  if (!container) return;

  while (productsServerHasMore || backgroundRenderQueue.length > 0) {
    if (backgroundRenderQueue.length > 0) {
      // Pop one item and render it to create a real-time, one-by-one feel
      const item = backgroundRenderQueue.shift();
      products = [...products, item].sort((a, b) => (Number(b?.id) || 0) - (Number(a?.id) || 0));
      renderProductsGrid('allProductsContainer', null, selectedCategories);

      // 150ms delay perfectly balances speed with a visible "arriving" animation
      await new Promise(r => setTimeout(r, 150));
    } else {
      // Wait for more items to be fetched
      await new Promise(r => setTimeout(r, 100));
    }
  }
}`;

const replacement = `async function backgroundRenderLoop() {
  const allProductsContainer = document.getElementById('allProductsContainer');
  const adminProductsContainer = document.getElementById('adminProductsList');
  if (!allProductsContainer && !adminProductsContainer) return;

  while (productsServerHasMore || backgroundRenderQueue.length > 0) {
    if (backgroundRenderQueue.length > 0) {
      const item = backgroundRenderQueue.shift();
      products = [...products, item].sort((a, b) => (Number(b?.id) || 0) - (Number(a?.id) || 0));
      
      if (allProductsContainer) {
        renderProductsGrid('allProductsContainer', null, selectedCategories);
      }

      await new Promise(r => setTimeout(r, 150));
    } else {
      await new Promise(r => setTimeout(r, 100));
    }
  }
}`;

if (content.includes(targetToReplace)) {
  content = content.replace(targetToReplace, replacement);
  fs.writeFileSync(file, content);
  console.log("Successfully replaced backgroundRenderLoop!");
} else {
  console.log("Could not find the target string!");
}
