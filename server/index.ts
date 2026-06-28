import { Server } from "socket.io";
import { createBoard, reveal, type Board, progress, flag } from "./board.ts";
import {
  type Player,
  type Room,
  type Difficulty,
  generateRoomID,
  getRoom,
  createRoom,
  findRoomByPlayer,
  deleteRoom,
} from "./rooms.ts";

type SafeCell = {
  revealed: boolean;
  flagged: boolean;
  adjacentMines: number | null;
  isMine: boolean | null;
};

function toSafeBoard(board: Board): SafeCell[][] {
  return board.map((row) =>
    row.map((cell) => {
      if (cell.revealed) {
        return {
          revealed: true,
          flagged: cell.flagged,
          adjacentMines: cell.adjacentMines,
          isMine: cell.isMine,
        };
      }
      return {
        revealed: false,
        flagged: cell.flagged,
        adjacentMines: null,
        isMine: null,
      };
    }),
  );
}

// Needs to be added after creating Player type
function toSafePlayers(players: Player[]) {
  return players.map((p) => ({
    id: p.id,
    progress: p.board ? p.progress : 0,
    status: p.status,
  }));
}

// Used in start-game listener for when game is restarted
function resetGame(room: Room) {
  // Change player statuses to "playing" and progress to 0
  const players = room.players;

  for (const player of players) {
    player.status = "playing";
    player.progress = 0;
    player.board = null;
    player.hasStarted = false;
  }
}
// Checks if all players in the room are eliminated
function checkAllEliminated(room: Room) {
  for (const player of room.players) {
    if (player.status !== "eliminated") {
      return false;
    }
  }
  return true;
}
// Creates the set of cells to avoid for createBoard
function generateAvoidSet(
  rows: number,
  cols: number,
): { avoidSet: Set<number>; startRow: number; startCol: number } {
  const startRow = Math.round(rows / 2);
  const startCol = Math.round(cols / 2);

  const avoidSet = new Set<number>();

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (
        startRow + dr < 0 ||
        startCol + dc < 0 ||
        startRow + dr >= rows ||
        startCol + dc >= cols
      ) {
        continue;
      }
      avoidSet.add((startRow + dr) * cols + (startCol + dc));
    }
  }
  return { avoidSet, startRow, startCol };
}

const DIFFICULTIES = {
  easy: { rows: 9, cols: 9, mines: 10 },
  medium: { rows: 16, cols: 16, mines: 40 },
  hard: { rows: 21, cols: 21, mines: 70 },
};

const io = new Server(4000, {
  cors: {
    origin: "http://localhost:3000",
  },
});

console.log("Socket server listening on port 4000");

