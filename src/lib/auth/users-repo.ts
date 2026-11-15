import "server-only";
import { getSupabaseAdmin, isMissingTableError } from "@/lib/supabase/server";
import { hashPin } from "./session";
import type { User, UserRole, UserWithPinHash } from "./types";

const DEFAULT_ADMIN_USERNAME = (process.env.ADMIN_USERNAME || "admin").toLowerCase().trim();
const DEFAULT_ADMIN_PIN = process.env.ADMIN_PIN || "1234";
const DEFAULT_ADMIN_NAME = process.env.ADMIN_NAME || "Kraftman Admin";

// In-memory fallback cache when Supabase users table has not been created yet or is unavailable
const memoryUsers: Map<string, UserWithPinHash> = new Map();
let bootstrapInitialized = false;

async function getOrInitDefaultAdmin(): Promise<UserWithPinHash> {
  const existing = memoryUsers.get(DEFAULT_ADMIN_USERNAME);
  if (existing) return existing;

  const pin_hash = await hashPin(DEFAULT_ADMIN_PIN);
  const now = new Date().toISOString();
  const defaultAdmin: UserWithPinHash = {
    id: "00000000-0000-0000-0000-000000000001",
    username: DEFAULT_ADMIN_USERNAME,
    name: DEFAULT_ADMIN_NAME,
    pin_hash,
    role: "admin",
    is_active: true,
    created_at: now,
    updated_at: now,
  };
  memoryUsers.set(DEFAULT_ADMIN_USERNAME, defaultAdmin);
  return defaultAdmin;
}

/**
 * Ensures the bootstrap admin user exists in Supabase or the fallback store.
 */
export async function ensureBootstrapUser(): Promise<void> {
  if (bootstrapInitialized) return;
  const defaultAdmin = await getOrInitDefaultAdmin();

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    bootstrapInitialized = true;
    return;
  }

  try {
    const { count, error } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true });

    if (error) {
      if (isMissingTableError(error)) {
        // Table not migrated yet; fallback store is active
        bootstrapInitialized = true;
        return;
      }
      return;
    }

    if (count === 0) {
      // Seed default admin
      await supabase.from("users").insert({
        username: defaultAdmin.username,
        name: defaultAdmin.name,
        pin_hash: defaultAdmin.pin_hash,
        role: defaultAdmin.role,
        is_active: true,
      });
    }
    bootstrapInitialized = true;
  } catch {
    // Non-fatal; memory fallback handles it
    bootstrapInitialized = true;
  }
}

/**
 * Finds a user by username, including their pin_hash for authentication verification.
 */
export async function findUserByUsernameWithPin(username: string): Promise<UserWithPinHash | null> {
  await ensureBootstrapUser();
  const cleanUsername = username.toLowerCase().trim();
  if (!cleanUsername) return null;

  const supabase = getSupabaseAdmin();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("id, username, name, pin_hash, role, is_active, created_at, updated_at")
        .ilike("username", cleanUsername)
        .maybeSingle();

      if (!error && data) {
        return {
          id: data.id,
          username: data.username,
          name: data.name,
          pin_hash: data.pin_hash,
          role: data.role as UserRole,
          is_active: data.is_active,
          created_at: data.created_at,
          updated_at: data.updated_at,
        };
      }
    } catch {
      // Fall through to memory fallback
    }
  }

  const inMem = memoryUsers.get(cleanUsername);
  return inMem ?? null;
}

/**
 * Lists all active and inactive users (excluding pin_hash for safety).
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
  pin: string;
  role?: UserRole;
}

/**
 * Creates a new user with hashed PIN.
 */
export async function createUser(input: CreateUserInput): Promise<{ user?: User; error?: string }> {
  await ensureBootstrapUser();

  const cleanUsername = input.username.toLowerCase().trim();
  const cleanName = input.name.trim();
  const cleanPin = input.pin.trim();
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
  if (!cleanPin || cleanPin.length < 4) {
    return { error: "PIN must be at least 4 digits" };
  }

  // Check uniqueness
  const existing = await findUserByUsernameWithPin(cleanUsername);
  if (existing) {
    return { error: `Username "${cleanUsername}" is already taken` };
  }

  const pin_hash = await hashPin(cleanPin);
  const now = new Date().toISOString();
  const supabase = getSupabaseAdmin();

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
        .select("id, username, name, role, is_active, created_at, updated_at")
        .single();

      if (!error && data) {
        const newUser: User = {
          id: data.id,
          username: data.username,
          name: data.name,
          role: data.role as UserRole,
          is_active: data.is_active,
          created_at: data.created_at,
          updated_at: data.updated_at,
        };
        // Also cache locally
        memoryUsers.set(cleanUsername, { ...newUser, pin_hash });
        return { user: newUser };
      }

      if (error && !isMissingTableError(error)) {
        return { error: error.message || "Failed to create user in database" };
      }
    } catch {
      // Fall through to memory
    }
  }

  // Memory fallback
  const fallbackId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const newUser: UserWithPinHash = {
    id: fallbackId,
    username: cleanUsername,
    name: cleanName,
    pin_hash,
    role,
    is_active: true,
    created_at: now,
    updated_at: now,
  };
  memoryUsers.set(cleanUsername, newUser);

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
  const supabase = getSupabaseAdmin();
  if (supabase) {
    try {
      const { error } = await supabase
        .from("users")
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq("id", userId);

      if (!error) {
        // Update in memory as well
        for (const u of memoryUsers.values()) {
          if (u.id === userId) {
            u.is_active = isActive;
          }
        }
        return { success: true };
      }
    } catch {
      // Fall through
    }
  }

  for (const u of memoryUsers.values()) {
    if (u.id === userId) {
      u.is_active = isActive;
      return { success: true };
    }
  }

  return { success: false, error: "User not found" };
}

/**
 * Deletes a user by ID.
 */
export async function deleteUser(userId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    try {
      const { error } = await supabase.from("users").delete().eq("id", userId);
      if (!error) {
        for (const [uname, u] of memoryUsers.entries()) {
          if (u.id === userId) {
            memoryUsers.delete(uname);
          }
        }
        return { success: true };
      }
    } catch {
      // Fall through
    }
  }

  for (const [uname, u] of memoryUsers.entries()) {
    if (u.id === userId) {
      memoryUsers.delete(uname);
      return { success: true };
    }
  }

  return { success: false, error: "User not found" };
}
