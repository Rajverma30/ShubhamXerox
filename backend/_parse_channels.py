import re
for fname in ["_shopify_channel.js", "_custom_channel.js"]:
    js = open(rf"s:\Machine learning\Startup\Shubham xerox\backend\{fname}", encoding="utf-8", errors="ignore").read()
    print(f"\n======== {fname} ========")
    for term in ["shiprocketCheckoutBuyProductHandler", "shiprocketCheckoutDirectHandler", "shiprocketCheckoutBuyCartHandler", "variantId", "product_id", "CART_SERVICE", "cart-service"]:
        p = js.find(term)
        if p >= 0:
            print(f"\n--- {term} @ {p} ---")
            print(js[max(0,p-200):p+600])
