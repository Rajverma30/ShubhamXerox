import os
import logging
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
# Also look in parent directory (useful if running in backend/)
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

logger = logging.getLogger("shubhamxerox.config")


def _require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


# Optional (prevent crash if missing)
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "").strip()
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "").strip()

# Email API Config (Google Apps Script)
GOOGLE_SCRIPT_URL = os.getenv("GOOGLE_SCRIPT_URL", "").strip()


# Existing app settings (kept)
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "").strip()
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "").strip()
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", "").strip()

# Shiprocket Fastrr Checkout API (official)
SHIPROCKET_API_KEY = os.getenv("SHIPROCKET_API_KEY", "").strip()
SHIPROCKET_API_SECRET = os.getenv("SHIPROCKET_API_SECRET", "").strip()
SHIPROCKET_WEBHOOK_SECRET = os.getenv("SHIPROCKET_WEBHOOK_SECRET", "").strip()
SHIPROCKET_CHECKOUT_API_BASE_URL = os.getenv(
    "SHIPROCKET_CHECKOUT_API_BASE_URL",
    "https://checkout-api.shiprocket.com",
).strip().rstrip("/")
SHIPROCKET_CHECKOUT_SESSION_PATH = os.getenv(
    "SHIPROCKET_CHECKOUT_SESSION_PATH",
    "/api/v1/checkout/sessions",
).strip()
if not SHIPROCKET_CHECKOUT_SESSION_PATH.startswith("/"):
    SHIPROCKET_CHECKOUT_SESSION_PATH = f"/{SHIPROCKET_CHECKOUT_SESSION_PATH}"
SITE_BASE_URL = os.getenv("SITE_BASE_URL", "https://shubhamxerox.in").strip().rstrip("/")

JWT_SECRET = os.getenv("JWT_SECRET", "").strip()
JWT_EXPIRES_MINUTES = int(os.getenv("JWT_EXPIRES_MINUTES", "43200"))
ADMIN_DEFAULT_PASSWORD = os.getenv("ADMIN_DEFAULT_PASSWORD", "1234")


OTP_EXPIRY_MINUTES = int(os.getenv("OTP_EXPIRY_MINUTES", "5"))
OTP_RATE_LIMIT_PER_MINUTE = int(os.getenv("OTP_RATE_LIMIT_PER_MINUTE", "3"))
