import re
js = open(r"C:\Users\LOQ\AppData\Local\Temp\fastrr-edd.js", "r", encoding="utf-8", errors="ignore").read()

# extract quoted strings containing pickrr, checkout, api
strings = re.findall(r'"([^"\\]{4,200})"', js)
interesting = [s for s in strings if any(k in s.lower() for k in ["pickrr", "checkout", "api/", "gateway", "edge", "boost", "cart", "seller"])]
for s in sorted(set(interesting)):
    print(s)

print("\n--- backtick strings ---")
strings2 = re.findall(r"`([^`]{4,200})`", js)
interesting2 = [s for s in strings2 if any(k in s.lower() for k in ["pickrr", "checkout", "api", "gateway", "edge", "boost", "cart"])]
for s in sorted(set(interesting2)):
    print(s)
