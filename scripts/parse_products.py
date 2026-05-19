import json
import re

with open('s:/Machine learning/Startup/Shubham xerox/mppsc_html.txt', 'r', encoding='utf-8') as f:
    html = f.read()

# Let's extract any valid json-like structures that have product data
matches = re.findall(r'\{[^{]*?"title":"[^"]+".*?"price":[\d.]+,.*?"media":\[.*?\].*?\}', html)
print(f"Found {len(matches)} generic JSON-like products!")

if matches:
    # Let's try to parse the first few
    parsed = []
    for m in matches:
        # It's inside a JS string array, so it might have escaped quotes
        try:
            m_clean = m.replace('\\"', '"')
            data = json.loads(m_clean)
            parsed.append(data)
        except:
            pass
    print(f"Successfully parsed {len(parsed)} products!")
    if parsed:
        print("Sample product:", parsed[0].get('title'))
        
        with open('s:/Machine learning/Startup/Shubham xerox/mppsc_parsed.json', 'w', encoding='utf-8') as f:
            json.dump(parsed, f, indent=2)
else:
    # Try another pattern, maybe it's completely escaped
    matches = re.findall(r'\\{\\\"id\\\":\d+.*?\\\"title\\\":\\\"(.*?)\\\"', html)
    print(f"Found {len(matches)} heavily escaped products: {matches[:3]}")

