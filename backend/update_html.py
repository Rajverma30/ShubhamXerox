import glob
import os

files = glob.glob(r's:\Machine learning\Startup\Shubham xerox\backend\frontend\*.html')
count = 0
for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if '/config.js' not in content:
        content = content.replace(
            '<script defer src="assets/js/script.js', 
            '<script src="/config.js"></script>\n  <script defer src="assets/js/script.js'
        )
        content = content.replace(
            '<script src="assets/js/script.js', 
            '<script src="/config.js"></script>\n  <script src="assets/js/script.js'
        )
        with open(file, 'w', encoding='utf-8') as f:
            f.write(content)
        count += 1

print(f'Updated {count} HTML files.')
