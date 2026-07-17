import re
js = open(r"C:\Users\LOQ\AppData\Local\Temp\fastrr-edd.js", "r", encoding="utf-8", errors="ignore").read()
for pat in ["pickrr.com", "shiprocket.com", "buyCart", "checkoutBuyer", "storefront", "aggregator", "headless", "EDD"]:
    print(pat, js.count(pat))
urls = sorted(set(re.findall(r"https?://[a-zA-Z0-9._~:/?#\[\]@!$&'()*+,;=%-]+", js)))
for u in urls:
    print(u)
