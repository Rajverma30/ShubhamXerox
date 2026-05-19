import json
import requests

url = "https://acjnktdlqupwfeolkrfk.supabase.co/rest/v1/products?select=id,name,category,price,original_price,img,exam,free_note_id&order=id.desc&limit=10"
headers = {
    "apikey": "sb_publishable_q3zriGbom5L-kdt5ILtlvw_69i5nUj5",
    "Authorization": "Bearer sb_publishable_q3zriGbom5L-kdt5ILtlvw_69i5nUj5"
}

resp = requests.get(url, headers=headers)
data = resp.json()

for p in data:
    if p.get('img') and isinstance(p['img'], str):
        p['img'] = p['img'].split('|')[0]

with open('embedded_cache.json', 'w', encoding='utf-8') as f:
    json.dump(data, f)

print("Done")
