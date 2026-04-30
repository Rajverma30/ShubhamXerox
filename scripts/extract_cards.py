import re

with open(r'S:\Machine learning\Startup\Shubham xerox\Products - 𝐌𝐏𝐏𝐒𝐂 𝐁𝐎𝐎𝐊 𝐖𝐀𝐋𝐀.html', 'r', encoding='utf-8') as f:
    text = f.read()

# Let's find chunks that look like product cards.
# Search for product titles inside standard tags
matches = re.finditer(r'<div class="product-card[^"]*">(.*?)</div>\s*</div>\s*</div>', text, re.DOTALL)
cards = []
for m in matches:
    cards.append(m.group(0))

if not cards:
    # Try another pattern, maybe the user saved it with Chrome, which alters some classes
    matches = re.finditer(r'<a href="/product/[^"]+"[^>]*>(.*?)</a>', text, re.DOTALL)
    for m in matches:
        if '₹' in m.group(0):
            cards.append(m.group(0))

with open(r'S:\Machine learning\Startup\Shubham xerox\sample_cards.txt', 'w', encoding='utf-8') as f:
    f.write(f"Found {len(cards)} cards.\n\n")
    for c in cards[:5]:
        f.write(c + "\n\n---\n\n")
