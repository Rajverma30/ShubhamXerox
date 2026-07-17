js = open(r"s:\Machine learning\Startup\Shubham xerox\backend\_boost_main.js", encoding="utf-8", errors="ignore").read()
for term in ["location.hash", "#cart", "decodeURIComponent(window.atob", "parseCart", "getCartFromHash", "initialCartData"]:
    idx = 0
    n = 0
    while n < 2:
        p = js.find(term, idx)
        if p < 0: break
        print(f"\n=== {term} @ {p} ===")
        print(js[max(0,p-120):p+350].replace('\n',' ')[:470])
        idx = p + 5
        n += 1
