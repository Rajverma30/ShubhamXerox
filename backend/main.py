import os
import re
import hmac
import hashlib
import logging
import requests
import random
import time
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
import razorpay
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
PRODUCTS_CACHE: Dict[str, Any] = {"data": [], "expires_at": 0.0}
PRODUCTS_CACHE_TTL_SECONDS = 20
APP_BUILD_MARKER = "products-route-v2-requests-cache"

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

    return {"status": "success", "message": "Payment verified and order created."}

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
async def list_public_products():
    logger.info("GET /products build=%s", APP_BUILD_MARKER)
    now = time.time()
    if PRODUCTS_CACHE["data"] and now < PRODUCTS_CACHE["expires_at"]:
        return {"products": PRODUCTS_CACHE["data"]}

    try:
        base_url = str(SUPABASE_URL or "").rstrip("/")
        if not base_url or not SUPABASE_KEY:
            raise HTTPException(status_code=500, detail="Supabase config missing")

        url = (
            f"{base_url}/rest/v1/products"
            "?select=id,name,category,price,original_price,img,desc,exam&order=id.desc"
        )
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        }
        # Use explicit connect/read timeout to avoid repeated 5s failures.
        resp = requests.get(url, headers=headers, timeout=(5, 20))
        resp.raise_for_status()
        data = resp.json() if resp.content else []
        products = data if isinstance(data, list) else []
        PRODUCTS_CACHE["data"] = products
        PRODUCTS_CACHE["expires_at"] = time.time() + PRODUCTS_CACHE_TTL_SECONDS
        return {"products": products}
    except Exception as e:
        logger.exception("Error fetching products")
        if PRODUCTS_CACHE["data"]:
            return {"products": PRODUCTS_CACHE["data"]}
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/admin/products")
async def admin_list_products(_admin: Dict[str, Any] = Depends(verify_admin)):
    sb = _require_supabase()
    res = sb.table("products").select("*").order("id", desc=True).execute()
    return {"products": res.data or []}

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
