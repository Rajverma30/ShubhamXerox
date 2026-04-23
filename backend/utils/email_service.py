import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging
from config import SMTP_SERVER, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD

logger = logging.getLogger(__name__)

def send_otp_email(to_email: str, otp: str):
    if not SMTP_PASSWORD:
        logger.error("SMTP_PASSWORD is not set. Cannot send email.")
        return False

    msg = MIMEMultipart()
    msg['From'] = f"Shubham Xerox <{SMTP_USERNAME}>"
    msg['To'] = to_email
    msg['Subject'] = "Your Shubham Xerox Verification Code"

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
    msg.attach(MIMEText(body, 'html'))

    try:
        if SMTP_PORT == 465:
            server = smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT, timeout=10)
        else:
            server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=10)
            server.starttls()
        server.login(SMTP_USERNAME, SMTP_PASSWORD)
        server.send_message(msg)
        server.quit()
        logger.info(f"OTP email sent successfully to {to_email}")
        return True
    except Exception as e:
        logger.exception(f"Failed to send email to {to_email}")
        raise e
