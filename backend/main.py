import os
import re
import hmac
import base64
import io
import json
import threading
from urllib.parse import quote
import hashlib
import logging
import requests
import random
import time
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, HTTPException, Request, Depends, BackgroundTasks, Response
from fastapi.responses import HTMLResponse, FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
import razorpay
from supabase import create_client, Client
from supabase.client import ClientOptions
import bcrypt
import jwt
from PIL import Image, ImageOps
from config import (
    SUPABASE_URL,
    SUPABASE_KEY,
    SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_ANON_KEY,
    RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET,
    JWT_SECRET,
    JWT_EXPIRES_MINUTES,
    ADMIN_DEFAULT_PASSWORD,
    OTP_EXPIRY_MINUTES,
    OTP_RATE_LIMIT_PER_MINUTE,
)
from utils.otp import generate_and_hash_otp, hash_otp
from utils.email_service import send_otp_email
from utils.rate_limit import PerPhoneRateLimiter

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("shubhamxerox.api")

OTP_CACHE = {}  # In-memory cache for Email OTPs: email -> (otp, expiry_time)
PRODUCTS_CACHE: Dict[str, Dict[str, Any]] = {}
PRODUCTS_CACHE_TTL_SECONDS = 3600
CATALOG_PRODUCTS_CACHE: Dict[str, Any] = {}
CATALOG_PRODUCTS_CACHE_TTL_SECONDS = 300
DB_EXTRA_PRODUCTS_CACHE: Dict[str, Any] = {}
DB_EXTRA_PRODUCTS_CACHE_TTL_SECONDS = 300
DELETED_STATIC_PRODUCTS_CACHE: Dict[str, Any] = {}
DELETED_STATIC_PRODUCTS_CACHE_TTL_SECONDS = 60
APP_BUILD_MARKER = "products-route-v2-requests-cache"
GLOBAL_RATES: Dict[str, float] = {"bw": 1.0, "color": 5.0, "delivery_fee": 70.0}

app = FastAPI(title="Shubham Xerox API")

@app.get("/healthz")
async def healthz():
    return {
        "ok": True,
        "build_marker": APP_BUILD_MARKER,
        "railway_commit": os.getenv("RAILWAY_GIT_COMMIT_SHA", ""),
        "railway_deployment": os.getenv("RAILWAY_DEPLOYMENT_ID", ""),
    }

@app.get("/config.js")
async def get_config_js():
    url = SUPABASE_URL
    anon_key = SUPABASE_ANON_KEY or SUPABASE_KEY
    js_content = f"window.ENV_SUPABASE_URL = '{url}';\nwindow.ENV_SUPABASE_KEY = '{anon_key}';"
    return Response(content=js_content, media_type="application/javascript")


@app.post("/api/visit")
async def record_site_visit():
    return {"count": _increment_visitor_count()}


@app.get("/api/visitors")
async def get_visitor_count():
    return {"count": _read_visitor_count()}

# Configuration for CORS - Update origins in production!
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this to your frontend URL
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_cache_headers(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path

    if path.startswith(("/assets/", "/images/", "/all-products_files/")):
        if path.endswith(("products.json", ".html")):
            response.headers.setdefault("Cache-Control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600")
        else:
            response.headers.setdefault("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable")
    elif path == "/config.js":
        response.headers.setdefault("Cache-Control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600")
    elif path == "/robots.txt":
        response.headers.setdefault("Cache-Control", "public, max-age=3600, s-maxage=86400")

    return response

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
DATA_DIR = os.path.join(BASE_DIR, "data")
templates = Jinja2Templates(directory=FRONTEND_DIR)

DELETED_CATALOG_PATH = os.path.join(DATA_DIR, "deleted_static_products.json")

# Visitor counter: local JSON file only (+1 per day via /api/visit). Never Supabase.
VISITOR_SEED_PATH = os.path.join(DATA_DIR, "visitor_stats.json")
VISITOR_RUNTIME_PATH = (
    os.path.join("/tmp", "visitor_stats.json") if os.getenv("VERCEL") else VISITOR_SEED_PATH
)
_visitor_lock = threading.Lock()
DEFAULT_VISITOR_COUNT = int(os.getenv("VISITOR_COUNT", "2107"))


def _visitor_stats_seed() -> Dict[str, int]:
    if os.path.isfile(VISITOR_SEED_PATH):
        try:
            with open(VISITOR_SEED_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            return {"count": int(data.get("count", DEFAULT_VISITOR_COUNT))}
        except Exception:
            pass
    return {"count": DEFAULT_VISITOR_COUNT}


def _ensure_visitor_stats_file() -> None:
    if os.path.isfile(VISITOR_RUNTIME_PATH):
        return
    runtime_dir = os.path.dirname(VISITOR_RUNTIME_PATH)
    if runtime_dir:
        os.makedirs(runtime_dir, exist_ok=True)
    with open(VISITOR_RUNTIME_PATH, "w", encoding="utf-8") as f:
        json.dump(_visitor_stats_seed(), f)


def _read_visitor_count() -> int:
    with _visitor_lock:
        _ensure_visitor_stats_file()
        try:
            with open(VISITOR_RUNTIME_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            return int(data.get("count", DEFAULT_VISITOR_COUNT))
        except Exception:
            return DEFAULT_VISITOR_COUNT


def _increment_visitor_count() -> int:
    with _visitor_lock:
        _ensure_visitor_stats_file()
        try:
            with open(VISITOR_RUNTIME_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            data = _visitor_stats_seed()
        data["count"] = int(data.get("count", DEFAULT_VISITOR_COUNT)) + 1
        with open(VISITOR_RUNTIME_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f)
        return int(data["count"])

# Mount static files if they exist in the root directory
if os.path.isdir(os.path.join(FRONTEND_DIR, "assets")):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIR, "assets")), name="assets")
if os.path.isdir(os.path.join(FRONTEND_DIR, "images")):
    app.mount("/images", StaticFiles(directory=os.path.join(FRONTEND_DIR, "images")), name="images")
if os.path.isdir(os.path.join(FRONTEND_DIR, "all-products_files")):
    app.mount("/all-products_files", StaticFiles(directory=os.path.join(FRONTEND_DIR, "all-products_files")), name="all-products_files")


@app.get("/healthz")
async def healthz():
    return {
        "ok": True,
        "build_marker": APP_BUILD_MARKER,
        "railway_commit": os.getenv("RAILWAY_GIT_COMMIT_SHA", ""),
        "railway_deployment": os.getenv("RAILWAY_DEPLOYMENT_ID", ""),
    }

# Initialize Razorpay Client
try:
    rzp_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)) if (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET) else None
except Exception as e:
    rzp_client = None
    logger.exception("Error initializing Razorpay client")

# Initialize Supabase Client
try:
    _orig_match = re.match
    re.match = lambda p, s, *a: True if str(s).startswith('sb_') else _orig_match(p, s, *a)
    options = ClientOptions(postgrest_client_timeout=60, storage_client_timeout=60)
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY, options=options)
    re.match = _orig_match
except Exception as e:
    if hasattr(re, 'match') and '_orig_match' in locals() and re.match != _orig_match:
        re.match = _orig_match
    supabase = None
    logger.exception("Error initializing Supabase client")

# --- Pydantic Models for Validation ---

class CreateOrderRequest(BaseModel):
    amount: float # Amount in INR (will be converted to paise internally)
    currency: str = "INR"

class VerifyPaymentRequest(BaseModel):
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str
    order_type: str  # e.g., 'books' or 'photocopy'
    order_data: Dict[str, Any] # The actual payload to insert into Supabase

class RegisterRequest(BaseModel):
    phone: str
    email: str
    name: str
    password: str

class LoginRequest(BaseModel):
    identifier: str
    password: str

class ResetPasswordRequest(BaseModel):
    email: str
    otp: str
    new_password: str

class SendOtpRequest(BaseModel):
    email: str

class VerifyOtpRequest(BaseModel):
    email: str
    otp: str

class AdminProductUpsert(BaseModel):
    name: str
    category: str
    price: float
    original_price: Optional[float] = None
    img: Optional[str] = None
    desc: Optional[str] = Field(default=None, alias="desc")
    exam: Optional[str] = None
    free_note_id: Optional[Any] = None

class BulkDeleteRequest(BaseModel):
    product_ids: List[int]

class BulkUpdateCategoryRequest(BaseModel):
    product_ids: List[int]
    category: str

class CompressPdfRequest(BaseModel):
    bucket: str
    file_name: str

class CreateCodOrderRequest(BaseModel):
    order_data: dict
    order_type: str

class AdminOrderStatusUpdate(BaseModel):
    status: str

class AdminSettingsUpdate(BaseModel):
    bw: float
    color: float
    delivery_fee: Optional[float] = 70.0

class AdminOfferUpdate(BaseModel):
    text: str

# --- Auth / Security ---

bearer_scheme = HTTPBearer(auto_error=False)

def _hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

def _verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception:
        return False

def _issue_jwt(payload: Dict[str, Any]) -> str:
    if not JWT_SECRET:
        raise HTTPException(status_code=500, detail="Server auth not configured")
    now = datetime.now(timezone.utc)
    claims = {
        **payload,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=JWT_EXPIRES_MINUTES)).timestamp()),
    }
    return jwt.encode(claims, JWT_SECRET, algorithm="HS256")

def _decode_jwt(token: str) -> Dict[str, Any]:
    if not JWT_SECRET:
        raise HTTPException(status_code=500, detail="Server auth not configured")
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def verify_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)) -> Dict[str, Any]:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Missing bearer token")
    claims = _decode_jwt(credentials.credentials)
    if not claims.get("phone") or not claims.get("role"):
        raise HTTPException(status_code=401, detail="Invalid token payload")
    return claims

def verify_user_optional(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)) -> Optional[Dict[str, Any]]:
    if not credentials or credentials.scheme.lower() != "bearer" or not credentials.credentials.strip():
        return None
    try:
        claims = _decode_jwt(credentials.credentials)
        if not claims.get("phone") or not claims.get("role"):
            return None
        return claims
    except Exception:
        return None

def verify_admin(user: Dict[str, Any] = Depends(verify_user)) -> Dict[str, Any]:
    if user.get("role") != "admin" and str(user.get("phone") or "") != "6265660387":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

def _require_supabase() -> Client:
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    return supabase

def _supabase_storage_base_url() -> str:
    base_url = str(SUPABASE_URL or "").rstrip("/")
    storage_key = SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY
    if not base_url or not storage_key:
        raise HTTPException(status_code=500, detail="Supabase storage not configured")
    return base_url

