import re
js = open(r"s:\Machine learning\Startup\Shubham xerox\backend\_boost_main.js", encoding="utf-8", errors="ignore").read()

terms = [
    "productDetails",
    "isFastrrProduct",
    "CUSTOM",
    "CART_INITIATE",
    "cart-service",
    "capital-api",
    "SELLER_CONFIG",
    "atob",
    "decodeURIComponent",
    "headless-storage",
    "Taking you to checkout",
    "createCart",
    "buyCart",
    "popupType",
    "HeadlessCheckout",
]
for term in terms:
    idx = 0
    n = 0
    while n < 2:
        p = js.find(term, idx)
        if p < 0:
            break
        print(f"\n=== {term} @ {p} ===")
        print(js[max(0, p - 150): p + 350].replace("\n", " "))
        idx = p + len(term)
        n += 1

# extract API path strings
paths = set(re.findall(r'["\'](/api/ve1/[^"\']+)["\']', js))
paths |= set(re.findall(r'["\'](api/ve1/[^"\']+)["\']', js))
print("\n=== API paths ===")
for p in sorted(paths)[:40]:
    print(p)
