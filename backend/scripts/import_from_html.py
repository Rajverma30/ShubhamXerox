import os
import re
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

# Environment variables are required to connect to Supabase
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL and SUPABASE_KEY environment variables must be set.")
    exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

file_path = "S:/Machine learning/Startup/Shubham xerox/shubham xerox product.htm"

try:
    with open(file_path, "r", encoding="utf-8") as f:
        html = f.read()
except Exception as e:
    print(f"Error reading file: {e}")
    exit(1)

# More robust pattern matching to catch any product block inside the page
# We will match the product title, selling price and optional compare price.
# For image, we will find the closest preceding img tag.

# Let's find all products. A product block usually ends around the price.
# First find all title matches
title_pattern = re.compile(r'data-testid="standardlayout-product-title-text"><span>(.*?)</span></p>')
titles = list(title_pattern.finditer(html))

print(f"Found {len(titles)} titles.")

products_to_insert = []

for i, title_match in enumerate(titles):
    name = title_match.group(1).strip()
    start_pos = title_match.start()
    
    # The end of this product block is either the start of the next title, or end of HTML
    end_pos = titles[i+1].start() if i + 1 < len(titles) else len(html)
    
    # We look for prices within this block
    block_html = html[start_pos:end_pos]
    
    # Selling price
    price_match = re.search(r'data-testid="standardlayout-selling-price-text"><span>₹(.*?)</span></p>', block_html)
    if not price_match:
        print(f"Skipping product without price: {name}")
        continue
    
    price_str = price_match.group(1).replace(',', '').strip()
    try:
        price = float(price_str)
    except ValueError:
        price = 0.0

    # Compare price (original price)
    orig_price_match = re.search(r'data-testid="standardlayout-compare-price-text"><span>₹(.*?)</span></p>', block_html)
    if orig_price_match:
        orig_str = orig_price_match.group(1).replace(',', '').strip()
        try:
            original_price = float(orig_str)
        except ValueError:
            original_price = price
    else:
        original_price = price

    # Look backwards for image before the title.
    # A safe assumption is to look within a window before the title start, e.g. 5000 characters
    search_start = max(0, start_pos - 5000)
    pre_html = html[search_start:start_pos]
    
    # Find all images in pre_html
    imgs = re.findall(r'<img[^>]*?src="([^"]+)"', pre_html)
    
    img_url = ""
    if imgs:
        # Take the last image found before the title
        last_img = imgs[-1]
        # Ignore base64 svgs and local paths
        if last_img.startswith("http") and "media-amazon.com" in last_img:
            img_url = last_img
    
    # Append to list
    products_to_insert.append({
        "name": name,
        "price": price,
        "original_price": original_price,
        "img": img_url,
        "category": "Book"
    })

print(f"Prepared {len(products_to_insert)} products for insertion.")

# Bulk insert
if products_to_insert:
    # Get existing product names to avoid duplicates
    existing_res = supabase.table("products").select("name").execute()
    existing_names = {row["name"].lower() for row in existing_res.data} if existing_res.data else set()
    
    new_products = [p for p in products_to_insert if p["name"].lower() not in existing_names]
    
    print(f"Found {len(new_products)} new products to insert (avoiding {len(products_to_insert) - len(new_products)} duplicates).")
    
    if new_products:
        # Supabase API limits insertions per request, so insert in chunks of 100
        chunk_size = 100
        for i in range(0, len(new_products), chunk_size):
            chunk = new_products[i:i + chunk_size]
            res = supabase.table("products").insert(chunk).execute()
            print(f"Inserted chunk of {len(chunk)} items.")
        print("Done importing products!")
    else:
        print("No new products to import.")
else:
    print("No valid products found to insert.")
