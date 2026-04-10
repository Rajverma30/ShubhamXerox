import os
import hmac
import hashlib
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
import razorpay
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", "")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not all([RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY]):
    print("Warning: Missing essential environment variables. Please check your .env file.")

app = FastAPI(title="Shubham Xerox API")

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
    rzp_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
except Exception as e:
    rzp_client = None
    print(f"Error initializing Razorpay client: {e}")

# Initialize Supabase Client
try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
except Exception as e:
    supabase = None
    print(f"Error initializing Supabase client: {e}")

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

# --- Endpoints ---

@app.post("/create-order")
async def create_order(req: CreateOrderRequest):
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
async def verify_payment(req: VerifyPaymentRequest):
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
