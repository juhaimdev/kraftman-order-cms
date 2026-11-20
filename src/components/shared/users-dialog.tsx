"use client";

import * as React from "react";
import {
  Check,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Plus,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import {
  createUserAction,
  deleteUserAction,
  listUsersAction,
  toggleUserStatusAction,
} from "@/actions/auth";
import type { User as TeamUser, UserRole } from "@/lib/auth/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface UsersDialogProps {
  trigger?: React.ReactNode;
}

export function UsersDialog({ trigger }: UsersDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"list" | "create">("list");
  const [users, setUsers] = React.useState<TeamUser[]>([]);
  const [currentUserId, setCurrentUserId] = React.useState<string | undefined>();
  const [isLoading, setIsLoading] = React.useState(false);

  // Form State
  const [fullName, setFullName] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [useSameAsUsername, setUseSameAsUsername] = React.useState(true);
  const [showPassword, setShowPassword] = React.useState(false);
  const [role, setRole] = React.useState<UserRole>("operator");
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, startSubmit] = React.useTransition();

  const loadUsers = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await listUsersAction();
      if (res.error) {
        toast.error(res.error);
      } else {
        setUsers(res.users);
        setCurrentUserId(res.currentUserId);
      }
    } catch {
      toast.error("Failed to load team users");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setFormError(null);
      void loadUsers();
    }
  };

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanName = fullName.trim();
    const cleanUsername = username.toLowerCase().trim();

    if (!cleanName || cleanName.length < 2) {
      setFormError("Full name must be at least 2 characters");
      return;
    }
    if (!cleanUsername || cleanUsername.length < 3) {
      setFormError("Username must be at least 3 characters");
      return;
    }

    const finalPassword = useSameAsUsername || !password.trim() ? cleanUsername : password.trim();

    if (finalPassword.length < 3) {
      setFormError("Password must be at least 3 characters");
      return;
    }

    startSubmit(async () => {
      const res = await createUserAction({
        name: cleanName,
        username: cleanUsername,
        password: finalPassword,
        role,
      });

      if (!res.success) {
        setFormError(res.error || "Failed to create user");
        toast.error(res.error || "Failed to create user");
        return;
      }

      toast.success(
        `User "${cleanUsername}" created successfully! Password: ${
          useSameAsUsername || !password.trim() ? "same as username" : "set"
        }`
      );

      // Reset form
      setFullName("");
      setUsername("");
      setPassword("");
      setUseSameAsUsername(true);
      setRole("operator");
      setActiveTab("list");
      await loadUsers();
    });
  };

  const handleToggleStatus = async (user: TeamUser) => {
    const nextStatus = !user.is_active;
    const res = await toggleUserStatusAction(user.id, nextStatus);
    if (!res.success) {
      toast.error(res.error || "Could not update status");
      return;
    }
    toast.success(
      `User ${user.username} is now ${nextStatus ? "active" : "disabled"}`
    );
    await loadUsers();
  };

  const handleDeleteUser = async (user: TeamUser) => {
    if (!confirm(`Are you sure you want to delete user "${user.username}"?`)) {
      return;
    }
    const res = await deleteUserAction(user.id);
    if (!res.success) {
      toast.error(res.error || "Failed to delete user");
      return;
    }
    toast.success(`User "${user.username}" deleted`);
    await loadUsers();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
          >
            <Users className="h-3.5 w-3.5 text-[#D9232A]" />
            <span>Team &amp; Users</span>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto p-0 sm:rounded-2xl">
        <DialogHeader className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur-md px-5 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-white shadow-2xs">
                <Users className="h-4.5 w-4.5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-slate-950">
                  Team &amp; User Access
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Manage operators, passwords, and permissions for Kraftman Command Center
                </DialogDescription>
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex items-center gap-1.5 pt-3">
            <button
              type="button"
              onClick={() => setActiveTab("list")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === "list"
                  ? "bg-slate-950 text-white shadow-2xs"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              <span>Users ({users.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("create")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === "create"
                  ? "bg-[#D9232A] text-white shadow-2xs"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add New User</span>
            </button>
          </div>
        </DialogHeader>

        <div className="p-5">
          {activeTab === "list" ? (
            <div className="space-y-3">
              {isLoading ? (
                <div className="flex h-36 items-center justify-center gap-2 text-slate-400">
                  <Loader2 className="h-5 w-5 animate-spin text-[#D9232A]" />
                  <span className="text-xs font-medium">Loading team members...</span>
                </div>
              ) : users.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-10 text-center">
                  <Users className="h-8 w-8 text-slate-300 mb-2" />
                  <p className="text-xs font-medium text-slate-600">No users found</p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setActiveTab("create")}
                    className="mt-3 bg-[#D9232A] text-white text-xs cursor-pointer"
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add First User
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                  {users.map((user) => {
                    const isSelf = user.id === currentUserId;
                    return (
                      <div
                        key={user.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 hover:bg-slate-50/80 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white shadow-2xs">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-900 truncate">
                                {user.name}
                              </span>
                              {isSelf && (
                                <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[9px] font-semibold text-slate-600">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500">
                              <span className="font-mono">@{user.username}</span>
                              <span>•</span>
                              <Badge
                                variant={user.role === "admin" ? "default" : "outline"}
                                className={
                                  user.role === "admin"
                                    ? "bg-slate-950 text-white text-[10px] h-4.5 px-1.5"
                                    : "text-slate-600 text-[10px] h-4.5 px-1.5"
                                }
                              >
                                {user.role === "admin" ? "Admin" : "Operator"}
                              </Badge>
                              <span>•</span>
                              <span
                                className={`inline-flex items-center gap-1 font-medium ${
                                  user.is_active ? "text-emerald-600" : "text-amber-600"
                                }`}
                              >
                                {user.is_active ? (
                                  <>
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                    Active
                                  </>
                                ) : (
                                  <>
                                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                    Disabled
                                  </>
                                )}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                          {!isSelf && user.username !== "admin" && (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleToggleStatus(user)}
                                title={user.is_active ? "Disable user" : "Enable user"}
                                className="h-7 px-2 text-[11px] cursor-pointer"
                              >
                                {user.is_active ? (
                                  <>
                                    <UserX className="mr-1 h-3 w-3 text-amber-600" />
                                    Disable
                                  </>
                                ) : (
                                  <>
                                    <UserCheck className="mr-1 h-3 w-3 text-emerald-600" />
                                    Enable
                                  </>
                                )}
                              </Button>

                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteUser(user)}
                                title="Delete user"
                                className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 hover:border-red-200 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Add New User Form */
            <form onSubmit={handleCreateUser} className="space-y-4">
              {formError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-800">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label
                    htmlFor="new-fullName"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="new-fullName"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Arun Kumar"
                      className="pl-8.5 h-9 text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="new-username"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Username (Login ID)
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      @
                    </span>
                    <Input
                      id="new-username"
                      required
                      value={username}
                      onChange={(e) =>
                        setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))
                      }
                      placeholder="e.g. arun"
                      className="pl-8 h-9 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Password Option: Username & Password Same */}
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-800">
                    Password Setup
                  </label>
                  <button
                    type="button"
                    onClick={() => setUseSameAsUsername(!useSameAsUsername)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#D9232A] hover:underline cursor-pointer"
                  >
                    {useSameAsUsername ? "Set custom password" : "Make password same as username"}
                  </button>
                </div>

                {useSameAsUsername ? (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800 font-medium">
                    <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span>
                      Password will be identical to username:{" "}
                      <code className="bg-emerald-100 px-1 py-0.5 rounded font-mono font-bold">
                        {username || "username"}
                      </code>
                    </span>
                  </div>
                ) : (
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="new-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter custom password"
                      className="pl-8.5 pr-8 h-9 text-xs"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="new-role"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Role &amp; Permissions
                </label>
                <select
                  id="new-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#D9232A]/20"
                >
                  <option value="operator">Operator (Shipments, Orders &amp; Manifests)</option>
                  <option value="admin">Administrator (Full Access &amp; Team Management)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab("list")}
                  className="text-xs cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  size="sm"
                  className="bg-[#D9232A] hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Creating User...
                    </>
                  ) : (
                    <>
                      <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                      Create User
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
