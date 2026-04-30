import re
import json

with open('s:/Machine learning/Startup/Shubham xerox/parsed_categories.html', 'r', encoding='utf-8') as f:
    snippet = f.read()

categories = {}
for match in re.finditer(r'<a class="image-category-item" href="[^"]+">\s*<div class="img-wrapper">\s*<img src="([^"]+)" alt="([^"]+)" loading="lazy">\s*</div>\s*<span class="category-label">[^<]+</span>\s*</a>', snippet):
    img_src = match.group(1)
    alt = match.group(2)
    categories[alt] = img_src

with open('s:/Machine learning/Startup/Shubham xerox/parsed_json.json', 'w', encoding='utf-8') as f:
    json.dump(categories, f)

print("Done")
