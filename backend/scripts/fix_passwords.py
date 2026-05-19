import os
import bcrypt
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

def main():
    print("=== Supabase Password Fixer ===")
    
    url = input("Enter Supabase URL (or press Enter to use .env): ").strip()
    key = input("Enter Supabase Service Key (or press Enter to use .env): ").strip()
    
    if not url:
        url = os.getenv("SUPABASE_URL")
    if not key:
        key = os.getenv("SUPABASE_KEY")
        
    if not url or not key:
        print("Error: Missing Supabase URL or Key.")
        return
        
    supabase: Client = create_client(url, key)
    
    print("\nFetching users...")
    res = supabase.table("users").select("id, phone, email, password_hash").execute()
    users = res.data or []
    
    if not users:
        print("No users found.")
        return
        
    updated_count = 0
    for user in users:
        pwd = user.get("password_hash")
        
        # If no password or already a bcrypt hash (starts with $2b$ or $2a$)
        if not pwd or pwd.startswith("$2b$") or pwd.startswith("$2a$"):
            continue
            
        print(f"Hashing plain-text password for user: {user.get('phone')} / {user.get('email')}")
        hashed_pwd = hash_password(pwd)
        
        supabase.table("users").update({"password_hash": hashed_pwd}).eq("id", user["id"]).execute()
        updated_count += 1
        
    print(f"\nDone! Successfully hashed passwords for {updated_count} users.")
    print("Users can now log in using their original passwords.")

if __name__ == "__main__":
    main()
