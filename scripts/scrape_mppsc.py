import urllib.request
import json
import re

url = "https://www.mppscbookwala.com/products"
headers = {'User-Agent': 'Mozilla/5.0'}
req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req) as response:
        html = response.read().decode('utf-8')
        print("HTML length:", len(html))
        
        # This website uses Clevup (I saw 'img.clevup.in' earlier for the categories).
        # Clevup usually stores page data in a NEXT_DATA script or similar state block.
        # Let's try to extract JSON from window.__INITIAL_STATE__ or __NEXT_DATA__
        
        state_match = re.search(r'window\.__INITIAL_STATE__\s*=\s*(\{.*?\});', html)
        next_match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html)
        
        if next_match:
            data = json.loads(next_match.group(1))
            with open('mppsc_data.json', 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
            print("Saved Next.js data to mppsc_data.json")
        elif state_match:
            data = json.loads(state_match.group(1))
            with open('mppsc_data.json', 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
            print("Saved INITIAL_STATE data to mppsc_data.json")
        else:
            print("No JSON state found in HTML.")
            with open('mppsc_html.txt', 'w', encoding='utf-8') as f:
                f.write(html)
except Exception as e:
    print("Error:", e)
