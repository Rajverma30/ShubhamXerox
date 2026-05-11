import os
import re
import hmac
from urllib.parse import quote
import hashlib
import logging
import requests
import random
import time
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, HTTPException, Request, Depends, BackgroundTasks, Response
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
import razorpay
import fitz  # PyMuPDF
from supabase import create_client, Client
from supabase.client import ClientOptions
import bcrypt
import jwt
from config import (
    SUPABASE_URL,
    SUPABASE_KEY,
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
PRODUCTS_CACHE_TTL_SECONDS = 20
APP_BUILD_MARKER = "products-route-v2-requests-cache"
GLOBAL_RATES: Dict[str, float] = {"bw": 1.0, "color": 5.0}

app = FastAPI(title="Shubham Xerox API")

@app.get("/healthz")
async def healthz():
    return {
        "ok": True,
        "build_marker": APP_BUILD_MARKER,
        "railway_commit": os.getenv("RAILWAY_GIT_COMMIT_SHA", ""),
        "railway_deployment": os.getenv("RAILWAY_DEPLOYMENT_ID", ""),
    }

# Configuration for CORS - Update origins in production!
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this to your frontend URL
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
templates = Jinja2Templates(directory=FRONTEND_DIR)

# Mount static files if they exist in the root directory
if os.path.isdir(os.path.join(FRONTEND_DIR, "assets")):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIR, "assets")), name="assets")
if os.path.isdir(os.path.join(FRONTEND_DIR, "images")):
    app.mount("/images", StaticFiles(directory=os.path.join(FRONTEND_DIR, "images")), name="images")

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
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY, options=options)
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
    free_note_id: Optional[str] = None

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

def verify_admin(user: Dict[str, Any] = Depends(verify_user)) -> Dict[str, Any]:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

def _require_supabase() -> Client:
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    return supabase


otp_rate_limiter = PerPhoneRateLimiter(max_events=OTP_RATE_LIMIT_PER_MINUTE, window_seconds=60)


def _is_valid_phone(phone: str) -> bool:
    return bool(phone) and phone.isdigit() and len(phone) == 10

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

def compress_pdf_task(bucket: str, file_name: str):
    sb = _require_supabase()
    try:
        logger.info(f"Downloading {file_name} from {bucket} for compression...")
        file_bytes = sb.storage.from_(bucket).download(file_name)
        
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        
        out_path = f"temp_{file_name.replace('/', '_')}"
        doc.save(out_path, garbage=4, deflate=True, clean=True)
        doc.close()
        
        new_size = os.path.getsize(out_path)
        logger.info(f"Compressed {file_name}: {len(file_bytes)} -> {new_size} bytes")
        
        if new_size < len(file_bytes):
            with open(out_path, "rb") as f:
                # Re-upload and overwrite
                sb.storage.from_(bucket).upload(
                    file_name,
                    f,
                    file_options={"upsert": "true", "contentType": "application/pdf"}
                )
            logger.info(f"Uploaded compressed {file_name} successfully.")
        
        if os.path.exists(out_path):
            os.remove(out_path)
    except Exception as e:
        logger.error(f"Failed to compress PDF {file_name}: {e}")
        if 'out_path' in locals() and os.path.exists(out_path):
            try:
                os.remove(out_path)
            except:
                pass

@app.post("/compress-pdf")
async def compress_pdf_endpoint(req: CompressPdfRequest, background_tasks: BackgroundTasks):
    # Non-blocking endpoint to trigger compression
    background_tasks.add_task(compress_pdf_task, req.bucket, req.file_name)
    return {"status": "ok", "message": "Compression task started"}


@app.on_event("startup")
async def _on_startup():
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

@app.post("/create-order")
async def create_order(req: CreateOrderRequest, user: Dict[str, Any] = Depends(verify_user)):
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
async def verify_payment(req: VerifyPaymentRequest, user: Dict[str, Any] = Depends(verify_user)):
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
async def create_cod_order(req: CreateCodOrderRequest, user: Dict[str, Any] = Depends(verify_user)):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    table = "orders" if req.order_type == "books" else "photocopy_orders"
    payload = req.order_data.copy()
    payload["status"] = "Pending"
    
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

