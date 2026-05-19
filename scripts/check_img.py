import json
import base64
from io import BytesIO
from PIL import Image

with open('default_products.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for i, p in enumerate(data[:3]):
    img_str = p.get('img', '')
    if img_str.startswith('data:image'):
        header, base64_data = img_str.split(',', 1)
        img_bytes = base64.b64decode(base64_data)
        size_kb = len(img_bytes) / 1024
        
        try:
            img = Image.open(BytesIO(img_bytes))
            print(f"Product {p['id']}: Size = {size_kb:.2f} KB, Dimensions = {img.size}, Format = {img.format}, Mode = {img.mode}")
        except Exception as e:
            print(f"Product {p['id']}: Error reading image - {e}")
