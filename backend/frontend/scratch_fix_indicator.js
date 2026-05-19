const fs = require('fs');
const file = 's:/Machine learning/Startup/Shubham xerox/backend/frontend/assets/js/script.js';
let content = fs.readFileSync(file, 'utf8');

// Fix the loading indicator twitching
const indRegex = /function setAdminProductsLoadMoreIndicator\(state = 'hidden'\) \{[\s\S]*?if \(!indicator\) return;[\s\S]*?if \(state === 'loading'\) \{/g;
const newInd = `function setAdminProductsLoadMoreIndicator(state = 'hidden') {
  const indicator = document.getElementById('adminProductsLoadMoreIndicator');
  if (!indicator) return;
  if (indicator.dataset.state === state) return;
  indicator.dataset.state = state;
  if (state === 'loading') {`;

content = content.replace(indRegex, newInd);

// Let's also add console logs to renderAdminList to see why it gets stuck!
const renderAdminRegex = /const itemsToAppend = filtered\.slice\(adminLastRenderedCount, adminLastRenderedCount \+ 10\);/g;
const newRenderAdmin = `const itemsToAppend = filtered.slice(adminLastRenderedCount, adminLastRenderedCount + 10);
  console.log('renderAdminList:', { adminLastRenderedCount, filteredLen: filtered.length, itemsToAppendLen: itemsToAppend.length, queueLen: backgroundRenderQueue.length, productsLen: products.length });`;

content = content.replace(renderAdminRegex, newRenderAdmin);

fs.writeFileSync(file, content);
console.log('Fixed indicator and added logs.');
