import base64
import hashlib
import hmac
import json
import logging
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote

import requests

from config import (
    SHIPROCKET_API_KEY,
    SHIPROCKET_API_SECRET,
    SHIPROCKET_CHECKOUT_API_BASE_URL,
    SHIPROCKET_CHECKOUT_SESSION_PATH,
    SHIPROCKET_CHECKOUT_UI_BASE_URL,
    SHIPROCKET_WEBHOOK_SECRET,
    SITE_BASE_URL,
)

logger = logging.getLogger("shubhamxerox.shiprocket_checkout")


class ShiprocketCheckoutError(Exception):
    pass


def canonical_json_body(payload: Dict[str, Any]) -> str:
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=False)


def generate_hmac_signature(body: str, secret: Optional[str] = None) -> str:
    key = (secret or SHIPROCKET_API_SECRET or "").encode("utf-8")
    if not key:
        raise ShiprocketCheckoutError("SHIPROCKET_API_SECRET is not configured")
    digest = hmac.new(key, body.encode("utf-8"), hashlib.sha256).digest()
    return base64.b64encode(digest).decode("utf-8")


def build_auth_headers(body: str) -> Dict[str, str]:
    if not SHIPROCKET_API_KEY:
        raise ShiprocketCheckoutError("SHIPROCKET_API_KEY is not configured")
    return {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Api-Key": SHIPROCKET_API_KEY,
        "X-Api-HMAC-SHA256": generate_hmac_signature(body),
    }


def checkout_api_request(method: str, path: str, payload: Optional[Dict[str, Any]] = None) -> Tuple[int, Dict[str, Any]]:
    if not path.startswith("/"):
        path = f"/{path}"
    url = f"{SHIPROCKET_CHECKOUT_API_BASE_URL}{path}"
    body = canonical_json_body(payload or {})
    headers = build_auth_headers(body)

    try:
        res = requests.request(method.upper(), url, data=body.encode("utf-8"), headers=headers, timeout=25)
    except Exception as exc:
        logger.exception("Shiprocket checkout API request failed: %s", exc)
        raise ShiprocketCheckoutError(f"Shiprocket checkout API request failed: {exc}") from exc

    try:
        data = res.json() if res.content else {}
    except Exception:
        data = {"raw": res.text}

    if not isinstance(data, dict):
        data = {"data": data}

    if not res.ok:
        detail = data.get("message") or data.get("error") or data.get("detail") or res.text
        logger.warning("Shiprocket checkout API %s %s failed (%s): %s", method, path, res.status_code, detail)
        raise ShiprocketCheckoutError(str(detail or f"Shiprocket checkout API error ({res.status_code})"))

    return res.status_code, data


