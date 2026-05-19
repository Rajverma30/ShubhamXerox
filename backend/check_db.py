import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

# Wait, Supabase client cannot do DDL (ALTER TABLE) directly unless using REST RPC or executing SQL through a postgres client.
# The user's Supabase key might be a service role key. Let's try to query the table schema or just run an RPC.
# But we can't run raw SQL easily via the JS/Python Supabase client without an RPC like `exec_sql`.

