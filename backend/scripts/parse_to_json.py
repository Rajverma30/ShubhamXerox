import json
import re

file_path = "S:/Machine learning/Startup/Shubham xerox/shubham xerox product.htm"

with open(file_path, "r", encoding="utf-8") as f:
    html = f.read()

title_pattern = re.compile(r'data-testid="standardlayout-product-title-text"><span>(.*?)</span></p>')
titles = list(title_pattern.finditer(html))

products_to_insert = []

for i, title_match in enumerate(titles):
    name = title_match.group(1).strip()
    start_pos = title_match.start()
    
    end_pos = titles[i+1].start() if i + 1 < len(titles) else len(html)
    block_html = html[start_pos:end_pos]
    
    price_match = re.search(r'data-testid="standardlayout-selling-price-text"><span>₹(.*?)</span></p>', block_html)
    if not price_match:
        continue
    
    price_str = price_match.group(1).replace(',', '').strip()
    try:
        price = float(price_str)
    except ValueError:
        price = 0.0

    orig_price_match = re.search(r'data-testid="standardlayout-compare-price-text"><span>₹(.*?)</span></p>', block_html)
    if orig_price_match:
        orig_str = orig_price_match.group(1).replace(',', '').strip()
        try:
            original_price = float(orig_str)
        except ValueError:
            original_price = price
    else:
        original_price = price

    search_start = max(0, start_pos - 5000)
    pre_html = html[search_start:start_pos]
    
    imgs = re.findall(r'<img[^>]*?src="([^"]+)"', pre_html)
    
    img_url = ""
    if imgs:
        last_img = imgs[-1]
        if last_img.startswith("http") and "media-amazon.com" in last_img:
            img_url = last_img
    
    products_to_insert.append({
        "name": name,
        "price": price,
        "original_price": original_price,
        "img": img_url,
        "category": "Book"
    })

with open("S:/Machine learning/Startup/Shubham xerox/backend/scripts/products.json", "w", encoding="utf-8") as f:
    json.dump(products_to_insert, f)

print(f"Exported {len(products_to_insert)} products to JSON.")
