import re
import json
import glob
from bs4 import BeautifulSoup

def extract_products(html_path):
    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()
    
    soup = BeautifulSoup(html, 'html.parser')
    products = []
    
    # Try to find product cards (assuming typical structure from previous parsing)
    cards = soup.select('.product-card, .product-item, .card, li.product')
    for card in cards:
        name_elem = card.select_one('.product-title, .title, h3, h2, .woocommerce-loop-product__title')
        price_elem = card.select_one('.price .amount, .price, .woocommerce-Price-amount')
        img_elem = card.select_one('img')
        
        if not name_elem:
            continue
            
        name = name_elem.get_text(strip=True)
        
        price_text = price_elem.get_text(strip=True) if price_elem else '0'
        price_match = re.search(r'[\d,]+(?:\.\d+)?', price_text.replace(',', ''))
        price = float(price_match.group(0)) if price_match else 0.0
        
        img = img_elem.get('src') or img_elem.get('data-src') if img_elem else ''
        
        products.append({
            'name': name,
            'price': price,
            'original_price': price,
            'img': img,
            'category': 'MPPSC', # Default based on filename
            'exam': 'MPPSC'
        })
    return products

products1 = extract_products(r'S:\Machine learning\Startup\Shubham xerox\HTML pages\Products - ?????????? ???????? ????????.html')
products2 = extract_products(r's:\Machine learning\Startup\Shubham xerox\HTML pages\MPPSC Books 2025 – Prelims & Mains _ Hindi & English _ B3 Books – Page 12 – B3books.html')

all_extracted = products1 + products2
print(f"Extracted {len(all_extracted)} products.")
print(json.dumps(all_extracted[:2], indent=2))
