import re
html = open(r"s:\Machine learning\Startup\Shubham xerox\backend\_boost.html", encoding="utf-8", errors="ignore").read()
scripts = re.findall(r'src="([^"]+\.js[^"]*)"', html)
for s in scripts[:20]:
    print(s)
