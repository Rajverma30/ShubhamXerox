const fs = require('fs');
const DEFAULT_BOOK_SVG = \data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='260' viewBox='0 0 200 260'><rect width='200' height='260' fill='%23f3f4f6'/><path d='M40 40h120v180H40z' fill='%23e5e7eb'/><rect x='60' y='60' width='80' height='15' fill='%23d1d5db' rx='4'/><rect x='60' y='90' width='60' height='15' fill='%23d1d5db' rx='4'/><rect x='60' y='120' width='70' height='15' fill='%23d1d5db' rx='4'/></svg>\;

const product = {
  id: 1,
  name: '4 book combo r',
  price: 510.99,
  original_price: 921.00,
  category: 'Combos',
  img: '',
  desc: 'COMBO_DETAILS:{\"combo_books\":[{\"id\":-1,\"name\":\"Indian Economy + MP Economy | Updated Data, English Medium\",\"qty\":1,\"price\":266,\"img\":\"images/books/book_14b91d52.webp\"},{\"id\":-2,\"name\":\"MPPSC Prelims 2026 Unit-5 Constitutional System of Madhya Pradesh | English Medium | Indian Polity & MP Polity | State Services Preliminary Examination)\",\"qty\":1,\"price\":230,\"img\":\"images/books/book_0ca350a4.webp\"}]}'
};

const products = [];

function createProductCard(product) {
  const fixImgPath = (imgString) => {
    let str = imgString || '';
    if (str.includes('./MPPSC') || str.includes('./Products -')) {
      return str.split('|').map(path => {
        if (path.includes('./')) {
          const parts = path.split('/');
          return 'images/books_new/' + parts[parts.length - 1];
        }
        return path;
      }).join('|');
    }
    return str;
  };

  let imgStr = fixImgPath(product.img);
  const images = imgStr ? imgStr.split('|').filter(i => i.trim() !== '') : [];
  const hasDiscount = product.original_price && product.original_price > product.price;
  const discountPct = hasDiscount
    ? Math.round(((product.original_price - product.price) / product.original_price) * 100)
    : 0;
  
  let imagesHtml = '';
  const isCombo = (product.category || '').toLowerCase() === 'combos';
  let comboImages = [];
  
  if (isCombo && (!images[0] || images[0].includes('unsplash.com'))) {
    if (product.desc && product.desc.startsWith('COMBO_DETAILS:')) {
      try {
        const details = JSON.parse(product.desc.replace('COMBO_DETAILS:', ''));
        if (details.combo_books && details.combo_books.length > 0) {
          details.combo_books.forEach(b => {
            const firstImg = b.img ? fixImgPath(b.img).split('|')[0] : null;
            if (firstImg) {
              comboImages.push(firstImg);
            } else {
              const matched = products.find(p => Number(p.id) === Number(b.id));
              if (matched && matched.img) {
                const matchedImg = fixImgPath(matched.img).split('|')[0];
                if (matchedImg) comboImages.push(matchedImg);
              }
            }
          });
        }
      } catch(e) {
        const imgRegex = /"img":"([^"]+)"/g;
        let match;
        while ((match = imgRegex.exec(product.desc)) !== null) {
          const matchedImg = fixImgPath(match[1]).split('|')[0];
          if (matchedImg) comboImages.push(matchedImg);
        }
      }
    }
    
    if (comboImages.length > 1) {
      const gridImages = comboImages.slice(0, 4);
      imagesHtml = \<div class="combo-image-grid">\;
      gridImages.forEach(img => {
        imagesHtml += \<img src="\" alt="\" loading="lazy" decoding="async" fetchpriority="low">\;
      });
      imagesHtml += \</div>\;
    } else {
      const imgSrc = comboImages[0] || DEFAULT_BOOK_SVG;
      imagesHtml = \<img src="\" alt="\" width="320" height="420" loading="lazy" decoding="async" fetchpriority="low">\;
    }
  } else {
    const imgSrc = images[0] || DEFAULT_BOOK_SVG;
    imagesHtml = \<img src="\" alt="\" width="320" height="420" loading="lazy" decoding="async" fetchpriority="low">\;
  }

  console.log('Images HTML:', imagesHtml);
}

createProductCard(product);
