import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function readSupabaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    ""
  );
}

function readSupabaseServiceKey(): string {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    ""
  );
}

export function isSupabaseConfigured(): boolean {
  const url = readSupabaseUrl();
  const key = readSupabaseServiceKey();
  return Boolean(
    url &&
      key &&
      !url.includes("your-project-ref") &&
      !key.includes("your_supabase")
  );
}

export function getLabelsBucketName(): string {
  return process.env.SUPABASE_LABELS_BUCKET?.trim() || "shipping-labels";
}

type GlobalWithSupabase = typeof globalThis & {
  __supabaseAdmin?: SupabaseClient;
  __supabaseAdminKey?: string;
};

/**
 * Singleton server-side Supabase admin client using the service role key.
 * Reuses HTTP keep-alive connections across warm Vercel serverless invocations.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  const url = readSupabaseUrl();
  const key = readSupabaseServiceKey();
  if (
    !url ||
    !key ||
    url.includes("your-project-ref") ||
    key.includes("your_supabase")
  ) {
    return null;
  }

  const g = globalThis as GlobalWithSupabase;
  const cacheSig = `${url}::${key.slice(-8)}`;
  if (g.__supabaseAdmin && g.__supabaseAdminKey === cacheSig) {
    return g.__supabaseAdmin;
  }

  const client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        "X-Client-Info": "delhivery-command-vercel/1.0",
      },
    },
  });

  g.__supabaseAdmin = client;
  g.__supabaseAdminKey = cacheSig;
  return client;
}

export function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = error.message ?? "";
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /relation .* does not exist/i.test(msg) ||
    /could not find the table/i.test(msg)
  );
}

