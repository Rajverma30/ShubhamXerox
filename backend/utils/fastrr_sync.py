"""Outbound Fastrr catalog webhook sync (product + collection push).

Does not touch checkout. Gated by ENABLE_FASTRR_AUTO_SYNC.
HMAC signs the exact request body bytes being POSTed.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import re
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import requests

from config import (
    ENABLE_FASTRR_AUTO_SYNC,
    FASTRR_API_KEY,
    FASTRR_COLLECTION_WEBHOOK_URL,
    FASTRR_PRODUCT_WEBHOOK_URL,
    FASTRR_WEBHOOK_SECRET,
)

logger = logging.getLogger("shubhamxerox.fastrr_sync")

_MAX_ATTEMPTS = 3
_REQUEST_TIMEOUT_SECONDS = 10


def _mask_secret(value: str) -> str:
    text = value or ""
    if not text:
        return "(empty)"
    if len(text) <= 8:
        return f"{text[:2]}***{text[-1:]}(len={len(text)})"
    return f"{text[:4]}...{text[-4:]}(len={len(text)})"


def _credential_source() -> Dict[str, str]:
    """Report which env names are set (not values) vs which resolved config is used."""
    import os

    return {
        "env_FASTRR_API_KEY_set": str(bool(os.getenv("FASTRR_API_KEY", "").strip())),
        "env_FASTRR_WEBHOOK_SECRET_set": str(bool(os.getenv("FASTRR_WEBHOOK_SECRET", "").strip())),
        "env_SHIPROCKET_API_KEY_set": str(bool(os.getenv("SHIPROCKET_API_KEY", "").strip())),
        "env_SHIPROCKET_API_SECRET_set": str(bool(os.getenv("SHIPROCKET_API_SECRET", "").strip())),
        "env_SHIPROCKET_WEBHOOK_SECRET_set": str(bool(os.getenv("SHIPROCKET_WEBHOOK_SECRET", "").strip())),
        "resolved_FASTRR_API_KEY": _mask_secret(FASTRR_API_KEY or ""),
        "resolved_FASTRR_WEBHOOK_SECRET": _mask_secret(FASTRR_WEBHOOK_SECRET or ""),
    }


def _iso_timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")


def _slugify(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text[:120] or "collection"


def _stable_collection_id(category: str) -> int:
    digest = hashlib.sha256(category.strip().lower().encode("utf-8")).hexdigest()
    return int(digest[:12], 16)


def _price_rupees(value: Any) -> float:
    try:
        return max(0.0, round(float(value or 0), 2))
    except (TypeError, ValueError):
        return 0.0


def generate_signature(raw_body: bytes | str) -> str:
    """Base64(HMAC_SHA256(raw_request_body, FASTRR_WEBHOOK_SECRET)).

    Hash the exact bytes being sent — do not hash parsed JSON.
    """
    secret = (FASTRR_WEBHOOK_SECRET or "").encode("utf-8")
    if isinstance(raw_body, str):
        body_bytes = raw_body.encode("utf-8")
    else:
        body_bytes = raw_body
    digest = hmac.new(secret, body_bytes, hashlib.sha256).digest()
    return base64.b64encode(digest).decode("utf-8")


def _encode_body(payload: Dict[str, Any]) -> bytes:
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def _post_webhook(url: str, payload: Dict[str, Any], *, entity: str, entity_id: Any) -> bool:
    if not ENABLE_FASTRR_AUTO_SYNC:
        logger.info(
            "fastrr_sync_skipped reason=feature_flag_off entity=%s id=%s",
            entity,
            entity_id,
        )
        return False

    if not FASTRR_API_KEY:
        logger.warning(
            "fastrr_sync_skipped reason=missing_api_key entity=%s id=%s",
            entity,
            entity_id,
        )
        return False

    if not FASTRR_WEBHOOK_SECRET:
        logger.warning(
            "fastrr_sync_skipped reason=missing_webhook_secret entity=%s id=%s",
            entity,
            entity_id,
        )
        return False

    if not url:
        logger.warning(
            "fastrr_sync_skipped reason=missing_url entity=%s id=%s",
            entity,
            entity_id,
        )
        return False

    raw_body = _encode_body(payload)
    signature = generate_signature(raw_body)
    headers = {
        "Content-Type": "application/json",
        "X-Api-Key": FASTRR_API_KEY,
        "X-Api-HMAC-SHA256": signature,
    }

    # Auth audit (masked). Confirms exact values/source used for this outbound POST.
    logger.info(
        "fastrr_sync_auth_audit entity=%s id=%s url=%s body_bytes=%s "
        "header_X-Api-Key=%s header_X-Api-HMAC-SHA256=%s uses_data_raw_body=1 uses_json_kwarg=0 %s",
        entity,
        entity_id,
        url,
        len(raw_body),
        _mask_secret(FASTRR_API_KEY or ""),
        _mask_secret(signature),
        " ".join(f"{k}={v}" for k, v in _credential_source().items()),
    )

    last_error: Optional[str] = None
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        started = time.monotonic()
        try:
            # IMPORTANT: data=raw_body (exact signed bytes). Never json=payload.
            response = requests.post(
                url,
                data=raw_body,
                headers=headers,
                timeout=_REQUEST_TIMEOUT_SECONDS,
            )
            elapsed_ms = int((time.monotonic() - started) * 1000)
            if response.ok:
                logger.info(
                    "fastrr_sync_ok entity=%s id=%s attempt=%s status=%s elapsed_ms=%s",
                    entity,
                    entity_id,
                    attempt,
                    response.status_code,
                    elapsed_ms,
                )
                return True

            body_preview = (response.text or "")[:300]
            last_error = f"HTTP {response.status_code}: {body_preview}"
            logger.warning(
                "fastrr_sync_http_error entity=%s id=%s attempt=%s status=%s elapsed_ms=%s body=%s",
                entity,
                entity_id,
                attempt,
                response.status_code,
                elapsed_ms,
                body_preview,
            )
        except requests.Timeout:
            elapsed_ms = int((time.monotonic() - started) * 1000)
            last_error = "timeout"
            logger.warning(
                "fastrr_sync_timeout entity=%s id=%s attempt=%s elapsed_ms=%s",
                entity,
                entity_id,
                attempt,
                elapsed_ms,
            )
        except Exception as exc:
            elapsed_ms = int((time.monotonic() - started) * 1000)
            last_error = str(exc)
            logger.exception(
                "fastrr_sync_exception entity=%s id=%s attempt=%s elapsed_ms=%s error=%s",
                entity,
                entity_id,
                attempt,
                elapsed_ms,
                exc,
            )

        if attempt < _MAX_ATTEMPTS:
            backoff_seconds = 2 ** (attempt - 1)
            time.sleep(backoff_seconds)

    logger.error(
        "fastrr_sync_failed entity=%s id=%s attempts=%s last_error=%s",
        entity,
        entity_id,
        _MAX_ATTEMPTS,
        last_error,
    )
    return False


def build_product_payload(
    row: Dict[str, Any],
    *,
    status: str = "active",
    created_at: Optional[str] = None,
    updated_at: Optional[str] = None,
) -> Dict[str, Any]:
    """Build Shiprocket/Fastrr custom product webhook payload from a catalog row."""
    product_id = int(row.get("id") or 0)
    now = _iso_timestamp()
    created = created_at or str(row.get("created_at") or now)
    updated = updated_at or str(row.get("updated_at") or now)
    title = str(row.get("title") or row.get("name") or "Product").strip() or "Product"
    body_html = str(row.get("body_html") or row.get("desc") or "").strip()
    if body_html.startswith("COMBO_DETAILS:"):
        body_html = ""
    product_type = str(row.get("product_type") or row.get("category") or "").strip()
    handle = str(row.get("handle") or row.get("slug") or product_id)
    vendor = str(row.get("vendor") or "Shubham Xerox").strip() or "Shubham Xerox"
    tags = row.get("tags")
    if tags is None:
        exam = str(row.get("exam") or "").strip()
        tags = exam
    elif not isinstance(tags, str):
        tags = ",".join(str(t) for t in tags) if tags else ""

    image_field = row.get("image")
    if isinstance(image_field, dict):
        image_src = str(image_field.get("src") or "").strip()
    else:
        image_src = str(image_field or row.get("img_url") or "").strip()

    price = _price_rupees(row.get("price"))
    variant_id = int(row.get("variant_id") or product_id)
    variant_image = str(row.get("variant_image") or image_src).strip()

    return {
        "id": product_id,
        "title": title,
        "body_html": body_html,
        "vendor": vendor,
        "product_type": product_type,
        "created_at": created,
        "handle": handle,
        "updated_at": updated,
        "tags": tags or "",
        "status": status,
        "variants": [
            {
                "id": variant_id,
                "title": str(row.get("variant_title") or "Default Title"),
                "price": str(price),
                "sku": str(row.get("sku") or product_id),
                "created_at": created,
                "updated_at": updated,
                "taxable": True,
                "grams": int(row.get("grams") or 500),
                "weight": float(row.get("weight") or 0.5),
                "weight_unit": str(row.get("weight_unit") or "kg"),
                "image": {"src": variant_image},
            }
        ],
        "image": {"src": image_src},
    }


def build_collection_payload(
    *,
    category: str,
    image_src: str = "",
    body_html: str = "",
    created_at: Optional[str] = None,
    updated_at: Optional[str] = None,
    collection_id: Optional[int] = None,
    handle: Optional[str] = None,
    title: Optional[str] = None,
) -> Dict[str, Any]:
    """Build Shiprocket/Fastrr custom collection webhook payload from a category."""
    category_name = (category or title or "Uncategorized").strip() or "Uncategorized"
    now = _iso_timestamp()
    return {
        "id": int(collection_id if collection_id is not None else _stable_collection_id(category_name)),
        "updated_at": updated_at or now,
        "body_html": body_html or "",
        "handle": handle or _slugify(category_name),
        "image": {"src": image_src or ""},
        "title": title or category_name,
        "created_at": created_at or now,
    }


def sync_product(product: Dict[str, Any]) -> bool:
    """POST product payload to Fastrr custom product webhook."""
    if not isinstance(product, dict):
        logger.warning("fastrr_sync_skipped reason=invalid_product_payload")
        return False
    # Accept either a ready webhook payload or a raw catalog row.
    payload = product
    if "variants" not in product or "handle" not in product:
        payload = build_product_payload(product, status=str(product.get("status") or "active"))
    return _post_webhook(
        FASTRR_PRODUCT_WEBHOOK_URL,
        payload,
        entity="product",
        entity_id=payload.get("id"),
    )


def sync_collection(collection: Dict[str, Any]) -> bool:
    """POST collection payload to Fastrr custom collection webhook."""
    if not isinstance(collection, dict):
        logger.warning("fastrr_sync_skipped reason=invalid_collection_payload")
        return False
    payload = collection
    if "handle" not in collection or "title" not in collection:
        payload = build_collection_payload(
            category=str(collection.get("category") or collection.get("title") or "Uncategorized"),
            image_src=str(
                (collection.get("image") or {}).get("src")
                if isinstance(collection.get("image"), dict)
                else collection.get("image") or collection.get("img_url") or ""
            ),
            body_html=str(collection.get("body_html") or collection.get("description") or ""),
            collection_id=collection.get("id"),
            handle=collection.get("handle"),
            title=collection.get("title"),
        )
    return _post_webhook(
        FASTRR_COLLECTION_WEBHOOK_URL,
        payload,
        entity="collection",
        entity_id=payload.get("id"),
    )
