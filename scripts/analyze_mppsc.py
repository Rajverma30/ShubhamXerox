import re
import json

with open('s:/Machine learning/Startup/Shubham xerox/mppsc_html.txt', 'r', encoding='utf-8') as f:
    html = f.read()

# Look for embedded JSON data or state variables
match = re.search(r'window\.__INITIAL_DATA__\s*=\s*(\{.*?\});', html)
if not match:
    match = re.search(r'window\.__clevup_state\s*=\s*(\{.*?\});', html)

if match:
    print("Found a data variable!")
else:
    print("Could not find global state object. Let's look for script tags that contain product data.")
    # Look for anything like "products":[
    products_match = re.search(r'\"products\"s*:\s*(\[.*?\])', html)
    if products_match:
        print("Found products array!")
    else:
        # Let's extract script tags and see if any of them are large JSON
        scripts = re.findall(r'<script.*?>(.*?)</script>', html, re.DOTALL)
        for i, script in enumerate(scripts):
            if '"products"' in script or 'price' in script:
                print(f"Script {i} might contain products (length {len(script)})")
                with open(f'script_{i}.js', 'w', encoding='utf-8') as sf:
                    sf.write(script)
