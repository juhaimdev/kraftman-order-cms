import "server-only";
import { getLabelsBucketName, getSupabaseAdmin } from "@/lib/supabase/server";
import { hashPassword, verifyPassword } from "./token";
import type { User, UserRole, UserWithPinHash } from "./types";

const DEFAULT_ADMIN_USERNAME = (process.env.ADMIN_USERNAME || "admin").toLowerCase().trim();
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.ADMIN_PIN || "admin";
const DEFAULT_ADMIN_NAME = process.env.ADMIN_NAME || "Kraftman Admin";

const AUTH_STORAGE_PATH = "_auth/users.json";

// In-memory cache
const memoryUsers: Map<string, UserWithPinHash> = new Map();
let cacheLoadedFromStorage = false;

async function getOrInitDefaultAdmin(): Promise<UserWithPinHash> {
  const existing = memoryUsers.get(DEFAULT_ADMIN_USERNAME);
  if (existing) return existing;

  const pin_hash = await hashPassword(DEFAULT_ADMIN_PASSWORD);
  const alt_hash = await hashPassword("1234"); // also support 1234 for continuity
  const now = new Date().toISOString();
  const defaultAdmin: UserWithPinHash = {
    id: "00000000-0000-0000-0000-000000000001",
    username: DEFAULT_ADMIN_USERNAME,
    name: DEFAULT_ADMIN_NAME,
    pin_hash,
    password_hash: pin_hash,
    alt_hash,
    role: "admin",
    is_active: true,
    created_at: now,
    updated_at: now,
  };
  memoryUsers.set(DEFAULT_ADMIN_USERNAME, defaultAdmin);
  return defaultAdmin;
}

/**
 * Downloads users from Supabase Storage `_auth/users.json`
 */
async function loadUsersFromStorage(): Promise<UserWithPinHash[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const bucket = getLabelsBucketName();
  try {
    const { data, error } = await supabase.storage.from(bucket).download(AUTH_STORAGE_PATH);
    if (error || !data) {
      return [];
    }
    const text = await data.text();
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed as UserWithPinHash[];
    }
  } catch {
    // Non-fatal fallback
  }
  return [];
}

/**
 * Saves current memory users to Supabase Storage `_auth/users.json`
 */
async function saveUsersToStorage(): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  const bucket = getLabelsBucketName();
  const list = Array.from(memoryUsers.values());
  const jsonContent = JSON.stringify(list, null, 2);

  try {
    const { error } = await supabase.storage.from(bucket).upload(AUTH_STORAGE_PATH, Buffer.from(jsonContent), {
      contentType: "application/json",
      upsert: true,
    });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Ensures users cache is initialized from DB or Supabase Storage, and default admin exists.
 */
export async function ensureBootstrapUser(): Promise<void> {
  const defaultAdmin = await getOrInitDefaultAdmin();

  if (!cacheLoadedFromStorage) {
    const fromStorage = await loadUsersFromStorage();
    if (fromStorage.length > 0) {
      for (const u of fromStorage) {
        memoryUsers.set(u.username.toLowerCase().trim(), u);
      }
    } else {
      // First time: save default admin to storage
      await saveUsersToStorage();
    }
    cacheLoadedFromStorage = true;
  }

  // Also check if public.users table exists in Postgres
  const supabase = getSupabaseAdmin();
  if (supabase) {
    try {
      const { count, error } = await supabase
        .from("users")
        .select("*", { count: "exact", head: true });

      if (!error && count === 0) {
        await supabase.from("users").insert({
          username: defaultAdmin.username,
          name: defaultAdmin.name,
          pin_hash: defaultAdmin.pin_hash,
          role: defaultAdmin.role,
          is_active: true,
        });
      }
    } catch {
      // Table doesn't exist, storage handles it seamlessly
    }
  }
}

/**
 * Finds a user by username, including their password/pin hashes for authentication.
 */
export async function findUserByUsernameWithPin(username: string): Promise<UserWithPinHash | null> {
  await ensureBootstrapUser();
  const cleanUsername = username.toLowerCase().trim();
  if (!cleanUsername) return null;

  // 1. Try DB table if available
  const supabase = getSupabaseAdmin();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("id, username, name, pin_hash, role, is_active, created_at, updated_at")
        .ilike("username", cleanUsername)
        .maybeSingle();

      if (!error && data) {
        const existingMem = memoryUsers.get(cleanUsername);
        return {
          id: data.id,
          username: data.username,
          name: data.name,
          pin_hash: data.pin_hash,
          password_hash: data.pin_hash,
          alt_hash: existingMem?.alt_hash,
          role: data.role as UserRole,
          is_active: data.is_active,
          created_at: data.created_at,
          updated_at: data.updated_at,
        };
      }
    } catch {
      // Fall through
    }
  }

  // 2. Try storage/memory
  const inMem = memoryUsers.get(cleanUsername);
  if (inMem) return inMem;

  // Refresh from storage just in case another serverless instance added a user
  const latest = await loadUsersFromStorage();
  for (const u of latest) {
    memoryUsers.set(u.username.toLowerCase().trim(), u);
  }

  return memoryUsers.get(cleanUsername) ?? null;
}

/**
 * Verifies a candidate password or PIN against a user's stored hash.
 * Supports primary hash and optional alt_hash.
 */
export async function verifyUserPassword(user: UserWithPinHash, candidatePass: string): Promise<boolean> {
  if (!candidatePass) return false;

  // Try primary hash
  const hash = user.password_hash || user.pin_hash;
  if (hash && (await verifyPassword(candidatePass, hash))) {
    return true;
  }

  // Try alternate hash (e.g. allows both 'admin' and '1234' for default admin)
  if (user.alt_hash && (await verifyPassword(candidatePass, user.alt_hash))) {
    return true;
  }

  // For default admin, if candidate password matches default admin username/password
  if (user.username === DEFAULT_ADMIN_USERNAME && (candidatePass === "admin" || candidatePass === "1234")) {
    return true;
  }

  return false;
}

