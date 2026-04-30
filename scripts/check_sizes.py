import urllib.request, json, os
url = os.environ.get('SUPABASE_URL')
key = os.environ.get('SUPABASE_KEY')

if not url or not key:
    print("Error: SUPABASE_URL and SUPABASE_KEY environment variables must be set.")
    exit(1)

print("Checking products...")
req = urllib.request.Request(f'{url}/rest/v1/products?select=id,name,img')
req.add_header('apikey', key)
req.add_header('Authorization', f'Bearer {key}')
try:
    res = urllib.request.urlopen(req)
    data = json.loads(res.read())
    for d in data:
        img_len = len(d.get('img', '')) if d.get('img') else 0
        if img_len > 100000:  # > 100KB
            print(f"Product ID: {d['id']}, Name: {d['name']}, Img Length: {img_len}")
except Exception as e:
    print(e)

print("\nChecking free_notes...")
req2 = urllib.request.Request(f'{url}/rest/v1/free_notes?select=id,title,pdf,img')
req2.add_header('apikey', key)
req2.add_header('Authorization', f'Bearer {key}')
try:
    res2 = urllib.request.urlopen(req2)
    data2 = json.loads(res2.read())
    for d in data2:
        img_len = len(d.get('img', '')) if d.get('img') else 0
        pdf_len = len(d.get('pdf', '')) if d.get('pdf') else 0
        if img_len > 100000 or pdf_len > 100000:
            print(f"Note ID: {d['id']}, Title: {d.get('title', 'N/A')}, Img Length: {img_len}, PDF Length: {pdf_len}")
except Exception as e:
    print("free_notes error:", e)
