"""Turn off two-step sign-in for one admin, from the server's shell.

For when the only super admin has lost their phone and cannot use the panel's
own reset. Run it where DATABASE_URL points at the live database (on Render:
the service's Shell tab):

    python -m app.scripts.reset_admin_2fa you@thravic.com

The next sign-in sets the authenticator app up again, which needs a code sent
to that email address.
"""

from __future__ import annotations

import asyncio
import sys

from .. import db


async def _reset(email: str) -> int:
    await db.init_database()
    try:
        row = await db.query_one(
            """
            UPDATE users SET totp_secret = NULL, totp_enabled_at = NULL, totp_last_step = NULL
            WHERE LOWER(email) = LOWER($1) AND role IN ('admin', 'super_admin')
            RETURNING id
            """,
            email,
        )
        if not row:
            print(f"No admin account with the email {email}")
            return 1
        await db.query(
            """
            INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
            VALUES ($1, 'user.reset_2fa', 'user', $1, '{"via": "server shell"}'::jsonb)
            """,
            row["id"],
        )
        print(f"Two-step sign-in reset for {email}. Sign in to set it up again.")
        return 0
    finally:
        await db.close_database()


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python -m app.scripts.reset_admin_2fa <admin email>")
        return 2
    return asyncio.run(_reset(sys.argv[1]))


if __name__ == "__main__":
    raise SystemExit(main())
