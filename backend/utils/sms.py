import logging
from typing import Any, Dict

from twilio.rest import Client


logger = logging.getLogger("shubhamxerox.sms")


def send_otp_twilio(account_sid: str, auth_token: str, service_sid: str, phone: str, otp: str) -> Dict[str, Any]:
    """
    Sends OTP via Twilio Verify service.
    NOTE: We do not log the OTP.
    """
    try:
        client = Client(account_sid, auth_token)
        verification = client.verify.v2.services(service_sid).verifications.create(
            to=f"+91{phone}",
            channel="sms"
        )
        return {"status": "pending", "sid": verification.sid}
    except Exception as e:
        logger.exception("Twilio network error for phone=%s", phone)
        raise RuntimeError("SMS gateway network error") from e


def verify_otp_twilio(account_sid: str, auth_token: str, service_sid: str, phone: str, otp: str) -> Dict[str, Any]:
    """
    Verifies OTP via Twilio Verify service.
    """
    try:
        client = Client(account_sid, auth_token)
        verification_check = client.verify.v2.services(service_sid).verification_checks.create(
            to=f"+91{phone}",
            code=otp
        )
        return {"status": verification_check.status, "valid": verification_check.status == "approved"}
    except Exception as e:
        logger.exception("Twilio verification error for phone=%s", phone)
        raise RuntimeError("SMS gateway error") from e

