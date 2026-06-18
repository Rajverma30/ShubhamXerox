"""Move all Supabase products into frontend/assets/products.json, then delete from DB.

Usage:
  python migrate_db_products_to_local.py          # run migration
  python migrate_db_products_to_local.py --dry-run  # preview only
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import os
import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
from dotenv import load_dotenv
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent
FRONTEND = ROOT / "frontend"
PRODUCTS_JSON = FRONTEND / "assets" / "products.json"
CATALOG_DIR = FRONTEND / "all-products_files"

load_dotenv(ROOT.parent / ".env")
load_dotenv(ROOT / ".env")

STATIC_DEFAULTS = {
    "format": "Physical Book",
    "stock": 100,
    "views": 0,
    "purchases": 0,
    "exam": "",
    "desc": "",
}


def _headers() -> Dict[str, str]:
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY", "")
    return {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def _supabase_url() -> str:
    return os.getenv("SUPABASE_URL", "").rstrip("/")


def fetch_all_db_products() -> List[Dict[str, Any]]:
    url = _supabase_url()
    if not url:
        raise RuntimeError("SUPABASE_URL missing in .env")
    rows: List[Dict[str, Any]] = []
    offset = 0
    while True:
        resp = requests.get(
            f"{url}/rest/v1/products?select=*&order=id.desc&offset={offset}&limit=500",
            headers=_headers(),
            timeout=60,
        )
        resp.raise_for_status()
        batch = resp.json() if resp.content else []
        if not isinstance(batch, list) or not batch:
            break
        rows.extend(batch)
        if len(batch) < 500:
            break
        offset += 500
    return rows


def _select_main_image(src: Any) -> str:
    raw = str(src or "").strip()
    if not raw:
        return ""
    for part in raw.split("|"):
        part = part.strip()
        if part and "logo.png" not in part.lower():
            return part
    return ""


def _save_base64_image(product_id: int, data_uri: str, *, dry_run: bool) -> str:
    match = re.match(r"^data:(image/[a-zA-Z0-9.+-]+);base64,(.+)$", data_uri, re.DOTALL)
    if not match:
        return data_uri

    raw = base64.b64decode(match.group(2), validate=False)
    image = Image.open(io.BytesIO(raw))
    image = ImageOps.exif_transpose(image)
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGBA")
    if image.mode == "RGBA":
        bg = Image.new("RGBA", image.size, (255, 255, 255, 255))
        bg.alpha_composite(image)
        image = bg.convert("RGB")
    else:
        image = image.convert("RGB")
    image.thumbnail((600, 600), Image.Resampling.LANCZOS)

    rel_path = f"all-products_files/db_migrated_{product_id}.webp"
    out_path = FRONTEND / rel_path
    if not dry_run:
        CATALOG_DIR.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(_encode_webp(image))
    return rel_path


def _encode_webp(image: Image.Image) -> bytes:
    buf = io.BytesIO()
    image.save(buf, format="WEBP", quality=62, method=6)
    return buf.getvalue()


def _normalize_img(product_id: int, img: Any, *, dry_run: bool) -> str:
    main = _select_main_image(img)
    if not main:
        return ""
    if main.startswith("data:image/"):
        return _save_base64_image(product_id, main, dry_run=dry_run)
    main = re.sub(r"^\./", "", main)
    if main.startswith("/"):
        main = main.lstrip("/")
    return main


def _db_row_to_static(row: Dict[str, Any], existing: Optional[Dict[str, Any]], *, dry_run: bool) -> Dict[str, Any]:
    pid = row.get("id")
    base = dict(existing) if existing else {}
    for key, val in STATIC_DEFAULTS.items():
        base.setdefault(key, val)

    for key in ("id", "name", "price", "original_price", "category", "exam", "desc", "free_note_id"):
        if key in row and row[key] not in (None, ""):
            base[key] = row[key]

    img = _normalize_img(int(pid), row.get("img"), dry_run=dry_run)
    if img:
        base["img"] = img
    elif existing and existing.get("img"):
        base["img"] = existing["img"]

    base["id"] = pid
    return base


def merge_into_catalog(db_rows: List[Dict[str, Any]], *, dry_run: bool) -> Dict[str, int]:
    if not PRODUCTS_JSON.is_file():
        raise FileNotFoundError(f"Missing catalog: {PRODUCTS_JSON}")

    with open(PRODUCTS_JSON, "r", encoding="utf-8") as f:
        catalog = json.load(f)
    if not isinstance(catalog, list):
        raise ValueError("products.json must be a JSON array")

    by_id: Dict[str, Dict[str, Any]] = {str(r.get("id")): r for r in catalog if isinstance(r, dict)}
    added = updated = 0

    for row in db_rows:
        pid = str(row.get("id"))
        existing = by_id.get(pid)
        merged = _db_row_to_static(row, existing, dry_run=dry_run)
        if existing:
            by_id[pid] = merged
            updated += 1
        else:
            by_id[pid] = merged
            added += 1

    merged_list = sorted(by_id.values(), key=lambda item: int(item.get("id") or 0), reverse=True)

    if not dry_run:
        backup = PRODUCTS_JSON.with_suffix(
            f".bak.{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
        )
        shutil.copy2(PRODUCTS_JSON, backup)
        with open(PRODUCTS_JSON, "w", encoding="utf-8") as f:
            json.dump(merged_list, f, ensure_ascii=False, indent=2)
        print(f"Backup saved: {backup.name}")

    return {"added": added, "updated": updated, "total": len(merged_list)}


def delete_all_db_products(db_rows: List[Dict[str, Any]], *, dry_run: bool) -> None:
    url = _supabase_url()
    ids = [row.get("id") for row in db_rows if row.get("id") is not None]
    if not ids:
        print("No DB products to delete.")
        return

    if dry_run:
        print(f"Would delete {len(ids)} products from Supabase: {ids}")
        return

    # Delete in batches to avoid URL length limits.
    batch_size = 50
    for i in range(0, len(ids), batch_size):
        chunk = ids[i : i + batch_size]
        id_filter = ",".join(str(x) for x in chunk)
        resp = requests.delete(
            f"{url}/rest/v1/products?id=in.({id_filter})",
            headers={**_headers(), "Prefer": "return=minimal"},
            timeout=60,
        )
        resp.raise_for_status()
    print(f"Deleted {len(ids)} products from Supabase DB.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Migrate Supabase products to local products.json")
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without writing")
    args = parser.parse_args()

    db_rows = fetch_all_db_products()
    print(f"Found {len(db_rows)} products in Supabase DB.")

    if not db_rows:
        print("Nothing to migrate.")
        return 0

    stats = merge_into_catalog(db_rows, dry_run=args.dry_run)
    print(
        f"Catalog merge: {stats['added']} added, {stats['updated']} updated, "
        f"{stats['total']} total in products.json"
    )

    delete_all_db_products(db_rows, dry_run=args.dry_run)

    if args.dry_run:
        print("\nDry run complete — no files or DB rows were changed.")
    else:
        print("\nMigration complete. Restart the server and bump PRODUCTS_JSON_BUILD_VERSION in script.js.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
