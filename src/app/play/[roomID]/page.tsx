"use client";
import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useParams } from "next/navigation";

type PlayerStatus = "playing" | "eliminated" | "won";

type RoomStatus = "waiting" | "playing" | "finished";

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
  status: PlayerStatus;
};

// Displays the progress of each player
function ProgressBars({ players }: { players: PlayerInfo[] }) {
  return (
    <div>
      <ul>
        {players.map((p) => {
          return (
            <li key={p.id}>
              ({p.id}) Progress: {p.progress}% - {p.status}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Board({
  board,
  onCellClick,
  canPlay,
  safeStartCell,
  hasStarted,
}: {
  board: SafeCell[][];
  onCellClick: (r: number, c: number) => void;
  canPlay: boolean;
  safeStartCell: { row: number; col: number };
  hasStarted: boolean;
}) {
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

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(9,30px)",
        opacity: canPlay ? 1 : 0.5, // visually dim when can't play
      }}
    >
      {board.map((row, r) =>
        row.map((cell, c) => (
          <button
            key={`${r}-${c}`}
            onClick={() => canPlay && onCellClick(r, c)}
            // The cell is disabled if play is off OR its on and the cell is the safe cell
            disabled={
              !canPlay ||
              (canPlay &&
                !hasStarted &&
                (r !== safeStartCell.row || c !== safeStartCell.col))
            }
            style={{
              width: 30,
              height: 30,
              border: "1px solid #999",
              background:
                !hasStarted &&
                r === safeStartCell.row &&
                c === safeStartCell.col
                  ? "#7c4"
                  : cell.revealed
                    ? "#ddd"
                    : "#bbb",
              fontSize: 14,
              cursor: canPlay ? "pointer" : "default",
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

export default function GameRoom() {
  const socketRef = useRef<Socket | null>(null);
  const [board, setBoard] = useState<SafeCell[][] | null>(null);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [hostID, setHostID] = useState<string | null>(null);
  const [roomStatus, setRoomStatus] = useState<RoomStatus>("waiting");
  const [safeStartCell, setSafeStartCell] = useState<{
    row: number;
    col: number;
  }>({ row: 0, col: 0 });
  const [hasStarted, setHasStarted] = useState<boolean>(false);
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

    socket.on(
      "progress-update",
      (payload: { players: PlayerInfo[]; roomStatus: RoomStatus }) => {
        setPlayers(payload.players);
        setRoomStatus(payload.roomStatus);
      },
    );

    socket.on(
      "room-update",
      (payload: { players: PlayerInfo[]; hostID: string }) => {
        setPlayers(payload.players);
        setHostID(payload.hostID);
      },
    );

    socket.on(
      "game-starting",
      (payload: {
        roomStatus: RoomStatus;
        safeStartCell: { row: number; col: number };
      }) => {
        setRoomStatus(payload.roomStatus);
        setSafeStartCell(payload.safeStartCell);
        setHasStarted(false);
      },
    );

    return () => {
      socket.disconnect();
    };
  }, [roomID]);

  // Checks if the current socket is the host
  const isHost = hostID !== null && hostID === socketRef.current?.id;

  // Derive the player's status
  const me = players.find((p) => p.id === socketRef.current?.id);
  const myStatus = me?.status;
  const canPlay = myStatus === "playing" && roomStatus === "playing";

  // When a cell is clicked that signal is sent to the server to perform the proper reveal
  const cellClick = (row: number, col: number) => {
    socketRef.current?.emit("reveal", { row: row, col: col });
    setHasStarted(true);
  };

  const hostStartGameClick = () => {
    socketRef.current?.emit("start-game", { roomID });
  };

  return (
    <>
      <div>
        {isHost && roomStatus === "waiting" ? (
          <button onClick={hostStartGameClick}>Start Game</button>
        ) : null}

        {isHost && roomStatus === "finished" ? (
          <button onClick={hostStartGameClick}>Start New Game</button>
        ) : null}

        <ProgressBars players={players} />

        {myStatus === "won" && <h2>You Won!</h2>}
        {myStatus === "eliminated" && <h2>You hit a mine - eliminated</h2>}

        {board ? (
          <Board
            board={board}
            onCellClick={cellClick}
            canPlay={canPlay}
            safeStartCell={safeStartCell}
            hasStarted={hasStarted}
          />
        ) : (
          <p>Waiting for game to start...</p>
        )}
      </div>
    </>
  );
}
