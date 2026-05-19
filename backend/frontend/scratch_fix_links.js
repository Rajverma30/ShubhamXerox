const fs = require('fs');
const glob = require('glob'); // Note: if glob is not installed, we can just read the directory.
const path = require('path');

const dir = 's:/Machine learning/Startup/Shubham xerox/backend/frontend';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html') && f.startsWith('admin'));

files.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  if (content.includes('admin-ebooks.html">Manage E-Books</a>')) {
    // Only add if it doesn't already exist
    if (!content.includes('admin-stationery.html">Manage Stationery</a>')) {
      content = content.replace(
        '<a href="admin-ebooks.html">Manage E-Books</a>',
        '<a href="admin-stationery.html">Manage Stationery</a>\n            <a href="admin-ebooks.html">Manage E-Books</a>'
      );
      fs.writeFileSync(filePath, content);
      console.log('Updated ' + file);
    }
  }
});
