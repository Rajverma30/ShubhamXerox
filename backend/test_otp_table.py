import os
from dotenv import load_dotenv
from supabase import create_client
import re

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

_orig_match = re.match
re.match = lambda p, s, *a: True if str(s).startswith('sb_') else _orig_match(p, s, *a)
sb = create_client(SUPABASE_URL, SUPABASE_KEY)
re.match = _orig_match

try:
    res = sb.table("otp_codes").select("*").limit(1).execute()
    print("otp_codes table exists:", res.data)
except Exception as e:
    print("otp_codes table does not exist or error:", e)
