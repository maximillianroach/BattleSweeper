"use client";
import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useRouter } from "next/navigation";

type SafeCell = {
  revealed: boolean;
  flagged: boolean;
  adjacentMines: number | null;
  isMine: boolean | null;
};

export default function LandingPage() {
  const socketRef = useRef<Socket | null>(null);
  const router = useRouter();
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
    socketRef.current?.emit("create-room");
  };

  return (
    <div>
      <button onClick={createRoomClick}>Create Room</button>
    </div>
  );
}
