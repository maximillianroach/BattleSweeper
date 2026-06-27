import { Server } from "socket.io";
import { createBoard, reveal, type Board } from "./board.ts";
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

const io = new Server(4000, {
  cors: {
    origin: "http://localhost:3000",
  },
});

console.log("Socket server listening on port 4000");

io.on("connection", (socket) => {
  console.log("A client connected:", socket.id);

  let board: Board = createBoard(9, 9, 10);

  // Send initial board as soon as user connects
  socket.emit("board", { rows: 9, cols: 9, board: toSafeBoard(board) });

  socket.on("reveal", (payload: { row: number; col: number }) => {
    reveal(board, payload.row, payload.col);
    socket.emit("board", { rows: 9, cols: 9, board: toSafeBoard(board) });
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
    room.players.push(socket.id);
    socket.join(payload.roomID);
    io.to(payload.roomID).emit("room-update", { players: room.players });
  });

  socket.on("disconnect", () => {
    console.log("A client disconnected:", socket.id);
    const room = findRoomByPlayer(socket.id);
    if (room) {
      room.players = room.players.filter((playerID) => playerID !== socket.id);

      if (room.players.length === 0) {
        deleteRoom(room.id);
      } else {
        io.to(room.id).emit("room-update", { players: room.players });
      }
    }
  });
});
