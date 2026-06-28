"use client";
import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const socketRef = useRef<Socket | null>(null);
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const socket = io("http://localhost:4000");
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Connected to server:", socket.id);
    });

    socket.on("room-created", (payload: { roomID: string }) => {
      router.push(`/play/${payload.roomID}`);
    });

    return () => {
      socket.disconnect();
    };
  }, [router]);

  const createRoomClick = () => {
    setCreating(true);
    socketRef.current?.emit("create-room");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6 text-ink">
      <div className="flex w-full max-w-md flex-col items-center gap-8 text-center">
        {/* Wordmark */}
        <div className="flex flex-col items-center gap-3">
          <span className="text-4xl">💣</span>
          <h1 className="text-3xl font-semibold tracking-tight">
            Minesweeper Battle
          </h1>
          <p className="max-w-sm text-sm leading-relaxed text-muted">
            Race a friend through the same board. Same mines, separate grids —
            fastest to clear it wins.
          </p>
        </div>

        {/* Create room */}
        <button
          onClick={createRoomClick}
          disabled={creating}
          className="rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-accent/90 active:scale-[0.98] disabled:opacity-60"
        >
          {creating ? "Creating room…" : "Create a room"}
        </button>

        <p className="text-xs text-muted">
          You&apos;ll get a link to share with your opponent.
        </p>
      </div>
    </main>
  );
}
