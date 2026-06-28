import { Server } from "socket.io";
import { createBoard, reveal, type Board, progress } from "./board.ts";
import { type Player, type Room } from "./rooms.ts";
import {
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
      // Cheks that both the player and room have "playing" status for revealing to be allowed.
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
        socket.emit("board", { rows: 9, cols: 9, board: toSafeBoard(board) });
      }
    }
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

    resetGame(room);

    const { avoidSet, startRow, startCol } = generateAvoidSet(9, 9);
    room.safeStartCell = { row: startRow, col: startCol };

    // Create the shared board
    const sharedBoard = createBoard(9, 9, 10, avoidSet);

    // Assign a copy of the shared board to each player
    for (const player of room.players) {
      player.board = structuredClone(sharedBoard);
    }

    // Send each player their board
    // player.id is the socket id of the player so this sends the board signal to only that player's socket
    for (const player of room.players) {
      if (!player.board) continue;
      io.to(player.id).emit("board", {
        rows: 9,
        cols: 9,
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
