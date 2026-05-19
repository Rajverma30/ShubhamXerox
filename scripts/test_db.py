import requests
import json

url = "https://acjnktdlqupwfeolkrfk.supabase.co/rest/v1/products?limit=1"
headers = {
    "apikey": "sb_publishable_q3zriGbom5L-kdt5ILtlvw_69i5nUj5",
    "Authorization": "Bearer sb_publishable_q3zriGbom5L-kdt5ILtlvw_69i5nUj5"
}
response = requests.get(url, headers=headers)
data = response.json()
if data:
    keys = data[0].keys()
    print("Columns:", list(keys))
else:
    print("No data")
