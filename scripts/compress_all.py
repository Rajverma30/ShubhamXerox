import json
import base64
import io
import os
import fitz  # PyMuPDF
from PIL import Image
import urllib.request
import urllib.error
import ssl

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")

if not url or not key:
    print("Error: SUPABASE_URL and SUPABASE_KEY environment variables must be set.")
    exit(1)

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def api_get(path):
    req = urllib.request.Request(f"{url}{path}")
    req.add_header('apikey', key)
    req.add_header('Authorization', f'Bearer {key}')
    res = urllib.request.urlopen(req, timeout=30, context=ctx)
    return json.loads(res.read())

def api_patch(path, payload):
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(f"{url}{path}", data=data, method='PATCH')
    req.add_header('apikey', key)
    req.add_header('Authorization', f'Bearer {key}')
    req.add_header('Content-Type', 'application/json')
    req.add_header('Prefer', 'return=minimal')
    res = urllib.request.urlopen(req, timeout=30, context=ctx)
    return res.status

def api_post(path, payload):
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(f"{url}{path}", data=data, method='POST')
    req.add_header('apikey', key)
    req.add_header('Authorization', f'Bearer {key}')
    req.add_header('Content-Type', 'application/json')
    res = urllib.request.urlopen(req, timeout=30, context=ctx)
    return json.loads(res.read())

def storage_download(bucket, filename):
    req = urllib.request.Request(f"{url}/storage/v1/object/{bucket}/{filename}")
    req.add_header('apikey', key)
    req.add_header('Authorization', f'Bearer {key}')
    res = urllib.request.urlopen(req, timeout=60, context=ctx)
    return res.read()

def storage_upload(bucket, filename, file_bytes, content_type="application/pdf"):
    req = urllib.request.Request(f"{url}/storage/v1/object/{bucket}/{filename}", data=file_bytes, method='PUT')
    req.add_header('apikey', key)
    req.add_header('Authorization', f'Bearer {key}')
    req.add_header('Content-Type', content_type)
    res = urllib.request.urlopen(req, timeout=120, context=ctx)
    return json.loads(res.read())

def compress_products_images():
    print("--- Compressing Product Images ---")
    try:
        products = api_get("/rest/v1/products?select=id,name")
    except Exception as e:
        print(f"Error fetching products: {e}")
        return

    print(f"Found {len(products)} products")

    for p in products:
        try:
            full_p_array = api_get(f"/rest/v1/products?select=id,name,img&id=eq.{p['id']}")
            if not full_p_array:
                continue
            full_p = full_p_array[0]
            
            img_data = full_p.get('img')
            if img_data and img_data.startswith('data:image'):
                if len(img_data) < 100000: # Skip small images (<100KB)
                    continue
                
                print(f"Processing product {p['id']} - {p['name']} (Size: {len(img_data)//1024} KB)")
                images = img_data.split('|')
                new_images = []
                for img_str in images:
                    if not img_str.startswith('data:image'):
                        new_images.append(img_str)
                        continue
                        
                    header, encoded = img_str.split(",", 1)
                    img_bytes = base64.b64decode(encoded)
                    
                    if len(img_bytes) < 50000: # Skip if individual image is small
                        new_images.append(img_str)
                        continue

                    img = Image.open(io.BytesIO(img_bytes))
                    if img.mode != 'RGB':
                        img = img.convert('RGB')
                        
                    img.thumbnail((800, 800))
                    
                    out = io.BytesIO()
                    img.save(out, format="JPEG", quality=60)
                    compressed_bytes = out.getvalue()
                    
                    new_base64 = "data:image/jpeg;base64," + base64.b64encode(compressed_bytes).decode('utf-8')
                    new_images.append(new_base64)
                    
                final_img_data = '|'.join(new_images)
                
                if len(final_img_data) < len(img_data):
                    print(f"  -> Compressed {len(img_data)//1024} KB to {len(final_img_data)//1024} KB")
                    api_patch(f"/rest/v1/products?id=eq.{full_p['id']}", {"img": final_img_data})
                    print("  -> Updated in database.")
                else:
                    print("  -> Compression did not reduce size.")
        except Exception as e:
            print(f"  -> Failed for product {p['id']}: {e}")

def compress_pdfs_in_bucket(bucket_name):
    print(f"\n--- Compressing PDFs in bucket: {bucket_name} ---")
    try:
        # Search for all files in the bucket
        payload = {"prefix": "", "limit": 100, "offset": 0, "sortBy": {"column": "name", "order": "asc"}}
        files = api_post(f"/storage/v1/object/list/{bucket_name}", payload)
    except Exception as e:
        print(f"Error listing bucket {bucket_name}: {e}")
        return

    for f in files:
        # Some items might be folders
        if not f.get('name') or f.get('name') == '.emptyFolderPlaceholder':
            continue
            
        metadata = f.get('metadata', {})
        size = metadata.get('size', 0)
        
        # Process files larger than 1MB (1,048,576 bytes)
        if f['name'].endswith('.pdf') and size > 1048576:
            print(f"Found large PDF: {f['name']} ({size//1024//1024} MB)")
            try:
                print("  -> Downloading...")
                pdf_bytes = storage_download(bucket_name, f['name'])
                
                print("  -> Compressing...")
                doc = fitz.open(stream=pdf_bytes, filetype="pdf")
                
                out_path = f"temp_{f['name'].replace('/', '_')}"
                # garbage=4: removes unused objects and deduplicates
                # deflate=True: compresses streams
                # clean=True: clean graphics streams
                doc.save(out_path, garbage=4, deflate=True, clean=True)
                doc.close()
                
                new_size = os.path.getsize(out_path)
                print(f"  -> Compressed: {size//1024} KB -> {new_size//1024} KB")
                
                if new_size < size:
                    print("  -> Uploading...")
                    with open(out_path, 'rb') as f_in:
                        storage_upload(bucket_name, f['name'], f_in.read())
                    print("  -> Updated in storage.")
                else:
                    print("  -> Compression did not reduce size.")
                    
                os.remove(out_path)
            except Exception as e:
                print(f"  -> Failed to compress {f['name']}: {e}")
                if os.path.exists(f"temp_{f['name'].replace('/', '_')}"):
                    try:
                        os.remove(f"temp_{f['name'].replace('/', '_')}")
                    except:
                        pass

if __name__ == "__main__":
    compress_products_images()
    compress_pdfs_in_bucket("free-notes")
    compress_pdfs_in_bucket("chat-files")
    compress_pdfs_in_bucket("photocopy-docs")
    print("\nAll compression tasks finished.")
