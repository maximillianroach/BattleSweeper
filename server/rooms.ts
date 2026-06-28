import { type Board } from "./board.ts";

type PlayerStatus = "playing" | "eliminated" | "won";

type RoomStatus = "waiting" | "playing" | "finished";

export type Player = {
  id: string;
  board: Board | null;
  progress: number;
  status: PlayerStatus;
  hasStarted: boolean;
};

export type Room = {
  id: string;
  players: Player[];
  hostID: string | null;
  status: RoomStatus;
  safeStartCell: { row: number; col: number } | null;
};

const rooms = new Map<string, Room>();

// ID is 4 uppercase letters followed by 2 numbers
export const generateRoomID = (): string => {
  let roomID: string = "";

  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const numbers = "0123456789";

  // generate letters
  for (let i = 0; i < 4; i++) {
    const letterIndex = Math.floor(Math.random() * 26);
    roomID += letters[letterIndex];
  }

  for (let i = 0; i < 2; i++) {
    const numIndex = Math.floor(Math.random() * 10);
    roomID += numbers[numIndex];
  }

  // Generate new id if roomID is already in rooms
  if (rooms.has(roomID)) {
    return generateRoomID();
  }
  return roomID;
};

export const getRoom = (roomID: string): Room | undefined => {
  return rooms.get(roomID);
};

export const createRoom = (): Room => {
  const newRoom: Room = {
    id: generateRoomID(),
    players: [],
    hostID: null,
    status: "waiting",
    safeStartCell: null,
  };
  rooms.set(newRoom.id, newRoom);
  return newRoom;
};

export const findRoomByPlayer = (socketID: string): Room | undefined => {
  for (const room of rooms.values()) {
    if (room.players.some((p) => p.id === socketID)) {
      return room;
    }
  }
  return undefined;
};

export const deleteRoom = (roomID: string) => {
  if (rooms.has(roomID)) {
    rooms.delete(roomID);
  }
};
