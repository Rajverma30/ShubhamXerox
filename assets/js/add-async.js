const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.endsWith('.html'));

files.forEach(f => {
  let c = fs.readFileSync(f, 'utf8');
  let before = c.length;
  c = c.replace('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>', '<script async src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>');
  fs.writeFileSync(f, c);
  console.log(`Processed ${f}: changed=${before !== c.length}`);
});
