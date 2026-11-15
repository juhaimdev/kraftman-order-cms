"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  clearSessionCookie,
  getSession,
  setSessionCookie,
  signSessionToken,
  verifyPin,
} from "@/lib/auth/session";
import type { SessionUser, User } from "@/lib/auth/types";
import {
  createUser,
  deleteUser,
  findUserByUsernameWithPin,
  listUsers,
  toggleUserStatus,
} from "@/lib/auth/users-repo";

const loginSchema = z.object({
  username: z.string().min(1, "Please enter your username").max(50),
  pin: z.string().min(4, "PIN must be at least 4 digits").max(20),
});

export async function loginAction(
  rawInput: unknown
): Promise<{ success: boolean; user?: SessionUser; error?: string }> {
  const parsed = loginSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid login credentials",
    };
  }

  const { username, pin } = parsed.data;
  const user = await findUserByUsernameWithPin(username);

  if (!user) {
    return {
      success: false,
      error: "Invalid username or PIN",
    };
  }

  if (!user.is_active) {
    return {
      success: false,
      error: "This account has been disabled. Contact an administrator.",
    };
  }

  const isPinMatch = await verifyPin(pin, user.pin_hash);
  if (!isPinMatch) {
    return {
      success: false,
      error: "Invalid username or PIN",
    };
  }

  const token = await signSessionToken({
    sub: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
  });

  await setSessionCookie(token);

  return {
    success: true,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
    },
  };
}

export async function logoutAction(): Promise<{ success: boolean }> {
  await clearSessionCookie();
  return { success: true };
}

export async function getCurrentUserAction(): Promise<SessionUser | null> {
  return getSession();
}

export async function listUsersAction(): Promise<{ users: User[]; currentUserId?: string; error?: string }> {
  const session = await getSession();
  if (!session) {
    return { users: [], error: "Unauthorized" };
  }

  const users = await listUsers();
  return { users, currentUserId: session.id };
}

const createUserSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30)
    .regex(/^[a-zA-Z0-9_-]+$/, "Letters, numbers, underscores and hyphens only"),
  name: z.string().min(2, "Full name must be at least 2 characters").max(60),
  pin: z.string().min(4, "PIN must be at least 4 digits").max(16),
  role: z.enum(["admin", "operator"]).default("operator"),
});

export async function createUserAction(
  rawInput: unknown
): Promise<{ success: boolean; user?: User; error?: string }> {
  const session = await getSession();
  if (!session) {
    return { success: false, error: "Unauthorized. Please log in first." };
  }

  const parsed = createUserSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid user input",
    };
  }

  const result = await createUser(parsed.data);
  if (result.error || !result.user) {
    return { success: false, error: result.error || "Failed to create user" };
  }

  revalidatePath("/");
  revalidatePath("/sales");

  return { success: true, user: result.user };
}

export async function toggleUserStatusAction(
  userId: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) {
    return { success: false, error: "Unauthorized" };
  }

  if (session.id === userId && !isActive) {
    return { success: false, error: "You cannot disable your own active account" };
  }

  const result = await toggleUserStatus(userId, isActive);
  if (!result.success) {
    return { success: false, error: result.error || "Failed to update status" };
  }

  revalidatePath("/");
  return { success: true };
}

export async function deleteUserAction(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) {
    return { success: false, error: "Unauthorized" };
  }

  if (session.id === userId) {
    return { success: false, error: "You cannot delete your own account" };
  }

  const result = await deleteUser(userId);
  if (!result.success) {
    return { success: false, error: result.error || "Failed to delete user" };
  }

  revalidatePath("/");
  return { success: true };
}
