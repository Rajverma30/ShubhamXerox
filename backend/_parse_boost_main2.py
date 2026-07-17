import re
js = open(r"s:\Machine learning\Startup\Shubham xerox\backend\_boost_main.js", encoding="utf-8", errors="ignore").read()
for term in ["CUSTOM", "custom", "edge.pickrr.com/cart", "aggregator", "productDetails", "seller-domain", "buyCart", "createCart"]:
    idx = 0
    n = 0
    while n < 3:
        p = js.find(term, idx)
        if p < 0:
            break
        print(f"\n=== {term} @ {p} ===")
        print(js[max(0, p - 120): p + 280].replace("\n", " "))
        idx = p + len(term)
        n += 1
