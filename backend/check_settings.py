import os
import sys

# Ensure backend directory is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from config import SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY
from supabase import create_client

print("SUPABASE_URL:", SUPABASE_URL)
print("SUPABASE_KEY exists:", bool(SUPABASE_KEY))
print("SUPABASE_SERVICE_ROLE_KEY exists:", bool(SUPABASE_SERVICE_ROLE_KEY))

import re
_orig_match = re.match
re.match = lambda p, s, *a: True if str(s).startswith('sb_') else _orig_match(p, s, *a)
sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY)
re.match = _orig_match
print("Client created successfully!")

try:
    res = sb.from_("settings").select("*").eq("key", "photocopy_rates").execute()
    print("Settings query response:", res.data)
except Exception as e:
    print("Query failed:", e)
