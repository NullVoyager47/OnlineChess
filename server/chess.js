// Basic chess engine utilities shared by the server

const inBounds = ({ row, col }) => row >= 0 && row < 8 && col >= 0 && col < 8

const cloneBoard = (board) => board.map((row) => row.map((sq) => (sq ? { ...sq } : null)))

const placeBackRank = () => ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook']

export const createInitialBoard = () => {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null))
  const backRank = placeBackRank()

  backRank.forEach((type, col) => {
    board[0][col] = { type, color: 'black' }
    board[7][col] = { type, color: 'white' }
  })

  for (let col = 0; col < 8; col += 1) {
    board[1][col] = { type: 'pawn', color: 'black' }
    board[6][col] = { type: 'pawn', color: 'white' }
  }

  return board
}

const getSlidingMoves = (board, from, directions) => {
  const moves = []

  directions.forEach((dir) => {
    let next = { row: from.row + dir.row, col: from.col + dir.col }
    while (inBounds(next)) {
      const occupant = board[next.row][next.col]
      if (!occupant) {
        moves.push(next)
      } else {
        if (occupant.color !== board[from.row][from.col]?.color) {
          moves.push(next)
        }
        break
      }
      next = { row: next.row + dir.row, col: next.col + dir.col }
    }
  })

  return moves
}

const getPseudoMoves = (board, from, forAttack = false) => {
  const piece = board[from.row][from.col]
  if (!piece) return []

  const moves = []

  switch (piece.type) {
    case 'pawn': {
      const dir = piece.color === 'white' ? -1 : 1
      const startRow = piece.color === 'white' ? 6 : 1

      if (!forAttack) {
        const oneForward = { row: from.row + dir, col: from.col }
        if (inBounds(oneForward) && !board[oneForward.row][oneForward.col]) {
          moves.push(oneForward)
          const twoForward = { row: from.row + dir * 2, col: from.col }
          if (from.row === startRow && !board[twoForward.row][twoForward.col]) {
            moves.push(twoForward)
          }
        }
      }

      const diagonals = [
        { row: from.row + dir, col: from.col - 1 },
        { row: from.row + dir, col: from.col + 1 },
      ]

      diagonals.forEach((pos) => {
        if (!inBounds(pos)) return
        const occupant = board[pos.row][pos.col]
        if (forAttack) {
          moves.push(pos)
        } else if (occupant && occupant.color !== piece.color) {
          moves.push(pos)
        }
      })
      break
    }
    case 'knight': {
      const deltas = [
        { row: 2, col: 1 },
        { row: 2, col: -1 },
        { row: -2, col: 1 },
        { row: -2, col: -1 },
        { row: 1, col: 2 },
        { row: 1, col: -2 },
        { row: -1, col: 2 },
        { row: -1, col: -2 },
      ]

      deltas.forEach((delta) => {
        const next = { row: from.row + delta.row, col: from.col + delta.col }
        if (!inBounds(next)) return
        const occupant = board[next.row][next.col]
        if (!occupant || occupant.color !== piece.color) {
          moves.push(next)
        }
      })
      break
    }
    case 'bishop': {
      moves.push(
        ...getSlidingMoves(board, from, [
          { row: 1, col: 1 },
          { row: 1, col: -1 },
          { row: -1, col: 1 },
          { row: -1, col: -1 },
        ]),
      )
      break
    }
    case 'rook': {
      moves.push(
        ...getSlidingMoves(board, from, [
          { row: 1, col: 0 },
          { row: -1, col: 0 },
          { row: 0, col: 1 },
          { row: 0, col: -1 },
        ]),
      )
      break
    }
    case 'queen': {
      moves.push(
        ...getSlidingMoves(board, from, [
          { row: 1, col: 0 },
          { row: -1, col: 0 },
          { row: 0, col: 1 },
          { row: 0, col: -1 },
          { row: 1, col: 1 },
          { row: 1, col: -1 },
          { row: -1, col: 1 },
          { row: -1, col: -1 },
        ]),
      )
      break
    }
    case 'king': {
      const steps = [
        { row: 1, col: 0 },
        { row: -1, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: -1 },
        { row: 1, col: 1 },
        { row: 1, col: -1 },
        { row: -1, col: 1 },
        { row: -1, col: -1 },
      ]

      steps.forEach((step) => {
        const next = { row: from.row + step.row, col: from.col + step.col }
        if (!inBounds(next)) return
        const occupant = board[next.row][next.col]
        if (!occupant || occupant.color !== piece.color) {
          moves.push(next)
        }
      })
      break
    }
    default:
      break
  }

  return moves
}

const isSquareAttacked = (board, square, byColor) => {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col]
      if (!piece || piece.color !== byColor) continue
      const moves = getPseudoMoves(board, { row, col }, true)
      if (moves.some((move) => move.row === square.row && move.col === square.col)) {
        return true
      }
    }
  }
  return false
}

const isKingInCheck = (board, color) => {
  let kingPos = null
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col]
      if (piece?.type === 'king' && piece.color === color) {
        kingPos = { row, col }
        break
      }
    }
    if (kingPos) break
  }

  if (!kingPos) return false
  return isSquareAttacked(board, kingPos, color === 'white' ? 'black' : 'white')
}

