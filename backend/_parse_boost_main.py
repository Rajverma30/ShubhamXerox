import re
js = open(r"s:\Machine learning\Startup\Shubham xerox\backend\_boost_main.js", encoding="utf-8", errors="ignore").read()
print("size", len(js))
for term in ["productDetails", "pageType", "seller-domain", "CUSTOM", "checkout", "gateway.pickrr", "edge.pickrr", "promotion/api", "HEADLESS"]:
    print(term, js.count(term))
for pat in [r"pageType[=:][\"']([A-Za-z]+)", r"productDetails", r"seller-domain", r"gateway\.pickrr\.com/[a-zA-Z0-9/_-]+", r"edge\.pickrr\.com/[a-zA-Z0-9/_-]+"]:
    found = sorted(set(re.findall(pat, js)))
    print("\nPAT", pat, "count", len(found))
    for s in found[:15]:
        print(" ", s[:200])
