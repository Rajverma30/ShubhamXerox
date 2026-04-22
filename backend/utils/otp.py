import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Tuple


def generate_otp() -> str:
    # 6-digit numeric OTP, never persisted in plaintext
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_otp(otp: str) -> str:
    return hashlib.sha256(otp.encode("utf-8")).hexdigest()


def expiry_timestamp(minutes: int) -> datetime:
    return datetime.now(timezone.utc) + timedelta(minutes=minutes)


def generate_and_hash_otp(expiry_minutes: int) -> Tuple[str, str, datetime]:
    otp = generate_otp()
    return otp, hash_otp(otp), expiry_timestamp(expiry_minutes)

