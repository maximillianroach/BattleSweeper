"use client";
import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

type SafeCell = {
  revealed: boolean;
  flagged: boolean;
  adjacentMines: number | null;
  isMine: boolean | null;
};

export default function Board() {
  const socketRef = useRef<Socket | null>(null);
  const [board, setBoard] = useState<SafeCell[][] | null>(null);

  useEffect(() => {
    const socket = io("http://localhost:4000");
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Connected to server:", socket.id);
    });

    socket.on(
      "board",
      (payload: { rows: number; cols: number; board: SafeCell[][] }) => {
        setBoard(payload.board);
      },
    );

    return () => {
      socket.disconnect();
    };
  }, []);

  // When a cell is clicked that signal is sent to the server to perform the proper reveal
  const cellClick = (row: number, col: number) => {
    socketRef.current?.emit("reveal", { row: row, col: col });
  };

  // Determines the symbol of a cell based on its properties
  const determineSymbol = (cell: SafeCell): string => {
    if (!cell.revealed) {
      return cell.flagged ? "🚩" : "";
    }

    if (cell.isMine) {
      return "💣";
    }

    if (cell.adjacentMines === 0) {
      return "";
    }

    return String(cell.adjacentMines);
  };

  if (!board) return <p>Loading...</p>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(9,30px)" }}>
      {board.map((row, r) =>
        row.map((cell, c) => (
          <button
            key={`${r}-${c}`}
            onClick={() => cellClick(r, c)}
            style={{
              width: 30,
              height: 30,
              border: "1px solid #999",
              background: cell.revealed ? "#ddd" : "#bbb",
              fontSize: 14,
              cursor: "pointer",
              color: "black",
            }}
          >
            {determineSymbol(cell)}
          </button>
        )),
      )}
    </div>
  );
}
