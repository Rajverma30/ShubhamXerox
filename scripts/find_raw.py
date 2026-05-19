import json

with open('s:/Machine learning/Startup/Shubham xerox/mppsc_html.txt', 'r', encoding='utf-8') as f:
    text = f.read()

# The data is in __next_f chunks. Let's just find the substring "title"
import re
titles = re.findall(r'\"title\":\"(.*?)\"', text)
prices = re.findall(r'\"price\":(\d+)', text)
print(f"Found {len(titles)} titles and {len(prices)} prices.")
if titles:
    print(list(set(titles))[:20])
