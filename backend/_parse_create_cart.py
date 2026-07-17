js = open(r"s:\Machine learning\Startup\Shubham xerox\backend\_boost_main.js", encoding="utf-8", errors="ignore").read()
idx = js.find("CREATE_CART_DETAILS")
while idx >= 0:
    # find POST to cart-service near this
    chunk = js[idx:idx+8000]
    if "cart-service" in chunk or "CART_INITIATE" in chunk:
        print(chunk[:2500])
        print("\n---\n")
    idx = js.find("CREATE_CART_DETAILS", idx+1)
    if idx > 200000:
        break