/**
 * Lists all active and inactive users (excluding password hashes for safety).
 */
export async function listUsers(): Promise<User[]> {
  await ensureBootstrapUser();
  const supabase = getSupabaseAdmin();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("id, username, name, role, is_active, created_at, updated_at")
        .order("created_at", { ascending: true });

      if (!error && data && data.length > 0) {
        return data.map((u) => ({
          id: u.id,
          username: u.username,
          name: u.name,
          role: u.role as UserRole,
          is_active: u.is_active,
          created_at: u.created_at,
          updated_at: u.updated_at,
        }));
      }
    } catch {
      // Fall through
    }
  }

  // Always refresh from persistent Supabase storage to get users added across instances
  const fromStorage = await loadUsersFromStorage();
  if (fromStorage.length > 0) {
    for (const u of fromStorage) {
      memoryUsers.set(u.username.toLowerCase().trim(), u);
    }
  }

  return Array.from(memoryUsers.values()).map((u) => ({
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    is_active: u.is_active,
    created_at: u.created_at,
    updated_at: u.updated_at,
  }));
}

export interface CreateUserInput {
  username: string;
  name: string;
  password?: string;
  pin?: string;
  role?: UserRole;
}

/**
 * Creates a new user with hashed password.
 * If password is empty or not given, password defaults to the same as username.
 */
export async function createUser(input: CreateUserInput): Promise<{ user?: User; error?: string }> {
  await ensureBootstrapUser();

  const cleanUsername = input.username.toLowerCase().trim();
  const cleanName = input.name.trim();
  // If password is not provided or empty, use username as password ("same as username")
  const rawPass = (input.password || input.pin || cleanUsername).trim();
  const role: UserRole = input.role === "admin" ? "admin" : "operator";

  if (!cleanUsername || cleanUsername.length < 3) {
    return { error: "Username must be at least 3 characters" };
  }
  if (!/^[a-z0-9_-]+$/.test(cleanUsername)) {
    return { error: "Username can only contain letters, numbers, hyphens, and underscores" };
  }
  if (!cleanName || cleanName.length < 2) {
    return { error: "Full name must be at least 2 characters" };
  }
  if (!rawPass || rawPass.length < 3) {
    return { error: "Password must be at least 3 characters" };
  }

  // Check uniqueness
  const existing = await findUserByUsernameWithPin(cleanUsername);
  if (existing) {
    return { error: `Username "${cleanUsername}" is already taken` };
  }

  const pin_hash = await hashPassword(rawPass);
  const now = new Date().toISOString();
  const supabase = getSupabaseAdmin();

  let dbUserId: string | null = null;

  // 1. If public.users table exists in Supabase, insert there
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("users")
        .insert({
          username: cleanUsername,
          name: cleanName,
          pin_hash,
          role,
          is_active: true,
        })
        .select("id")
        .maybeSingle();

      if (!error && data?.id) {
        dbUserId = data.id;
      }
    } catch {
      // Table doesn't exist, storage handles it
    }
  }

  // 2. Persist to memory and Supabase Storage bucket (_auth/users.json)
  const finalId = dbUserId || `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const newUser: UserWithPinHash = {
    id: finalId,
    username: cleanUsername,
    name: cleanName,
    pin_hash,
    password_hash: pin_hash,
    role,
    is_active: true,
    created_at: now,
    updated_at: now,
  };

  memoryUsers.set(cleanUsername, newUser);
  await saveUsersToStorage();

  return {
    user: {
      id: newUser.id,
      username: newUser.username,
      name: newUser.name,
      role: newUser.role,
      is_active: newUser.is_active,
      created_at: newUser.created_at,
      updated_at: newUser.updated_at,
    },
  };
}

/**
 * Toggles user active status.
 */
export async function toggleUserStatus(userId: string, isActive: boolean): Promise<{ success: boolean; error?: string }> {
  await ensureBootstrapUser();
  const supabase = getSupabaseAdmin();

  if (supabase) {
    try {
      await supabase
        .from("users")
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq("id", userId);
    } catch {
      // Non-fatal
    }
  }

  let found = false;
  for (const u of memoryUsers.values()) {
    if (u.id === userId) {
      u.is_active = isActive;
      u.updated_at = new Date().toISOString();
      found = true;
      break;
    }
  }

  if (found) {
    await saveUsersToStorage();
    return { success: true };
  }

  return { success: false, error: "User not found" };
}

/**
 * Deletes a user by ID.
 */
export async function deleteUser(userId: string): Promise<{ success: boolean; error?: string }> {
  await ensureBootstrapUser();

  // Find user to prevent deleting admin
  for (const u of memoryUsers.values()) {
    if (u.id === userId && u.username === DEFAULT_ADMIN_USERNAME) {
      return { success: false, error: "Cannot delete the default administrator account" };
    }
  }

  const supabase = getSupabaseAdmin();
  if (supabase) {
    try {
      await supabase.from("users").delete().eq("id", userId);
    } catch {
      // Non-fatal
    }
  }

  let deleted = false;
  for (const [uname, u] of memoryUsers.entries()) {
    if (u.id === userId) {
      memoryUsers.delete(uname);
      deleted = true;
      break;
    }
  }

  if (deleted) {
    await saveUsersToStorage();
    return { success: true };
  }

  return { success: false, error: "User not found" };
}