def _supabase_storage_headers(extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    storage_key = SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY
    headers = {
        "apikey": storage_key,
        "Authorization": f"Bearer {storage_key}",
    }
    if extra:
        headers.update(extra)
    return headers

def _ensure_storage_bucket(bucket: str) -> None:
    base_url = _supabase_storage_base_url()
    bucket_id = quote(bucket, safe="")
    try:
        get_res = requests.get(
            f"{base_url}/storage/v1/bucket/{bucket_id}",
            headers=_supabase_storage_headers(),
            timeout=20,
        )
        if get_res.status_code == 200:
            return

        logger.info(f"Bucket '{bucket}' check returned status {get_res.status_code}. Attempting to create bucket...")
        create_res = requests.post(
            f"{base_url}/storage/v1/bucket",
            headers=_supabase_storage_headers({"Content-Type": "application/json"}),
            json={"id": bucket, "name": bucket, "public": True, "file_size_limit": 104857600},
            timeout=20,
        )
        if create_res.status_code in (200, 201, 409):
            logger.info(f"Bucket '{bucket}' ensured (status {create_res.status_code}).")
            return
        else:
            logger.warning(f"Storage bucket create returned {create_res.status_code}: {create_res.text}. Continuing anyway.")
    except Exception as e:
        logger.warning(f"Failed to ensure storage bucket '{bucket}': {e}. Continuing anyway.")



def _upload_storage_bytes(bucket: str, file_name: str, file_bytes: bytes, content_type: str) -> str:
    _ensure_storage_bucket(bucket)
    base_url = _supabase_storage_base_url()
    object_path = quote(file_name, safe="/")
    upload_res = requests.post(
        f"{base_url}/storage/v1/object/{quote(bucket, safe='')}/{object_path}",
        headers=_supabase_storage_headers({
            "Content-Type": content_type,
            "x-upsert": "true",
        }),
        data=file_bytes,
        timeout=120,
    )
    if upload_res.status_code not in (200, 201):
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {upload_res.text}")
    return f"{base_url}/storage/v1/object/public/{quote(bucket, safe='')}/{object_path}"

def _safe_storage_filename(filename: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9._-]+", "_", filename or "book.pdf").strip("._")
    if not safe.lower().endswith(".pdf"):
        safe = f"{safe or 'book'}.pdf"
    return safe

otp_rate_limiter = PerPhoneRateLimiter(max_events=OTP_RATE_LIMIT_PER_MINUTE, window_seconds=60)


def _is_valid_phone(phone: str) -> bool:
    return bool(phone) and phone.isdigit() and len(phone) == 10

def _normalize_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", str(phone or ""))
    if len(digits) >= 10:
        return digits[-10:]
    return digits

def _phone_variants(phone: str) -> List[str]:
    normalized = _normalize_phone(phone)
    if not normalized:
        return []
    return list(dict.fromkeys([normalized, f"+91{normalized}", f"91{normalized}", f"0{normalized}"]))

def _normalize_order_phones(payload: Dict[str, Any], table: str) -> None:
    if table == "orders":
        for key in ("customerphone", "customerPhone", "customer_phone"):
            if key in payload and payload[key]:
                payload["customerphone"] = _normalize_phone(payload[key])
                payload.pop("customerPhone", None)
                payload.pop("customer_phone", None)
                break
    else:
        for key in ("customer_phone", "customerphone", "customerPhone"):
            if key in payload and payload[key]:
                payload["customer_phone"] = _normalize_phone(payload[key])
                payload.pop("customerphone", None)
                payload.pop("customerPhone", None)
                break

def _seed_admin_user() -> None:
    """
    Backward compatibility:
    - Ensures admin user exists with phone 6265660387 and role=admin
    - Ensures a password_hash is present (default from ADMIN_DEFAULT_PASSWORD)
    """
    sb = _require_supabase()
    admin_phone = "6265660387"
    try:
        res = sb.table("users").select("phone,name,role,password_hash").eq("phone", admin_phone).execute()
        row = (res.data or [None])[0] if isinstance(res.data, list) else res.data
    except Exception:
        row = None

    if not row:
        sb.table("users").insert({
            "phone": admin_phone,
            "name": "Admin",
            "role": "admin",
            "password_hash": _hash_password(ADMIN_DEFAULT_PASSWORD),
        }).execute()
        return

    updates: Dict[str, Any] = {}
    if row.get("role") != "admin":
        updates["role"] = "admin"
    if not row.get("password_hash"):
        updates["password_hash"] = _hash_password(ADMIN_DEFAULT_PASSWORD)
    if updates:
        sb.table("users").update(updates).eq("phone", admin_phone).execute()

# --- Endpoints ---

def _compress_pdf_bytes(file_bytes: bytes) -> bytes:
    if not file_bytes or not file_bytes.startswith(b"%PDF"):
        return file_bytes
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        out = io.BytesIO()
        doc.save(out, garbage=4, deflate=True, clean=True)
        doc.close()
        compressed = out.getvalue()
        if compressed and len(compressed) < len(file_bytes):
            logger.info("PDF compressed %s -> %s bytes", len(file_bytes), len(compressed))
            return compressed
    except Exception:
        logger.exception("PDF compression failed; using original bytes")
    return file_bytes


def _guess_upload_content_type(file_bytes: bytes, filename: str = "") -> str:
    lower_name = str(filename or "").lower()
    if file_bytes.startswith(b"%PDF") or lower_name.endswith(".pdf"):
        return "application/pdf"
    if file_bytes.startswith(b"\xff\xd8") or lower_name.endswith((".jpg", ".jpeg")):
        return "image/jpeg"
    if file_bytes.startswith(b"\x89PNG") or lower_name.endswith(".png"):
        return "image/png"
    if file_bytes[:4] == b"RIFF" and file_bytes[8:12] == b"WEBP":
        return "image/webp"
    if lower_name.endswith(".webp"):
        return "image/webp"
    return "application/octet-stream"


def _compress_upload_image_bytes(file_bytes: bytes, *, max_side: int = 1200, quality: int = 82) -> tuple:
    content_type = _guess_upload_content_type(file_bytes)
    if not content_type.startswith("image/"):
        return file_bytes, content_type
    try:
        image = Image.open(io.BytesIO(file_bytes))
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
        out = io.BytesIO()
        image.save(out, format="WEBP", quality=quality, method=6)
        compressed = out.getvalue()
        if compressed and len(compressed) < len(file_bytes):
            logger.info("Image compressed %s -> %s bytes", len(file_bytes), len(compressed))
            return compressed, "image/webp"
    except Exception:
        logger.exception("Image compression failed; using original bytes")
    return file_bytes, content_type


def _prepare_upload_bytes(file_bytes: bytes, filename: str = "") -> tuple:
    content_type = _guess_upload_content_type(file_bytes, filename)
    if content_type == "application/pdf":
        return _compress_pdf_bytes(file_bytes), "application/pdf"
    if content_type.startswith("image/"):
        return _compress_upload_image_bytes(file_bytes)
    return file_bytes, content_type


def compress_pdf_task(bucket: str, file_name: str):
    sb = _require_supabase()
    try:
        logger.info("Downloading %s from %s for compression...", file_name, bucket)
        file_bytes = sb.storage.from_(bucket).download(file_name)
        compressed = _compress_pdf_bytes(file_bytes)
        if len(compressed) >= len(file_bytes):
            return
        sb.storage.from_(bucket).upload(
            file_name,
            compressed,
            file_options={"upsert": "true", "contentType": "application/pdf"},
        )
        logger.info("Uploaded compressed %s successfully.", file_name)
    except Exception:
        logger.exception("Failed to compress PDF %s", file_name)

@app.post("/compress-pdf")
async def compress_pdf_endpoint(req: CompressPdfRequest, background_tasks: BackgroundTasks):
    # Non-blocking endpoint to trigger compression
    background_tasks.add_task(compress_pdf_task, req.bucket, req.file_name)
    return {"status": "ok", "message": "Compression task started"}

@app.post("/admin/book-pdf")
async def admin_upload_book_pdf(
    request: Request,
    filename: str,
    title: str,
    pdf_type: str = "free",
    price: float = 0,
    _admin: Dict[str, Any] = Depends(verify_admin),
):
    sb = _require_supabase()
    file_bytes = await request.body()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="PDF file is empty")
    if len(file_bytes) > 100 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="PDF file is too large")
    if not file_bytes.startswith(b"%PDF"):
        logger.warning("Book PDF upload does not start with PDF magic bytes: %s", filename)

    original_size = len(file_bytes)
    file_bytes = _compress_pdf_bytes(file_bytes)
    logger.info("Book PDF upload %s: %s -> %s bytes before storage", filename, original_size, len(file_bytes))

    safe_name = _safe_storage_filename(filename)
    file_name = f"book-attachments/{int(time.time())}_{random.randint(100000, 999999)}_{safe_name}"
    bucket_errors: List[str] = []
    upload_bucket = ""
    public_url = ""

    for bucket in ["free-notes", "products"]:
        try:
            public_url = _upload_storage_bytes(bucket, file_name, file_bytes, "application/pdf")
            upload_bucket = bucket
            break
        except HTTPException as e:
            bucket_errors.append(f"{bucket}: {e.detail}")
            continue

    if not public_url:
        raise HTTPException(status_code=500, detail=" | ".join(bucket_errors) or "PDF upload failed")

    is_paid = (pdf_type or "free").lower() == "paid"
    note_payload: Dict[str, Any] = {
        "title": title,
        "file_url": public_url,
        "is_paid": is_paid,
        "price": float(price or 0) if is_paid else 0,
    }
    note_data = None
    try:
        note_res = sb.table("free_notes").insert(note_payload).execute()
        note_data = (note_res.data or [None])[0] if isinstance(note_res.data, list) else note_res.data
    except Exception as e:
        if "is_paid" not in str(e):
            raise HTTPException(status_code=500, detail=f"PDF uploaded, but database link failed: {e}")
        note_payload.pop("is_paid", None)
        note_payload.pop("price", None)
        note_res = sb.table("free_notes").insert(note_payload).execute()
        note_data = (note_res.data or [None])[0] if isinstance(note_res.data, list) else note_res.data

    if not note_data or not note_data.get("id"):
        raise HTTPException(status_code=500, detail="PDF uploaded, but database link failed")

    return {
        "bucket": upload_bucket,
        "file_name": file_name,
        "public_url": public_url,
        "note": note_data,
        "free_note_id": note_data.get("id"),
    }

@app.post("/photocopy-doc")
async def upload_photocopy_doc(
    request: Request,
    order_id: str,
    index: int = 1,
    filename: str = "document.pdf",
):
    file_bytes = await request.body()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="PDF file is empty")
    if len(file_bytes) > 100 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="PDF file is too large")

    original_size = len(file_bytes)
    file_bytes = _compress_pdf_bytes(file_bytes)
    logger.info("Photocopy PDF upload %s: %s -> %s bytes before storage", filename, original_size, len(file_bytes))

    safe_order = re.sub(r"[^a-zA-Z0-9_-]+", "_", order_id or f"COPY{int(time.time())}")
    safe_name = _safe_storage_filename(filename)
    file_name = f"{safe_order}_{max(int(index or 1), 1)}_{safe_name}"
    public_url = _upload_storage_bytes("photocopy-docs", file_name, file_bytes, "application/pdf")
    return {"bucket": "photocopy-docs", "file_name": file_name, "public_url": public_url}


@app.post("/upload/chat-file")
async def upload_chat_file(request: Request, filename: str = "file"):
    file_bytes = await request.body()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="File is empty")
    if len(file_bytes) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File is too large (max 25 MB)")

    original_size = len(file_bytes)
    file_bytes, content_type = _prepare_upload_bytes(file_bytes, filename)
    logger.info("Chat file upload %s: %s -> %s bytes (%s)", filename, original_size, len(file_bytes), content_type)

    safe_name = re.sub(r"[^a-zA-Z0-9._-]+", "_", filename or "file").strip("._") or "file"
    if content_type == "application/pdf" and not safe_name.lower().endswith(".pdf"):
        safe_name = f"{safe_name}.pdf"
    if content_type == "image/webp" and not safe_name.lower().endswith(".webp"):
        safe_name = f"{os.path.splitext(safe_name)[0] or 'image'}.webp"

    file_name = f"{int(time.time())}_{random.randint(100000, 999999)}_{safe_name}"
    public_url = _upload_storage_bytes("chat-files", file_name, file_bytes, content_type)
    return {"bucket": "chat-files", "file_name": file_name, "public_url": public_url}


@app.on_event("startup")
async def _on_startup():
    if os.getenv("VERCEL"):
        return
    if supabase:
        try:
            _seed_admin_user()
        except Exception as e:
            print(f"Warning: failed to seed admin user: {e}")

@app.post("/register")
async def register(req: RegisterRequest):
    sb = _require_supabase()
    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    role = "user"
    
    existing_phone = sb.table("users").select("phone").eq("phone", req.phone).execute()
    if existing_phone.data:
        raise HTTPException(status_code=409, detail="Phone already registered")
        
    existing_email = sb.table("users").select("email").eq("email", req.email).execute()
    if existing_email.data:
        raise HTTPException(status_code=409, detail="Email already registered")

    sb.table("users").insert({
        "phone": req.phone,
        "email": req.email,
        "name": req.name,
        "role": role,
        "password_hash": _hash_password(req.password),
    }).execute()
    token = _issue_jwt({"phone": req.phone, "email": req.email, "role": role, "name": req.name})
    return {"token": token, "user": {"phone": req.phone, "email": req.email, "role": role, "name": req.name}}

