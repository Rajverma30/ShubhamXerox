import sys

with open(r'S:\Machine learning\Startup\Shubham xerox\backend\main.py', 'a', encoding='utf-8') as f:
    f.write('''

import json

# --- SSR Routes (Serving HTML with Jinja2) ---

@app.get('/', response_class=HTMLResponse)
async def render_home(request: Request):
    # Fetch top 10 products to inject into initial HTML
    products_resp = await list_public_products(limit=10, offset=0)
    products = products_resp.get("products", [])
    return templates.TemplateResponse("index.html", {"request": request, "initial_products": json.dumps(products)})

@app.get('/{page_name}.html', response_class=HTMLResponse)
async def render_page(request: Request, page_name: str):
    products = []
    if page_name in ["products", "index"]:
        products_resp = await list_public_products(limit=10, offset=0)
        products = products_resp.get("products", [])
        
    try:
        return templates.TemplateResponse(f"{page_name}.html", {"request": request, "initial_products": json.dumps(products)})
    except Exception:
        raise HTTPException(status_code=404, detail="Page not found")
''')
