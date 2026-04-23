import os
import logging

logger = logging.getLogger("shubhamxerox.config")


def _require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


# Required (per spec)
SUPABASE_URL = _require_env("SUPABASE_URL")
SUPABASE_KEY = _require_env("SUPABASE_KEY")  # Use service_role key on backend

# SMTP Config for Email OTP
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "vermaraj01110@gmail.com").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()


# Existing app settings (kept)
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "").strip()
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "").strip()
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", "").strip()

JWT_SECRET = os.getenv("JWT_SECRET", "").strip()
JWT_EXPIRES_MINUTES = int(os.getenv("JWT_EXPIRES_MINUTES", "43200"))
ADMIN_DEFAULT_PASSWORD = os.getenv("ADMIN_DEFAULT_PASSWORD", "1234")


OTP_EXPIRY_MINUTES = int(os.getenv("OTP_EXPIRY_MINUTES", "5"))
OTP_RATE_LIMIT_PER_MINUTE = int(os.getenv("OTP_RATE_LIMIT_PER_MINUTE", "3"))

