"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Loader2,
  LogOut,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { getCurrentUserAction, logoutAction } from "@/actions/auth";
import type { SessionUser } from "@/lib/auth/types";
import { UsersDialog } from "./users-dialog";

interface UserProfileMenuProps {
  initialUser?: SessionUser | null;
}

export function UserProfileMenu({ initialUser }: UserProfileMenuProps) {
  const router = useRouter();
  const [user, setUser] = React.useState<SessionUser | null>(initialUser ?? null);
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLoggingOut, startLogout] = React.useTransition();
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (initialUser !== undefined) {
      return;
    }
    let mounted = true;
    getCurrentUserAction().then((u) => {
      if (mounted && u) {
        setUser(u);
      }
    });
    return () => {
      mounted = false;
    };
  }, [initialUser]);

  // Click outside listener
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleLogout = () => {
    startLogout(async () => {
      await logoutAction();
      toast.success("Signed out successfully");
      router.push("/login");
      router.refresh();
    });
  };

  const displayName = user ? user.name || user.username : "Team";
  const initial = user ? (user.name || user.username).charAt(0).toUpperCase() : "U";

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-label="User account menu"
        className="inline-flex min-h-10 sm:min-h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 cursor-pointer"
      >
        <div className="flex h-5.5 w-5.5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
          {initial}
        </div>
        <span className="hidden sm:inline font-mono font-medium max-w-[90px] truncate">
          {displayName}
        </span>
        <ChevronDown className="h-3 w-3 text-slate-400" />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-1.5 w-56 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5 animate-in fade-in-0 zoom-in-95 duration-100">
          <div className="border-b border-slate-100 px-3 py-2">
            <p className="text-xs font-bold text-slate-900 truncate">
              {user?.name || "Team Member"}
            </p>
            <p className="text-[11px] font-mono text-slate-500 truncate">
              @{user?.username || "user"} •{" "}
              <span className="uppercase text-[#D9232A] font-bold text-[10px]">
                {user?.role || "operator"}
              </span>
            </p>
          </div>

          <div className="py-1">
            <UsersDialog
              trigger={
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer text-left"
                >
                  <Users className="h-4 w-4 text-[#D9232A]" />
                  <span>Manage Team &amp; PINs</span>
                </button>
              }
            />
          </div>

          <div className="border-t border-slate-100 pt-1">
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 cursor-pointer text-left"
            >
              {isLoggingOut ? (
                <Loader2 className="h-4 w-4 animate-spin text-red-600" />
              ) : (
                <LogOut className="h-4 w-4 text-red-600" />
              )}
              <span>{isLoggingOut ? "Signing out..." : "Sign Out"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
