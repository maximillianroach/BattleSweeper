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

// Classic Minesweeper number colors
function numberColor(n: number): string {
  switch (n) {
    case 1:
      return "text-blue-700";
    case 2:
      return "text-green-700";
    case 3:
      return "text-red-600";
    case 4:
      return "text-indigo-900";
    case 5:
      return "text-rose-900";
    case 6:
      return "text-cyan-700";
    case 7:
      return "text-black";
    case 8:
      return "text-gray-500";
    default:
      return "";
  }
}

// A short, stable, readable label for a socket id
function shortName(index: number): string {
  return `Player ${index + 1}`;
}

// Displays the progress of each player as labelled bars
function ProgressBars({
  players,
  myId,
}: {
  players: PlayerInfo[];
  myId: string | undefined;
}) {
  return (
    <div className="flex flex-col gap-3">
      {players.map((p, i) => {
        const isMe = p.id === myId;
        const statusLabel =
          p.status === "won"
            ? "Finished"
            : p.status === "eliminated"
              ? "Out"
              : `${p.progress}%`;

        const barColor =
          p.status === "won"
            ? "bg-accent"
            : p.status === "eliminated"
              ? "bg-rose-300"
              : "bg-accent/70";

        return (
          <div key={p.id} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between text-sm">
              <span
                className={
                  isMe ? "font-semibold text-ink" : "font-medium text-ink/80"
                }
              >
                {shortName(i)}
                {isMe && (
                  <span className="ml-1.5 text-xs font-normal text-muted">
                    you
                  </span>
                )}
              </span>
              <span
                className={
                  p.status === "eliminated"
                    ? "text-xs font-medium text-rose-600"
                    : p.status === "won"
                      ? "text-xs font-semibold text-accent"
                      : "text-xs font-medium text-muted"
                }
              >
                {statusLabel}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-ink/5">
              <div
                className={`h-full rounded-full transition-all duration-300 ease-out ${barColor}`}
                style={{
                  width: `${p.status === "eliminated" ? 100 : p.progress}%`,
                }}
              />
            </div>
          </div>
        );
      })}
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

  const cols = board[0]?.length ?? 9;

  return (
    <div
      className="grid gap-px rounded-lg bg-stone-400/60 p-2.5 shadow-md transition-opacity"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        opacity: canPlay ? 1 : 0.55,
      }}
    >
      {board.map((row, r) =>
        row.map((cell, c) => {
          const isSafeHighlight =
            !hasStarted && r === safeStartCell.row && c === safeStartCell.col;

          const disabled =
            !canPlay ||
            (canPlay &&
              !hasStarted &&
              (r !== safeStartCell.row || c !== safeStartCell.col));

          const base =
            "flex aspect-square items-center justify-center text-[clamp(0.75rem,2vw,1.25rem)] font-bold leading-none select-none transition-colors";

          let stateClasses = "";
          if (isSafeHighlight) {
            stateClasses =
              "bg-accent/15 ring-2 ring-inset ring-accent text-accent animate-pulse cursor-pointer";
          } else if (cell.revealed && cell.isMine) {
            stateClasses = "bg-rose-200 text-rose-700";
          } else if (cell.revealed) {
            stateClasses = "bg-stone-200 text-ink";
          } else {
            stateClasses =
              "bg-stone-300 border-t border-l border-t-white/70 border-l-white/70 border-b border-r border-b-stone-500/50 border-r-stone-500/50 hover:bg-stone-200";
          }

          const numClass =
            cell.revealed && !cell.isMine && (cell.adjacentMines ?? 0) > 0
              ? numberColor(cell.adjacentMines ?? 0)
              : "";

          return (
            <button
              key={`${r}-${c}`}
              onClick={() => canPlay && onCellClick(r, c)}
              disabled={disabled}
              className={`${base} ${stateClasses} ${numClass} ${
                disabled && !isSafeHighlight
                  ? "cursor-default"
                  : "cursor-pointer"
              }`}
            >
              {determineSymbol(cell)}
            </button>
          );
        }),
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
  const myId = socketRef.current?.id;
  const me = players.find((p) => p.id === myId);
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
    <main className="min-h-screen bg-paper text-ink">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">
          Minesweeper Battle
        </h1>
        <p className="text-sm text-muted">
          Room{" "}
          <span className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-ink/80">
            {roomID}
          </span>
        </p>
      </header>

      {/* Side rail (players) + centered board */}
      <div className="lg:flex">
        {/* Players side rail */}
        <aside className="border-b border-ink/10 px-6 py-5 lg:w-72 lg:shrink-0 lg:border-b-0 lg:border-r">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Players
            </h2>
            <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs font-medium text-muted">
              {players.length}
            </span>
          </div>
          {players.length > 0 ? (
            <ProgressBars players={players} myId={myId} />
          ) : (
            <p className="text-sm text-muted">No one here yet.</p>
          )}
        </aside>

        {/* Centered board column */}
        <section className="flex flex-1 flex-col items-center gap-6 px-6 py-8">
          {/* Status / result banner */}
          <div className="flex min-h-[2.75rem] items-center">
            {myStatus === "won" && (
              <div className="inline-flex items-center gap-2 rounded-lg bg-accent/10 px-4 py-2 text-accent">
                <span className="text-lg">🏆</span>
                <span className="font-semibold">You won!</span>
              </div>
            )}
            {myStatus === "eliminated" && (
              <div className="inline-flex items-center gap-2 rounded-lg bg-rose-50 px-4 py-2 text-rose-700">
                <span className="text-lg">💥</span>
                <span className="font-semibold">
                  You hit a mine — eliminated
                </span>
              </div>
            )}
            {roomStatus === "waiting" && myStatus !== "won" && (
              <p className="text-sm text-muted">
                Waiting for the host to start the game…
              </p>
            )}
            {roomStatus === "playing" &&
              myStatus === "playing" &&
              !hasStarted && (
                <p className="text-sm text-muted">
                  Click the{" "}
                  <span className="font-medium text-accent">
                    highlighted cell
                  </span>{" "}
                  to begin.
                </p>
              )}
          </div>

          {/* Board — capped square that scales with the viewport */}
          <div className="w-full max-w-[min(80vh,640px)]">
            {board ? (
              <Board
                board={board}
                onCellClick={cellClick}
                canPlay={canPlay}
                safeStartCell={safeStartCell}
                hasStarted={hasStarted}
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed border-ink/15 text-sm text-muted">
                Waiting for game to start…
              </div>
            )}
          </div>

          {/* Host controls */}
          <div className="min-h-[3rem]">
            {isHost && roomStatus === "waiting" && (
              <button
                onClick={hostStartGameClick}
                className="rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent/90 active:scale-[0.98]"
              >
                Start game
              </button>
            )}
            {isHost && roomStatus === "finished" && (
              <button
                onClick={hostStartGameClick}
                className="rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent/90 active:scale-[0.98]"
              >
                Start new game
              </button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
