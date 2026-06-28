export type Cell = {
  isMine: boolean;
  revealed: boolean;
  flagged: boolean;
  adjacentMines: number;
};

export type Board = Cell[][];

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

export function createBoard(
  row: number,
  col: number,
  mineCount: number,
  avoid?: Set<number>,
): Board {
  const board: Board = Array.from({ length: row }, () =>
    Array.from({ length: col }, () => ({
      isMine: false,
      revealed: false,
      flagged: false,
      adjacentMines: 0,
    })),
  );

  let positions: number[] = Array.from({ length: row * col }, (_, i) => i);
  if (avoid) {
    positions = positions.filter((num) => !avoid.has(num));
  }

  // Fisher-Yates shuffle
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }

  // Assigns the first mineCount cells to have mines
  for (let k = 0; k < mineCount; k++) {
    const index = positions[k];
    const r = Math.floor(index / col);
    const c = index % col;
    board[r][c].isMine = true;
  }

  // Count number of adjacent mines for each cell and update corresponding property
  // Checks the 8 surrounding cells
  for (let r = 0; r < row; r++) {
    for (let c = 0; c < col; c++) {
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          // Skip the target cell
          if (dr === 0 && dc === 0) continue;

          const cur_row = r + dr;
          const cur_col = c + dc;

          // Skip out-of-bounds cells
          if (cur_row < 0 || cur_col < 0 || cur_row >= row || cur_col >= col)
            continue;

          if (board[cur_row][cur_col].isMine) {
            count++;
          }
        }
      }
      board[r][c].adjacentMines = count;
    }
  }

  return board;
}

// Reveals the state of the cell at specified position
export function reveal(board: Board, row: number, col: number): Board {
  if (board[row][col].revealed || board[row][col].flagged) {
    return board;
  }

  board[row][col].revealed = true;

  // Stops from cascading out of mine
  if (board[row][col].isMine) {
    return board;
  }

  // Flood-fill
  if (board[row][col].adjacentMines === 0) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;

        const nr = row + dr;
        const cr = col + dc;

        if (nr < 0 || cr < 0 || nr >= board.length || cr >= board[0].length)
          continue;

        reveal(board, nr, cr);
      }
    }
    return board;
  }

  return board;
}

export function progress(board: Board): number {
  const num_rows = board.length;
  const num_cols = board[0].length;

  let revealed_count = 0;
  let safe_count = 0;

  for (let i = 0; i < num_rows; i++) {
    for (let j = 0; j < num_cols; j++) {
      if (!board[i][j].isMine) {
        if (board[i][j].revealed) {
          revealed_count++;
        }

        safe_count++;
      }
    }
  }

  return Math.round((revealed_count / safe_count) * 100);
}
