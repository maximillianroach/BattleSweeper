import { Server } from "socket.io";
import { createBoard, reveal, type Board, progress } from "./board.ts";
import { type Player } from "./rooms.ts";
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
    progress: p.board ? progress(p.board) : 0,
  }));
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
      reveal(board, payload.row, payload.col);
      player.progress = progress(board);
      io.to(room.id).emit("progress-update", {
        players: toSafePlayers(room.players),
      });
      socket.emit("board", { rows: 9, cols: 9, board: toSafeBoard(board) });
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

    room.players.push({ id: socket.id, board: null, progress: 0 });
    socket.join(payload.roomID);
    io.to(payload.roomID).emit("room-update", {
      players: toSafePlayers(room.players),
      hostID: room.hostID,
    });
  });

  socket.on("start-game", (payload: { roomID: string }) => {
    const room = getRoom(payload.roomID);
    if (!room) return;

    // Create the shared board
    const sharedBoard = createBoard(9, 9, 10);

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

    io.to(payload.roomID).emit("game-starting");
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
