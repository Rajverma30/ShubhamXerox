import logging

logger = logging.getLogger("shubhamxerox.shiprocket")


def create_shiprocket_order(order_data: dict, items: list) -> dict:
    """
    Legacy logistics helper for manual-order shipping sync.
    Shipping panel APIs are separate from Fastrr Checkout API credentials.
    """
    logger.warning(
        "Shiprocket logistics order sync skipped for %s; configure Fastrr Checkout mode instead.",
        order_data.get("order_id"),
    )
    return {
        "error": "Shiprocket logistics API is not configured. Use Shiprocket Checkout mode for integrated fulfillment.",
    }
