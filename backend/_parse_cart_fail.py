import re
js = open(r"s:\Machine learning\Startup\Shubham xerox\backend\_boost_main.js", encoding="utf-8", errors="ignore").read()
for term in ["CART_INITIATE_FAILURE", "CART_SERVICE", "cart-service", "Something went wrong", "capital-api", "initiateCart", "createCart"]:
    idx = 0
    n = 0
    while n < 2:
        p = js.find(term, idx)
        if p < 0: break
        print(f"\n=== {term} @ {p} ===")
        print(js[max(0,p-200):p+500].replace('\n',' ')[:700])
        idx = p + len(term)
        n += 1
