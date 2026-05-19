import os
from dotenv import load_dotenv
from twilio.rest import Client

load_dotenv()

account_sid = os.getenv("TWILIO_ACCOUNT_SID")
auth_token = os.getenv("TWILIO_AUTH_TOKEN")
service_sid = os.getenv("TWILIO_SERVICE_SID")
phone = "6265660387" # Using admin phone or any number just to see the error

try:
    print("Testing Twilio...")
    client = Client(account_sid, auth_token)
    verification = client.verify.services(service_sid).verifications.create(
        to=f"+91{phone}",
        channel="sms"
    )
    print("Success! SID:", verification.sid)
except Exception as e:
    print("Twilio Error:", str(e))
