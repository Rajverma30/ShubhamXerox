const fs = require('fs');
const file = 's:/Machine learning/Startup/Shubham xerox/backend/frontend/assets/js/script.js';
let content = fs.readFileSync(file, 'utf8');

// Update renderAdminList
const renderAdminRegex = /let filtered = getFilteredProducts\(\[\]\, searchValue\);/g;
const newRenderAdmin = `  let filtered;
  if (window.location.pathname.includes('admin-stationery.html')) {
    filtered = getFilteredProducts(['Stationery'], searchValue);
  } else {
    // Admin products (books) implicitly excludes Stationery because we pass empty array, 
    // BUT we should verify how getFilteredProducts handles empty arrays.
    // getFilteredProducts hides 'Stationery' by default if no category is selected.
    filtered = getFilteredProducts([], searchValue);
  }`;
content = content.replace(renderAdminRegex, newRenderAdmin);

// Update backgroundRenderLoop
const bgRenderRegex = /const adminProductsContainer = document\.getElementById\('adminProductsList'\);/g;
const newBgRender = `const adminProductsContainer = document.getElementById('adminProductsList'); // used for both books and stationery since they share the same layout ID`;
content = content.replace(bgRenderRegex, newBgRender);

fs.writeFileSync(file, content);
console.log('Updated script.js to support admin-stationery');
