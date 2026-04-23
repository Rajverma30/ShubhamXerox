import json
import base64
import io
import urllib.request
from PIL import Image

url = "https://acjnktdlqupwfeolkrfk.supabase.co"
key = "sb_publishable_q3zriGbom5L-kdt5ILtlvw_69i5nUj5"

def api_get(path):
    req = urllib.request.Request(f"{url}{path}")
    req.add_header('apikey', key)
    res = urllib.request.urlopen(req, timeout=30)
    return json.loads(res.read())

def api_patch(path, payload):
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(f"{url}{path}", data=data, method='PATCH')
    req.add_header('apikey', key)
    req.add_header('Content-Type', 'application/json')
    req.add_header('Prefer', 'return=minimal')
    res = urllib.request.urlopen(req, timeout=30)
    return res.status

print("Fetching product IDs...")
products = api_get("/rest/v1/products?select=id,name")

print(f"Found {len(products)} products")

for p in products:
    print(f"Fetching details for product {p['id']} - {p['name']}...")
    try:
        full_p_array = api_get(f"/rest/v1/products?select=*&id=eq.{p['id']}")
        if not full_p_array:
            continue
        full_p = full_p_array[0]
        
        img_data = full_p.get('img')
        if img_data and img_data.startswith('data:image'):
            print(f"  -> Compressing image...")
            # Handle multiple images joined by '|'
            images = img_data.split('|')
            new_images = []
            for img_str in images:
                if not img_str.startswith('data:image'):
                    new_images.append(img_str)
                    continue
                    
                header, encoded = img_str.split(",", 1)
                img_bytes = base64.b64decode(encoded)
                img = Image.open(io.BytesIO(img_bytes))
                
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                    
                img.thumbnail((800, 800))
                
                out = io.BytesIO()
                img.save(out, format="JPEG", quality=60)
                compressed_bytes = out.getvalue()
                
                new_base64 = "data:image/jpeg;base64," + base64.b64encode(compressed_bytes).decode('utf-8')
                new_images.append(new_base64)
                
            final_img_data = '|'.join(new_images)
            print(f"  -> Compressed {len(img_data)} chars to {len(final_img_data)} chars")
            
            if len(final_img_data) < len(img_data):
                api_patch(f"/rest/v1/products?id=eq.{full_p['id']}", {"img": final_img_data})
                print("  -> Updated in database.")
        else:
            print(f"  -> No base64 image or already a URL.")
    except Exception as e:
        print(f"  -> Failed: {e}")

print("Compression complete!")
