import requests
import logging
from config import GOOGLE_SCRIPT_URL

logger = logging.getLogger(__name__)

def send_otp_email(to_email: str, otp: str):
    if not GOOGLE_SCRIPT_URL:
        logger.error("GOOGLE_SCRIPT_URL is not set. Cannot send email.")
        return False

    subject = "Your Shubham Xerox Verification Code"
    body = f"""
    <html>
      <body>
        <h3>Shubham Xerox Verification</h3>
        <p>Your OTP for verification is: <strong>{otp}</strong></p>
        <p>Please do not share this code with anyone.</p>
        <p>Regards,<br>Shubham Xerox Team</p>
      </body>
    </html>
    """
    
    try:
        response = requests.post(
            GOOGLE_SCRIPT_URL,
            json={"to": to_email, "subject": subject, "htmlBody": body},
            timeout=15
        )
        data = response.json()
        if data.get("status") == "success":
            logger.info(f"OTP email sent successfully to {to_email} via Google Apps Script")
            return True
        else:
            logger.error(f"Google Script returned error: {data}")
            return False
    except Exception as e:
        logger.exception(f"Failed to send email to {to_email} via Google Script")
        return False
