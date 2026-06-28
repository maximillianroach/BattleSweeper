"use client";
import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useParams, useSearchParams } from "next/navigation";

type PlayerStatus = "playing" | "eliminated" | "won";

type RoomStatus = "waiting" | "playing" | "finished";

type Difficulty = "easy" | "medium" | "hard";

const difficulties: Difficulty[] = ["easy", "medium", "hard"];

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

const DIFFICULTY_DESC: Record<Difficulty, string> = {
  easy: "9×9 · 10 mines",
  medium: "16×16 · 40 mines",
  hard: "21×21 · 70 mines",
};

type SafeCell = {
  revealed: boolean;
  flagged: boolean;
  adjacentMines: number | null;
  isMine: boolean | null;
};

type PlayerInfo = {
  id: string;
  progress: number;
  status: PlayerStatus;
  name: string;
};

type ChatMessage = {
  id: string; // sender socket id
  name: string; // sender display name
  text: string;
  at: number; // timestamp (ms)
};

function displayName(player: PlayerInfo): string {
  return player.name || "Anonymous";
}

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

function ProgressBars({
  players,
  myId,
}: {
  players: PlayerInfo[];
  myId: string | undefined;
}) {
  return (
    <div className="flex flex-col gap-3">
      {players.map((p) => {
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
                {displayName(p)}
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
  onCellRightClick,
  canPlay,
  safeStartCell,
  hasStarted,
}: {
  board: SafeCell[][];
  onCellClick: (r: number, c: number) => void;
  onCellRightClick: (e: React.MouseEvent, r: number, c: number) => void;
  canPlay: boolean;
  safeStartCell: { row: number; col: number };
  hasStarted: boolean;
}) {
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
              onContextMenu={(e) => onCellRightClick(e, r, c)}
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
function LobbyPlayerList({
  players,
  myId,
  hostID,
}: {
  players: PlayerInfo[];
  myId: string | undefined;
  hostID: string | null;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {players.map((p) => {
        const isMe = p.id === myId;
        const isHost = p.id === hostID;
        return (
          <li
            key={p.id}
            className="flex items-center justify-between rounded-lg bg-ink/[0.03] px-3 py-2.5"
          >
            <span className="flex items-center gap-2 text-sm">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
                {displayName(p).charAt(0).toUpperCase()}
              </span>
              <span className="font-medium text-ink">{displayName(p)}</span>
              {isMe && <span className="text-xs text-muted">you</span>}
            </span>
            {isHost && (
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                Host
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Chat({
  messages,
  draft,
  setDraft,
  onSend,
  myId,
}: {
  messages: ChatMessage[];
  draft: string;
  setDraft: (v: string) => void;
  onSend: () => void;
  myId: string | undefined;
}) {
  // Auto-scroll to the newest message
  const bottomRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex h-full flex-col rounded-xl border border-ink/10 bg-surface shadow-sm">
      {/* Header */}
      <div className="border-b border-ink/10 px-4 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Chat
        </h3>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <p className="text-sm text-muted">No messages yet. Say hi 👋</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {messages.map((m, i) => {
              const isMe = m.id === myId;
              return (
                <div
                  key={`${m.at}-${i}`}
                  className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                >
                  <span className="px-1 text-xs text-muted">
                    {isMe ? "You" : m.name}
                  </span>
                  <span
                    className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm ${
                      isMe ? "bg-accent text-white" : "bg-ink/5 text-ink"
                    }`}
                  >
                    {m.text}
                  </span>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="flex items-center gap-2 border-t border-ink/10 p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSend();
          }}
          placeholder="Type a message…"
          maxLength={300}
          className="flex-1 rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm text-ink outline-none transition placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <button
          onClick={onSend}
          disabled={!draft.trim()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90 active:scale-[0.98] disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default function GameRoom() {
  const socketRef = useRef<Socket | null>(null);
  const [board, setBoard] = useState<SafeCell[][] | null>(null);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [hostID, setHostID] = useState<string | null>(null);
  const [roomStatus, setRoomStatus] = useState<RoomStatus>("waiting");
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [safeStartCell, setSafeStartCell] = useState<{
    row: number;
    col: number;
  }>({ row: 0, col: 0 });
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const [copied, setCopied] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");

  const params = useParams();
  const roomID = params.roomID as string;

  const searchParams = useSearchParams();
  const name = searchParams.get("name") ?? "Anonymous";

  useEffect(() => {
    const socket = io("http://localhost:4000");
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Connected, joining room:", roomID);
      socket.emit("join-room", { roomID, name });
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

    socket.on("change-difficulty", (payload: { difficulty: Difficulty }) => {
      setDifficulty(payload.difficulty);
    });

    socket.on("returned-to-lobby", (payload: { roomStatus: RoomStatus }) => {
      setRoomStatus(payload.roomStatus);
      setBoard(null);
    });

    socket.on("chat-message", (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      socket.disconnect();
    };
  }, [roomID]);

  const isHost = hostID !== null && hostID === socketRef.current?.id;

  const myId = socketRef.current?.id;
  const me = players.find((p) => p.id === myId);
  const myStatus = me?.status;
  const canPlay = myStatus === "playing" && roomStatus === "playing";

  const cellClick = (row: number, col: number) => {
    socketRef.current?.emit("reveal", { row: row, col: col });
    setHasStarted(true);
  };

  const cellRightClick = (e: React.MouseEvent, row: number, col: number) => {
    e.preventDefault();
    if (!canPlay) return;
    socketRef.current?.emit("flag", { row: row, col: col });
  };

  const hostStartGameClick = () => {
    socketRef.current?.emit("start-game", { roomID });
  };

  const pickDifficulty = (d: Difficulty) => {
    socketRef.current?.emit("set-difficulty", { difficulty: d });
  };

  const returnToLobbyClick = () => {
    socketRef.current?.emit("return-to-lobby", { roomID });
  };

  const sendMessage = () => {
    const text = draft.trim();
    if (!text) return;
    socketRef.current?.emit("chat-message", { text });
    setDraft("");
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomID);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable; ignore
    }
  };

  const isLobby = roomStatus === "waiting";

  // Winner (for the finished banner)
  const winner = players.find((p) => p.status === "won");

  return (
    <main className="min-h-screen bg-paper text-ink">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">BattleSweeper</h1>
        <button
          onClick={copyCode}
          className="group flex items-center gap-2 rounded-lg border border-ink/10 px-3 py-1.5 text-sm transition hover:border-accent/40 hover:bg-accent/5"
          title="Click to copy"
        >
          <span className="text-muted">Room</span>
          <span className="font-mono font-semibold tracking-wider text-ink">
            {roomID}
          </span>
          <span className="text-xs text-muted group-hover:text-accent">
            {copied ? "Copied!" : "Copy"}
          </span>
        </button>
      </header>

      {isLobby ? (
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
          <div className="text-center">
            <h2 className="text-2xl font-semibold tracking-tight">Lobby</h2>
            <p className="mt-1 text-sm text-muted">
              Share the room code with a friend, then start when everyone&apos;s
              in.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Players */}
            <div className="rounded-xl border border-ink/10 bg-surface p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
                  Players
                </h3>
                <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs font-medium text-muted">
                  {players.length}
                </span>
              </div>
              {players.length > 0 ? (
                <LobbyPlayerList
                  players={players}
                  myId={myId}
                  hostID={hostID}
                />
              ) : (
                <p className="text-sm text-muted">Waiting for players…</p>
              )}
            </div>

            {/* Settings / chat placeholder column */}
            <div className="flex flex-col gap-6">
              {/* Difficulty */}
              <div className="rounded-xl border border-ink/10 bg-surface p-5 shadow-sm">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
                  Difficulty
                </h3>
                {isHost ? (
                  <div className="flex flex-col gap-2">
                    {difficulties.map((d) => {
                      const isSelected = difficulty === d;
                      return (
                        <button
                          key={d}
                          onClick={() => pickDifficulty(d)}
                          className={`flex items-center justify-between rounded-lg px-4 py-2.5 text-sm transition ${
                            isSelected
                              ? "bg-accent text-white shadow-sm"
                              : "bg-ink/5 text-ink hover:bg-ink/10"
                          }`}
                        >
                          <span className="font-semibold">
                            {DIFFICULTY_LABELS[d]}
                          </span>
                          <span
                            className={
                              isSelected
                                ? "text-xs text-white/80"
                                : "text-xs text-muted"
                            }
                          >
                            {DIFFICULTY_DESC[d]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg bg-ink/5 px-4 py-2.5 text-sm">
                    <span className="font-semibold text-ink">
                      {DIFFICULTY_LABELS[difficulty]}
                    </span>
                    <span className="ml-2 text-xs text-muted">
                      {DIFFICULTY_DESC[difficulty]}
                    </span>
                  </div>
                )}
              </div>

              {/* Chat placeholder — Checkpoint 12 goes here */}
              <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-ink/15 p-5 text-center text-sm text-muted h-[400px]">
                <Chat
                  messages={messages}
                  draft={draft}
                  setDraft={setDraft}
                  onSend={sendMessage}
                  myId={socketRef.current?.id}
                />
              </div>
            </div>
          </div>

          {/* Start control */}
          <div className="flex flex-col items-center gap-2">
            {isHost ? (
              <button
                onClick={hostStartGameClick}
                className="rounded-lg bg-accent px-8 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-accent/90 active:scale-[0.98]"
              >
                Start game
              </button>
            ) : (
              <p className="text-sm text-muted">
                Waiting for the host to start…
              </p>
            )}
          </div>
        </div>
      ) : (
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
              {roomStatus === "finished" && winner ? (
                <div className="inline-flex items-center gap-2 rounded-lg bg-accent/10 px-4 py-2 text-accent">
                  <span className="text-lg">🏆</span>
                  <span className="font-semibold">
                    {winner.id === myId
                      ? "You won!"
                      : `${displayName(winner)} won!`}
                  </span>
                </div>
              ) : roomStatus === "finished" ? (
                <div className="inline-flex items-center gap-2 rounded-lg bg-ink/5 px-4 py-2 text-muted">
                  <span className="font-semibold">Game over</span>
                </div>
              ) : myStatus === "eliminated" ? (
                <div className="inline-flex items-center gap-2 rounded-lg bg-rose-50 px-4 py-2 text-rose-700">
                  <span className="text-lg">💥</span>
                  <span className="font-semibold">
                    You hit a mine — eliminated
                  </span>
                </div>
              ) : myStatus === "playing" && !hasStarted ? (
                <p className="text-sm text-muted">
                  Click the{" "}
                  <span className="font-medium text-accent">
                    highlighted cell
                  </span>{" "}
                  to begin.
                </p>
              ) : null}
            </div>

            {/* Board */}
            <div className="w-full max-w-[min(80vh,640px)]">
              {board ? (
                <Board
                  board={board}
                  onCellClick={cellClick}
                  onCellRightClick={cellRightClick}
                  canPlay={canPlay}
                  safeStartCell={safeStartCell}
                  hasStarted={hasStarted}
                />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed border-ink/15 text-sm text-muted">
                  Loading…
                </div>
              )}
            </div>

            {/* Post-game host controls */}
            <div className="flex min-h-[3rem] items-center gap-3">
              {isHost && roomStatus === "finished" && (
                <>
                  <button
                    onClick={hostStartGameClick}
                    className="rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent/90 active:scale-[0.98]"
                  >
                    Play again
                  </button>

                  <button
                    onClick={returnToLobbyClick}
                    className="rounded-lg border border-ink/15 px-6 py-2.5 text-sm font-semibold text-ink transition hover:bg-ink/5 active:scale-[0.98]"
                  >
                    Back to lobby
                  </button>
                </>
              )}
              {!isHost && roomStatus === "finished" && (
                <p className="text-sm text-muted">Waiting for the host…</p>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
