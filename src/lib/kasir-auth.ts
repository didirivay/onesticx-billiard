import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import {
  createAdminSupabaseClient,
  isAdminSupabaseConfigured,
} from "@/lib/supabase/admin";

export const KASIR_COOKIE_NAME = "onesticx_kasir_session";
export const KASIR_SESSION_MAX_AGE_SECONDS = 60 * 60 * 16; // 16 jam (1 shift 10.00-02.00 WIB)

// Rate limiter sederhana in-memory untuk mencegah tebak PIN massal
const MAX_FAILED_ATTEMPTS = 10;
const WINDOW_MS = 5 * 60 * 1000;
const failedAttempts = new Map<string, { count: number; resetAt: number }>();

function getSigningSecret(): string {
  const base =
    process.env.KASIR_SESSION_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!base) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY belum diatur.");
  }
  return createHmac("sha256", "onesticx-kasir-v1").update(base).digest("hex");
}

function signPayload(payloadB64: string): string {
  return createHmac("sha256", getSigningSecret())
    .update(payloadB64)
    .digest("base64url");
}

export function createKasirSessionToken(): string {
  const payload = {
    v: 1,
    exp: Date.now() + KASIR_SESSION_MAX_AGE_SECONDS * 1000,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const signature = signPayload(payloadB64);
  return `${payloadB64}.${signature}`;
}

export function verifyKasirSessionToken(token: string | undefined): boolean {
  if (!token || !isAdminSupabaseConfigured()) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, receivedSig] = parts;
  if (!payloadB64 || !receivedSig) return false;

  try {
    const expectedSig = signPayload(payloadB64);
    const a = Buffer.from(receivedSig, "utf8");
    const b = Buffer.from(expectedSig, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return false;
    }

    const decoded = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8"),
    ) as { exp?: number };

    return typeof decoded.exp === "number" && decoded.exp > Date.now();
  } catch {
    return false;
  }
}

export async function isKasirAuthenticated(): Promise<boolean> {
  if (!isAdminSupabaseConfigured()) return false;
  const cookieStore = await cookies();
  const token = cookieStore.get(KASIR_COOKIE_NAME)?.value;
  return verifyKasirSessionToken(token);
}

export function checkPinRateLimit(clientKey: string): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const entry = failedAttempts.get(clientKey);
  if (!entry || entry.resetAt <= now) {
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (entry.count >= MAX_FAILED_ATTEMPTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export function recordFailedPinAttempt(clientKey: string): void {
  const now = Date.now();
  const entry = failedAttempts.get(clientKey);
  if (!entry || entry.resetAt <= now) {
    failedAttempts.set(clientKey, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

export function clearFailedPinAttempts(clientKey: string): void {
  failedAttempts.delete(clientKey);
}

export async function verifyKasirPinAgainstDb(inputPin: string): Promise<boolean> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "kasir_pin")
    .maybeSingle();

  if (error || !data?.value) {
    return false;
  }

  const expected = data.value.trim();
  const provided = inputPin.trim();
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
