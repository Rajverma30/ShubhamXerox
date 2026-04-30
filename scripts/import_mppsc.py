import os
import re
import uuid
from supabase import create_client, Client

SUPABASE_URL = 'https://acjnktdlqupwfeolkrfk.supabase.co'
SUPABASE_KEY = 'sb_publishable_q3zriGbom5L-kdt5ILtlvw_69i5nUj5'

_orig_match = re.match
re.match = lambda p, s, *a: True if str(s).startswith('sb_') else _orig_match(p, s, *a)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
re.match = _orig_match

html_file = r'S:\Machine learning\Startup\Shubham xerox\Products - 𝐌𝐏𝐏𝐒𝐂 𝐁𝐎𝐎𝐊 𝐖𝐀𝐋𝐀.html'
files_dir = r'S:\Machine learning\Startup\Shubham xerox\Products - 𝐌𝐏𝐏𝐒𝐂 𝐁𝐎𝐎𝐊 𝐖𝐀𝐋𝐀_files'

with open(html_file, 'r', encoding='utf-8') as f:
    html = f.read()

# Extract cards
cards = []
# Try looking for <div class="product-card ..."> 
# Some cards have class="product-card ", some just "product-card".
raw_cards = re.findall(r'<div class="product-card[^>]*>(.*?)</button></div></div>', html, re.DOTALL)
for rc in raw_cards:
    cards.append('<div class="product-card">' + rc + '</button></div></div>')

print(f"Found {len(cards)} cards")

inserted = 0
for card in cards:
    try:
        # Title
        title_m = re.search(r'<h3 class="product-card-name" title="([^"]+)"', card)
        if not title_m:
            continue
        title = title_m.group(1).replace('&amp;', '&').strip()
        
        # Check if already exists in DB to prevent duplicates
        res = supabase.table('products').select('id').eq('name', title).execute()
        if res.data:
            print(f"Already exists: {title}")
            continue
        
        # Price
        price_m = re.search(r'<span class="product-card-price"><span>₹\s*([\d,]+)', card)
        price = float(price_m.group(1).replace(',', '')) if price_m else 0.0
        
        # Original Price
        mrp_m = re.search(r'<span class="product-card-mrp-price"><span>₹\s*([\d,]+)', card)
        mrp = float(mrp_m.group(1).replace(',', '')) if mrp_m else price
        
        # Image
        img_m = re.search(r'class="product-card-image main-image"[^>]*src="([^"]+)"', card)
        if not img_m:
            img_m = re.search(r'<img[^>]+src="([^"]+)"[^>]*class="product-card-image', card)
            
        img_url = ""
        if img_m:
            src = img_m.group(1)
            filename = src.split('/')[-1]
            local_path = os.path.join(files_dir, filename)
            
            if os.path.exists(local_path):
                # Upload to Supabase
                ext = filename.split('.')[-1]
                storage_filename = f"{uuid.uuid4().hex}.{ext}"
                with open(local_path, 'rb') as f:
                    supabase.storage.from_("products").upload(
                        file=f.read(),
                        path=storage_filename,
                        file_options={"content-type": f"image/{ext}"}
                    )
                img_url = supabase.storage.from_("products").get_public_url(storage_filename)
            else:
                img_url = "https://via.placeholder.com/600x800.png?text=No+Image"
                
        category = "Stationery" if "stationery" in title.lower() else "MPPSC / SSC / UPSC / IAS"
        
        product_data = {
            "name": title,
            "category": category,
            "price": price,
            "original_price": mrp,
            "img": img_url,
            "exam": "MPPSC",
            "format": "Physical Book",
            "stock": 100,
            "views": 0,
            "purchases": 0
        }
        
        res = supabase.table("products").insert(product_data).execute()
        print(f"Inserted: {title}")
        inserted += 1
    except Exception as e:
        print(f"Error processing card: {e}")

print(f"Total inserted: {inserted}")
