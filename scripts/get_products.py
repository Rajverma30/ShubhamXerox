import requests
import json
url = "https://acjnktdlqupwfeolkrfk.supabase.co/rest/v1/products?select=*&order=id.desc&limit=20"
headers = {
    "apikey": "sb_publishable_q3zriGbom5L-kdt5ILtlvw_69i5nUj5",
    "Authorization": "Bearer sb_publishable_q3zriGbom5L-kdt5ILtlvw_69i5nUj5"
}
try:
    response = requests.get(url, headers=headers)
    products = response.json()
    with open("default_products.json", "w", encoding="utf-8") as f:
        json.dump(products, f)
    print("Success")
except Exception as e:
    print(e)
