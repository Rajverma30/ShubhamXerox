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
    FASTRR_SELLER_DOMAIN,
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
    channel_return_url: Optional[str] = None,
) -> str:
    """Official Fastrr Boost headless popup URL (iframe overlay)."""
    seller_domain = (domain or FASTRR_SELLER_DOMAIN or "shubhamxerox.in").replace("https://", "").replace("http://", "").split("/")[0]
    checkout_type = "product" if len(cart_products) == 1 else "cart"
    channel = {
        "shop_name": "company-logo",
        "shop_url": seller_domain,
        "redirectUrl": channel_return_url or f"{SHIPROCKET_CHECKOUT_UI_BASE_URL}/",
    }
    cart_token = _fastrr_b64_json(cart_products)
    channel_token = _fastrr_b64_json(channel)
    # Match Fastrr custom.js widget URL builder: cart goes in hash, query values are raw base64.
    query = "&".join([
        f"type={checkout_type}",
        "platform=CUSTOM",
        f"seller-domain={seller_domain}",
        f"channel={channel_token}",
    ])
    return f"{SHIPROCKET_CHECKOUT_UI_BASE_URL}/?{query}#cart={cart_token}"


def build_fastrr_checkout_url(
    *,
    domain: str,
    items: List[Dict[str, Any]],
    external_order_id: str,
    catalog_by_id: Optional[Dict[str, Dict[str, Any]]] = None,
    success_url: Optional[str] = None,
    channel_return_url: Optional[str] = None,
    cart_products: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    lines = cart_products or build_fastrr_cart_products(items, catalog_by_id)
    seller_domain = (domain or FASTRR_SELLER_DOMAIN or "shubhamxerox.in").replace("https://", "").replace("http://", "").split("/")[0]
    widget_url = build_fastrr_headless_widget_url(
        domain=seller_domain,
        cart_products=lines,
        success_url=success_url,
        channel_return_url=channel_return_url,
    )
    return {
        "checkout_url": widget_url,
        "widget_url": widget_url,
        "checkout_mode": "headless_popup",
        "platform": "CUSTOM",
        "seller_domain": seller_domain,
        "cart_products": lines,
        "order_id": external_order_id,
        "fastrr_setup_hint": (
            "If Fastrr shows 'Something went wrong' with HTTP 402, that is walletThresholdBreach — "
            "recharge / raise Shiprocket Fastrr wallet threshold (not a catalog URL bug). "
            "Also verify Domain Name, catalog URLs, and that products appear in "
            f"/shiprocket-checkout/products after sync. Seller domain={seller_domain}."
        ),
    }


def create_checkout_session(
    *,
    domain: str,
    items: List[Dict[str, Any]],
    external_order_id: str,
    subtotal: float,
    success_url: Optional[str] = None,
    channel_return_url: Optional[str] = None,
    cancel_url: Optional[str] = None,
    catalog_by_id: Optional[Dict[str, Dict[str, Any]]] = None,
    cart_products: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    sr_items = map_cart_items_for_shiprocket(items)
    if not sr_items:
        return {"error": "Cart is empty"}

    resolved_success = success_url or f"{SITE_BASE_URL}/my-orders"
    resolved_channel_return = channel_return_url or f"{SHIPROCKET_CHECKOUT_UI_BASE_URL}/"
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
        domain=domain or FASTRR_SELLER_DOMAIN,
        items=items,
        external_order_id=external_order_id,
        catalog_by_id=catalog_by_id,
        success_url=resolved_success,
        channel_return_url=resolved_channel_return,
        cart_products=cart_products,
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


def _nested_dicts(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    order = data.get("order") if isinstance(data.get("order"), dict) else data
    blobs = [payload, data, order]
    for key in ("shipment", "tracking", "payment", "result"):
        nested = data.get(key) if isinstance(data, dict) else None
        if isinstance(nested, dict):
            blobs.append(nested)
        nested_order = order.get(key) if isinstance(order, dict) else None
        if isinstance(nested_order, dict):
            blobs.append(nested_order)
    return [b for b in blobs if isinstance(b, dict)]


def _collect_text_signals(payload: Dict[str, Any]) -> str:
    parts: List[str] = []
    for blob in _nested_dicts(payload):
        for key in (
            "event",
            "event_type",
            "eventType",
            "type",
            "status",
            "order_status",
            "payment_status",
            "current_status",
            "shipment_status",
            "message",
            "action",
        ):
            value = blob.get(key)
            if value is not None and str(value).strip():
                parts.append(str(value).strip().lower())
    return " | ".join(parts)


def classify_checkout_webhook(payload: Dict[str, Any]) -> str:
    """
    Classify Fastrr/Shiprocket checkout webhook.
    Returns: success | failed | update | ignore
    """
    if not isinstance(payload, dict):
        return "ignore"

    signal = _collect_text_signals(payload)
    failed_tokens = (
        "payment_failed",
        "payment-failed",
        "payment failed",
        "failed",
        "failure",
        "cancelled",
        "canceled",
        "abandoned",
        "abandon",
        "dropped",
        "rejected",
        "declined",
    )
    success_tokens = (
        "order_placed",
        "order-placed",
        "order placed",
        "fastrr_order_placed",
        "purchase",
        "payment_success",
        "payment-success",
        "payment successful",
        "payment_successful",
        "paid",
        "captured",
        "completed",
        "confirmed",
        "order_created",
        "order-created",
    )
    update_tokens = (
        "awb",
        "shipped",
        "shipping",
        "tracking",
        "out for delivery",
        "ofd",
        "delivered",
        "pickup",
        "in transit",
        "manifest",
    )

    if any(token in signal for token in failed_tokens) and not any(
        token in signal for token in ("order_placed", "purchase", "paid", "payment_success", "payment successful")
    ):
        return "failed"

    if any(token in signal for token in success_tokens):
        return "success"

    # Tracking/status-only updates (order should already exist).
    if any(token in signal for token in update_tokens):
        return "update"

    # Unknown event with cart/order money → treat as success so paid orders are not dropped.
    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    order = data.get("order") if isinstance(data.get("order"), dict) else data
    has_money = bool(_first(order.get("total"), order.get("sub_total"), data.get("total"), order.get("payment_id")))
    has_items = isinstance(order.get("items") or order.get("order_items") or data.get("items"), list)
    if has_money or has_items:
        return "success"
    return "ignore"


def extract_external_order_id(payload: Dict[str, Any], pending: Optional[Dict[str, Any]] = None) -> str:
    pending = pending or {}
    for blob in _nested_dicts(payload):
        candidate = _first(
            blob.get("external_order_id"),
            blob.get("channel_order_id"),
            blob.get("merchant_order_id"),
            blob.get("platform_order_id"),
            blob.get("platformOrderId"),
            blob.get("order_id") if str(blob.get("order_id") or "").startswith("ORD") else None,
            blob.get("id") if str(blob.get("id") or "").startswith("ORD") else None,
        )
        if candidate:
            return str(candidate).strip()
    return str(pending.get("id") or "").strip()


def build_tracking_url(tracking_id: Any = None, tracking_url: Any = None) -> str:
    url = str(tracking_url or "").strip()
    if url:
        return url
    awb = str(tracking_id or "").strip()
    if awb:
        return f"https://shiprocket.co/tracking/{awb}"
    return ""


def order_payload_from_webhook(payload: Dict[str, Any], pending: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    pending = pending or {}
    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    order = data.get("order") if isinstance(data.get("order"), dict) else data

    external_id = extract_external_order_id(payload, pending)
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
        "Address captured via Shiprocket Checkout",
    )
    if isinstance(address, dict):
        address = ", ".join(
            str(address.get(k) or "").strip()
            for k in ("address", "address_1", "address1", "city", "state", "pincode", "zip", "country")
            if str(address.get(k) or "").strip()
        ) or "Address captured via Shiprocket Checkout"

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

    tracking_id = str(_first(
        order.get("awb"),
        order.get("awb_code"),
        order.get("tracking_id"),
        order.get("tracking_number"),
        data.get("awb"),
        data.get("awb_code"),
        data.get("tracking_id"),
        payload.get("awb"),
        payload.get("awb_code"),
    ) or "")
    tracking_url = build_tracking_url(
        tracking_id,
        _first(order.get("tracking_url"), data.get("tracking_url"), payload.get("tracking_url"), pending.get("tracking_url")),
    )

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
        "shiprocket_order_id": str(_first(
            order.get("shiprocket_order_id"),
            order.get("sr_order_id"),
            data.get("shiprocket_order_id"),
            data.get("sr_order_id"),
            payload.get("sr_order_id"),
            # Prefer SR numeric id only when it is not our ORD* id.
            data.get("order_id") if not str(data.get("order_id") or "").startswith("ORD") else None,
            order.get("order_id") if not str(order.get("order_id") or "").startswith("ORD") else None,
        ) or ""),
        "shipment_id": str(_first(order.get("shipment_id"), data.get("shipment_id"), payload.get("shipment_id"), "")),
        "tracking_id": tracking_id,
        "courier_name": str(_first(order.get("courier_name"), order.get("courier"), data.get("courier_name"), payload.get("courier_name"), "")),
        "tracking_url": tracking_url,
    }


def default_store_domain(request_host: Optional[str] = None) -> str:
    """Fastrr seller-domain — must match dashboard Domain Name, not website host."""
    if FASTRR_SELLER_DOMAIN:
        return FASTRR_SELLER_DOMAIN.replace("https://", "").replace("http://", "").split("/")[0]
    if SITE_BASE_URL:
        host = SITE_BASE_URL.replace("https://", "").replace("http://", "").split("/")[0]
        if host and "localhost" not in host:
            return host
    return (request_host or "shubhamxerox.in").split(":")[0]
