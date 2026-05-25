import os
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import PlainTextResponse

app = FastAPI(title="Shubham Xerox API")

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.chdir(BACKEND_DIR)

try:
    from main import app as main_app  # noqa: E402

    app = main_app
except Exception:  # pragma: no cover - deployment diagnostics
    import traceback

    STARTUP_TRACEBACK = traceback.format_exc()

    @app.get("/{path:path}")
    async def startup_failed(path: str):
        return PlainTextResponse(
            f"FastAPI startup failed:\n\n{STARTUP_TRACEBACK}",
            status_code=500,
        )

application = app
handler = app
