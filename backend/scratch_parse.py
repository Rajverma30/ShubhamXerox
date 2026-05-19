import re
import json

with open("S:/Machine learning/Startup/Shubham xerox/shubham xerox product.htm", "r", encoding="utf-8") as f:
    html = f.read()

# We can split by <div class="sb-wl-flex sb-wl-flex-col sb-wl-w-full sb-wl-pt-[0.4rem] sb-wl-gap-[0.3rem]
# Actually, let's just find all product containers by looking for 'data-testid="standardlayout-product-title-text"'
# It seems each product is inside a <li class="alice-carousel__stage-item"> or just similar containers.
# Let's split by 'data-testid="standardlayout-product-title-text"' and go backwards to find the image.

# A more reliable way: find all images with alt text, then map them?
# Let's just use regex to find blocks of data. 

pattern = re.compile(
    r'<img alt="([^"]+)"[^>]*?src="([^"]+)"[^>]*?style="position: absolute; height: 100%; width: 100%; inset: 0px; object-fit: cover; color: transparent;"[^>]*?>.*?'
    r'data-testid="standardlayout-product-title-text"><span>(.*?)</span></p>.*?'
    r'data-testid="standardlayout-selling-price-text"><span>₹(.*?)</span></p>',
    re.DOTALL
)

matches = pattern.findall(html)
print(f"Found {len(matches)} products with full pattern")

products = []
for m in matches:
    alt, img, title, price = m
    price = float(price.replace(',', '').strip())
    products.append({
        "name": title.strip(),
        "img": img,
        "price": price,
        "original_price": price * 2, # Fallback, will try to find compare price if exists
        "category": "Book" # Default category
    })

for p in products[:5]:
    print(p)
