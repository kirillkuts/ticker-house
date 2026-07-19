# 026 — User system: chats and dashboards per user

## Request
Add a user system. All chats and dashboards belong to a user.

## Scope
- Use PostgresSQL
- User accounts (auth/login — mechanism TBD).
- Chats scoped to the logged-in user.
- Dashboards / saved widgets scoped to the user.

## Status
**Status:** done

Resolution: Postgres 17 joins docker-compose (`ticker-house-postgres`, db/user/pass
ticker/ticker); `DATABASE_URL` added to web/.env(.local). New `lib/db.ts` (pg pool +
idempotent schema: users, sessions, chats, dashboard_widgets, all user-scoped with
ON DELETE CASCADE) and `lib/auth.ts` (scrypt password hashes, opaque 30-day session
tokens in Postgres, httpOnly `th_session` cookie; createUser/verifyUser/currentUser/
requireUser). `/login` page handles both sign-in and account creation; Header gets a
Sign out button. Chats and dashboard recipes moved from ClickHouse to Postgres keyed
by user_id — the chat upsert refuses to change owners, loads/lists/removes all filter
by owner, and every mutating server action calls requireUser(). All three pages
redirect to /login when signed out. Verified: 16-assertion DB script
(web/scripts/verify-026.ts — signup/login, wrong password, duplicate email,
cross-user chat/widget isolation, ownership-steal attempt) and a 7-step Playwright
flow (web/scripts/verify-026-ui.mjs — gate, signup, dashboard, sign out, re-gate,
wrong password error, re-login), all green. Old ClickHouse `chats` /
`dashboard_widgets` tables are left in place but orphaned — pre-auth history does not
migrate.
