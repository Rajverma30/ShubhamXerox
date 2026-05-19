import os

func = """
// --- Render Dynamic Home Categories ---
function renderHomeDynamicCategories() {
  const container = document.getElementById('homeDynamicCategoriesSlider');
  if (!container) return;
  
  // Exclude some base categories that might already be in the grid, or show all
  const excluded = ['Stationery', 'Combos'];
  const catsToShow = siteCategories.filter(c => !excluded.includes(c));
  
  container.innerHTML = catsToShow.map(cat => {
    const meta = categoryMeta[cat] || {};
    // Use a default placeholder icon if no image is set
    const imgSrc = meta.image || 'images/logo.png'; 
    const searchUrl = 'products.html?strict=true&search=' + encodeURIComponent(cat);
    
    return `
      <a class="dynamic-category-item" href="${searchUrl}">
        <div class="img-wrapper">
          <img src="${imgSrc}" alt="${cat}" loading="lazy">
        </div>
        <span class="category-label">${cat}</span>
      </a>
    `;
  }).join('');
}
document.addEventListener('DOMContentLoaded', renderHomeDynamicCategories);
"""

with open('s:/Machine learning/Startup/Shubham xerox/assets/js/script.js', 'a', encoding='utf-8') as f:
    f.write(func)

print('Function added!')