def map_cart_items_for_shiprocket(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    mapped: List[Dict[str, Any]] = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        product_id = str(item.get("id") or item.get("productId") or item.get("product_id") or "item")
        mapped.append({
            "product_id": product_id,
            "variant_id": product_id,
            "sku": product_id,
            "name": item.get("name") or item.get("title") or "Product",
            "quantity": int(item.get("quantity") or item.get("qty") or 1),
            "price": float(item.get("price") or 0),
        })
    return mapped


def _extract_checkout_url(data: Dict[str, Any]) -> str:
    for key in ("checkout_url", "redirect_url", "payment_url", "url", "storefrontUrl", "storefront_url"):
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    nested = data.get("data")
    if isinstance(nested, dict):
        return _extract_checkout_url(nested)

    return ""


def _fastrr_b64_json(value: Any) -> str:
    """Match JS: btoa(encodeURIComponent(JSON.stringify(value)))."""
    raw = json.dumps(value, separators=(",", ":"), ensure_ascii=False)
    escaped = quote(raw, safe="~()*!.'")
    return base64.b64encode(escaped.encode("utf-8")).decode("ascii")


def _resolve_image_url(catalog_row: Optional[Dict[str, Any]], item: Dict[str, Any]) -> str:
    for source in (catalog_row, item):
        if not isinstance(source, dict):
            continue
        for key in ("img_url", "image", "img"):
            value = source.get(key)
            if isinstance(value, str) and value.strip():
                url = value.strip()
                if url.startswith(("http://", "https://", "//")):
                    return url
                return f"{SITE_BASE_URL.rstrip('/')}/{url.lstrip('/')}"
    return ""


def build_fastrr_cart_products(
    items: List[Dict[str, Any]],
    catalog_by_id: Optional[Dict[str, Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """Build cart lines for Fastrr headless popup (same shape as B3 Books / Shopify SDK)."""
    catalog_by_id = catalog_by_id or {}
    lines: List[Dict[str, Any]] = []

    for item in items or []:
        if not isinstance(item, dict):
            continue
        pid_raw = item.get("id") or item.get("productId") or item.get("product_id")
        if pid_raw is None:
            continue
        pid_key = str(pid_raw)
        try:
            product_id = int(pid_raw)
        except (TypeError, ValueError):
            raise ShiprocketCheckoutError(f"Invalid product id: {pid_raw}")

        catalog_row = catalog_by_id.get(pid_key) or catalog_by_id.get(str(product_id))
        name = str(
            item.get("name") or item.get("title")
            or (catalog_row or {}).get("name")
            or "Product"
        ).strip() or "Product"
        price = float(item.get("price") or (catalog_row or {}).get("price") or 0)
        if price <= 0 and catalog_row:
            price = float(catalog_row.get("price") or 0)
        qty = int(item.get("quantity") or item.get("qty") or 1)
        if qty < 1:
            qty = 1

        category = str((catalog_row or {}).get("category") or item.get("category") or "").strip()
        image = _resolve_image_url(catalog_row, item)

        line: Dict[str, Any] = {
            "productId": product_id,
            "variantId": product_id,
            "title": name,
            "variantTitle": "Default Title",
            "price": round(price, 2),
            "quantity": qty,
            "vendor": str((catalog_row or {}).get("vendor") or "Shubham Xerox"),
            "product_type": category,
        }
        if image:
            line["image"] = image
        lines.append(line)

    if not lines:
        raise ShiprocketCheckoutError("Cart is empty")
    return lines


def build_fastrr_headless_widget_url(
    *,
    domain: str,
    cart_products: List[Dict[str, Any]],
    success_url: Optional[str] = None,
) -> str:
    """Official Fastrr Boost headless popup URL (iframe overlay, not productDetails redirect)."""
    seller_domain = (domain or SITE_BASE_URL or "shubhamxerox.in").replace("https://", "").replace("http://", "").split("/")[0]
    checkout_type = "product" if len(cart_products) == 1 else "cart"
    channel = {
        "shop_name": "company-logo",
        "shop_url": seller_domain,
        "redirectUrl": success_url or f"{SITE_BASE_URL}/my-orders",
    }
    cart_token = _fastrr_b64_json(cart_products)
    channel_token = _fastrr_b64_json(channel)
    query = "&".join([
        f"type={quote(checkout_type, safe='')}",
        "platform=CUSTOM",
        f"seller-domain={quote(seller_domain, safe='')}",
        f"channel={quote(channel_token, safe='')}",
    ])
    return f"{SHIPROCKET_CHECKOUT_UI_BASE_URL}/?{query}#cart={quote(cart_token, safe='')}"


def build_fastrr_checkout_url(
    *,
    domain: str,
    items: List[Dict[str, Any]],
    external_order_id: str,
    catalog_by_id: Optional[Dict[str, Dict[str, Any]]] = None,
    success_url: Optional[str] = None,
) -> Dict[str, Any]:
    cart_products = build_fastrr_cart_products(items, catalog_by_id)
    widget_url = build_fastrr_headless_widget_url(
        domain=domain,
        cart_products=cart_products,
        success_url=success_url,
    )
    return {
        "checkout_url": widget_url,
        "widget_url": widget_url,
        "checkout_mode": "headless_popup",
        "platform": "CUSTOM",
        "seller_domain": (domain or SITE_BASE_URL or "shubhamxerox.in").split("/")[0],
        "cart_products": cart_products,
        "order_id": external_order_id,
    }


def create_checkout_session(
    *,
    domain: str,
    items: List[Dict[str, Any]],
    external_order_id: str,
    subtotal: float,
    success_url: Optional[str] = None,
    cancel_url: Optional[str] = None,
    catalog_by_id: Optional[Dict[str, Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    sr_items = map_cart_items_for_shiprocket(items)
    if not sr_items:
        return {"error": "Cart is empty"}

    resolved_success = success_url or f"{SITE_BASE_URL}/my-orders"
    payload = {
        "order_id": external_order_id,
        "external_order_id": external_order_id,
        "domain": domain,
        "redirect_url": resolved_success,
        "success_url": resolved_success,
        "cancel_url": cancel_url or f"{SITE_BASE_URL}/cart",
        "cart": {
            "currency": "INR",
            "subtotal": float(subtotal or 0),
            "items": sr_items,
        },
    }

    if SHIPROCKET_API_KEY and SHIPROCKET_API_SECRET:
        try:
            _, data = checkout_api_request("POST", SHIPROCKET_CHECKOUT_SESSION_PATH, payload)
            checkout_url = _extract_checkout_url(data)
            if checkout_url:
                return {
                    "checkout_url": checkout_url,
                    "provider": "shiprocket-checkout-api",
                    "checkout_mode": "redirect",
                    "session": data,
                }
        except ShiprocketCheckoutError as exc:
            logger.warning(
                "Shiprocket checkout API session failed, using Fastrr headless fallback: %s",
                exc,
            )

    headless = build_fastrr_checkout_url(
        domain=domain,
        items=items,
        external_order_id=external_order_id,
        catalog_by_id=catalog_by_id,
        success_url=resolved_success,
    )
    logger.info(
        "Fastrr headless payload seller=%s products=%s url=%s",
        headless.get("seller_domain"),
        json.dumps(headless.get("cart_products") or [], ensure_ascii=False),
        headless.get("widget_url"),
    )
    return {
        **headless,
        "provider": "fastrr-headless-ui",
        "session": {"fallback": True, "order_id": external_order_id},
    }


def verify_webhook_signature(body: bytes, signature: Optional[str]) -> bool:
    secret = SHIPROCKET_WEBHOOK_SECRET or SHIPROCKET_API_SECRET
    if not secret or not signature:
        return False

    expected = base64.b64encode(
        hmac.new(secret.encode("utf-8"), body, hashlib.sha256).digest()
    ).decode("utf-8")
    provided = signature.strip()
    return hmac.compare_digest(provided, expected)


def _first(*values: Any) -> Any:
    for value in values:
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        return value
    return ""


def order_payload_from_webhook(payload: Dict[str, Any], pending: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    pending = pending or {}
    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    order = data.get("order") if isinstance(data.get("order"), dict) else data

    external_id = _first(
        order.get("external_order_id"),
        order.get("order_id"),
        order.get("id"),
        data.get("external_order_id"),
        payload.get("external_order_id"),
        pending.get("id"),
    )
    if external_id and not str(external_id).startswith("ORD"):
        external_id = pending.get("id") or f"ORD{external_id}"

    customer_name = _first(
        order.get("customer_name"),
        order.get("billing_customer_name"),
        order.get("name"),
        data.get("customer_name"),
        pending.get("customer"),
        "Customer",
    )
    customer_phone = _first(
        order.get("customer_phone"),
        order.get("billing_phone"),
        order.get("phone"),
        data.get("customer_phone"),
        pending.get("customerphone"),
    )
    address = _first(
        order.get("shipping_address"),
        order.get("billing_address"),
        order.get("address"),
        data.get("address"),
        pending.get("address"),
    )
    total = float(_first(order.get("total"), order.get("sub_total"), data.get("total"), pending.get("total"), 0) or 0)
    payment_method = _first(order.get("payment_method"), data.get("payment_method"), "Online")
    payment_id = _first(
        order.get("payment_id"),
        order.get("transaction_id"),
        order.get("razorpay_payment_id"),
        data.get("payment_id"),
    )

    items = pending.get("items") or []
    webhook_items = order.get("items") or order.get("order_items") or data.get("items")
    if isinstance(webhook_items, list) and webhook_items:
        parsed_items = []
        for row in webhook_items:
            if not isinstance(row, dict):
                continue
            parsed_items.append({
                "id": row.get("product_id") or row.get("productId") or row.get("sku") or row.get("id"),
                "name": row.get("name") or row.get("title") or "Product",
                "price": float(row.get("price") or row.get("selling_price") or 0),
                "quantity": int(row.get("quantity") or row.get("qty") or row.get("units") or 1),
                "type": row.get("type") or "book",
            })
        if parsed_items:
            items = parsed_items

    method = "Online"
    if payment_id:
        method = f"Online (Txn: {payment_id})"
    elif str(payment_method).lower() == "cod":
        method = "COD"

    return {
        "id": str(external_id or pending.get("id") or f"ORD{int(time.time() * 1000)}"),
        "customer": customer_name,
        "customerphone": customer_phone,
        "address": address,
        "items": items,
        "total": total,
        "method": method,
        "status": "Pending",
        "date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "shiprocket_order_id": str(_first(order.get("shiprocket_order_id"), order.get("sr_order_id"), data.get("order_id"), "")),
        "shipment_id": str(_first(order.get("shipment_id"), data.get("shipment_id"), "")),
        "tracking_id": str(_first(order.get("awb"), order.get("awb_code"), data.get("awb"), "")),
        "courier_name": str(_first(order.get("courier_name"), order.get("courier"), data.get("courier_name"), "")),
        "tracking_url": str(_first(order.get("tracking_url"), data.get("tracking_url"), "")),
    }


def default_store_domain(request_host: Optional[str] = None) -> str:
    if SITE_BASE_URL:
        host = SITE_BASE_URL.replace("https://", "").replace("http://", "").split("/")[0]
        if host and "localhost" not in host:
            return host
    return (request_host or "shubhamxerox.in").split(":")[0]