io.on("connection", (socket) => {
  console.log("A client connected:", socket.id);

  // We have the socket.id so we know who sent the signal
  socket.on("reveal", (payload: { row: number; col: number }) => {
    // find the room corresponding to socket signal
    const room = findRoomByPlayer(socket.id);
    const player = room?.players.find((p) => p.id === socket.id);
    const board = player?.board;

    if (board && room) {
      // Bars invalid row and col parameters
      if (
        payload.row >= board.length ||
        payload.col >= board[0].length ||
        payload.row < 0 ||
        payload.col < 0
      ) {
        return;
      }

      // Checks that both the player and room have "playing" status for revealing to be allowed.
      if (player.status === "playing" && room.status === "playing") {
        // If the player hasn't clicked the initial safe square, disable all others
        if (!player.hasStarted) {
          // The safe cell has been clicked
          if (
            payload.row === room.safeStartCell?.row &&
            payload.col === room.safeStartCell?.col
          ) {
            player.hasStarted = true;
          } else {
            return;
          }
        }

        reveal(board, payload.row, payload.col);
        player.progress = progress(board);

        // If the player reveals a mine, they are eliminated
        if (board[payload.row][payload.col].isMine) {
          player.status = "eliminated";
        }

        // If the player's progress reaches 100, they have won
        // Change room status to "finished"
        if (player.progress === 100) {
          player.status = "won";
          room.status = "finished";
        } else if (checkAllEliminated(room)) {
          room.status = "finished";
        }

        io.to(room.id).emit("progress-update", {
          players: toSafePlayers(room.players),
          roomStatus: room.status,
        });
        socket.emit("board", {
          rows: DIFFICULTIES[room.difficulty].rows,
          cols: DIFFICULTIES[room.difficulty].cols,
          board: toSafeBoard(board),
        });
      }
    }
  });

  socket.on("flag", (payload: { row: number; col: number }) => {
    const room = findRoomByPlayer(socket.id);
    const player = room?.players.find((p) => p.id === socket.id);
    const board = player?.board;

    // Prevents flagging before first click
    if (!player?.hasStarted) return;

    if (player?.status !== "playing" || room?.status !== "playing") {
      return;
    }

    if (board && room) {
      flag(board, payload.row, payload.col);
      socket.emit("board", { rows: 9, cols: 9, board: toSafeBoard(board) });
    }
  });

  socket.on("set-difficulty", (payload: { difficulty: Difficulty }) => {
    const room = findRoomByPlayer(socket.id);

    if (!room) return;

    room.difficulty = payload.difficulty;
    io.to(room.id).emit("change-difficulty", { difficulty: room.difficulty });
  });

  socket.on("create-room", () => {
    const room = createRoom();
    socket.emit("room-created", { roomID: room.id });
  });

  socket.on("join-room", (payload: { roomID: string }) => {
    const room = getRoom(payload.roomID);

    if (!room) {
      socket.emit("roomID-error", { roomID: payload.roomID });
      return;
    }
    if (!room.hostID) {
      room.hostID = socket.id;
    }

    room.players.push({
      id: socket.id,
      board: null,
      progress: 0,
      status: "playing",
      hasStarted: false,
    });
    socket.join(payload.roomID);
    io.to(payload.roomID).emit("room-update", {
      players: toSafePlayers(room.players),
      hostID: room.hostID,
    });
  });

  socket.on("start-game", (payload: { roomID: string }) => {
    const room = getRoom(payload.roomID);
    if (!room) return;

    // Makes it so non-host sockets can't start game
    if (room.hostID !== socket.id) {
      return;
    }

    resetGame(room);

    const { rows, cols, mines } = DIFFICULTIES[room.difficulty];

    const { avoidSet, startRow, startCol } = generateAvoidSet(rows, cols);

    room.safeStartCell = { row: startRow, col: startCol };

    // Create the shared board
    const sharedBoard = createBoard(rows, cols, mines, avoidSet);

    // Assign a copy of the shared board to each player
    for (const player of room.players) {
      player.board = structuredClone(sharedBoard);
    }

    // Send each player their board
    // player.id is the socket id of the player so this sends the board signal to only that player's socket
    for (const player of room.players) {
      if (!player.board) continue;
      io.to(player.id).emit("board", {
        rows: rows,
        cols: cols,
        board: toSafeBoard(player.board),
      });
    }

    // Enable "playing" status for the room
    room.status = "playing";

    io.to(payload.roomID).emit("game-starting", {
      roomStatus: room.status,
      safeStartCell: room.safeStartCell,
    });

    // We need a progress-update so we can send the new player statuses after resetting
    io.to(payload.roomID).emit("progress-update", {
      players: toSafePlayers(room.players),
      roomStatus: room.status,
    });
  });

  socket.on("try-to-join", (payload: { code: string }) => {
    socket.emit("try-to-join-message", {
      message: getRoom(payload.code.toUpperCase()) !== undefined,
      code: payload.code,
    });
  });

  // When a player disconnects from a room they are removed from that room's player list
  socket.on("disconnect", () => {
    console.log("A client disconnected:", socket.id);
    const room = findRoomByPlayer(socket.id);
    if (room) {
      room.players = room.players.filter((player) => player.id !== socket.id);

      if (room.players.length === 0) {
        deleteRoom(room.id);
        return;
      }

      // If the host disconnects, promote the next player in the players array to be the host
      if (socket.id === room.hostID) {
        room.hostID = room.players[0].id;
      }
      io.to(room.id).emit("room-update", {
        players: toSafePlayers(room.players),
        hostID: room.hostID,
      });
    }
  });
});
