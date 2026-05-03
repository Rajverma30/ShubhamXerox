import json
from supabase import create_client

# These were found in script.js
SUPABASE_URL = 'https://acjnktdlqupwfeolkrfk.supabase.co'
SUPABASE_KEY = 'sb_publishable_q3zriGbom5L-kdt5ILtlvw_69i5nUj5'

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

with open("S:/Machine learning/Startup/Shubham xerox/backend/scripts/products.json", "r", encoding="utf-8") as f:
    products = json.load(f)

if products:
    existing_res = sb.table("products").select("name").execute()
    existing_names = {row["name"].lower() for row in existing_res.data} if existing_res.data else set()
    
    new_products = [p for p in products if p["name"].lower() not in existing_names]
    
    if new_products:
        # Supabase API limits insertions per request, so insert in chunks of 100
        chunk_size = 100
        for i in range(0, len(new_products), chunk_size):
            chunk = new_products[i:i + chunk_size]
            res = sb.table("products").insert(chunk).execute()
            print(f"Inserted chunk of {len(chunk)} items.")
        print(f"Successfully imported {len(new_products)} products!")
    else:
        print("No new products to import.")
else:
    print("No valid products found to insert.")
