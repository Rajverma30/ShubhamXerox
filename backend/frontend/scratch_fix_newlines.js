const fs = require('fs');
const path = require('path');
const dir = 's:/Machine learning/Startup/Shubham xerox/backend/frontend';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html') && f.startsWith('admin'));
files.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('Manage Stationery</a>\\n')) {
    content = content.replace(/Manage Stationery<\/a>\\n\s*<a href="admin-ebooks\.html">/g, 'Manage Stationery</a>\n            <a href="admin-ebooks.html">');
    fs.writeFileSync(filePath, content);
    console.log('Fixed \\n in ' + file);
  }
});
