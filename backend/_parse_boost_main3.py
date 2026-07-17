js = open(r"s:\Machine learning\Startup\Shubham xerox\backend\_boost_main.js", encoding="utf-8", errors="ignore").read()
pos = js.find('null!=Ee.get("productDetails")')
print(js[pos:pos+2500])
