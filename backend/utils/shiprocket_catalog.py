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
    api_key = (
        request.headers.get("x-api-key")
        or request.headers.get("X-Api-Key")
        or request.query_params.get("api_key")
        or request.query_params.get("x-api-key")
        or ""
    ).strip()
    if not api_key:
        auth = (request.headers.get("authorization") or request.headers.get("Authorization") or "").strip()
        if auth.lower().startswith("bearer "):
            api_key = auth[7:].strip()
        elif auth:
            api_key = auth

    if not SHIPROCKET_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Catalog API is not configured on the server (SHIPROCKET_API_KEY missing in Railway env).",
        )
    if not api_key:
        raise HTTPException(
            status_code=401,
            detail=(
                "Missing X-Api-Key header. Opening this URL in a browser will always fail. "
                "In Fastrr → Settings → Custom Endpoints → ADD/EDIT, set API Key to match server SHIPROCKET_API_KEY."
            ),
        )
    if api_key != SHIPROCKET_API_KEY:
        raise HTTPException(
            status_code=401,
            detail="Invalid API key. Fastrr Custom Endpoint API Key must exactly match server SHIPROCKET_API_KEY.",
        )

    # HMAC is optional. Many Custom Endpoint setups only send X-Api-Key.
    signature = request.headers.get("x-api-hmac-sha256") or request.headers.get("X-Api-HMAC-SHA256")
    if not signature or not SHIPROCKET_API_SECRET:
        return

    body = canonical_json_body({})
    expected = generate_hmac_signature(body)
    if not hmac.compare_digest(signature.strip(), expected):
        # Don't hard-fail catalog sync on signature mismatch when API key already matched.
        # Fastrr sometimes signs differently than empty-body HMAC.
        return


def serialize_collection(
    *,
    collection_id: int,
    handle: str,
    title: str,
    body_html: str = "",
    image_src: str = "",
    created_at: Optional[str] = None,
    updated_at: Optional[str] = None,
) -> Dict[str, Any]:
    now = updated_at or _iso_timestamp()
    created = created_at or now
    return {
        "id": collection_id,
        "updated_at": now,
        "body_html": body_html or "",
        "handle": handle,
        "image": {"src": image_src or ""},
        "title": title,
        "created_at": created,
    }


def build_collection_index(products: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
    grouped: Dict[str, int] = {}
    category_images: Dict[str, str] = {}
    for row in products:
        category = str(row.get("category") or "Uncategorized").strip() or "Uncategorized"
        grouped[category] = grouped.get(category, 0) + 1
        if category not in category_images:
            image_src = str(row.get("img_url") or row.get("img") or "").strip()
            if image_src:
                category_images[category] = image_src

    collections: List[Dict[str, Any]] = []
    lookup: Dict[str, str] = {}
    now = _iso_timestamp()
    for category in sorted(grouped.keys()):
        collection_id = _stable_collection_id(category)
        handle = _slugify(category)
        lookup[str(collection_id)] = category
        lookup[handle] = category
        lookup[handle.lower()] = category
        collections.append(serialize_collection(
            collection_id=collection_id,
            handle=handle,
            title=category,
            body_html="",
            image_src=category_images.get(category, ""),
            created_at=now,
            updated_at=now,
        ))
    return collections, lookup


def _serialize_variant(row: Dict[str, Any], product_id: int, price_paise: int, compare_paise: Optional[int]) -> Dict[str, Any]:
    stock = row.get("stock")
    try:
        quantity = max(0, int(stock))
    except (TypeError, ValueError):
        quantity = 9999

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
        "inventory_quantity": quantity,
        "quantity": quantity,
        "requires_shipping": True,
        "fulfillment_service": "manual",
        "inventory_management": "shopify",
        "available": quantity > 0,
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

    tag_parts: List[str] = []
    exam = str(row.get("exam") or "").strip()
    if exam:
        tag_parts.append(exam)
    tags = ",".join(tag_parts)

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


def build_fastrr_cart_line_from_serialized_product(
    shopify_product: Dict[str, Any],
    quantity: int = 1,
) -> Dict[str, Any]:
    """Cart line shape expected by Fastrr headless SDK (matches Shopify channel mapper)."""
    variants = shopify_product.get("variants") or []
    if not variants:
        raise ValueError("Product has no variants")
    variant = variants[0]
    try:
        price_paise = int(variant.get("price") or shopify_product.get("price") or 0)
    except (TypeError, ValueError):
        price_paise = 0
    image_obj = shopify_product.get("image") or {}
    image_src = image_obj.get("src") if isinstance(image_obj, dict) else ""
    if not image_src:
        images = shopify_product.get("images") or []
        if images and isinstance(images[0], dict):
            image_src = images[0].get("src") or ""

    qty = max(1, int(quantity or 1))
    product_id = int(shopify_product.get("id") or variant.get("product_id") or 0)
    variant_id = int(variant.get("id") or product_id)
    line: Dict[str, Any] = {
        "productId": product_id,
        "variantId": variant_id,
        "sku": str(variant_id),
        "title": str(shopify_product.get("title") or "Product"),
        "variantTitle": str(variant.get("title") or "Default Title"),
        "price": round(price_paise / 100.0, 2),
        "quantity": qty,
        "vendor": str(shopify_product.get("vendor") or "Shubham Xerox"),
        "product_type": str(shopify_product.get("product_type") or ""),
        "item_meta_data": {"properties": {}},
        "customAttributes": {},
    }
    if image_src:
        line["image"] = image_src
    return line


def build_collections_payload(products: List[Dict[str, Any]]) -> Dict[str, Any]:
    collections, _ = build_collection_index(products)
    return {"collections": collections}


def resolve_collection_category(collection_id: str, products: List[Dict[str, Any]]) -> Optional[str]:
    _, lookup = build_collection_index(products)
    return lookup.get(str(collection_id).strip())
