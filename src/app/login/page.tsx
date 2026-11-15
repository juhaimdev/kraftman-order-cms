"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Delete,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Package,
  ShieldCheck,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { loginAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [showPin, setShowPin] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const [showKeypad, setShowKeypad] = React.useState(false);

  const handleQuickFill = () => {
    setUsername("admin");
    setPin("1234");
    setError(null);
  };

  const handleKeypadPress = (val: string) => {
    if (val === "backspace") {
      setPin((prev) => prev.slice(0, -1));
    } else if (val === "clear") {
      setPin("");
    } else {
      if (pin.length < 10) {
        setPin((prev) => prev + val);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError("Please enter your username");
      return;
    }
    if (!pin.trim() || pin.length < 4) {
      setError("PIN must be at least 4 digits");
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await loginAction({ username, pin });
      if (!res.success) {
        setError(res.error || "Invalid username or PIN");
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
      {/* Background Glow */}
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

        {/* Login Box */}
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-xl sm:p-7">
          <div className="mb-5 space-y-1 text-center">
            <h2 className="text-base font-bold text-white">Sign In with PIN</h2>
            <p className="text-xs text-slate-400">
              Authorized team access for shipping manifests &amp; orders
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
                  placeholder="e.g. admin or operator name"
                  className="pl-10 h-11 bg-slate-950/60 border-slate-700 text-white placeholder:text-slate-500 focus-visible:border-[#D9232A] focus-visible:ring-[#D9232A]/20"
                />
              </div>
            </div>

            {/* PIN Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="pin"
                  className="block text-xs font-semibold text-slate-300"
                >
                  Security PIN
                </label>
                <button
                  type="button"
                  onClick={() => setShowKeypad(!showKeypad)}
                  className="text-[11px] font-medium text-[#D9232A] hover:underline cursor-pointer"
                >
                  {showKeypad ? "Hide Keypad" : "Show On-Screen Keypad"}
                </button>
              </div>

              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  id="pin"
                  name="pin"
                  type={showPin ? "text" : "password"}
                  inputMode="numeric"
                  autoComplete="current-password"
                  required
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Enter 4-8 digit PIN"
                  className="pl-10 pr-10 h-11 bg-slate-950/60 border-slate-700 text-white font-mono tracking-widest placeholder:text-slate-500 placeholder:font-sans placeholder:tracking-normal focus-visible:border-[#D9232A] focus-visible:ring-[#D9232A]/20"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPin(!showPin)}
                  aria-label={showPin ? "Hide PIN" : "Show PIN"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white cursor-pointer"
                >
                  {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Touch Keypad for Warehouse Terminals & Mobile */}
            {showKeypad && (
              <div className="pt-1 pb-1">
                <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-950/70 p-3 border border-slate-800">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handleKeypadPress(num)}
                      className="flex h-11 items-center justify-center rounded-lg bg-slate-800/80 text-base font-bold text-white transition-all hover:bg-slate-700 active:scale-95 cursor-pointer shadow-2xs"
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => handleKeypadPress("clear")}
                    className="flex h-11 items-center justify-center rounded-lg bg-slate-800/40 text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKeypadPress("0")}
                    className="flex h-11 items-center justify-center rounded-lg bg-slate-800/80 text-base font-bold text-white transition-all hover:bg-slate-700 active:scale-95 cursor-pointer shadow-2xs"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKeypadPress("backspace")}
                    aria-label="Backspace"
                    className="flex h-11 items-center justify-center rounded-lg bg-slate-800/40 text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
                  >
                    <Delete className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isPending}
              className="w-full h-11 bg-gradient-to-r from-[#D9232A] to-red-600 hover:from-red-600 hover:to-red-700 text-white font-bold shadow-md shadow-red-950/40 cursor-pointer"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying PIN...
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          {/* Quick Demo Fill Pill for First-Time Setup */}
          <div className="mt-5 pt-4 border-t border-slate-800/80 text-center">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 rounded-xl bg-slate-950/50 p-2.5 border border-slate-800">
              <div className="flex items-center gap-2 text-left">
                <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                <div className="text-[11px] text-slate-400">
                  <span className="font-semibold text-slate-300">Default Admin:</span>{" "}
                  <code className="text-white bg-slate-800 px-1 py-0.5 rounded">admin</code> / PIN:{" "}
                  <code className="text-white bg-slate-800 px-1 py-0.5 rounded">1234</code>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleQuickFill}
                className="h-7 text-[11px] border-slate-700 bg-slate-800/60 text-slate-200 hover:bg-slate-700 hover:text-white shrink-0 cursor-pointer"
              >
                <KeyRound className="mr-1 h-3 w-3" />
                Fill Demo
              </Button>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-center text-[11px] text-slate-500">
          Protected by Kraftman Session Security &amp; Delhivery One Cloud
        </p>
      </div>
    </div>
  );
}
