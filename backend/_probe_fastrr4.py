import re
js = open(r"C:\Users\LOQ\AppData\Local\Temp\fastrr-edd.js", "r", encoding="utf-8", errors="ignore").read()
for term in ["checkoutBuyer", "renderButton", "buyNow", "HeadlessCheckout", "openCheckout", "boost-ui", "seller-domain", "productDetails", "SHOPIFY"]:
    positions = [m.start() for m in re.finditer(re.escape(term), js)]
    print(term, len(positions))
    for pos in positions[:3]:
        print(" ", js[max(0,pos-200):pos+400].replace("\n"," ")[:500])
        print("---")
