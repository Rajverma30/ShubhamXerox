import re
import json

file_path = r'S:\Machine learning\Startup\Shubham xerox\Products - 𝐌𝐏𝐏𝐒𝐂 𝐁𝐎𝐎𝐊 𝐖𝐀𝐋𝐀.html'
try:
    with open(file_path, 'r', encoding='utf-8') as f:
        html = f.read()

    # Look for product cards.
    # Clevup cards typically have a div wrapping the image and info.
    # Let's find all chunks that look like a product.
    # We can search for the "product-card" or similar div, or just grab the JSON from the end of the file!
    # Because Next.js `__next_f.push` contains all the data that was loaded!
    
    # First, let's see if __next_f is present
    if '__next_f.push' in html:
        print("Found Next.js data!")
        # Let's extract all strings that look like a JSON object with title, price
        matches = re.findall(r'\\\"title\\\":\\\"(.*?)\\\".*?\\\"price\\\":(\d+)', html)
        print(f"Regex 1 found {len(matches)} matches")
        
        matches2 = re.findall(r'\"title\":\"(.*?)\".*?\"price\":([\d\.]+)', html)
        print(f"Regex 2 found {len(matches2)} matches")
        
        if matches2:
            print(list(set(matches2))[:10])
    
    # Let's also try to just parse the HTML elements directly.
    # Typically: <p class="product-title">Title</p>
    # <span class="product-price">₹100</span>
    titles = re.findall(r'class="[^"]*product[^"]*title[^"]*">(.*?)<', html)
    print(f"Found {len(titles)} HTML titles")
    if titles:
        print(titles[:10])
        
    titles2 = re.findall(r'alt="([^"]+)"[^>]*loading="lazy"', html)
    print(f"Found {len(titles2)} HTML lazy image alts")
    if titles2:
        print(titles2[:10])

except Exception as e:
    print('Error:', e)
