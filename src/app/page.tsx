"use client";
import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useRouter } from "next/navigation";
import { useAuth, signUp, logIn, logOut } from "@/lib/auth";

export default function LandingPage() {
  const socketRef = useRef<Socket | null>(null);
  const nameRef = useRef<string>("");
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [mode, setMode] = useState<
    "choose" | "create" | "join" | "login" | "signup"
  >("choose");
  const [name, setName] = useState<string>("");
  const [code, setCode] = useState<string>("");
  const [error, setError] = useState<string>("");

  // ── Auth state ──
  const { user, isLoggedIn } = useAuth();
  const accountUsername = user?.user_metadata?.username as string | undefined;

  // ── Auth form state ──
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authUsername, setAuthUsername] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    const socket = io("http://localhost:4000");
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Connected to server:", socket.id);
    });

    socket.on("room-created", (payload: { roomID: string }) => {
      router.push(
        `/play/${payload.roomID}?name=${encodeURIComponent(nameRef.current)}`,
      );
    });

    socket.on(
      "try-to-join-message",
      (payload: { message: boolean; code: string }) => {
        if (payload.message) {
          router.push(
            `/play/${payload.code.toUpperCase()}?name=${encodeURIComponent(nameRef.current)}`,
          );
        } else {
          setJoining(false);
          setError(
            "That room code doesn't exist. Double-check it and try again.",
          );
        }
      },
    );

    return () => {
      socket.disconnect();
    };
  }, [router]);

  // Keep nameRef in sync with the logged-in username (so members play
  // under their account name without typing it). Guests still type a name.
  useEffect(() => {
    if (isLoggedIn && accountUsername) {
      setName(accountUsername);
      nameRef.current = accountUsername;
    }
  }, [isLoggedIn, accountUsername]);

  const chooseCreateRoomClick = () => {
    setMode("create");
  };

  const chooseJoinRoomClick = () => {
    setMode("join");
  };

  const createRoomClick = () => {
    setCreating(true);
    socketRef.current?.emit("create-room");
  };

  const joinRoomClick = () => {
    if (!code) return;
    setError(""); // clear any old error when re-trying
    setJoining(true);
    socketRef.current?.emit("try-to-join", { code: code });
  };

  const backToChoose = () => {
    setMode("choose");
    setCreating(false);
    setJoining(false);
    setError("");
    setAuthError("");
  };

  // ── Auth handlers ──
  const handleSignup = async () => {
    setAuthError("");
    if (!email || !password || !authUsername) {
      setAuthError("Please fill in every field.");
      return;
    }
    setAuthBusy(true);
    const { error } = await signUp(email, password, authUsername);
    setAuthBusy(false);
    if (error) {
      setAuthError(error.message);
    } else {
      setMode("choose");
      setEmail("");
      setPassword("");
      setAuthUsername("");
    }
  };

  const handleLogin = async () => {
    setAuthError("");
    if (!email || !password) {
      setAuthError("Please enter your email and password.");
      return;
    }
    setAuthBusy(true);
    const { error } = await logIn(email, password);
    setAuthBusy(false);
    if (error) {
      setAuthError(error.message);
    } else {
      setMode("choose");
      setEmail("");
      setPassword("");
    }
  };

  const handleLogout = async () => {
    await logOut();
    setName("");
    nameRef.current = "";
  };

  const nameLocked = isLoggedIn && !!accountUsername;

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6 text-ink">
      <div className="w-full max-w-sm">
        {/* Wordmark */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="text-4xl">💣</span>
          <h1 className="text-3xl font-semibold tracking-tight">
            BattleSweeper
          </h1>
          {mode === "choose" && (
            <p className="max-w-xs text-sm leading-relaxed text-muted">
              Race a friend through the same board. Same mines, separate grids —
              fastest to clear it wins.
            </p>
          )}
        </div>

        {/* Auth status bar (only on the choose view) */}
        {mode === "choose" && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-ink/10 bg-surface px-4 py-3 shadow-sm">
            {isLoggedIn ? (
              <>
                <span className="flex items-center gap-2 text-sm">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
                    {(accountUsername ?? "?").charAt(0).toUpperCase()}
                  </span>
                  <span className="text-muted">
                    Signed in as{" "}
                    <span className="font-semibold text-ink">
                      {accountUsername}
                    </span>
                  </span>
                </span>
                <button
                  onClick={handleLogout}
                  className="text-sm font-medium text-muted transition hover:text-ink"
                >
                  Log out
                </button>
              </>
            ) : (
              <>
                <span className="text-sm text-muted">Playing as guest</span>
                <span className="flex gap-2">
                  <button
                    onClick={() => {
                      setMode("login");
                      setAuthError("");
                    }}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-ink/5"
                  >
                    Log in
                  </button>
                  <button
                    onClick={() => {
                      setMode("signup");
                      setAuthError("");
                    }}
                    className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-accent/90"
                  >
                    Sign up
                  </button>
                </span>
              </>
            )}
          </div>
        )}

        {/* Card */}
        <div className="rounded-2xl border border-ink/10 bg-surface p-6 shadow-sm">
          {mode === "choose" && (
            <div className="flex flex-col gap-3">
              <button
                onClick={chooseCreateRoomClick}
                className="w-full rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-accent/90 active:scale-[0.98]"
              >
                Create a room
              </button>
              <button
                onClick={chooseJoinRoomClick}
                className="w-full rounded-lg border border-ink/15 bg-transparent px-6 py-3 text-sm font-semibold text-ink transition hover:bg-ink/5 active:scale-[0.98]"
              >
                Join a room
              </button>
            </div>
          )}

          {mode === "create" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted">
                  Your name
                </label>
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    nameRef.current = e.target.value;
                  }}
                  disabled={nameLocked}
                  placeholder="e.g. Max"
                  className="rounded-lg border border-ink/15 bg-paper px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
                />
                {nameLocked && (
                  <span className="text-xs text-muted">
                    Playing as your account.
                  </span>
                )}
              </div>

              <button
                onClick={createRoomClick}
                disabled={creating}
                className="w-full rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-accent/90 active:scale-[0.98] disabled:opacity-60"
              >
                {creating ? "Creating room…" : "Create a room"}
              </button>

              <button
                onClick={backToChoose}
                className="text-sm font-medium text-muted transition hover:text-ink"
              >
                ← Back
              </button>
            </div>
          )}

          {mode === "join" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted">
                  Your name
                </label>
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    nameRef.current = e.target.value;
                  }}
                  disabled={nameLocked}
                  placeholder="e.g. Max"
                  className="rounded-lg border border-ink/15 bg-paper px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
                />
                {nameLocked && (
                  <span className="text-xs text-muted">
                    Playing as your account.
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted">
                  Room code
                </label>
                <input
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    if (error) setError("");
                  }}
                  placeholder="e.g. ABCD12"
                  maxLength={6}
                  aria-invalid={error ? true : false}
                  className={`rounded-lg border bg-paper px-3 py-2.5 font-mono text-sm uppercase tracking-widest text-ink outline-none transition placeholder:font-sans placeholder:tracking-normal placeholder:text-muted/60 focus:ring-2 ${
                    error
                      ? "border-rose-400 focus:border-rose-400 focus:ring-rose-200"
                      : "border-ink/15 focus:border-accent focus:ring-accent/20"
                  }`}
                />
              </div>

              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700"
                >
                  <span className="mt-px text-base leading-none">⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              <button
                onClick={joinRoomClick}
                disabled={joining || code.length === 0}
                className="w-full rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-accent/90 active:scale-[0.98] disabled:opacity-60"
              >
                {joining ? "Joining room…" : "Join room"}
              </button>
              <button
                onClick={backToChoose}
                className="text-sm font-medium text-muted transition hover:text-ink"
              >
                ← Back
              </button>
            </div>
          )}

          {mode === "login" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="rounded-lg border border-ink/15 bg-paper px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  placeholder="••••••••"
                  className="rounded-lg border border-ink/15 bg-paper px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </div>

              {authError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700"
                >
                  <span className="mt-px text-base leading-none">⚠️</span>
                  <span>{authError}</span>
                </div>
              )}

              <button
                onClick={handleLogin}
                disabled={authBusy}
                className="w-full rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-accent/90 active:scale-[0.98] disabled:opacity-60"
              >
                {authBusy ? "Logging in…" : "Log in"}
              </button>

              <div className="flex items-center justify-between text-sm">
                <button
                  onClick={backToChoose}
                  className="font-medium text-muted transition hover:text-ink"
                >
                  ← Back
                </button>
                <button
                  onClick={() => {
                    setMode("signup");
                    setAuthError("");
                  }}
                  className="font-medium text-accent transition hover:text-accent/80"
                >
                  Need an account? Sign up
                </button>
              </div>
            </div>
          )}

          {mode === "signup" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted">
                  Username
                </label>
                <input
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  placeholder="e.g. minesweeper_pro"
                  maxLength={20}
                  className="rounded-lg border border-ink/15 bg-paper px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="rounded-lg border border-ink/15 bg-paper px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSignup()}
                  placeholder="At least 6 characters"
                  className="rounded-lg border border-ink/15 bg-paper px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </div>

              {authError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700"
                >
                  <span className="mt-px text-base leading-none">⚠️</span>
                  <span>{authError}</span>
                </div>
              )}

              <button
                onClick={handleSignup}
                disabled={authBusy}
                className="w-full rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-accent/90 active:scale-[0.98] disabled:opacity-60"
              >
                {authBusy ? "Creating account…" : "Create account"}
              </button>

              <div className="flex items-center justify-between text-sm">
                <button
                  onClick={backToChoose}
                  className="font-medium text-muted transition hover:text-ink"
                >
                  ← Back
                </button>
                <button
                  onClick={() => {
                    setMode("login");
                    setAuthError("");
                  }}
                  className="font-medium text-accent transition hover:text-accent/80"
                >
                  Have an account? Log in
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Helper caption */}
        <p className="mt-4 text-center text-xs text-muted">
          {mode === "join"
            ? "Get a code from a friend to join their room."
            : mode === "login" || mode === "signup"
              ? "Accounts let you keep your stats across games."
              : "You'll get a link to share with your opponent."}
        </p>
      </div>
    </main>
  );
}
