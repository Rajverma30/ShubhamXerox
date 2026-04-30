import re

with open('s:/Machine learning/Startup/Shubham xerox/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# First, remove the 'Top Publishers' section I added previously
content = re.sub(
    r'<section class="section" style="padding-top: 32px; padding-bottom: 0;">\n  <div class="container">\n    <h2 class="section-title" style="margin-bottom: 16px;">Top Publishers</h2>\n    <div class="image-categories-container">.*?</div>\n  </div>\n</section>\n\n  <!-- Shop By Category -->',
    '  <!-- Shop By Category -->',
    content,
    flags=re.DOTALL
)

# Read the snippet again
with open('s:/Machine learning/Startup/Shubham xerox/parsed_categories.html', 'r', encoding='utf-8') as f:
    snippet = f.read()

snippet_items = re.search(r'<div class="image-categories-container">\n(.*?)    </div>', snippet, re.DOTALL).group(1)

grid_items = ''
for match in re.finditer(r'<a class="image-category-item" href="([^"]+)">\s*<div class="img-wrapper">\s*<img src="([^"]+)" alt="([^"]+)" loading="lazy">\s*</div>\s*<span class="category-label">[^<]+</span>\s*</a>', snippet_items):
    href = match.group(1)
    img_src = match.group(2)
    alt = match.group(3)
    grid_items += f'''        <a class="category-tile" href="{href}" style="--tile-accent:#3b82f6;">
          <div class="category-tile-body" style="align-items: center;">
            <div style="width:60px; height:60px; border-radius:50%; overflow:hidden; margin-bottom:12px; border: 2px solid var(--border-color); display: flex; align-items: center; justify-content: center; padding: 2px;">
              <img src="{img_src}" alt="{alt}" style="max-width:100%; max-height:100%; border-radius: 50%; object-fit:contain;" loading="lazy">
            </div>
            <div class="category-tile-title" style="text-align: center; font-size: 0.85rem; line-height: 1.3; margin-top: 0;">{alt}</div>
          </div>
        </a>\n'''

content = content.replace('      </div>\n\n      <div style="text-align: center; margin-top: 32px;">', grid_items + '      </div>\n\n      <div style="text-align: center; margin-top: 32px;">')

with open('s:/Machine learning/Startup/Shubham xerox/index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print('Injected as grid items!')
