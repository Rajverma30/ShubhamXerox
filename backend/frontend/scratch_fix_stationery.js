const fs = require('fs');

const adminProductsHtml = fs.readFileSync('s:/Machine learning/Startup/Shubham xerox/backend/frontend/admin-products.html', 'utf8');

let adminStationeryHtml = adminProductsHtml
  .replace('<title>Manage Books - Shubham Xerox</title>', '<title>Manage Stationery - Shubham Xerox</title>')
  .replace('<h1 class="section-title" style="margin: 0; font-size: 1.8rem;">Manage Books</h1>', '<h1 class="section-title" style="margin: 0; font-size: 1.8rem;">Manage Stationery</h1>')
  .replace('<p style="color: var(--text-muted); margin-top: 4px;">View, edit, search, and delete books.</p>', '<p style="color: var(--text-muted); margin-top: 4px;">View, edit, search, and delete stationery items.</p>')
  .replace('placeholder="Search books by name, exam, category..."', 'placeholder="Search stationery by name, category..."');

fs.writeFileSync('s:/Machine learning/Startup/Shubham xerox/backend/frontend/admin-stationery.html', adminStationeryHtml);
console.log('Recreated admin-stationery.html correctly.');
