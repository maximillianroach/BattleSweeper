"use client";
import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useParams } from "next/navigation";

type SafeCell = {
  revealed: boolean;
  flagged: boolean;
  adjacentMines: number | null;
  isMine: boolean | null;
};

// Created as a safe version of Player - no board
// We don't want to mix the server-side Player with client-side
type PlayerInfo = {
  id: string;
  progress: number;
};

function ProgressBars({ players }: { players: PlayerInfo[] }) {
  return (
    <div>
      <ul>
        {players.map((p) => {
          return (
            <li key={p.id}>
              ({p.id}) Progress: {p.progress}%
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function Board() {
  const socketRef = useRef<Socket | null>(null);
  const [board, setBoard] = useState<SafeCell[][] | null>(null);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [hostID, setHostID] = useState<string | null>(null);
  const params = useParams();
  const roomID = params.roomID as string;

  useEffect(() => {
    const socket = io("http://localhost:4000");
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Connected, joining room:", roomID);
      socket.emit("join-room", { roomID });
    });

    socket.on(
      "board",
      (payload: { rows: number; cols: number; board: SafeCell[][] }) => {
        setBoard(payload.board);
      },
    );

    socket.on("progress-update", (payload: { players: PlayerInfo[] }) => {
      setPlayers(payload.players);
    });

    socket.on(
      "room-update",
      (payload: { players: PlayerInfo[]; hostID: string }) => {
        setPlayers(payload.players);
        setHostID(payload.hostID);
      },
    );

    socket.on("game-starting", () => {
      console.log("The game is starting!");
    });

    return () => {
      socket.disconnect();
    };
  }, [roomID]);

  // Checks if the current socket is the host
  const isHost = hostID !== null && hostID === socketRef.current?.id;

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

  const hostStartGameClick = () => {
    socketRef.current?.emit("start-game", { roomID });
  };

  return (
    <>
      <div>
        <h3>Players ({players.length})</h3>
        <ul>
          {players.map((player) => (
            <li key={player.id}>{player.id}</li>
          ))}
        </ul>
      </div>

      {isHost ? <button onClick={hostStartGameClick}>Start Game</button> : null}

      <ProgressBars players={players} />

      {board ? (
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
      ) : (
        <p>Waiting for game to start...</p>
      )}
    </>
  );
}
