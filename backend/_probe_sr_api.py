import hmac, hashlib, base64, json, requests, re

secret = "test"
payload = {
    "domain": "shubhamxerox.in",
    "external_order_id": "ORD123",
    "cart": {
        "currency": "INR",
        "subtotal": 100,
        "items": [{"product_id": "1", "variant_id": "1", "sku": "1", "name": "Test", "quantity": 1, "price": 100}],
    },
}
body = json.dumps(payload, separators=(",", ":"))
sig = base64.b64encode(hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest()).decode()
headers = {
    "Content-Type": "application/json",
    "X-Api-Key": "test",
    "X-Api-HMAC-SHA256": sig,
}
base = "https://checkout-api.shiprocket.com"
paths = [
    "/public-api/api/v1/checkout/sessions",
    "/public-api/api/v1/checkout/session",
    "/public-api/api/v1/cart/checkout",
    "/public-api/api/v1/checkout/create",
    "/public-api/api/v1/checkout/initiate",
    "/public-api/api/v1/headless/checkout",
    "/public-api/api/v1/storefront/checkout",
]
for p in paths:
    try:
        r = requests.post(base + p, data=body.encode(), headers=headers, timeout=12)
        print(r.status_code, p, r.text[:160])
    except Exception as e:
        print("ERR", p, e)

js = open(r"C:\Users\LOQ\AppData\Local\Temp\fastrr-edd.js", "r", encoding="utf-8", errors="ignore").read()
for pat in [r"edge\.pickrr\.com[a-zA-Z0-9/._?=&%-]+", r"gateway\.pickrr\.com[a-zA-Z0-9/._?=&%-]+"]:
    found = sorted(set(re.findall(pat, js)))
    print("\n", pat, "count", len(found))
    for s in found[:20]:
        print(" ", s[:180])
