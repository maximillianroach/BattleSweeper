"use client";
import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const socketRef = useRef<Socket | null>(null);
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [mode, setMode] = useState<"choose" | "create" | "join">("choose");
  const [name, setName] = useState<string>("");
  const [code, setCode] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const socket = io("http://localhost:4000");
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Connected to server:", socket.id);
    });

    socket.on("room-created", (payload: { roomID: string }) => {
      router.push(`/play/${payload.roomID}`);
    });

    socket.on(
      "try-to-join-message",
      (payload: { message: boolean; code: string }) => {
        if (payload.message) {
          router.push(`/play/${payload.code.toUpperCase()}`);
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
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6 text-ink">
      <div className="w-full max-w-sm">
        {/* Wordmark — shown on every view for consistency */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="text-4xl">💣</span>
          <h1 className="text-3xl font-semibold tracking-tight">
            Minesweeper Battle
          </h1>
          {mode === "choose" && (
            <p className="max-w-xs text-sm leading-relaxed text-muted">
              Race a friend through the same board. Same mines, separate grids —
              fastest to clear it wins.
            </p>
          )}
        </div>

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
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Max"
                  className="rounded-lg border border-ink/15 bg-paper px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
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
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Max"
                  className="rounded-lg border border-ink/15 bg-paper px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
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
                  placeholder="e.g. AB12CD"
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
        </div>

        {/* Helper caption under the card */}
        <p className="mt-4 text-center text-xs text-muted">
          {mode === "join"
            ? "Get a code from a friend to join their room."
            : "You'll get a link to share with your opponent."}
        </p>
      </div>
    </main>
  );
}