@app.get("/products")
async def list_public_products(
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
            url += f"&name=ilike.*{quote(search_q, safe='')}*"
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
        
        # Strip all but the main image to drastically reduce payload size for list views
        for p in products:
            if p.get("img") and isinstance(p["img"], str):
                p["img"] = p["img"].split("|")[0]
                
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
    return {"bw": float(GLOBAL_RATES.get("bw", 1.0)), "color": float(GLOBAL_RATES.get("color", 5.0))}

@app.put("/admin/settings/rates")
async def update_global_rates(req: AdminSettingsUpdate, _admin: Dict[str, Any] = Depends(verify_admin)):
    bw = float(req.bw)
    color = float(req.color)
    if bw <= 0 or color <= 0:
        raise HTTPException(status_code=400, detail="Rates must be positive numbers")
    GLOBAL_RATES["bw"] = round(bw, 2)
    GLOBAL_RATES["color"] = round(color, 2)
    return {"status": "ok", "rates": {"bw": GLOBAL_RATES["bw"], "color": GLOBAL_RATES["color"]}}

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
    return {"product": (res.data or [None])[0] if isinstance(res.data, list) else res.data}

@app.put("/admin/products/{product_id}")
async def admin_update_product(product_id: int, req: AdminProductUpsert, _admin: Dict[str, Any] = Depends(verify_admin)):
    sb = _require_supabase()
    payload = req.model_dump(by_alias=True, exclude_none=True)
    res = sb.table("products").update(payload).eq("id", product_id).execute()
    return {"product": (res.data or [None])[0] if isinstance(res.data, list) else res.data}

@app.delete("/admin/products/{product_id}")
async def admin_delete_product(product_id: int, _admin: Dict[str, Any] = Depends(verify_admin)):
    sb = _require_supabase()
    sb.table("products").delete().eq("id", product_id).execute()
    return {"status": "ok"}

@app.post("/admin/products/bulk-delete")
async def admin_bulk_delete_products(req: BulkDeleteRequest, _admin: Dict[str, Any] = Depends(verify_admin)):
    sb = _require_supabase()
    if not req.product_ids:
        return {"status": "ok"}
    sb.table("products").delete().in_("id", req.product_ids).execute()
    return {"status": "ok"}

@app.post("/admin/products/bulk-update-category")
async def admin_bulk_update_category(req: BulkUpdateCategoryRequest, _admin: Dict[str, Any] = Depends(verify_admin)):
    sb = _require_supabase()
    if not req.product_ids:
        return {"status": "ok"}
    sb.table("products").update({"category": req.category}).in_("id", req.product_ids).execute()
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

@app.patch("/admin/orders/{order_id}")
async def admin_update_order_status(order_id: str, req: AdminOrderStatusUpdate, order_type: str = "books", _admin: Dict[str, Any] = Depends(verify_admin)):
    sb = _require_supabase()
    table = _orders_table_for(order_type)
    sb.table(table).update({"status": req.status}).eq("id", order_id).execute()
    return {"status": "ok"}

@app.delete("/admin/orders/{order_id}")
async def admin_delete_order(order_id: str, order_type: str = "books", _admin: Dict[str, Any] = Depends(verify_admin)):
    sb = _require_supabase()
    table = _orders_table_for(order_type)
    sb.table(table).delete().eq("id", order_id).execute()
    return {"status": "ok"}

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


import json

# --- SSR Routes (Serving HTML with Jinja2) ---

@app.get('/', response_class=HTMLResponse)
async def render_home(request: Request):
    # Fetch top 10 products to inject into initial HTML
    products_resp = await list_public_products(response=Response(), limit=10, offset=0)
    products = products_resp.get("products", [])
    return templates.TemplateResponse("index.html", {"request": request, "initial_products": json.dumps(products)})

@app.get('/{page_name}.html', response_class=HTMLResponse)
async def render_page(request: Request, page_name: str):
    products = []
    if page_name in ["products", "index"]:
        initial_limit = 24 if page_name == "products" else 10
        products_resp = await list_public_products(response=Response(), limit=initial_limit, offset=0)
        products = products_resp.get("products", [])
        
    try:
        return templates.TemplateResponse(f"{page_name}.html", {"request": request, "initial_products": json.dumps(products)})
    except Exception:
        raise HTTPException(status_code=404, detail="Page not found")

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    return HTMLResponse(content=f'<pre>{traceback.format_exc()}</pre>', status_code=500)
