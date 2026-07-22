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

def _env_first(*names: str) -> str:
    for name in names:
        value = os.getenv(name, "").strip()
        if value:
            return value
    return ""


# Shiprocket Fastrr Checkout API (official)
# Accept common aliases — exact name must still exist in Railway Variables.
# Fallback keys only if Railway env is empty (move to Railway Variables when possible).
_SHIPROCKET_API_KEY_FALLBACK = "rdPDPq4KGC3caj3Q"
_SHIPROCKET_API_SECRET_FALLBACK = "L5T7KIM8855YFcJp87f9TCJDWqfEjADa"
SHIPROCKET_API_KEY = _env_first(
    "SHIPROCKET_API_KEY",
    "FASTRR_API_KEY",
    "SHIPROCKET_CHECKOUT_API_KEY",
    "X_API_KEY",
) or _SHIPROCKET_API_KEY_FALLBACK
SHIPROCKET_API_SECRET = _env_first(
    "SHIPROCKET_API_SECRET",
    "FASTRR_API_SECRET",
    "SHIPROCKET_CHECKOUT_API_SECRET",
) or _SHIPROCKET_API_SECRET_FALLBACK
SHIPROCKET_WEBHOOK_SECRET = _env_first(
    "SHIPROCKET_WEBHOOK_SECRET",
    "FASTRR_WEBHOOK_SECRET",
) or SHIPROCKET_API_SECRET

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
# Live storefront is www — apex (shubhamxerox.in) is not attached on Railway and returns 404.
_SITE_BASE_DEFAULT = "https://www.shubhamxerox.in"
SITE_BASE_URL = os.getenv("SITE_BASE_URL", _SITE_BASE_DEFAULT).strip().rstrip("/")
if SITE_BASE_URL in ("https://shubhamxerox.in", "http://shubhamxerox.in"):
    SITE_BASE_URL = _SITE_BASE_DEFAULT
API_BASE_URL = os.getenv("API_BASE_URL", "").strip().rstrip("/") or SITE_BASE_URL
if API_BASE_URL in ("https://shubhamxerox.in", "http://shubhamxerox.in"):
    API_BASE_URL = SITE_BASE_URL
SHIPROCKET_CHECKOUT_UI_BASE_URL = os.getenv(
    "SHIPROCKET_CHECKOUT_UI_BASE_URL",
    "https://fastrr-boost-ui.pickrr.com",
).strip().rstrip("/")
# Must match Domain Name in Shiprocket Fastrr dashboard exactly (often jetshop subdomain, not storefront URL).
FASTRR_SELLER_DOMAIN = (
    os.getenv("FASTRR_SELLER_DOMAIN", "").strip()
    or "shubham-xerox.jetshop.co"
)

JWT_SECRET = os.getenv("JWT_SECRET", "").strip()
JWT_EXPIRES_MINUTES = int(os.getenv("JWT_EXPIRES_MINUTES", "43200"))
ADMIN_DEFAULT_PASSWORD = os.getenv("ADMIN_DEFAULT_PASSWORD", "1234")


OTP_EXPIRY_MINUTES = int(os.getenv("OTP_EXPIRY_MINUTES", "5"))
OTP_RATE_LIMIT_PER_MINUTE = int(os.getenv("OTP_RATE_LIMIT_PER_MINUTE", "3"))
