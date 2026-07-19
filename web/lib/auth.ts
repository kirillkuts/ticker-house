import { cookies } from "next/headers";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db, ensureSchema } from "./db";

// Minimal credential auth: scrypt-hashed passwords, opaque session tokens in
// Postgres, httpOnly cookie. No email verification — this is a single-box app.

const SESSION_COOKIE = "th_session";
const SESSION_DAYS = 30;

export interface User {
  id: string;
  email: string;
}

// "salt:hash", both hex. scryptSync is fine at login frequency.
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

export async function createUser(email: string, password: string): Promise<User | { error: string }> {
  await ensureSchema();
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return { error: "Enter a valid email address." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  try {
    const res = await db().query<{ id: string; email: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email`,
      [normalized, hashPassword(password)],
    );
    return res.rows[0];
  } catch (e) {
    if (e instanceof Error && "code" in e && (e as { code?: string }).code === "23505")
      return { error: "An account with this email already exists." };
    throw e;
  }
}

export async function verifyUser(email: string, password: string): Promise<User | null> {
  await ensureSchema();
  const res = await db().query<{ id: string; email: string; password_hash: string }>(
    `SELECT id, email, password_hash FROM users WHERE email = $1`,
    [email.trim().toLowerCase()],
  );
  const row = res.rows[0];
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  return { id: row.id, email: row.email };
}

export async function startSession(userId: string): Promise<void> {
  await ensureSchema();
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  await db().query(`INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`, [
    token, userId, expires,
  ]);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires,
    path: "/",
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await ensureSchema();
    await db().query(`DELETE FROM sessions WHERE token = $1`, [token]);
  }
  jar.delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  await ensureSchema();
  const res = await db().query<{ id: string; email: string }>(
    `SELECT u.id, u.email
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND s.expires_at > now()`,
    [token],
  );
  return res.rows[0] ?? null;
}

// For server actions that mutate user data: reject instead of redirecting.
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in");
  return user;
}
