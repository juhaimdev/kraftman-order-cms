"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Package,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { loginAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError("Please enter your username");
      return;
    }
    if (!password.trim()) {
      setError("Please enter your password");
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await loginAction({ username, password });
      if (!res.success) {
        setError(res.error || "Invalid username or password");
        toast.error(res.error || "Login failed");
        return;
      }

      toast.success(`Welcome, ${res.user?.name || res.user?.username}!`);

      let target = "/";
      if (typeof window !== "undefined") {
        const fromParam = new URLSearchParams(window.location.search).get("from");
        if (fromParam && fromParam.startsWith("/") && !fromParam.startsWith("//")) {
          target = fromParam;
        }
      }

      router.push(target);
      router.refresh();
    });
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-slate-900 via-slate-950 to-black px-4 py-8 text-slate-100">
      {/* Subtle Background Glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-96 w-[36rem] rounded-full bg-[#D9232A]/15 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md space-y-6">
        {/* Header Branding */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-800 via-slate-900 to-[#D9232A] shadow-xl ring-1 ring-white/15">
            <Package className="h-7 w-7 text-white" />
            <span className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-2 border-slate-950 bg-[#D9232A]" />
          </div>

          <div className="space-y-1">
            <div className="inline-flex items-center gap-2">
              <h1 className="text-xl font-extrabold tracking-tight text-white sm:text-2xl">
                KRAFTMAN
              </h1>
              <span className="rounded bg-[#D9232A] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white shadow-xs">
                DELHIVERY ONE
              </span>
            </div>
            <p className="text-xs font-medium text-slate-400">
              Shipping &amp; Orders Command Center
            </p>
          </div>
        </div>

        {/* Login Card */}
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-xl sm:p-7">
          <div className="mb-5 space-y-1 text-center">
            <h2 className="text-base font-bold text-white">Sign In</h2>
            <p className="text-xs text-slate-400">
              Enter your username and password to access orders &amp; shipments
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 flex items-center gap-2.5 rounded-xl border border-red-500/30 bg-red-950/40 p-3 text-xs font-medium text-red-200"
            >
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500 text-white text-[11px] font-bold">
                !
              </div>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username Input */}
            <div className="space-y-1.5">
              <label
                htmlFor="username"
                className="block text-xs font-semibold text-slate-300"
              >
                Username
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  className="pl-10 h-11 bg-slate-950/60 border-slate-700 text-white placeholder:text-slate-500 focus-visible:border-[#D9232A] focus-visible:ring-[#D9232A]/20"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-slate-300"
              >
                Password
              </label>

              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="pl-10 pr-10 h-11 bg-slate-950/60 border-slate-700 text-white placeholder:text-slate-500 focus-visible:border-[#D9232A] focus-visible:ring-[#D9232A]/20"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isPending}
              className="w-full h-11 bg-gradient-to-r from-[#D9232A] to-red-600 hover:from-red-600 hover:to-red-700 text-white font-bold shadow-md shadow-red-950/40 cursor-pointer"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing In...
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        </div>

        {/* Footer info */}
        <p className="text-center text-[11px] text-slate-500">
          Kraftman Command Center · Delhivery One Cloud
        </p>
      </div>
    </div>
  );
}
