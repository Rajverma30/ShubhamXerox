js = open(r"s:\Machine learning\Startup\Shubham xerox\backend\_boost_main.js", encoding="utf-8", errors="ignore").read()

# Find productDetails decode / cart initiate body
for term in ["eddProductDetails", "product_details", "fastrrProduct", "channel", "SHOPIFY", "headlessCheckout", "CART_INITIATE", "initiateCart", "cartInitiate"]:
    p = js.find(term)
    if p >= 0:
        print(f"\n=== {term} first @ {p} ===")
        print(js[max(0,p-100):p+500])

# Find where Te (productDetails from URL) is used
idx = js.find("eddProductDetails:Te")
print("\n=== eddProductDetails:Te ===")
print(js[max(0,idx-200):idx+800] if idx>=0 else "not found")

idx2 = js.find("productDetails")
count = 0
pos = 0
while count < 15:
    p = js.find("productDetails", pos)
    if p < 0: break
    snippet = js[max(0,p-80):p+120]
    if any(k in snippet for k in ["decode", "atob", "JSON.parse", "btoa", "cart", "initiate", "Te", "Pe"]):
        print(f"\n--- productDetails @ {p} ---")
        print(snippet.replace("\n"," "))
    pos = p + 12
    count += 1
