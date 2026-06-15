"""Compress product images: local catalog files and/or Supabase DB base64 blobs.

Usage:
  python compress_product_images.py --local          # compress all-products_files/
  python compress_product_images.py --supabase       # compress base64 images in products table
  python compress_product_images.py --local --dry-run
"""
from __future__ import annotations

import argparse
import base64
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent
FRONTEND = ROOT / "frontend"
CATALOG_DIR = FRONTEND / "all-products_files"

load_dotenv(ROOT.parent / ".env")

MAX_SIDE = 600
QUALITY = 62


def compress_bytes(file_bytes: bytes, *, max_side: int = MAX_SIDE, quality: int = QUALITY) -> bytes:
    image = Image.open(__import__("io").BytesIO(file_bytes))
    image = ImageOps.exif_transpose(image)
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGBA")
    if image.mode == "RGBA":
        background = Image.new("RGBA", image.size, (255, 255, 255, 255))
        background.alpha_composite(image)
        image = background.convert("RGB")
    else:
        image = image.convert("RGB")
    image.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    out = __import__("io").BytesIO()
    image.save(out, format="WEBP", quality=quality, method=6)
    compressed = out.getvalue()
    return compressed if compressed and len(compressed) < len(file_bytes) else file_bytes


def compress_local_catalog(*, dry_run: bool = False) -> None:
    if not CATALOG_DIR.is_dir():
        print(f"Catalog dir not found: {CATALOG_DIR}")
        return

    exts = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
    files = [p for p in CATALOG_DIR.iterdir() if p.is_file() and p.suffix.lower() in exts]
    if not files:
        print("No image files found in catalog folder.")
        return

    before_total = 0
    after_total = 0
    changed = 0
    path_rewrites: dict[str, str] = {}

    print(f"Scanning {len(files)} files in {CATALOG_DIR}")
    for path in sorted(files):
        original = path.read_bytes()
        before_total += len(original)
        try:
            compressed = compress_bytes(original)
        except Exception as exc:
            print(f"  SKIP {path.name}: {exc}")
            after_total += len(original)
            continue

        if len(compressed) >= len(original):
            after_total += len(original)
            continue

        saved_pct = (1 - len(compressed) / len(original)) * 100
        out_path = path.with_suffix(".webp")
        rel_old = f"all-products_files/{path.name}"
        rel_new = f"all-products_files/{out_path.name}"
        print(
            f"  {'DRY' if dry_run else 'OK '} {path.name}: "
            f"{len(original)//1024}KB -> {len(compressed)//1024}KB ({saved_pct:.0f}% smaller)"
        )
        after_total += len(compressed)
        changed += 1
        if rel_old != rel_new:
            path_rewrites[rel_old] = rel_new
        if not dry_run:
            out_path.write_bytes(compressed)
            if out_path.resolve() != path.resolve():
                path.unlink(missing_ok=True)

    products_json = FRONTEND / "assets" / "products.json"
    if path_rewrites and products_json.is_file():
        raw = products_json.read_text(encoding="utf-8")
        updated = raw
        for old, new in path_rewrites.items():
            updated = updated.replace(old, new)
        if updated != raw and not dry_run:
            products_json.write_text(updated, encoding="utf-8")
            print(f"Updated {len(path_rewrites)} image paths in products.json")

    print(
        f"\nLocal summary: {changed}/{len(files)} files compressed; "
        f"{before_total/1024/1024:.2f}MB -> {after_total/1024/1024:.2f}MB"
    )


def compress_supabase(*, dry_run: bool = False) -> None:
    import requests

    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
    if not url or not key:
        print("Supabase credentials missing in .env")
        return

    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    rows = []
    offset = 0
    while True:
        resp = requests.get(
            f"{url}/rest/v1/products?select=id,name,img&order=id.desc&offset={offset}&limit=500",
            headers=headers,
            timeout=60,
        )
        resp.raise_for_status()
        batch = resp.json()
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < 500:
            break
        offset += 500

    print(f"Supabase products in DB: {len(rows)}")
    base64_rows = [r for r in rows if str(r.get("img") or "").startswith("data:image/")]
    print(f"Base64 image products: {len(base64_rows)}")

    if not base64_rows:
        print("Nothing to compress in Supabase DB.")
        return

    sizes = []
    for row in base64_rows:
        m = re.match(r"^data:[^;]+;base64,(.+)$", str(row["img"]), re.DOTALL)
        if m:
            sizes.append(int(len(m.group(1)) * 3 / 4))
    if sizes:
        print(
            f"Current base64 sizes — total {sum(sizes)/1024/1024:.2f}MB, "
            f"avg {sum(sizes)/len(sizes)/1024:.1f}KB, max {max(sizes)/1024:.1f}KB"
        )

    updated = 0
    saved = 0
    for row in base64_rows:
        img = str(row["img"])
        parts = img.split("|")
        new_parts = []
        row_saved = 0
        for part in parts:
            m = re.match(r"^data:[^;]+;base64,(.+)$", part, re.DOTALL)
            if not m:
                new_parts.append(part)
                continue
            original = base64.b64decode(m.group(1))
            compressed = compress_bytes(original)
            row_saved += max(0, len(original) - len(compressed))
            encoded = base64.b64encode(compressed).decode("ascii")
            new_parts.append(f"data:image/webp;base64,{encoded}")
        new_img = "|".join(new_parts)
        if row_saved <= 0:
            continue
        updated += 1
        saved += row_saved
        print(f"  {'DRY' if dry_run else 'OK '} id={row['id']} saved {row_saved//1024}KB")
        if not dry_run:
            requests.patch(
                f"{url}/rest/v1/products?id=eq.{row['id']}",
                headers={**headers, "Prefer": "return=minimal"},
                json={"img": new_img},
                timeout=60,
            ).raise_for_status()

    print(f"\nSupabase summary: {updated} updated, saved {saved/1024/1024:.2f}MB")


def main() -> int:
    parser = argparse.ArgumentParser(description="Compress Shubham Xerox product images")
    parser.add_argument("--local", action="store_true", help="Compress frontend/all-products_files images")
    parser.add_argument("--supabase", action="store_true", help="Compress base64 images in Supabase products table")
    parser.add_argument("--dry-run", action="store_true", help="Report only, do not write")
    args = parser.parse_args()

    if not args.local and not args.supabase:
        parser.error("Pass --local and/or --supabase")

    if args.local:
        compress_local_catalog(dry_run=args.dry_run)
    if args.supabase:
        compress_supabase(dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
