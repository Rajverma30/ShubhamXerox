import re
js = open(r"C:\Users\LOQ\AppData\Local\Temp\fastrr-edd.js", "r", encoding="utf-8", errors="ignore").read()
idx = js.find("fastrr-boost-ui")
print("context around boost-ui:")
print(js[idx-800:idx+1200])
