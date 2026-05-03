const fs = require('fs');

const html = fs.readFileSync('S:/Machine learning/Startup/Shubham xerox/shubham xerox product.htm', 'utf8');

const titleRegex = /data-testid="standardlayout-product-title-text"><span>(.*?)<\/span>/g;
const priceRegex = /data-testid="standardlayout-selling-price-text"><span>₹(.*?)<\/span>/g;
const originalPriceRegex = /data-testid="standardlayout-compare-price-text"><span>₹(.*?)<\/span>/g;
const imgRegex = /<img alt="[^"]+"[^>]*?src="([^"]+)"[^>]*?>/g; 

// Let's do it by finding blocks! The HTML contains <div class="sb-wl-group"> ... </div> for each product.
// A simpler way is to find each "standardlayout-product-title-text" index and slice the string.

const titles = [];
let match;
while ((match = titleRegex.exec(html)) !== null) {
  titles.push({ name: match[1], index: match.index });
}

const products = [];
for (let i = 0; i < titles.length; i++) {
  const current = titles[i];
  const nextIndex = i + 1 < titles.length ? titles[i+1].index : html.length;
  const block = html.slice(current.index, nextIndex);
  
  const pMatch = /data-testid="standardlayout-selling-price-text"><span>₹(.*?)<\/span>/.exec(block);
  const price = pMatch ? parseFloat(pMatch[1].replace(/,/g, '').trim()) : 0;
  
  const opMatch = /data-testid="standardlayout-compare-price-text"><span>₹(.*?)<\/span>/.exec(block);
  const original_price = opMatch ? parseFloat(opMatch[1].replace(/,/g, '').trim()) : price;
  
  // Find img BEFORE the title
  const searchStart = Math.max(0, current.index - 5000);
  const preBlock = html.slice(searchStart, current.index);
  
  let imgUrl = "";
  const imgs = preBlock.match(/<img[^>]*?src="([^"]+)"/g);
  if (imgs && imgs.length > 0) {
      const lastImgTag = imgs[imgs.length - 1];
      const srcMatch = /src="([^"]+)"/.exec(lastImgTag);
      if (srcMatch && srcMatch[1].startsWith('http') && srcMatch[1].includes('media-amazon.com')) {
          imgUrl = srcMatch[1];
      }
  }

  products.push({
      name: current.name.trim(),
      price: price,
      original_price: original_price,
      img: imgUrl,
      category: "Book"
  });
}

fs.writeFileSync('S:/Machine learning/Startup/Shubham xerox/backend/scripts/products.json', JSON.stringify(products, null, 2));
console.log(`Exported ${products.length} products to JSON.`);
