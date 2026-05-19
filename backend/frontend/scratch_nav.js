const fs = require('fs');
const path = 's:/Machine learning/Startup/Shubham xerox/backend/frontend';
const files = fs.readdirSync(path).filter(f => f.startsWith('admin') && f.endsWith('.html'));

files.forEach(f => {
  let content = fs.readFileSync(path + '/' + f, 'utf8');
  
  const startStr = '<div class="nav-links" id="adminNavLinks"';
  const startIdx = content.indexOf(startStr);
  if (startIdx === -1) return;
  
  const endStr = '<div class="nav-icons">';
  const endIdx = content.indexOf(endStr, startIdx);
  if (endIdx === -1) return;
  
  const newNav = `<div class="nav-links" id="adminNavLinks" style="display: none;">
        <a href="admin.html">Dashboard</a>
        <div class="nav-dropdown">
          <button type="button" class="nav-dropdown-trigger">Quick Add</button>
          <div class="nav-dropdown-menu">
            <a href="admin-add.html">Add Books</a>
            <a href="admin-categories.html">Add/Edit Category</a>
            <a href="admin-add-stationery.html">Add Stationery Item</a>
            <a href="admin-add-combo.html">Add Combo Deal</a>
          </div>
        </div>
        <div class="nav-dropdown">
          <button type="button" class="nav-dropdown-trigger">Quick Manage</button>
          <div class="nav-dropdown-menu">
            <a href="admin-products.html">Manage Books</a>
            <a href="admin-ebooks.html">Manage E-Books</a>
          </div>
        </div>
        <div class="nav-dropdown">
          <button type="button" class="nav-dropdown-trigger">Orders</button>
          <div class="nav-dropdown-menu">
            <a href="admin-orders.html">Book orders</a>
            <a href="admin-photocopy.html">Photocopy orders</a>
            <a href="admin-pdf-sales.html">Paid PDF orders</a>
            <a href="admin-returns.html">Returned orders</a>
          </div>
        </div>
        <a href="admin-chat.html" style="color: #44bd32; font-weight: 600;">Chat</a>
        <a href="#" onclick="logout()">Logout</a>
      </div>
      `;
      
  content = content.substring(0, startIdx) + newNav + content.substring(endIdx);
  fs.writeFileSync(path + '/' + f, content);
  console.log('Updated ' + f);
});
