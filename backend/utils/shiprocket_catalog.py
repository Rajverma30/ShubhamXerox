import hashlib
import hmac
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, Request

from config import SHIPROCKET_API_KEY, SHIPROCKET_API_SECRET
from utils.shiprocket_checkout import canonical_json_body, generate_hmac_signature


def _slugify(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text[:120] or "collection"


def _stable_collection_id(category: str) -> int:
    digest = hashlib.sha256(category.strip().lower().encode("utf-8")).hexdigest()
    return int(digest[:12], 16)


def _price_paise(value: Any) -> int:
    try:
        return max(0, int(round(float(value or 0) * 100)))
    except (TypeError, ValueError):
        return 0


def _iso_timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")


def verify_catalog_request(request: Request) -> None:
    api_key = request.headers.get("x-api-key") or request.headers.get("X-Api-Key")
    if not SHIPROCKET_API_KEY or api_key != SHIPROCKET_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    signature = request.headers.get("x-api-hmac-sha256") or request.headers.get("X-Api-HMAC-SHA256")
    if not signature or not SHIPROCKET_API_SECRET:
        return

    body = canonical_json_body({})
    expected = generate_hmac_signature(body)
    if not hmac.compare_digest(signature.strip(), expected):
        raise HTTPException(status_code=401, detail="Invalid catalog signature")


def build_collection_index(products: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
    grouped: Dict[str, int] = {}
    for row in products:
        category = str(row.get("category") or "Uncategorized").strip() or "Uncategorized"
        grouped[category] = grouped.get(category, 0) + 1

    collections: List[Dict[str, Any]] = []
    lookup: Dict[str, str] = {}
    now = _iso_timestamp()
    for category in sorted(grouped.keys()):
        collection_id = _stable_collection_id(category)
        handle = _slugify(category)
        lookup[str(collection_id)] = category
        lookup[handle] = category
        lookup[handle.lower()] = category
        collections.append({
            "id": collection_id,
            "handle": handle,
            "title": category,
            "body_html": "",
            "published_at": now,
            "updated_at": now,
            "sort_order": "best-selling",
            "template_suffix": None,
            "published_scope": "web",
            "products_count": grouped[category],
        })
    return collections, lookup


def _serialize_variant(row: Dict[str, Any], product_id: int, price_paise: int, compare_paise: Optional[int]) -> Dict[str, Any]:
    stock = row.get("stock")
    try:
        inventory_quantity = max(0, int(stock))
    except (TypeError, ValueError):
        inventory_quantity = 100

    variant: Dict[str, Any] = {
        "id": product_id,
        "product_id": product_id,
        "title": "Default Title",
        "price": str(price_paise),
        "sku": str(product_id),
        "position": 1,
        "inventory_policy": "deny",
        "compare_at_price": str(compare_paise) if compare_paise else None,
        "option1": "Default Title",
        "option2": None,
        "option3": None,
        "taxable": True,
        "barcode": None,
        "grams": 500,
        "weight": 0.5,
        "weight_unit": "kg",
        "inventory_item_id": product_id,
        "inventory_quantity": inventory_quantity,
        "requires_shipping": True,
        "fulfillment_service": "manual",
        "inventory_management": "shopify",
        "available": inventory_quantity > 0,
    }
    return variant


def serialize_product(row: Dict[str, Any], base_url: str) -> Dict[str, Any]:
    product_id = int(row.get("id") or 0)
    slug = str(row.get("slug") or product_id)
    name = str(row.get("name") or "Product").strip() or "Product"
    category = str(row.get("category") or "").strip()
    description = str(row.get("desc") or "").strip()
    if description.startswith("COMBO_DETAILS:"):
        description = ""
    image_url = str(row.get("img_url") or "").strip()
    now = _iso_timestamp()

    price_paise = _price_paise(row.get("price"))
    original_paise = _price_paise(row.get("original_price"))
    compare_paise = original_paise if original_paise > price_paise else None
    variant = _serialize_variant(row, product_id, price_paise, compare_paise)

    images: List[Dict[str, Any]] = []
    if image_url:
        images.append({
            "id": product_id,
            "product_id": product_id,
            "position": 1,
            "src": image_url,
            "width": 800,
            "height": 800,
            "variant_ids": [product_id],
        })

    tags: List[str] = []
    exam = str(row.get("exam") or "").strip()
    if exam:
        tags.append(exam)

    product_url = f"{base_url.rstrip('/')}/products/{slug}"
    return {
        "id": product_id,
        "title": name,
        "handle": slug,
        "body_html": description,
        "vendor": "Shubham Xerox",
        "product_type": category,
        "created_at": now,
        "updated_at": now,
        "published_at": now,
        "template_suffix": None,
        "published_scope": "web",
        "status": "active",
        "tags": tags,
        "admin_graphql_api_id": f"gid://shopify/Product/{product_id}",
        "variants": [variant],
        "options": [{"id": product_id, "product_id": product_id, "name": "Title", "position": 1, "values": ["Default Title"]}],
        "images": images,
        "image": images[0] if images else None,
        "price": price_paise,
        "price_min": price_paise,
        "price_max": price_paise,
        "available": variant["available"],
        "price_varies": False,
        "compare_at_price": compare_paise,
        "compare_at_price_min": compare_paise or 0,
        "compare_at_price_max": compare_paise or 0,
        "compare_at_price_varies": False,
        "url": product_url,
    }


def build_products_payload(
    products: List[Dict[str, Any]],
    *,
    base_url: str,
    category: Optional[str] = None,
    limit: int = 250,
    page: int = 1,
) -> Dict[str, Any]:
    limit = max(1, min(int(limit or 250), 250))
    page = max(1, int(page or 1))
    rows = products
    if category:
        rows = [row for row in rows if str(row.get("category") or "").strip() == category]

    total = len(rows)
    start = (page - 1) * limit
    page_rows = rows[start:start + limit]
    serialized = [serialize_product(row, base_url) for row in page_rows]
    return {
        "products": serialized,
        "page": page,
        "limit": limit,
        "total": total,
        "has_more": start + len(page_rows) < total,
    }


def build_collections_payload(products: List[Dict[str, Any]]) -> Dict[str, Any]:
    collections, _ = build_collection_index(products)
    return {"collections": collections}


def resolve_collection_category(collection_id: str, products: List[Dict[str, Any]]) -> Optional[str]:
    _, lookup = build_collection_index(products)
    return lookup.get(str(collection_id).strip())
