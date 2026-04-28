import requests
import logging
from config import SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD, SHIPROCKET_PICKUP_LOCATION

logger = logging.getLogger("shubhamxerox.shiprocket")

BASE_URL = "https://apiv2.shiprocket.in/v1/external"

_token = None

def get_shiprocket_token():
    global _token
    if _token:
        # Simplistic caching. For robust production, check token expiry.
        return _token

    if not SHIPROCKET_EMAIL or not SHIPROCKET_PASSWORD:
        logger.warning("Shiprocket credentials not configured.")
        return None

    try:
        res = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": SHIPROCKET_EMAIL, "password": SHIPROCKET_PASSWORD},
            timeout=10
        )
        data = res.json()
        if res.status_code == 200 and "token" in data:
            _token = data["token"]
            return _token
        else:
            logger.error(f"Shiprocket auth failed: {data}")
            return None
    except Exception as e:
        logger.error(f"Error authenticating with Shiprocket: {e}")
        return None

def create_shiprocket_order(order_data: dict, items: list) -> dict:
    """
    order_data: {
        "order_id": str,
        "date": str,
        "payment_method": "Prepaid" | "COD",
        "sub_total": float,
        "customer_name": str,
        "customer_email": str,
        "customer_phone": str,
        "shipping_address": str,
        "shipping_city": str,
        "shipping_pin_code": str,
        "shipping_state": str,
        "shipping_country": str
    }
    items: [{
        "name": str,
        "sku": str,
        "units": int,
        "selling_price": float
    }]
    """
    token = get_shiprocket_token()
    if not token:
        return {"error": "Authentication failed or not configured"}

    payload = {
        "order_id": str(order_data["order_id"]),
        "order_date": order_data["date"],
        "pickup_location": SHIPROCKET_PICKUP_LOCATION,
        "channel_id": "",
        "comment": "",
        "billing_customer_name": order_data.get("customer_name", "Customer"),
        "billing_last_name": "",
        "billing_address": order_data.get("shipping_address", ""),
        "billing_address_2": "",
        "billing_city": order_data.get("shipping_city", ""),
        "billing_pincode": order_data.get("shipping_pin_code", ""),
        "billing_state": order_data.get("shipping_state", "Madhya Pradesh"),
        "billing_country": order_data.get("shipping_country", "India"),
        "billing_email": order_data.get("customer_email", "customer@shubhamxerox.in"),
        "billing_phone": order_data.get("customer_phone", ""),
        "shipping_is_billing": True,
        "order_items": items,
        "payment_method": order_data.get("payment_method", "Prepaid"),
        "shipping_charges": 0,
        "giftwrap_charges": 0,
        "transaction_charges": 0,
        "total_discount": 0,
        "sub_total": order_data.get("sub_total", 0),
        "length": 10,
        "breadth": 10,
        "height": 10,
        "weight": 0.5
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}"
    }

    try:
        res = requests.post(f"{BASE_URL}/orders/create/ad-hoc", json=payload, headers=headers, timeout=10)
        data = res.json()
        if res.status_code == 200 and data.get("order_id"):
            # successfully created
            return {
                "shiprocket_order_id": data["order_id"],
                "shipment_id": data.get("shipment_id"),
                "status_code": data.get("status_code"),
                "awb_code": data.get("awb_code")
            }
        else:
            logger.error(f"Failed to create Shiprocket order: {data}")
            return {"error": data.get("message", "Unknown API error")}
    except Exception as e:
        logger.error(f"Shiprocket API exception: {e}")
        return {"error": str(e)}