const moveWithSpecial = (board, from, to, promotionType) => {
  const piece = board[from.row][from.col]
  if (!piece) return board

  const targetPiece = board[to.row][to.col]
  const isCastling = piece.type === 'king' && Math.abs(to.col - from.col) === 2
  const isEnPassant = piece.type === 'pawn' && from.col !== to.col && !targetPiece
  const next = cloneBoard(board)
  next[from.row][from.col] = null

  if (isEnPassant) {
    next[from.row][to.col] = null
  }

  if (isCastling) {
    const row = from.row
    if (to.col > from.col) {
      next[row][5] = next[row][7]
      next[row][7] = null
      next[row][6] = { type: 'king', color: piece.color }
    } else {
      next[row][3] = next[row][0]
      next[row][0] = null
      next[row][2] = { type: 'king', color: piece.color }
    }
    return next
  }

  const placed = promotionType ? { type: promotionType, color: piece.color } : piece
  next[to.row][to.col] = placed
  return next
}

const nextEnPassantTarget = (from, to, piece) => {
  if (piece.type !== 'pawn') return null
  if (Math.abs(to.row - from.row) === 2) {
    return { row: (from.row + to.row) / 2, col: from.col }
  }
  return null
}

const disableRookRightsIfNeeded = (rights, pos, color) => {
  const updated = { ...rights, [color]: { ...rights[color] } }
  if (color === 'white') {
    if (pos.row === 7 && pos.col === 0) updated.white.queenSide = false
    if (pos.row === 7 && pos.col === 7) updated.white.kingSide = false
  } else {
    if (pos.row === 0 && pos.col === 0) updated.black.queenSide = false
    if (pos.row === 0 && pos.col === 7) updated.black.kingSide = false
  }
  return updated
}

export const getLegalMoves = (board, from, rights, enPassantTarget) => {
  const piece = board[from.row][from.col]
  if (!piece) return []

  const pseudo = getPseudoMoves(board, from, false)
  const moves = [...pseudo]

  if (piece.type === 'pawn' && enPassantTarget) {
    const dir = piece.color === 'white' ? -1 : 1
    const captureRow = from.row + dir
    if (
      captureRow === enPassantTarget.row &&
      Math.abs(from.col - enPassantTarget.col) === 1 &&
      board[from.row][enPassantTarget.col]?.color !== piece.color
    ) {
      moves.push(enPassantTarget)
    }
  }

  if (piece.type === 'king') {
    const row = piece.color === 'white' ? 7 : 0
    const enemy = piece.color === 'white' ? 'black' : 'white'

    if (from.row === row && from.col === 4 && rights[piece.color].kingSide) {
      const squaresClear = !board[row][5] && !board[row][6]
      const safe =
        !isKingInCheck(board, piece.color) &&
        !isSquareAttacked(board, { row, col: 5 }, enemy) &&
        !isSquareAttacked(board, { row, col: 6 }, enemy)
      if (squaresClear && safe) moves.push({ row, col: 6 })
    }

    if (from.row === row && from.col === 4 && rights[piece.color].queenSide) {
      const squaresClear = !board[row][1] && !board[row][2] && !board[row][3]
      const safe =
        !isKingInCheck(board, piece.color) &&
        !isSquareAttacked(board, { row, col: 3 }, enemy) &&
        !isSquareAttacked(board, { row, col: 2 }, enemy)
      if (squaresClear && safe) moves.push({ row, col: 2 })
    }
  }

  return moves.filter((target) => {
    const hypothetical = moveWithSpecial(board, from, target)
    return !isKingInCheck(hypothetical, piece.color)
  })
}

export const applyMove = (state, from, to, promotionType) => {
  const movingPiece = state.board[from.row][from.col]
  if (!movingPiece) return state

  const targetPiece = state.board[to.row][to.col]
  const isEnPassant =
    movingPiece.type === 'pawn' && from.col !== to.col && !targetPiece &&
    state.enPassantTarget &&
    state.enPassantTarget.row === to.row && state.enPassantTarget.col === to.col

  const capturedPos = isEnPassant ? { row: from.row, col: to.col } : { row: to.row, col: to.col }
  const capturedPiece = isEnPassant ? state.board[from.row][to.col] : targetPiece

  const board = moveWithSpecial(state.board, from, to, promotionType)

  let rights = {
    white: { ...state.castlingRights.white },
    black: { ...state.castlingRights.black },
  }

  if (movingPiece.type === 'king') rights[movingPiece.color] = { kingSide: false, queenSide: false }
  if (movingPiece.type === 'rook') rights = disableRookRightsIfNeeded(rights, from, movingPiece.color)
  if (capturedPiece?.type === 'rook' && capturedPiece.color !== movingPiece.color) {
    rights = disableRookRightsIfNeeded(rights, capturedPos, capturedPiece.color)
  }

  const enPassantTarget = nextEnPassantTarget(from, to, movingPiece)

  const history = [
    ...state.history,
    {
      turn: state.turn,
      from,
      to,
      piece: promotionType ? { type: promotionType, color: movingPiece.color } : movingPiece,
      captured: capturedPiece,
    },
  ]

  return {
    board,
    turn: state.turn === 'white' ? 'black' : 'white',
    lastMove: { from, to },
    history,
    castlingRights: rights,
    enPassantTarget,
  }
}

export const createInitialState = () => ({
  board: createInitialBoard(),
  turn: 'white',
  lastMove: null,
  history: [],
  castlingRights: {
    white: { kingSide: true, queenSide: true },
    black: { kingSide: true, queenSide: true },
  },
  enPassantTarget: null,
})
