"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  clearSessionCookie,
  getSession,
  setSessionCookie,
  signSessionToken,
} from "@/lib/auth/session";
import type { SessionUser, User } from "@/lib/auth/types";
import {
  createUser,
  deleteUser,
  findUserByUsernameWithPin,
  listUsers,
  toggleUserStatus,
  verifyUserPassword,
} from "@/lib/auth/users-repo";

const loginSchema = z
  .object({
    username: z.string().min(1, "Please enter your username").max(50),
    password: z.string().max(100).optional(),
    pin: z.string().max(100).optional(),
  })
  .refine((data) => Boolean((data.password && data.password.length > 0) || (data.pin && data.pin.length > 0)), {
    message: "Please enter your password",
    path: ["password"],
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

  const { username } = parsed.data;
  const candidatePass = (parsed.data.password || parsed.data.pin || "").trim();

  const user = await findUserByUsernameWithPin(username);

  if (!user) {
    return {
      success: false,
      error: "Invalid username or password",
    };
  }

  if (!user.is_active) {
    return {
      success: false,
      error: "This account has been disabled. Contact an administrator.",
    };
  }

  const isMatch = await verifyUserPassword(user, candidatePass);
  if (!isMatch) {
    return {
      success: false,
      error: "Invalid username or password",
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
  password: z.string().max(60).optional(),
  pin: z.string().max(60).optional(),
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

  const cleanUsername = parsed.data.username.toLowerCase().trim();
  // If password is not provided or empty, use the username as the password
  const passwordToUse = (parsed.data.password || parsed.data.pin || cleanUsername).trim();

  const result = await createUser({
    username: cleanUsername,
    name: parsed.data.name.trim(),
    password: passwordToUse,
    role: parsed.data.role,
  });

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