@app.post("/login")
async def login(req: LoginRequest):
    sb = _require_supabase()
    identifier = req.identifier.strip()
    
    res = sb.table("users").select("phone,email,name,role,password_hash").eq("phone", identifier).execute()
    row = (res.data or [None])[0] if isinstance(res.data, list) else res.data
    
    if not row:
        res = sb.table("users").select("phone,email,name,role,password_hash").eq("email", identifier).execute()
        row = (res.data or [None])[0] if isinstance(res.data, list) else res.data

    if not row:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not row.get("password_hash") or not _verify_password(req.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = _issue_jwt({"phone": row["phone"], "email": row.get("email", ""), "role": row.get("role", "user"), "name": row.get("name", "")})
    return {"token": token, "user": {"phone": row["phone"], "email": row.get("email", ""), "role": row.get("role", "user"), "name": row.get("name", "")}}

@app.post("/reset-password")
async def reset_password(req: ResetPasswordRequest):
    sb = _require_supabase()
    if len(req.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    res = sb.table("users").select("email").eq("email", req.email).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="User not found")
    sb.table("users").update({"password_hash": _hash_password(req.new_password)}).eq("email", req.email).execute()
    return {"status": "ok"}


@app.post("/send-otp")
async def send_otp(req: SendOtpRequest):
    email = (req.email or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email address")

    if not otp_rate_limiter.allow(email):
        raise HTTPException(status_code=429, detail="Too many OTP requests. Please wait and try again.")

    try:
        otp = str(random.randint(100000, 999999))
        if send_otp_email(email, otp):
            OTP_CACHE[email] = (otp, time.time() + (OTP_EXPIRY_MINUTES * 60))
        else:
            raise Exception("Email service failed")
    except Exception as e:
        logger.exception(f"Error sending OTP email to {email}")
        raise HTTPException(status_code=500, detail="Failed to send OTP email")

    return {"status": "ok", "message": "OTP sent successfully"}


@app.post("/verify-otp")
async def verify_otp(req: VerifyOtpRequest):
    email = (req.email or "").strip().lower()
    otp = (req.otp or "").strip()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email address")
    if not otp.isdigit() or len(otp) != 6:
        raise HTTPException(status_code=400, detail="Invalid OTP format")

    if email in OTP_CACHE:
        cached_otp, expiry_time = OTP_CACHE[email]
        if time.time() > expiry_time:
            del OTP_CACHE[email]
            raise HTTPException(status_code=400, detail="OTP expired")
        if cached_otp == otp:
            del OTP_CACHE[email]
            return {"status": "ok", "message": "OTP verified successfully"}
        else:
            raise HTTPException(status_code=400, detail="Invalid OTP")
    else:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

@app.get("/me")
async def me(user: Dict[str, Any] = Depends(verify_user)):
    return {"user": {"phone": user["phone"], "role": user["role"], "name": user.get("name", "")}}

@app.get("/user/orders")
async def user_orders(user: Dict[str, Any] = Depends(verify_user)):
    sb = _require_supabase()
    variants = _phone_variants(user.get("phone", ""))
    if not variants:
        return {"books": [], "photocopy": []}

    books_by_id: Dict[str, Dict[str, Any]] = {}
    photo_by_id: Dict[str, Dict[str, Any]] = {}

    for variant in variants:
        books_res = sb.table("orders").select("*").eq("customerphone", variant).execute()
        for row in books_res.data or []:
            books_by_id[str(row.get("id"))] = row

        photo_res = sb.table("photocopy_orders").select("*").eq("customer_phone", variant).execute()
        for row in photo_res.data or []:
            photo_by_id[str(row.get("id"))] = row

    books = sorted(books_by_id.values(), key=lambda o: str(o.get("date") or o.get("created_at") or ""), reverse=True)
    photocopy = sorted(photo_by_id.values(), key=lambda o: str(o.get("created_at") or ""), reverse=True)
    return {"books": books, "photocopy": photocopy}

@app.post("/create-order")
async def create_order(req: CreateOrderRequest, user: Optional[Dict[str, Any]] = Depends(verify_user_optional)):
    if not rzp_client:
        raise HTTPException(status_code=500, detail="Razorpay client not configured")

    amount_paise = int(round(req.amount * 100))
    
    try:
        # Create an order in Razorpay
        order_opts = {
            "amount": amount_paise,
            "currency": req.currency,
            "payment_capture": "1" # Auto-capture
        }
        rzp_order = rzp_client.order.create(data=order_opts)
        
        return {
            "order_id": rzp_order["id"],
            "amount": rzp_order["amount"],
            "currency": rzp_order["currency"],
            "key_id": RAZORPAY_KEY_ID # the frontend needs this to open the checkout
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create order: {str(e)}")


@app.post("/verify-payment")
async def verify_payment(req: VerifyPaymentRequest, user: Optional[Dict[str, Any]] = Depends(verify_user_optional)):
    if not rzp_client or not supabase:
        raise HTTPException(status_code=500, detail="Backend infrastructure not fully configured")

    # 1. Verify Razorpay Signature
    try:
        rzp_client.utility.verify_payment_signature({
            'razorpay_order_id': req.razorpay_order_id,
            'razorpay_payment_id': req.razorpay_payment_id,
            'razorpay_signature': req.razorpay_signature
        })
    except razorpay.errors.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Signature Verification Failed")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 2. Extract specific payload details and structure for database insertion
    table = "orders" if req.order_type == "books" else "photocopy_orders"
    payload = req.order_data.copy()
    
    # 3. Augment data securely on backend
    payload["status"] = "Pending" # Order is valid financially, now pending fulfillment
    if user and user.get("phone"):
        normalized_phone = _normalize_phone(user["phone"])
        if table == "orders":
            payload["customerphone"] = normalized_phone
        else:
            payload["customer_phone"] = normalized_phone
    _normalize_order_phones(payload, table)
    
    # Securely tag the payment method / transaction
    if table == "orders":
        payload["method"] = f"Online (Txn: {req.razorpay_payment_id})"
        # the books table doesn't have a transaction_id column by default, so we embed it
    else:
        payload["payment_method"] = "Online"
        # Since the customer uses a dynamic DB, if it lacks transaction_id we fail-safe:
        payload["transaction_id"] = req.razorpay_payment_id

    # Strip created_at to let database handle timestamps if desired, or let frontend supply it
    
    # 4. Save to Supabase
    try:
        response = supabase.table(table).insert(payload).execute()
        
        # If the user schema lacks transaction_id, it might throw a postgrest error.
        # Fallback mechanism if insertion fails due to a missing column:
        if not response.data:
            raise Exception("No data returned from insert")
            
    except Exception as e:
        # Fallback: some schemas may not have 'transaction_id' mapped in photocopy_orders.
        # Let's remove it and embed it into payment_method just like books
        if "transaction_id" in payload:
            del payload["transaction_id"]
            payload["payment_method"] = f"Online (Txn: {req.razorpay_payment_id})"
            try:
                response = supabase.table(table).insert(payload).execute()
            except Exception as inner_e:
                raise HTTPException(status_code=500, detail=f"Database insertion failed completely: {str(inner_e)}")
        else:
            raise HTTPException(status_code=500, detail=f"Database insertion failed: {str(e)}")

    # 5. Shiprocket Integration
    if table == "orders":
        _trigger_shiprocket_books(payload, is_cod=False)

    return {"status": "success", "message": "Payment verified and order created."}


@app.post("/create-cod-order")
async def create_cod_order(req: CreateCodOrderRequest, user: Optional[Dict[str, Any]] = Depends(verify_user_optional)):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    table = "orders" if req.order_type == "books" else "photocopy_orders"
    payload = req.order_data.copy()
    payload["status"] = "Pending"
    if user and user.get("phone"):
        normalized_phone = _normalize_phone(user["phone"])
        if table == "orders":
            payload["customerphone"] = normalized_phone
        else:
            payload["customer_phone"] = normalized_phone
    _normalize_order_phones(payload, table)
    
    try:
        response = supabase.table(table).insert(payload).execute()
        if not response.data:
            raise Exception("No data returned from insert")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database insertion failed: {str(e)}")

    if table == "orders":
        _trigger_shiprocket_books(payload, is_cod=True)

    return {"status": "success", "message": "COD order created"}


def _trigger_shiprocket_books(db_payload: dict, is_cod: bool):
    try:
        from utils.shiprocket import create_shiprocket_order
        sr_items = []
        for item in db_payload.get("items", []):
            sr_items.append({
                "name": item.get("name", "Book"),
                "sku": str(item.get("id", "sku")),
                "units": item.get("quantity", 1),
                "selling_price": item.get("price", 0)
            })
        
        # Split address if possible, otherwise use fallback
        addr = db_payload.get("address", "")
        
        sr_order_data = {
            "order_id": db_payload.get("id"),
            "date": db_payload.get("date"),
            "payment_method": "COD" if is_cod else "Prepaid",
            "sub_total": db_payload.get("total", 0),
            "customer_name": db_payload.get("customer", "Customer"),
            "customer_phone": db_payload.get("customerphone", ""),
            "shipping_address": addr,
            "shipping_city": "Indore",
            "shipping_pin_code": "452001",
            "shipping_state": "Madhya Pradesh",
            "shipping_country": "India"
        }

        res = create_shiprocket_order(sr_order_data, sr_items)
        if "error" not in res and res.get("shiprocket_order_id"):
            tracking_url = ""
            if res.get("awb_code"):
                tracking_url = f"https://shiprocket.co/tracking/{res['awb_code']}"
            
            update_payload = {
                "shiprocket_order_id": str(res["shiprocket_order_id"]),
                "shipment_id": str(res.get("shipment_id", "")),
                "tracking_url": tracking_url
            }
            supabase.table("orders").update(update_payload).eq("id", db_payload["id"]).execute()
    except Exception as e:
        logger.error(f"Failed to trigger Shiprocket for order {db_payload.get('id')}: {e}")

@app.post("/admin/photocopy-shiprocket")
async def create_photocopy_shiprocket(req: Request, _admin: Dict[str, Any] = Depends(verify_admin)):
    data = await req.json()
    order_id = data.get("order_id")
    if not order_id:
        raise HTTPException(400, "Missing order_id")
        
    res = supabase.table("photocopy_orders").select("*").eq("id", order_id).execute()
    if not res.data:
        raise HTTPException(404, "Order not found")
        
    db_payload = res.data[0]
    
    from utils.shiprocket import create_shiprocket_order
    is_cod = db_payload.get("payment_method", "").lower() == "cod"
    
    sr_items = [{
        "name": f"Photocopy Order {order_id}",
        "sku": "PHOTOCOPY",
        "units": 1,
        "selling_price": db_payload.get("total_amount", 0)
    }]
    
    sr_order_data = {
        "order_id": order_id,
        "date": db_payload.get("created_at"),
        "payment_method": "COD" if is_cod else "Prepaid",
        "sub_total": db_payload.get("total_amount", 0),
        "customer_name": db_payload.get("customer_phone", "Customer"),
        "customer_phone": db_payload.get("customer_phone", ""),
        "shipping_address": db_payload.get("customer_address", ""),
        "shipping_city": "Indore",
        "shipping_pin_code": "452001",
        "shipping_state": "Madhya Pradesh",
        "shipping_country": "India"
    }

    sr_res = create_shiprocket_order(sr_order_data, sr_items)
    if "error" in sr_res:
        raise HTTPException(500, sr_res["error"])
        
    tracking_url = ""
    if sr_res.get("awb_code"):
        tracking_url = f"https://shiprocket.co/tracking/{sr_res['awb_code']}"
        
    update_payload = {
        "status": "Out for Delivery",
        "shiprocket_order_id": str(sr_res["shiprocket_order_id"]),
        "shipment_id": str(sr_res.get("shipment_id", "")),
        "tracking_url": tracking_url
    }
    supabase.table("photocopy_orders").update(update_payload).eq("id", order_id).execute()
    
    return {"status": "success", "tracking_url": tracking_url}

@app.post("/shiprocket-webhook")
async def shiprocket_webhook(request: Request):
    try:
        payload = await request.json()
        status = payload.get("current_status")
        awb = payload.get("awb")
        
        if status == "DELIVERED" and awb:
            # We don't know if it's books or photocopy, so check both
            books_res = supabase.table("orders").select("id").like("tracking_url", f"%{awb}%").execute()
            if books_res.data:
                supabase.table("orders").update({"status": "Delivered"}).eq("id", books_res.data[0]["id"]).execute()
            else:
                photo_res = supabase.table("photocopy_orders").select("id").like("tracking_url", f"%{awb}%").execute()
                if photo_res.data:
                    supabase.table("photocopy_orders").update({"status": "Delivered"}).eq("id", photo_res.data[0]["id"]).execute()
                    
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return {"status": "error"}

# --- Admin protected APIs ---

@app.get("/admin/users")
async def admin_list_users(_admin: Dict[str, Any] = Depends(verify_admin)):
    sb = _require_supabase()
    res = sb.table("users").select("phone,name,role").order("phone").execute()
    return {"users": res.data or []}

@app.delete("/admin/users/{phone}")
async def admin_delete_user(phone: str, _admin: Dict[str, Any] = Depends(verify_admin)):
    if phone == "6265660387":
        raise HTTPException(status_code=400, detail="Cannot delete admin seed user")
    sb = _require_supabase()
    sb.table("users").delete().eq("phone", phone).execute()
    return {"status": "ok"}

def _read_static_catalog_rows_raw() -> List[Dict[str, Any]]:
    path = os.path.join(FRONTEND_DIR, "assets", "products.json")
    rows: List[Dict[str, Any]] = []
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            rows = data if isinstance(data, list) else data.get("products", []) if isinstance(data, dict) else []
            rows = [row for row in rows if isinstance(row, dict)]
        except Exception:
            logger.exception("Failed to read static products catalog")
    return rows


def _load_deleted_static_product_ids() -> set:
    now = time.time()
    cached = DELETED_STATIC_PRODUCTS_CACHE.get("ids")
    if cached is not None and now < float(DELETED_STATIC_PRODUCTS_CACHE.get("expires_at", 0.0)):
        return set(cached)

    deleted: set = set()
    if supabase:
        try:
            res = supabase.table("settings").select("value").eq("key", "deleted_static_product_ids").execute()
            if res.data:
                raw = res.data[0].get("value", [])
                if isinstance(raw, list):
                    deleted = {int(item) for item in raw}
                elif isinstance(raw, dict):
                    ids = raw.get("ids", [])
                    if isinstance(ids, list):
                        deleted = {int(item) for item in ids}
        except Exception:
            logger.exception("Failed to load deleted static product ids from settings")

    if not deleted and os.path.isfile(DELETED_CATALOG_PATH):
        try:
            with open(DELETED_CATALOG_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            ids = data if isinstance(data, list) else data.get("ids", []) if isinstance(data, dict) else []
            deleted = {int(item) for item in ids}
        except Exception:
            logger.exception("Failed to read deleted static product ids file")

    DELETED_STATIC_PRODUCTS_CACHE["ids"] = sorted(deleted)
    DELETED_STATIC_PRODUCTS_CACHE["expires_at"] = now + DELETED_STATIC_PRODUCTS_CACHE_TTL_SECONDS
    return deleted


def _save_deleted_static_product_ids(deleted: set) -> None:
    ids = sorted(int(item) for item in deleted)
    DELETED_STATIC_PRODUCTS_CACHE["ids"] = ids
    DELETED_STATIC_PRODUCTS_CACHE["expires_at"] = time.time() + DELETED_STATIC_PRODUCTS_CACHE_TTL_SECONDS
    CATALOG_PRODUCTS_CACHE.clear()
    SITEMAP_CACHE.clear()

    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(DELETED_CATALOG_PATH, "w", encoding="utf-8") as f:
            json.dump({"ids": ids}, f)
    except Exception:
        logger.exception("Failed to write deleted static product ids file")

    if supabase:
        try:
            supabase.table("settings").upsert({
                "key": "deleted_static_product_ids",
                "value": {"ids": ids},
            }).execute()
        except Exception:
            logger.exception("Failed to save deleted static product ids to settings")


def _get_static_catalog_id_set() -> set:
    ids: set = set()
    for row in _read_static_catalog_rows_raw():
        try:
            ids.add(int(row.get("id")))
        except (TypeError, ValueError):
            continue
    return ids


def _is_static_catalog_product_id(product_id: int) -> bool:
    return product_id in _get_static_catalog_id_set()


def _load_static_catalog_rows() -> List[Dict[str, Any]]:
    now = time.time()
    cached = CATALOG_PRODUCTS_CACHE.get("rows")
    if cached and now < float(CATALOG_PRODUCTS_CACHE.get("expires_at", 0.0)):
        return cached

    deleted = _load_deleted_static_product_ids()
    rows = [
        row for row in _read_static_catalog_rows_raw()
        if int(row.get("id", 0)) not in deleted
    ]

    CATALOG_PRODUCTS_CACHE["rows"] = rows
    CATALOG_PRODUCTS_CACHE["expires_at"] = now + CATALOG_PRODUCTS_CACHE_TTL_SECONDS
    return rows


def _load_db_extra_products() -> List[Dict[str, Any]]:
    now = time.time()
    cached = DB_EXTRA_PRODUCTS_CACHE.get("rows")
    if cached is not None and now < float(DB_EXTRA_PRODUCTS_CACHE.get("expires_at", 0.0)):
        return cached

    rows: List[Dict[str, Any]] = []
    base_url = str(SUPABASE_URL or "").rstrip("/")
    api_key = SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY
    if base_url and api_key:
        try:
            limit = 1000
            offset = 0
            headers = {
                "apikey": api_key,
                "Authorization": f"Bearer {api_key}",
            }
            while True:
                url = (
                    f"{base_url}/rest/v1/products"
                    "?select=id,name,category,price,original_price,img,exam,free_note_id,desc"
                    f"&order=id.desc&offset={offset}&limit={limit}"
                )
                resp = requests.get(url, headers=headers, timeout=(5, 15))
                resp.raise_for_status()
                batch = resp.json() if resp.content else []
                if not isinstance(batch, list) or not batch:
                    break
                rows.extend(batch)
                if len(batch) < limit:
                    break
                offset += limit
        except Exception:
            logger.exception("Failed to load admin-added products from Supabase")

    DB_EXTRA_PRODUCTS_CACHE["rows"] = rows
    DB_EXTRA_PRODUCTS_CACHE["expires_at"] = now + DB_EXTRA_PRODUCTS_CACHE_TTL_SECONDS
    return rows


def _merge_catalog_product_row(static_row: Dict[str, Any], db_row: Dict[str, Any]) -> Dict[str, Any]:
    """Static catalog is the base; DB overrides editable fields but keeps images when DB img is empty."""
    merged = dict(static_row)
    for key in ("name", "price", "original_price", "category", "desc", "exam", "free_note_id"):
        if db_row.get(key) is not None and db_row.get(key) != "":
            merged[key] = db_row[key]
    db_img = _select_main_product_image(db_row.get("img"))
    if db_img:
        merged["img"] = db_row.get("img")
    return merged


def _merge_catalog_products() -> List[Dict[str, Any]]:
    by_id: Dict[str, Dict[str, Any]] = {}
    for row in _load_static_catalog_rows():
        by_id[str(row.get("id"))] = row
    for row in _load_db_extra_products():
        pid = str(row.get("id"))
        static_row = by_id.get(pid)
        by_id[pid] = _merge_catalog_product_row(static_row, row) if static_row else row
    merged = list(by_id.values())
    merged.sort(key=lambda item: int(item.get("id") or 0), reverse=True)
    return merged


def _strip_product_list_images(products: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    cleaned: List[Dict[str, Any]] = []
    for product in products:
        row = dict(product)
        if row.get("img") and isinstance(row["img"], str):
            row["img"] = _select_main_product_image(row["img"])
        cleaned.append(row)
    return cleaned


def _list_catalog_products(
    limit: int,
    offset: int,
    category: Optional[str] = None,
    q: Optional[str] = None,
) -> Dict[str, Any]:
    cat_filter = (category or "").strip().lower()
    search_q = (q or "").strip().lower()
    rows = _merge_catalog_products()

    if cat_filter:
        rows = [row for row in rows if str(row.get("category") or "").strip().lower() == cat_filter]
    if search_q:
        tokens = [token for token in search_q.split() if token]
        filtered: List[Dict[str, Any]] = []
        for row in rows:
            haystack = f"{row.get('name', '')} {row.get('category', '')}".lower()
            if all(token in haystack for token in tokens):
                filtered.append(row)
        rows = filtered

    page = rows[offset: offset + limit + 1]
    has_more = len(page) > limit
    products = _strip_product_list_images(page[:limit] if has_more else page)
    return {
        "products": products,
        "has_more": has_more,
        "limit": limit,
        "offset": offset,
    }


async def list_public_products_helper(
    response: Response,
    limit: int = 40,
    offset: int = 0,
    category: Optional[str] = None,
    q: Optional[str] = None,
):
    response.headers["Cache-Control"] = "public, max-age=300, s-maxage=3600, stale-while-revalidate=7200"
    logger.info("GET /products build=%s", APP_BUILD_MARKER)
    limit = int(limit or 40)
    offset = int(offset or 0)
    if limit < 1:
        raise HTTPException(status_code=400, detail="limit must be >= 1")
    if limit > 100:
        limit = 100
    if offset < 0:
        offset = 0

    cat_filter = (category or "").strip()
    search_q = (q or "").strip()
    cache_key = f"{limit}:{offset}:{cat_filter}:{search_q}"
    now = time.time()
    cached = PRODUCTS_CACHE.get(cache_key)
    if cached and now < float(cached.get("expires_at", 0.0)):
        return {
            "products": cached.get("data", []),
            "has_more": bool(cached.get("has_more", False)),
            "limit": limit,
            "offset": offset,
        }

    try:
        catalog_rows = _load_static_catalog_rows()
        if catalog_rows:
            result = _list_catalog_products(limit, offset, cat_filter or None, search_q or None)
        else:
            base_url = str(SUPABASE_URL or "").rstrip("/")
            if not base_url or not SUPABASE_KEY:
                raise HTTPException(status_code=500, detail="Supabase config missing")

            url = (
                f"{base_url}/rest/v1/products"
                "?select=id,name,category,price,original_price,img,exam,free_note_id"
                f"&order=id.desc&offset={offset}&limit={limit + 1}"
            )
            if cat_filter:
                url += f"&category=eq.{quote(cat_filter, safe='')}"
            if search_q:
                url += f"&or=(name.ilike.*{quote(search_q, safe='')}*,category.ilike.*{quote(search_q, safe='')}*)"
            headers = {
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
            }
            resp = requests.get(url, headers=headers, timeout=(5, 20))
            resp.raise_for_status()
            data = resp.json() if resp.content else []
            rows = data if isinstance(data, list) else []
            has_more = len(rows) > limit
            products = _strip_product_list_images(rows[:limit] if has_more else rows)
            result = {
                "products": products,
                "has_more": has_more,
                "limit": limit,
                "offset": offset,
            }

        PRODUCTS_CACHE[cache_key] = {
            "data": result["products"],
            "has_more": result["has_more"],
            "expires_at": now + PRODUCTS_CACHE_TTL_SECONDS,
        }
        return result
    except Exception as e:
        logger.exception("Error in list_public_products_helper")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/products")
async def list_public_products(
    request: Request,
    response: Response,
    limit: int = 40,
    offset: int = 0,
    category: Optional[str] = None,
    q: Optional[str] = None,
):
    accept = request.headers.get("accept", "")
    if "text/html" in accept:
        products = []
        try:
            products_resp = await list_public_products_helper(response=response, limit=24, offset=0, category=category, q=q)
            products = products_resp.get("products", [])
        except Exception as e:
            logger.warning(f"Failed to load initial products: {e}")
        return templates.TemplateResponse("products.html", {"request": request, "initial_products": json.dumps(products)})
    return await list_public_products_helper(response, limit, offset, category, q)

# Dummy definition to absorb the original function body
async def original_list_public_products_body(
    response: Response,
    limit: int = 40,
    offset: int = 0,
    category: Optional[str] = None,
    q: Optional[str] = None,
):
    response.headers["Cache-Control"] = "public, max-age=20, s-maxage=60, stale-while-revalidate=120"
    logger.info("GET /products build=%s", APP_BUILD_MARKER)
    limit = int(limit or 40)
    offset = int(offset or 0)
    if limit < 1:
        raise HTTPException(status_code=400, detail="limit must be >= 1")
    if limit > 100:
        limit = 100
    if offset < 0:
        offset = 0

    cat_filter = (category or "").strip()
    search_q = (q or "").strip()
    cache_key = f"{limit}:{offset}:{cat_filter}:{search_q}"
    now = time.time()
    cached = PRODUCTS_CACHE.get(cache_key)
    if cached and now < float(cached.get("expires_at", 0.0)):
        return {
            "products": cached.get("data", []),
            "has_more": bool(cached.get("has_more", False)),
            "limit": limit,
            "offset": offset,
        }

    try:
        base_url = str(SUPABASE_URL or "").rstrip("/")
        if not base_url or not SUPABASE_KEY:
            raise HTTPException(status_code=500, detail="Supabase config missing")

        url = (
            f"{base_url}/rest/v1/products"
            "?select=id,name,category,price,original_price,img,exam,free_note_id"
            f"&order=id.desc&offset={offset}&limit={limit + 1}"
        )
        if cat_filter:
            url += f"&category=eq.{quote(cat_filter, safe='')}"
        if search_q:
            url += f"&or=(name.ilike.*{quote(search_q, safe='')}*,category.ilike.*{quote(search_q, safe='')}*)"
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        }
        # Use explicit connect/read timeout to avoid repeated 5s failures.
        resp = requests.get(url, headers=headers, timeout=(5, 20))
        resp.raise_for_status()
        data = resp.json() if resp.content else []
        rows = data if isinstance(data, list) else []
        has_more = len(rows) > limit
        products = rows[:limit] if has_more else rows
        
        # Strip all but the first usable image to drastically reduce payload size for list views
        for p in products:
            if p.get("img") and isinstance(p["img"], str):
                p["img"] = _select_main_product_image(p["img"])
                
        PRODUCTS_CACHE[cache_key] = {
            "data": products,
            "has_more": has_more,
            "expires_at": time.time() + PRODUCTS_CACHE_TTL_SECONDS,
        }
        return {"products": products, "has_more": has_more, "limit": limit, "offset": offset}
    except Exception as e:
        logger.exception("Error fetching products")
        if cached and cached.get("data"):
            return {
                "products": cached.get("data", []),
                "has_more": bool(cached.get("has_more", False)),
                "limit": limit,
                "offset": offset,
            }
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/settings/rates")
async def get_public_rates():
    if supabase:
        try:
            res = supabase.table("settings").select("value").eq("key", "photocopy_rates").execute()
            if res.data and len(res.data) > 0:
                val = res.data[0].get("value", {})
                if "bw" in val and "color" in val:
                    GLOBAL_RATES["bw"] = float(val["bw"])
                    GLOBAL_RATES["color"] = float(val["color"])
                if "delivery_fee" in val:
                    GLOBAL_RATES["delivery_fee"] = float(val["delivery_fee"])
        except Exception as e:
            logger.warning(f"Failed to fetch rates from database settings table: {e}. Using in-memory rates.")

    return {
        "bw": float(GLOBAL_RATES.get("bw", 1.0)),
        "color": float(GLOBAL_RATES.get("color", 5.0)),
        "delivery_fee": float(GLOBAL_RATES.get("delivery_fee", 70.0))
    }

@app.put("/admin/settings/rates")
async def update_global_rates(req: AdminSettingsUpdate, _admin: Dict[str, Any] = Depends(verify_admin)):
    bw = float(req.bw)
    color = float(req.color)
    delivery_fee = float(req.delivery_fee if req.delivery_fee is not None else 70.0)
    if bw <= 0 or color <= 0:
        raise HTTPException(status_code=400, detail="Rates must be positive numbers")
    if delivery_fee < 0:
        raise HTTPException(status_code=400, detail="Delivery fee cannot be negative")
    GLOBAL_RATES["bw"] = round(bw, 2)
    GLOBAL_RATES["color"] = round(color, 2)
    GLOBAL_RATES["delivery_fee"] = round(delivery_fee, 2)

    if supabase:
        try:
            payload = {
                "key": "photocopy_rates",
                "value": {
                    "bw": GLOBAL_RATES["bw"],
                    "color": GLOBAL_RATES["color"],
                    "delivery_fee": GLOBAL_RATES["delivery_fee"]
                }
            }
            supabase.table("settings").upsert(payload).execute()
        except Exception as e:
            logger.warning(f"Failed to save rates to database settings table: {e}")

    return {
        "status": "ok",
        "rates": {
            "bw": GLOBAL_RATES["bw"],
            "color": GLOBAL_RATES["color"],
            "delivery_fee": GLOBAL_RATES["delivery_fee"]
        }
    }

@app.get("/settings/offer")
async def get_public_offer():
    offer_text = "Welcome to Shubham Xerox! Get the best printing rates & notes here."
    if supabase:
        try:
            res = supabase.table("settings").select("value").eq("key", "todays_offer").execute()
            if res.data and len(res.data) > 0:
                val = res.data[0].get("value", {})
                offer_text = val.get("text", offer_text)
        except Exception as e:
            logger.warning(f"Failed to fetch offer from database: {e}")
    return {"text": offer_text}

@app.put("/admin/settings/offer")
async def update_global_offer(req: AdminOfferUpdate, _admin: Dict[str, Any] = Depends(verify_admin)):
    offer_text = req.text.strip()
    if supabase:
        try:
            payload = {
                "key": "todays_offer",
                "value": {"text": offer_text}
            }
            supabase.table("settings").upsert(payload).execute()
        except Exception as e:
            logger.warning(f"Failed to save offer to database: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to save offer to database: {e}")
    return {"status": "ok", "text": offer_text}

@app.get("/admin/products")
async def admin_list_products(
    limit: int = 20,
    offset: int = 0,
    _admin: Dict[str, Any] = Depends(verify_admin),
):
    """
    Admin products list, paginated.
    - limit: page size (max 100)
    - offset: number of rows to skip
    """
    sb = _require_supabase()
    limit = int(limit or 20)
    offset = int(offset or 0)
    if limit < 1:
        raise HTTPException(status_code=400, detail="limit must be >= 1")
    if limit > 100:
        limit = 100
    if offset < 0:
        offset = 0

    # Fetch one extra row to determine has_more without an expensive count.
    end = offset + limit  # inclusive index for range(); gives limit+1 rows
    res = sb.table("products").select("*").order("id", desc=True).range(offset, end).execute()
    rows = res.data or []
    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]
    return {"products": rows, "has_more": has_more, "limit": limit, "offset": offset}

@app.post("/admin/products")
async def admin_add_product(req: AdminProductUpsert, _admin: Dict[str, Any] = Depends(verify_admin)):
    sb = _require_supabase()
    payload = req.model_dump(by_alias=True, exclude_none=True)
    res = sb.table("products").insert(payload).execute()
    PRODUCTS_CACHE.clear()
    DB_EXTRA_PRODUCTS_CACHE.clear()
    return {"product": (res.data or [None])[0] if isinstance(res.data, list) else res.data}

def _update_static_catalog_row(product_id: int, updates: Dict[str, Any]) -> bool:
    path = os.path.join(FRONTEND_DIR, "assets", "products.json")
    rows = _read_static_catalog_rows_raw()
    updated = False
    for row in rows:
        if not isinstance(row, dict):
            continue
        try:
            row_id = int(row.get("id"))
        except (TypeError, ValueError):
            continue
        if row_id != int(product_id):
            continue
        for key, val in updates.items():
            if val is not None:
                row[key] = val
        updated = True
        break
    if not updated:
        return False
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(rows, f, ensure_ascii=False, indent=2)
        CATALOG_PRODUCTS_CACHE.clear()
        PRODUCTS_CACHE.clear()
        SITEMAP_CACHE.clear()
        return True
    except Exception:
        logger.exception("Failed to update static catalog product %s", product_id)
        return False


@app.put("/admin/products/{product_id}")
async def admin_update_product(product_id: int, req: AdminProductUpsert, _admin: Dict[str, Any] = Depends(verify_admin)):
    sb = _require_supabase()
    payload = req.model_dump(by_alias=True, exclude_none=True)
    if _is_static_catalog_product_id(product_id):
        _update_static_catalog_row(product_id, payload)
    res = sb.table("products").update(payload).eq("id", product_id).execute()
    updated_rows = res.data if isinstance(res.data, list) else []
    if not updated_rows:
        try:
            upsert_payload = {**payload, "id": product_id}
            res = sb.table("products").upsert(upsert_payload).execute()
        except Exception:
            logger.exception("Failed to upsert admin product %s", product_id)
    PRODUCTS_CACHE.clear()
    DB_EXTRA_PRODUCTS_CACHE.clear()
    CATALOG_PRODUCTS_CACHE.clear()
    return {"product": (res.data or [None])[0] if isinstance(res.data, list) else res.data}

@app.delete("/admin/products/{product_id}")
async def admin_delete_product(product_id: int, _admin: Dict[str, Any] = Depends(verify_admin)):
    sb = _require_supabase()
    is_catalog = _is_static_catalog_product_id(product_id)
    if is_catalog:
        deleted = _load_deleted_static_product_ids()
        deleted.add(int(product_id))
        _save_deleted_static_product_ids(deleted)
    else:
        sb.table("products").delete().eq("id", product_id).execute()
    PRODUCTS_CACHE.clear()
    DB_EXTRA_PRODUCTS_CACHE.clear()
    return {"status": "ok", "deleted_from": "catalog" if is_catalog else "database"}


@app.post("/admin/products/bulk-delete")
async def admin_bulk_delete_products(req: BulkDeleteRequest, _admin: Dict[str, Any] = Depends(verify_admin)):
    sb = _require_supabase()
    if not req.product_ids:
        return {"status": "ok"}

    static_ids = _get_static_catalog_id_set()
    catalog_ids = [int(pid) for pid in req.product_ids if int(pid) in static_ids]
    db_ids = [int(pid) for pid in req.product_ids if int(pid) not in static_ids]

    if catalog_ids:
        deleted = _load_deleted_static_product_ids()
        deleted.update(catalog_ids)
        _save_deleted_static_product_ids(deleted)
    if db_ids:
        sb.table("products").delete().in_("id", db_ids).execute()

    PRODUCTS_CACHE.clear()
    DB_EXTRA_PRODUCTS_CACHE.clear()
    return {"status": "ok", "catalog_deleted": catalog_ids, "database_deleted": db_ids}


@app.get("/catalog/deleted-ids")
async def get_deleted_catalog_ids():
    deleted = sorted(_load_deleted_static_product_ids())
    return {"ids": deleted}

@app.post("/admin/products/bulk-update-category")
async def admin_bulk_update_category(req: BulkUpdateCategoryRequest, _admin: Dict[str, Any] = Depends(verify_admin)):
    sb = _require_supabase()
    if not req.product_ids:
        return {"status": "ok"}
    sb.table("products").update({"category": req.category}).in_("id", req.product_ids).execute()
    PRODUCTS_CACHE.clear()
    DB_EXTRA_PRODUCTS_CACHE.clear()
    return {"status": "ok"}

def _orders_table_for(order_type: str) -> str:
    if order_type == "books":
        return "orders"
    if order_type == "photocopy":
        return "photocopy_orders"
    raise HTTPException(status_code=400, detail="Invalid order_type")

@app.get("/admin/orders")
async def admin_list_orders(order_type: str = "books", _admin: Dict[str, Any] = Depends(verify_admin)):
    sb = _require_supabase()
    table = _orders_table_for(order_type)
    res = sb.table(table).select("*").execute()
    return {"orders": res.data or []}


def _normalize_order_items_field(items: Any) -> List[Dict[str, Any]]:
    if isinstance(items, list):
        return [item for item in items if isinstance(item, dict)]
    if isinstance(items, str):
        try:
            parsed = json.loads(items)
            if isinstance(parsed, list):
                return [item for item in parsed if isinstance(item, dict)]
        except Exception:
            return []
    return []


def _compute_dashboard_stats(standard_orders: List[Dict[str, Any]], photocopy_orders: List[Dict[str, Any]]) -> Dict[str, Any]:
    total_revenue = 0.0
    pending_revenue = 0.0
    delivered_books = 0
    paid_pdfs_sold = 0
    pdf_orders: List[Dict[str, Any]] = []

    for order in standard_orders or []:
        items = _normalize_order_items_field(order.get("items"))
        has_pdf = any(item.get("type") == "note" for item in items)
        has_book = any(item.get("type") != "note" for item in items) if items else False
        total = float(order.get("total") or 0)
        status = str(order.get("status") or "").strip()

        if has_pdf:
            paid_pdfs_sold += 1
            total_revenue += total
            pdf_orders.append(order)
        elif has_book:
            if status == "Delivered":
                total_revenue += total
                delivered_books += 1
            elif status not in ("Returned", "Cancelled", "Cancel Refund"):
                pending_revenue += total
        else:
            if status == "Delivered":
                total_revenue += total
                delivered_books += 1
            elif status not in ("Returned", "Cancelled", "Cancel Refund"):
                pending_revenue += total

    for order in photocopy_orders or []:
        total = float(order.get("total_cost") or order.get("total") or 0)
        status = str(order.get("status") or "").strip()
        if status in ("Completed", "Delivered"):
            total_revenue += total
        elif status != "Returned":
            pending_revenue += total

    return {
        "total_revenue": total_revenue,
        "pending_revenue": pending_revenue,
        "delivered_books": delivered_books,
        "paid_pdfs_sold": paid_pdfs_sold,
        "pdf_orders": pdf_orders,
    }


@app.get("/admin/dashboard-stats")
async def admin_dashboard_stats(_admin: Dict[str, Any] = Depends(verify_admin)):
    sb = _require_supabase()
    books_res = sb.table("orders").select("*").execute()
    photo_res = sb.table("photocopy_orders").select("*").execute()
    return _compute_dashboard_stats(books_res.data or [], photo_res.data or [])

def _extract_razorpay_payment_id(order: Dict[str, Any]) -> Optional[str]:
    for field in ("method", "payment_method", "transaction_id"):
        source = str(order.get(field) or "")
        match = re.search(r"pay_[a-zA-Z0-9]+", source)
        if match:
            return match.group(0)
    return None


@app.patch("/admin/orders/{order_id}")
async def admin_update_order_status(order_id: str, req: AdminOrderStatusUpdate, order_type: str = "books", _admin: Dict[str, Any] = Depends(verify_admin)):
    blocked_statuses = {"cancelled", "cancel refund"}
    if req.status.strip().lower() in blocked_statuses:
        raise HTTPException(status_code=400, detail="Use Cancel Refund action to cancel and refund orders")
    sb = _require_supabase()
    table = _orders_table_for(order_type)
    sb.table(table).update({"status": req.status}).eq("id", order_id).execute()
    return {"status": "ok"}


@app.post("/admin/orders/{order_id}/cancel-refund")
async def admin_cancel_refund_order(order_id: str, order_type: str = "books", _admin: Dict[str, Any] = Depends(verify_admin)):
    if order_type != "books":
        raise HTTPException(status_code=400, detail="Cancel refund is only supported for book orders")
    if not rzp_client:
        raise HTTPException(status_code=500, detail="Razorpay client not configured")

    sb = _require_supabase()
    table = _orders_table_for(order_type)
    res = sb.table(table).select("*").eq("id", order_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Order not found")

    order = res.data[0]
    status = str(order.get("status") or "Pending").strip()
    status_key = status.lower()

    if status_key in ("delivered", "cancel refund", "cancelled"):
        raise HTTPException(status_code=400, detail=f"Order cannot be refunded in status: {status}")
    if status_key not in ("pending", "processing"):
        raise HTTPException(
            status_code=400,
            detail=f"Cancel refund is only allowed before delivery (Pending/Processing). Current: {status}",
        )

    payment_id = _extract_razorpay_payment_id(order)
    if not payment_id:
        raise HTTPException(status_code=400, detail="No Razorpay payment ID found for this order")

    total = float(order.get("total") or 0)
    amount_paise = int(round(total * 100))
    if amount_paise <= 0:
        raise HTTPException(status_code=400, detail="Invalid order amount for refund")

    try:
        refund = rzp_client.payment.refund(
            payment_id,
            {"amount": amount_paise, "notes": {"order_id": order_id}},
        )
    except Exception as e:
        logger.exception("Razorpay refund failed for order %s", order_id)
        raise HTTPException(status_code=500, detail=f"Razorpay refund failed: {str(e)}")

    refund_id = refund.get("id") if isinstance(refund, dict) else None
    method = str(order.get("method") or "")
    if refund_id:
        method = f"{method} | Refunded ({refund_id})" if method else f"Refunded ({refund_id})"

    sb.table(table).update({"status": "Cancel Refund", "method": method}).eq("id", order_id).execute()
    return {"status": "ok", "refund_id": refund_id, "payment_id": payment_id}


@app.delete("/admin/orders/{order_id}")
async def admin_delete_order(order_id: str, order_type: str = "books", _admin: Dict[str, Any] = Depends(verify_admin)):
    sb = _require_supabase()
    table = _orders_table_for(order_type)
    sb.table(table).delete().eq("id", order_id).execute()
    return {"status": "ok"}

def _trigger_zippee_delivery(db_payload: dict):
    # Mock Zippee API Call
    # Real integration would use requests.post('https://api.zippee.com/...', data=...)
    import uuid
    mock_tracking_id = str(uuid.uuid4())[:8].upper()
    mock_tracking_link = f"https://zippee.com/track/{mock_tracking_id}"
    return {
        "tracking_id": mock_tracking_id,
        "tracking_link": mock_tracking_link,
        "delivery_partner": "Zippee"
    }

@app.post("/admin/orders/{order_id}/start-delivery")
async def start_delivery(order_id: str, order_type: str = "books", _admin: Dict[str, Any] = Depends(verify_admin)):
    sb = _require_supabase()
    table = _orders_table_for(order_type)
    
    # 1. Fetch Order
    res = sb.table(table).select("*").eq("id", order_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Order not found")
    
    order = res.data[0]
    
    # 2. Call Delivery Partner API
    try:
        delivery_info = _trigger_zippee_delivery(order)
    except Exception as e:
        logger.error(f"Zippee API Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to start delivery with partner")
    
    # 3. Update Order in DB
    now = datetime.now(timezone.utc).isoformat()
    update_payload = {
        "status": "Rider Assigned",
        "delivery_status": "Rider Assigned",
        "tracking_id": delivery_info["tracking_id"],
        "tracking_link": delivery_info["tracking_link"],
        "delivery_partner": delivery_info["delivery_partner"],
        "rider_assigned_at": now
    }
    
    try:
        sb.table(table).update(update_payload).eq("id", order_id).execute()
    except Exception as e:
        logger.error(f"Supabase update error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update order status")
        
    return {"status": "success", "tracking_link": delivery_info["tracking_link"]}

@app.post("/zippee-webhook")
async def zippee_webhook(request: Request):
    """
    Webhook to receive delivery updates from Zippee.
    Expected payload example:
    { "tracking_id": "XYZ123", "status": "Delivered" }
    """
    try:
        payload = await request.json()
        tracking_id = payload.get("tracking_id")
        status = payload.get("status") # e.g., "Out For Delivery", "Delivered"
        
        if not tracking_id or not status:
            return {"status": "error", "message": "Missing required fields"}
            
        sb = _require_supabase()
        now = datetime.now(timezone.utc).isoformat()
        
        # We need to search in both tables if order_type isn't provided in webhook
        for table in ["orders", "photocopy_orders"]:
            res = sb.table(table).select("id").eq("tracking_id", tracking_id).execute()
            if res.data:
                order_id = res.data[0]["id"]
                update_payload = {
                    "delivery_status": status,
                    "status": status if status == "Delivered" else "Out For Delivery" # adjust main status if needed
                }
                
                if status == "Out For Delivery":
                    update_payload["out_for_delivery_at"] = now
                elif status == "Delivered":
                    update_payload["delivered_at"] = now
                    
                sb.table(table).update(update_payload).eq("id", order_id).execute()
                break
                
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Zippee Webhook error: {e}")
        return {"status": "error"}


@app.post("/webhook")
async def razorpay_webhook(request: Request):
    """
    Optional bonus endpoint to handle asynchronous payment events.
    """
    body = await request.body()
    signature = request.headers.get("x-razorpay-signature")
    
    if not signature or not RAZORPAY_WEBHOOK_SECRET:
        raise HTTPException(status_code=400, detail="Missing signature or secret")
        
    try:
        rzp_client.utility.verify_webhook_signature(body.decode("utf-8"), signature, RAZORPAY_WEBHOOK_SECRET)
    except razorpay.errors.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid Webhook Signature")
        
    # Example logic: log event or update DB
    # event_data = await request.json()
    # event_type = event_data.get('event')
    
    return {"status": "ok"}


# --- SSR Routes (Serving HTML with Jinja2) ---

@app.get('/', response_class=HTMLResponse)
async def render_home(request: Request):
    products = []
    try:
        products_resp = await list_public_products_helper(response=Response(), limit=10, offset=0)
        products = products_resp.get("products", [])
    except Exception as e:
        logger.warning(f"Failed to load initial home products: {e}")
    return templates.TemplateResponse("index.html", {"request": request, "initial_products": json.dumps(products)})

@app.get('/robots.txt', response_class=FileResponse)
async def get_robots_txt():
    path = os.path.join(FRONTEND_DIR, "robots.txt")
    if os.path.isfile(path):
        return FileResponse(path, media_type="text/plain")
    raise HTTPException(status_code=404, detail="Not Found")

def _xml_escape(value: Any) -> str:
    text = str(value or "")
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )

def _sitemap_base_url(request: Request) -> str:
    configured = os.getenv("SITE_BASE_URL", "").strip().rstrip("/")
    if configured:
        return configured
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or "shubhamxerox.in"
    scheme = request.headers.get("x-forwarded-proto") or request.url.scheme or "https"
    if "localhost" in host or host.startswith("127.0.0.1"):
        return f"{scheme}://{host}".rstrip("/")
    return "https://shubhamxerox.in"

def _build_sitemap_url(loc: str, lastmod: str, changefreq: str, priority: str) -> str:
    return (
        "  <url>\n"
        f"    <loc>{_xml_escape(loc)}</loc>\n"
        f"    <lastmod>{_xml_escape(lastmod)}</lastmod>\n"
        f"    <changefreq>{_xml_escape(changefreq)}</changefreq>\n"
        f"    <priority>{_xml_escape(priority)}</priority>\n"
        "  </url>"
    )

def _fetch_sitemap_product_ids() -> List[int]:
    now = time.time()
    cached = SITEMAP_CACHE.get("product_ids")
    if cached and now < float(cached.get("expires_at", 0.0)):
        return list(cached.get("data", []))

    base_url = str(SUPABASE_URL or "").rstrip("/")
    api_key = SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY
    if not base_url or not api_key:
        logger.warning("Supabase config missing; sitemap will include static URLs only")
        return []

    product_ids: List[int] = []
    limit = 1000
    offset = 0
    headers = {
        "apikey": api_key,
        "Authorization": f"Bearer {api_key}",
    }

    while True:
        url = f"{base_url}/rest/v1/products?select=id&order=id.asc&offset={offset}&limit={limit}"
        resp = requests.get(url, headers=headers, timeout=(5, 20))
        resp.raise_for_status()
        rows = resp.json() if resp.content else []
        if not isinstance(rows, list) or not rows:
            break

        for row in rows:
            try:
                product_ids.append(int(row.get("id")))
            except (TypeError, ValueError):
                continue

        if len(rows) < limit:
            break
        offset += limit

    SITEMAP_CACHE["product_ids"] = {
        "data": product_ids,
        "expires_at": now + SITEMAP_CACHE_TTL_SECONDS,
    }
    return product_ids

def _fetch_static_product_ids() -> List[int]:
    deleted = _load_deleted_static_product_ids()
    product_ids: List[int] = []
    for row in _read_static_catalog_rows_raw():
        if not isinstance(row, dict):
            continue
        try:
            pid = int(row.get("id"))
        except (TypeError, ValueError):
            continue
        if pid in deleted:
            continue
        product_ids.append(pid)
    return product_ids

def _request_base_url(request: Request) -> str:
    configured = os.getenv("SITE_BASE_URL", "").strip().rstrip("/")
    if configured:
        return configured
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or "shubhamxerox.in"
    scheme = request.headers.get("x-forwarded-proto") or request.url.scheme or "https"
    return f"{scheme}://{host}".rstrip("/")

def _parse_product_images(src: Any) -> List[str]:
    if isinstance(src, list):
        return [str(item or "").strip() for item in src]
    raw = str(src or "").strip()
    if not raw:
        return []
    if raw.startswith("["):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [str(item or "").strip() for item in parsed]
        except Exception:
            pass
    if "|" in raw:
        return [item.strip() for item in raw.split("|")]
    if "\n" in raw:
        return [item.strip() for item in raw.splitlines()]
    if not raw.startswith("data:") and "," in raw:
        return [item.strip() for item in raw.split(",")]
    return [raw]

def _is_usable_product_image(src: str) -> bool:
    path = str(src or "").strip().lower()
    if not path:
        return False
    return not (path == "logo.png" or path.endswith("/logo.png") or "images/logo.png" in path)

def _select_main_product_image(src: Any) -> str:
    for item in _parse_product_images(src):
        if _is_usable_product_image(item):
            return item
    return ""

def _normalize_product_image_url(src: Any, base_url: str) -> str:
    path = _select_main_product_image(src)
    if not path:
        return f"{base_url}/images/logo.png"
    if path.startswith(("http://", "https://")):
        return path
    if path.startswith("data:"):
        return f"{base_url}/images/logo.png"
    if "./MPPSC" in path or "./Products -" in path:
        path = f"/images/books_new/{path.split('/')[-1]}"
    else:
        path = re.sub(r"^\./", "", path)
        if re.search(r"\.(png|jpe?g|webp|gif|avif)(\?.*)?$", path, flags=re.IGNORECASE) and not path.startswith(("images/", "assets/", "all-products_files/", "/")):
            bucket = "products"
            object_path = path[len(f"{bucket}/"):] if path.startswith(f"{bucket}/") else path
            object_path = quote(object_path, safe="/%:@?&=+$,#")
            storage_base = str(SUPABASE_URL or "").rstrip("/")
            if storage_base:
                return f"{storage_base}/storage/v1/object/public/{bucket}/{object_path}"
        if not path.startswith("/"):
            path = f"/{path}"
    return f"{base_url}{quote(path, safe='/%:@?&=+$,#')}"

def _product_description(product: Dict[str, Any]) -> str:
    desc = str(product.get("desc") or "").strip()
    if desc.startswith("COMBO_DETAILS:"):
        desc = ""
    if not desc:
        name = str(product.get("name") or "Study material").strip()
        category = str(product.get("category") or "books and notes").strip()
        desc = f"{name} available at Shubham Xerox. Premium {category} for exam preparation and study needs."
    desc = re.sub(r"\s+", " ", desc)
    return desc[:280]

def _social_title(name: str) -> str:
    clean = re.sub(r"\s+", " ", str(name or "").strip())
    if len(clean) <= 65:
        return clean
    trimmed = clean[:65].rsplit(" ", 1)[0].strip()
    return f"{(trimmed or clean[:65]).rstrip(' ,-|')}..."

def _social_description(name: str) -> str:
    clean = _social_title(name)
    return clean or "Shubham Xerox Books"

def _shared_page_url(request: Request) -> str:
    scheme = request.headers.get("x-forwarded-proto") or request.url.scheme or "https"
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or "www.shubhamxerox.in"
    return f"{scheme}://{host}{request.url.path}".rstrip("/")

def _public_storage_object_url(bucket: str, object_path: str) -> str:
    base_url = _supabase_storage_base_url()
    return f"{base_url}/storage/v1/object/public/{quote(bucket, safe='')}/{quote(object_path, safe='/')}"

def _product_source_image_bytes(product: Dict[str, Any], base_url: str) -> Optional[bytes]:
    selected_image = _select_main_product_image(product.get("img"))
    if not selected_image:
        return None

    if selected_image.startswith("data:image/"):
        match = re.match(r"^data:(image/[a-zA-Z0-9.+-]+);base64,(.+)$", selected_image, flags=re.DOTALL)
        if not match:
            return None
        try:
            return base64.b64decode(match.group(2), validate=False)
        except Exception:
            return None

    local_bytes = _local_image_bytes(selected_image)
    if local_bytes:
        return local_bytes

    image_url = _normalize_product_image_url(selected_image, base_url)
    local_path_match = re.match(r"^https?://[^/]+/(images|assets|all-products_files)/(.+)$", image_url)
    if local_path_match:
        local_bytes = _local_image_bytes(f"{local_path_match.group(1)}/{local_path_match.group(2)}")
        if local_bytes:
            return local_bytes

    if image_url.startswith(("http://", "https://")):
        try:
            upstream = requests.get(image_url, timeout=(5, 20))
            upstream.raise_for_status()
            return upstream.content
        except Exception:
            logger.exception("Failed to download product image for social preview")
    return None

OG_PREVIEW_BUCKET = "products"
OG_PREVIEW_PREFIX = "og-previews-v3"
OG_IMAGE_BYTES_CACHE: Dict[str, Dict[str, Any]] = {}

def _og_preview_object_path(product_id: str) -> str:
    safe_id = re.sub(r"[^a-zA-Z0-9_-]+", "_", str(product_id or "product")).strip("_") or "product"
    return f"{OG_PREVIEW_PREFIX}/{safe_id}.jpg"

def _ensure_product_og_preview_url(product_id: str, product: Dict[str, Any], base_url: str) -> str:
    selected_image = _select_main_product_image(product.get("img"))
    if not selected_image:
        return f"{base_url}/images/logo.png"
    return f"{base_url}/product-og-image/{quote(str(product_id), safe='')}.jpg"

def _load_static_product(product_id: str) -> Optional[Dict[str, Any]]:
    try:
        pid = int(product_id)
    except (TypeError, ValueError):
        pid = None
    if pid is not None and pid in _load_deleted_static_product_ids():
        return None
    for row in _read_static_catalog_rows_raw():
        if isinstance(row, dict) and str(row.get("id")) == str(product_id):
            return row
    return None

def _load_db_product(product_id: str) -> Optional[Dict[str, Any]]:
    if not _is_numeric_product_id(product_id):
        return None
    base_url = str(SUPABASE_URL or "").rstrip("/")
    api_key = SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY
    if not base_url or not api_key:
        return None
    url = (
        f"{base_url}/rest/v1/products"
        "?select=id,name,category,price,original_price,img,exam,free_note_id,desc"
        f"&id=eq.{quote(product_id, safe='')}&limit=1"
    )
    headers = {
        "apikey": api_key,
        "Authorization": f"Bearer {api_key}",
    }
    resp = requests.get(url, headers=headers, timeout=(5, 15))
    resp.raise_for_status()
    rows = resp.json() if resp.content else []
    if isinstance(rows, list) and rows:
        return rows[0]
    return None

def _product_meta_context(request: Request, product_id: str) -> Dict[str, Any]:
    base_url = _request_base_url(request)
    product = None
    try:
        product = _load_db_product(product_id)
    except Exception:
        logger.exception("Failed to load DB product metadata")
    if not product:
        product = _load_static_product(product_id)

    fallback_title = "Product Details | Shubham Xerox"
    fallback_desc = "Buy study material, books, notes and print services from Shubham Xerox."
    canonical_slug = _canonical_product_slug(str(product_id))
    product_url = _shared_page_url(request) if str(request.url.path or "").startswith("/products/") else f"{base_url}/products/{quote(canonical_slug, safe='-')}"
    if not product:
        return {
            "meta_title": fallback_title,
            "meta_description": fallback_desc,
            "meta_url": product_url,
            "og_title": fallback_title,
            "og_description": fallback_desc,
            "og_image": f"{base_url}/images/logo.png",
            "og_url": product_url,
            "og_type": "website",
            "initial_products": "[]",
        }

    name = str(product.get("name") or fallback_title).strip()
    desc = _product_description(product)
    image = _ensure_product_og_preview_url(str(product_id), product, base_url)
    social_product = {**product, "img": _select_main_product_image(product.get("img"))}
    return {
        "meta_title": f"{name} | Shubham Xerox",
        "meta_description": desc,
        "meta_url": product_url,
        "og_title": _social_title(name),
        "og_description": _social_description(name),
        "og_image": image,
        "og_url": product_url,
        "og_type": "website",
        "initial_products": json.dumps([social_product]),
    }

def _local_image_file_response(path: str) -> Optional[FileResponse]:
    clean_path = re.sub(r"^\./", "", str(path or "").strip()).lstrip("/")
    allowed_roots = {
        "images": os.path.join(FRONTEND_DIR, "images"),
        "assets": os.path.join(FRONTEND_DIR, "assets"),
        "all-products_files": os.path.join(FRONTEND_DIR, "all-products_files"),
    }
    root_name = clean_path.split("/", 1)[0]
    root = allowed_roots.get(root_name)
    if not root:
        return None
    relative = clean_path.split("/", 1)[1] if "/" in clean_path else ""
    file_path = os.path.abspath(os.path.join(root, relative))
    if not file_path.startswith(os.path.abspath(root)) or not os.path.isfile(file_path):
        return None
    return FileResponse(
        file_path,
        headers={"Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800"},
    )

def _local_image_bytes(path: str) -> Optional[bytes]:
    clean_path = re.sub(r"^\./", "", str(path or "").strip()).lstrip("/")
    allowed_roots = {
        "images": os.path.join(FRONTEND_DIR, "images"),
        "assets": os.path.join(FRONTEND_DIR, "assets"),
        "all-products_files": os.path.join(FRONTEND_DIR, "all-products_files"),
    }
    root_name = clean_path.split("/", 1)[0]
    root = allowed_roots.get(root_name)
    if not root:
        return None
    relative = clean_path.split("/", 1)[1] if "/" in clean_path else ""
    file_path = os.path.abspath(os.path.join(root, relative))
    if not file_path.startswith(os.path.abspath(root)) or not os.path.isfile(file_path):
        return None
    with open(file_path, "rb") as f:
        return f.read()

SOCIAL_IMAGE_WIDTH = 1200
SOCIAL_IMAGE_HEIGHT = 1600

def _build_social_jpeg_bytes(image_bytes: bytes) -> bytes:
    image = Image.open(io.BytesIO(image_bytes))
    image = ImageOps.exif_transpose(image)
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGBA")

    if image.mode == "RGBA":
        background = Image.new("RGBA", image.size, (255, 255, 255, 255))
        background.alpha_composite(image)
        image = background.convert("RGB")
    else:
        image = image.convert("RGB")

    fitted = ImageOps.fit(
        image,
        (SOCIAL_IMAGE_WIDTH, SOCIAL_IMAGE_HEIGHT),
        method=Image.Resampling.LANCZOS,
        centering=(0.5, 0.5),
    )

    out = io.BytesIO()
    fitted.save(out, format="JPEG", quality=92, optimize=True)
    return out.getvalue()

def _jpeg_social_image_response(image_bytes: bytes, *, head_only: bool = False) -> Response:
    jpeg_bytes = _build_social_jpeg_bytes(image_bytes)
    headers = {
        "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800",
        "Content-Type": "image/jpeg",
        "Content-Length": str(len(jpeg_bytes)),
        "Accept-Ranges": "bytes",
    }
    if head_only:
        return Response(content=b"", media_type="image/jpeg", headers=headers)
    return Response(content=jpeg_bytes, media_type="image/jpeg", headers=headers)

def _normalize_product_og_image_path(product_path: str) -> str:
    segment = str(product_path or "").strip().strip("/")
    return re.sub(r"\.(jpg|jpeg|png|webp|gif)$", "", segment, flags=re.IGNORECASE)

@app.api_route('/product-og-image/{product_id}', methods=['GET', 'HEAD'])
async def get_product_og_image(request: Request, product_id: str):
    segment = _normalize_product_og_image_path(product_id)
    product = _resolve_product_from_path(segment)
    if not product:
        resolved_product_id = _extract_product_id(segment)
        if resolved_product_id:
            product = _load_product_record(resolved_product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product image not found")

    product_id = str(product.get("id") or segment)
    base_url = _request_base_url(request)

    def _respond(image_bytes: bytes) -> Response:
        return _jpeg_social_image_response(image_bytes, head_only=(request.method == "HEAD"))

    source_bytes = _product_source_image_bytes(product, base_url)
    if not source_bytes:
        logo_path = os.path.join(FRONTEND_DIR, "images", "logo.png")
        with open(logo_path, "rb") as f:
            return _respond(f.read())

    cache_key = product_id
    cached = OG_IMAGE_BYTES_CACHE.get(cache_key)
    if cached and time.time() < float(cached.get("expires_at", 0.0)):
        return _respond(cached["bytes"])

    try:
        jpeg_bytes = _build_social_jpeg_bytes(source_bytes)
    except Exception:
        logger.exception("Failed to build OG JPEG for product %s", product_id)
        raise HTTPException(status_code=404, detail="Product image not found")

    OG_IMAGE_BYTES_CACHE[cache_key] = {"bytes": jpeg_bytes, "expires_at": time.time() + 86400.0}
    return _respond(jpeg_bytes)

def _slugify_product_name(name: Any) -> str:
    text = str(name or "").strip().lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text[:120] or "product"

def _assign_product_slugs(rows: List[Dict[str, Any]]) -> Dict[str, str]:
    sorted_rows = sorted(rows, key=lambda row: int(row.get("id") or 0))
    id_to_slug: Dict[str, str] = {}
    base_seen: Dict[str, int] = {}
    for row in sorted_rows:
        base = _slugify_product_name(row.get("name", ""))
        base_seen[base] = base_seen.get(base, 0) + 1
        count = base_seen[base]
        slug = base if count == 1 else f"{base}-{count}"
        id_to_slug[str(row.get("id"))] = slug
    return id_to_slug

PRODUCT_SLUG_CACHE: Dict[str, Any] = {"expires_at": 0.0, "id_to_slug": {}, "slug_to_id": {}}

def _load_static_products() -> List[Dict[str, Any]]:
    path = os.path.join(FRONTEND_DIR, "assets", "products.json")
    if not os.path.isfile(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        logger.exception("Failed to read static products")
        return []
    rows = data if isinstance(data, list) else data.get("products", []) if isinstance(data, dict) else []
    return [row for row in rows if isinstance(row, dict)]

def _load_all_db_products() -> List[Dict[str, Any]]:
    base_url = str(SUPABASE_URL or "").rstrip("/")
    api_key = SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY
    if not base_url or not api_key:
        return []

    rows: List[Dict[str, Any]] = []
    limit = 1000
    offset = 0
    headers = {
        "apikey": api_key,
        "Authorization": f"Bearer {api_key}",
    }
    while True:
        url = (
            f"{base_url}/rest/v1/products"
            "?select=id,name,category,price,original_price,img,exam,free_note_id,desc"
            f"&order=id.asc&offset={offset}&limit={limit}"
        )
        resp = requests.get(url, headers=headers, timeout=(5, 20))
        resp.raise_for_status()
        batch = resp.json() if resp.content else []
        if not isinstance(batch, list) or not batch:
            break
        rows.extend(batch)
        if len(batch) < limit:
            break
        offset += limit
    return rows

def _refresh_product_slug_cache(force: bool = False) -> None:
    now = time.time()
    if not force and now < float(PRODUCT_SLUG_CACHE.get("expires_at", 0.0)):
        return

    merged: Dict[str, Dict[str, Any]] = {}
    for row in _load_static_products():
        merged[str(row.get("id"))] = row
    for row in _load_all_db_products():
        pid = str(row.get("id"))
        static_row = merged.get(pid)
        merged[pid] = _merge_catalog_product_row(static_row, row) if static_row else row

    id_to_slug = _assign_product_slugs(list(merged.values()))
    slug_to_id = {slug: pid for pid, slug in id_to_slug.items()}
    PRODUCT_SLUG_CACHE["id_to_slug"] = id_to_slug
    PRODUCT_SLUG_CACHE["slug_to_id"] = slug_to_id
    PRODUCT_SLUG_CACHE["expires_at"] = now + 300.0

def _canonical_product_slug(product_id: str) -> str:
    _refresh_product_slug_cache()
    return PRODUCT_SLUG_CACHE.get("id_to_slug", {}).get(str(product_id), str(product_id))

def _is_numeric_product_id(value: str) -> bool:
    text = str(value or "").strip()
    return text.isdigit() or (text.startswith("-") and text[1:].isdigit())

def _load_product_record(product_id: str) -> Optional[Dict[str, Any]]:
    static_product = _load_static_product(product_id)
    db_product = None
    try:
        db_product = _load_db_product(product_id)
    except Exception:
        logger.exception("Failed to load DB product %s", product_id)
    if static_product and db_product:
        return _merge_catalog_product_row(static_product, db_product)
    return db_product or static_product

def _resolve_product_from_path(product_path: str) -> Optional[Dict[str, Any]]:
    segment = str(product_path or "").strip().strip("/")
    if not segment:
        return None

    if _is_numeric_product_id(segment):
        return _load_product_record(segment)

    _refresh_product_slug_cache()
    product_id = PRODUCT_SLUG_CACHE.get("slug_to_id", {}).get(segment.lower())
    if not product_id:
        product_id = PRODUCT_SLUG_CACHE.get("slug_to_id", {}).get(segment)
    if product_id:
        return _load_product_record(product_id)

    # Case-insensitive fallback
    for slug, pid in PRODUCT_SLUG_CACHE.get("slug_to_id", {}).items():
        if slug.lower() == segment.lower():
            return _load_product_record(pid)
    return None

def _extract_product_id(product_path: str) -> Optional[str]:
    segment = str(product_path or "").strip().strip("/")
    if not segment:
        return None
    if _is_numeric_product_id(segment):
        return segment
    product = _resolve_product_from_path(segment)
    if product and product.get("id") is not None:
        return str(product.get("id"))
    return None

@app.get('/sitemap.xml')
async def get_sitemap_xml(request: Request):
    base_url = _sitemap_base_url(request)
    today = datetime.now(timezone.utc).date().isoformat()
    static_pages = [
        ("/", "daily", "1.0"),
        ("/products", "daily", "0.9"),
        ("/e-books", "weekly", "0.8"),
        ("/spiral-copies", "monthly", "0.7"),
        ("/combo-deals", "monthly", "0.7"),
        ("/stationery", "monthly", "0.6"),
    ]

    urls = [
        _build_sitemap_url(f"{base_url}{path}", today, changefreq, priority)
        for path, changefreq, priority in static_pages
    ]

    static_product_ids = set(_fetch_static_product_ids())
    try:
        dynamic_product_ids = set(_fetch_sitemap_product_ids())
    except Exception:
        logger.exception("Failed to fetch products for sitemap")
        dynamic_product_ids = set(SITEMAP_CACHE.get("product_ids", {}).get("data", []))

    product_ids = sorted(static_product_ids | dynamic_product_ids)
    _refresh_product_slug_cache(force=True)
    urls.extend(
        _build_sitemap_url(
            f"{base_url}/products/{quote(_canonical_product_slug(str(product_id)), safe='-')}",
            today,
            "weekly",
            "0.8",
        )
        for product_id in product_ids
    )

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(urls)
        + "\n</urlset>\n"
    )
    return Response(
        content=xml,
        media_type="application/xml",
        headers={"Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=3600"},
    )

@app.get('/products/lookup/{product_slug}')
async def lookup_product_by_slug(product_slug: str):
    product = _resolve_product_from_path(product_slug)
    if not product or product.get("id") is None:
        raise HTTPException(status_code=404, detail="Product not found")
    product_id = str(product.get("id"))
    return {
        "product": product,
        "id": product_id,
        "canonical_slug": _canonical_product_slug(product_id),
        "canonical_path": f"/products/{quote(_canonical_product_slug(product_id), safe='-')}",
    }

@app.get('/products/{product_path:path}', response_class=HTMLResponse)
async def render_product_detail(request: Request, product_path: str):
    segment = str(product_path or "").strip().strip("/")
    if not segment:
        raise HTTPException(status_code=404, detail="Product not found")

    product = _resolve_product_from_path(segment)
    if not product or product.get("id") is None:
        raise HTTPException(status_code=404, detail="Product not found")

    resolved_product_id = str(product.get("id"))
    canonical_slug = _canonical_product_slug(resolved_product_id)
    if segment != canonical_slug and segment.lower() != canonical_slug.lower():
        redirect_url = f"/products/{quote(canonical_slug, safe='-')}"
        if request.url.query:
            redirect_url = f"{redirect_url}?{request.url.query}"
        return RedirectResponse(url=redirect_url, status_code=301)

    context = {"request": request, **_product_meta_context(request, resolved_product_id)}
    response = templates.TemplateResponse("product.html", context)
    response.headers["Content-Type"] = "text/html; charset=utf-8"
    response.headers["Cache-Control"] = "public, max-age=60, s-maxage=300, stale-while-revalidate=600"
    return response

@app.get('/index.html')
async def redirect_index_html(request: Request):
    q = str(request.query_params)
    url = "/"
    if q:
        url += f"?{q}"
    return RedirectResponse(url=url, status_code=301)

@app.get('/index')
async def redirect_index(request: Request):
    q = str(request.query_params)
    url = "/"
    if q:
        url += f"?{q}"
    return RedirectResponse(url=url, status_code=301)

@app.get('/{page_name}.html')
async def redirect_html_page(request: Request, page_name: str):
    q = str(request.query_params)
    url = f"/{page_name}"
    if q:
        url += f"?{q}"
    return RedirectResponse(url=url, status_code=301)

@app.get('/{page_name}', response_class=HTMLResponse)
async def render_page(request: Request, page_name: str):
    if page_name == "index":
        return RedirectResponse(url="/", status_code=301)
    
    if page_name == "product":
        product_id = request.query_params.get("id", "").strip()
        is_valid = False
        if product_id:
            if product_id.startswith('-'):
                is_valid = product_id[1:].isdigit()
            else:
                is_valid = product_id.isdigit()
        if not is_valid:
            return RedirectResponse(url="/products.html", status_code=308)

    path = os.path.join(FRONTEND_DIR, f"{page_name}.html")
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Page not found")
    products = []
    if page_name in ["products", "index"]:
        initial_limit = 24 if page_name == "products" else 10
        try:
            products_resp = await list_public_products_helper(response=Response(), limit=initial_limit, offset=0)
            products = products_resp.get("products", [])
        except Exception as e:
            logger.warning(f"Failed to load initial {page_name} products: {e}")
        
    try:
        if page_name == "product":
            product_id = request.query_params.get("id", "").strip()
            if product_id and _is_numeric_product_id(product_id):
                slug = _canonical_product_slug(product_id)
                return RedirectResponse(url=f"/products/{quote(slug, safe='-')}", status_code=301)
            context = {"request": request, **_product_meta_context(request, product_id)}
            response = templates.TemplateResponse("product.html", context)
            response.headers["Cache-Control"] = "public, max-age=60, s-maxage=300, stale-while-revalidate=600"
            return response
        return templates.TemplateResponse(f"{page_name}.html", {"request": request, "initial_products": json.dumps(products)})
    except Exception:
        raise HTTPException(status_code=404, detail="Page not found")

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    return HTMLResponse(content=f'<pre>{traceback.format_exc()}</pre>', status_code=500)
