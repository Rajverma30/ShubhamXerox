const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.endsWith('.html'));

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes('supabase-js')) {
    content = content.replace('<script src="script.js"></script>', '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>\n  <script src="script.js"></script>');
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated CDN in ${file}`);
  }
});
