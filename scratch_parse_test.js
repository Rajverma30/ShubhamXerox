const fs = require('fs');

const html = fs.readFileSync('S:/Machine learning/Startup/Shubham xerox/shubham xerox product.htm', 'utf8');

// Look for product containers
// For example, from the snippet:
// <p ... data-testid="standardlayout-product-title-text"><span>Aakar Ias - MPPSC PRE 2026 TEST UNIT 1-5</span></p>
// <p ... data-testid="standardlayout-selling-price-text"><span>₹80</span></p>

const products = [];

// Simple regex extraction
const titleRegex = /data-testid="standardlayout-product-title-text"><span>(.*?)<\/span>/g;
const priceRegex = /data-testid="standardlayout-selling-price-text"><span>₹(.*?)<\/span>/g;
const originalPriceRegex = /data-testid="standardlayout-compare-price-text"><span>₹(.*?)<\/span>/g;
const imgRegex = /src="(.*?)" style="position: absolute; height: 100%; width: 100%; inset: 0px; object-fit: cover; color: transparent;"/g;

let titleMatch;
let titles = [];
while ((titleMatch = titleRegex.exec(html)) !== null) {
  titles.push(titleMatch[1].trim());
}

let priceMatch;
let prices = [];
while ((priceMatch = priceRegex.exec(html)) !== null) {
  prices.push(priceMatch[1].replace(/,/g, '').trim());
}

let origPriceMatch;
let origPrices = [];
while ((origPriceMatch = originalPriceRegex.exec(html)) !== null) {
  origPrices.push(origPriceMatch[1].replace(/,/g, '').trim());
}

let imgMatch;
let imgs = [];
while ((imgMatch = imgRegex.exec(html)) !== null) {
  imgs.push(imgMatch[1].trim());
}

console.log(`Found ${titles.length} titles, ${prices.length} prices, ${origPrices.length} original prices, ${imgs.length} images`);

for (let i = 0; i < Math.min(5, titles.length); i++) {
  console.log(`Product ${i + 1}: ${titles[i]} | Price: ${prices[i]} | Orig: ${origPrices[i]} | Img: ${imgs[i]}`);
}
