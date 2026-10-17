import os

# Settings are read at import time; these keep tests off any real project.
os.environ.update({
    "SUPABASE_URL": "https://test.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY": "test-service-key",
    "LEMONSQUEEZY_PRO_VARIANT_ID": "111",
    "LEMONSQUEEZY_PREMIUM_VARIANT_ID": "222",
    "LEMONSQUEEZY_WEBHOOK_SECRET": "ls-secret",
    "RAZORPAY_PRO_PLAN_ID": "plan_pro",
    "RAZORPAY_PREMIUM_PLAN_ID": "plan_premium",
    "RAZORPAY_WEBHOOK_SECRET": "rzp-secret",
    "CRON_SECRET": "cron-secret",
    "BYOK_ENCRYPTION_KEY": "_-zbP31M-3JgiBx9yoHlcf8g-fUjHl8PjZiRvo8HqkY=",
    "GROQ_API_KEY": "hosted-test-key",
})

SECOND_FERNET_KEY = "zEgx5fL378rW9xQMWmukkrs5-o_0ReksLg1Dl9IOZmg="
