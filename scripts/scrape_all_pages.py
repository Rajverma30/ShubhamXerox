import os
import re
import json
from bs4 import BeautifulSoup
from PIL import Image
import uuid

# Define paths
HTML_DIR = r"s:\Machine learning\Startup\Shubham xerox\HTML pages"
FRONTEND_DIR = r"s:\Machine learning\Startup\Shubham xerox\backend\frontend"
IMAGES_DIR = os.path.join(FRONTEND_DIR, "images", "books")
PRODUCTS_JSON = os.path.join(FRONTEND_DIR, "products.json")

# Ensure images directory exists
os.makedirs(IMAGES_DIR, exist_ok=True)

def compress_image(input_path, output_path):
    try:
        with Image.open(input_path) as img:
            # Convert to RGB if it's not (e.g. RGBA or P)
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            
            # Resize if too large
            max_size = (800, 800)
            img.thumbnail(max_size, Image.Resampling.LANCZOS)
            
            # Save as webp for best compression
            img.save(output_path, "WEBP", quality=75)
            return True
    except Exception as e:
        print(f"Error compressing {input_path}: {e}")
        return False

def scrape_pages():
    all_products = []
    seen_titles = set()
    next_id = 1
    
    # Iterate through all HTML files
    for filename in os.listdir(HTML_DIR):
        if not filename.endswith(".html"):
            continue
            
        filepath = os.path.join(HTML_DIR, filename)
        print(f"Processing: {filename.encode('ascii', 'replace').decode('ascii')}")
        
        with open(filepath, 'r', encoding='utf-8') as f:
            soup = BeautifulSoup(f, 'html.parser')
            
        cards = soup.find_all('div', class_='product-card')
        
        for card in cards:
            try:
                # Extract Title
                title_elem = card.find('h3', class_='product-card-name')
                if not title_elem:
                    continue
                title = title_elem.get('title') or title_elem.text.strip()
                
                # Prevent duplicates
                if title in seen_titles:
                    continue
                
                # Extract Price
                price_elem = card.find('span', class_='product-card-price')
                price_text = price_elem.text if price_elem else "0"
                price_match = re.search(r'[\d,]+', price_text)
                price = float(price_match.group(0).replace(',', '')) if price_match else 0.0
                
                # Extract MRP
                mrp_elem = card.find('span', class_='product-card-mrp-price')
                mrp_text = mrp_elem.text if mrp_elem else price_text
                mrp_match = re.search(r'[\d,]+', mrp_text)
                mrp = float(mrp_match.group(0).replace(',', '')) if mrp_match else price
                
                # Extract Category (rough heuristic based on existing data)
                category = "Stationery" if "stationery" in title.lower() else "MPPSC / SSC / UPSC / IAS"
                
                # Extract Image
                img_elem = card.find('img', class_='product-card-image')
                img_url = ""
                if img_elem and img_elem.has_attr('src'):
                    src = img_elem['src']
                    
                    # Handle local image resolution
                    if src.startswith('./'):
                        # Example: ./Products - MPPSC..._files/SKU...jpg
                        # It's relative to the HTML file's directory
                        relative_path = src[2:] # remove ./
                        # Some path encoding might be needed
                        import urllib.parse
                        decoded_path = urllib.parse.unquote(relative_path)
                        local_img_path = os.path.join(HTML_DIR, decoded_path)
                        
                        if os.path.exists(local_img_path):
                            new_filename = f"book_{uuid.uuid4().hex[:8]}.webp"
                            output_path = os.path.join(IMAGES_DIR, new_filename)
                            if compress_image(local_img_path, output_path):
                                img_url = f"images/books/{new_filename}"
                    elif src.startswith('http'):
                        # It's an external URL, just keep it for now or we could download it
                        img_url = src
                
                if not img_url:
                    img_url = "https://via.placeholder.com/600x800.png?text=No+Image"
                
                product = {
                    "id": next_id,
                    "name": title,
                    "category": category,
                    "price": price,
                    "original_price": mrp,
                    "img": img_url,
                    "exam": "MPPSC" if "mppsc" in title.lower() else "UPSC",
                    "format": "Physical Book",
                    "stock": 100,
                    "views": 0,
                    "purchases": 0
                }
                
                all_products.append(product)
                seen_titles.add(title)
                next_id += 1
                
            except Exception as e:
                print(f"Error parsing a card: {e}")
                
    # Save to JSON
    with open(PRODUCTS_JSON, 'w', encoding='utf-8') as f:
        json.dump(all_products, f, indent=2, ensure_ascii=False)
        
    print(f"Successfully scraped {len(all_products)} unique products and saved to {PRODUCTS_JSON}")

if __name__ == "__main__":
    scrape_pages()
