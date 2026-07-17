import re
js = open(r"s:\Machine learning\Startup\Shubham xerox\backend\_boost_main.js", encoding="utf-8", errors="ignore").read()
# find cart initiate saga / API call
for pat in [r"CART_INITIATE_REQUEST", r"pickrrCartService", r"cart-service/", r"initiateCart", r"sendCartInitiate", r"platform.?CUSTOM", r"HEADLESS"]:
    for m in re.finditer(pat, js):
        if m.start() > 50000:  # skip config block
            print(f"\n--- {pat} @ {m.start()} ---")
            print(js[m.start()-150:m.start()+400].replace('\n',' ')[:550])
            break
