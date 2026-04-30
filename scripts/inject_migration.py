import json
import re

with open('s:/Machine learning/Startup/Shubham xerox/parsed_json.json', 'r', encoding='utf-8') as f:
    new_cats = json.load(f)

migration_code = '''
// --- Migration: Merge new publisher categories ---
const newPublishers = ''' + json.dumps(new_cats, indent=2) + ''';
let __categoriesChanged = false;
for (const [catName, catImg] of Object.entries(newPublishers)) {
  if (!siteCategories.includes(catName)) {
    siteCategories.push(catName);
    __categoriesChanged = true;
  }
  if (!categoryMeta[catName] || categoryMeta[catName].image !== catImg) {
    categoryMeta[catName] = categoryMeta[catName] || {};
    categoryMeta[catName].image = catImg;
    categoryMeta[catName].section = 'general';
    __categoriesChanged = true;
  }
}
if (__categoriesChanged) {
  localStorage.setItem('shubham_categories', JSON.stringify(siteCategories));
  localStorage.setItem('shubham_category_meta', JSON.stringify(categoryMeta));
}
// -------------------------------------------------
'''

with open('s:/Machine learning/Startup/Shubham xerox/assets/js/script.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the end of the Safe Storage Initialization try-catch block
match = re.search(r'\} catch \(e\) \{\s*console\.error\("Storage parse error:", e\);\s*\}\n', content)
if match:
    insert_pos = match.end()
    new_content = content[:insert_pos] + '\n' + migration_code + '\n' + content[insert_pos:]
    with open('s:/Machine learning/Startup/Shubham xerox/assets/js/script.js', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('Migration injected successfully!')
else:
    print('Could not find injection point.')
