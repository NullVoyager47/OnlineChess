import { useEffect, useMemo, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import './App.css'

type Color = 'white' | 'black'
type PieceType = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn'

type Piece = {
  type: PieceType
  color: Color
}

type Square = Piece | null

type Position = {
  row: number
  col: number
}

type Board = Square[][]

type Move = {
  turn: Color
  from: Position
  to: Position
  piece: Piece
  captured?: Piece | null
}

type CastlingRights = {
  white: { kingSide: boolean; queenSide: boolean }
  black: { kingSide: boolean; queenSide: boolean }
}

type PendingPromotion = {
  from: Position
  to: Position
  piece: Piece
  captured?: Piece | null
}

type GameState = {
  board: Board
  turn: Color
  lastMove: { from: Position; to: Position } | null
  history: Move[]
  castlingRights: CastlingRights
  enPassantTarget: Position | null
}

const pieceSymbol: Record<Color, Record<PieceType, string>> = {
  white: {
    king: '♔',
    queen: '♕',
    rook: '♖',
    bishop: '♗',
    knight: '♘',
    pawn: '♙',
  },
  black: {
    king: '♚',
    queen: '♛',
    rook: '♜',
    bishop: '♝',
    knight: '♞',
    pawn: '♟',
  },
}

const inBounds = ({ row, col }: Position) => row >= 0 && row < 8 && col >= 0 && col < 8

const cloneBoard = (board: Board): Board => board.map((row) => row.slice())

const placeBackRank = (): PieceType[] => ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook']

const createInitialBoard = (): Board => {
  const board: Board = Array.from({ length: 8 }, () => Array<Square>(8).fill(null))

  const backRank = placeBackRank('white')

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

const getSlidingMoves = (board: Board, from: Position, directions: Position[]): Position[] => {
  const moves: Position[] = []

  directions.forEach((dir) => {
    let next: Position = { row: from.row + dir.row, col: from.col + dir.col }

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

const getPseudoMoves = (board: Board, from: Position, forAttack = false): Position[] => {
  const piece = board[from.row][from.col]
  if (!piece) return []

  const moves: Position[] = []

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

const isKingInCheck = (board: Board, color: Color): boolean => {
  let kingPos: Position | null = null
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

const isSquareAttacked = (board: Board, square: Position, byColor: Color): boolean => {
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

const moveWithSpecial = (board: Board, from: Position, to: Position, promotionType?: PieceType): Board => {
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
      // King side
      next[row][5] = next[row][7]
      next[row][7] = null
      next[row][6] = { type: 'king', color: piece.color }
    } else {
      // Queen side
      next[row][3] = next[row][0]
      next[row][0] = null
      next[row][2] = { type: 'king', color: piece.color }
    }
    return next
  }

  const placed: Piece = promotionType ? { type: promotionType, color: piece.color } : piece
  next[to.row][to.col] = placed
  return next
}

const getLegalMoves = (board: Board, from: Position, rights: CastlingRights, enPassantTarget: Position | null): Position[] => {
  const piece = board[from.row][from.col]
  if (!piece) return []

  const pseudo = getPseudoMoves(board, from, false)
  const moves: Position[] = [...pseudo]

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
      if (squaresClear && safe) {
        moves.push({ row, col: 6 })
      }
    }

    if (from.row === row && from.col === 4 && rights[piece.color].queenSide) {
      const squaresClear = !board[row][1] && !board[row][2] && !board[row][3]
      const safe =
        !isKingInCheck(board, piece.color) &&
        !isSquareAttacked(board, { row, col: 3 }, enemy) &&
        !isSquareAttacked(board, { row, col: 2 }, enemy)
      if (squaresClear && safe) {
        moves.push({ row, col: 2 })
      }
    }
  }

  return moves.filter((target) => {
    const hypothetical = moveWithSpecial(board, from, target)
    return !isKingInCheck(hypothetical, piece.color)
  })
}

const formatSquare = (pos: Position) => {
  const files = 'abcdefgh'
  return `${files[pos.col]}${8 - pos.row}`
}

const findKing = (board: Board, color: Color): Position | null => {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col]
      if (piece?.type === 'king' && piece.color === color) {
        return { row, col }
      }
    }
  }
  return null
}

const isCheckmate = (board: Board, color: Color, rights: CastlingRights, enPassantTarget: Position | null): boolean => {
  if (!isKingInCheck(board, color)) return false
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col]
      if (!piece || piece.color !== color) continue
      const moves = getLegalMoves(board, { row, col }, rights, enPassantTarget)
      if (moves.length > 0) return false
    }
  }
  return true
}

function App() {
  const [board, setBoard] = useState<Board>(() => createInitialBoard())
  const [selected, setSelected] = useState<Position | null>(null)
  const [legalMoves, setLegalMoves] = useState<Position[]>([])
  const [turn, setTurn] = useState<Color>('white')
  const [lastMove, setLastMove] = useState<{ from: Position; to: Position } | null>(null)
  const [history, setHistory] = useState<Move[]>([])
  const [castlingRights, setCastlingRights] = useState<CastlingRights>({
    white: { kingSide: true, queenSide: true },
    black: { kingSide: true, queenSide: true },
  })
  const [enPassantTarget, setEnPassantTarget] = useState<Position | null>(null)
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null)
  const [mode, setMode] = useState<'local' | 'online'>('local')
  const [gameId, setGameId] = useState<string>('')
  const [playerColor, setPlayerColor] = useState<Color | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  const [matchStatus, setMatchStatus] = useState<'idle' | 'searching'>('idle')
  const [whiteTime, setWhiteTime] = useState<number>(600) // 10 minutes in seconds
  const [blackTime, setBlackTime] = useState<number>(600)
  const [timerStarted, setTimerStarted] = useState<boolean>(false)
  const socketRef = useRef<Socket | null>(null)
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [gameOver, setGameOver] = useState<{ winner: Color; reason: string } | null>(null)

  const status = useMemo(() => {
    const inCheck = isKingInCheck(board, turn)
    const inMate = isCheckmate(board, turn, castlingRights, enPassantTarget)
    const player = turn === 'white' ? 'White' : 'Black'
    if (inMate) return `${player} is in checkmate`
    if (inCheck) return `${player} is in check`
    return `${player} to move`
  }, [board, turn, castlingRights, enPassantTarget])

  useEffect(() => {
    if (mode !== 'online') {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
      setConnectionStatus('idle')
      setPlayerColor(null)
      setMatchStatus('idle')
      return
    }

    const url = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:4000'
    const socket = io(url, { transports: ['websocket'] })
    socketRef.current = socket
    setConnectionStatus('connecting')

    socket.on('connect', () => setConnectionStatus('connected'))
    socket.on('disconnect', () => setConnectionStatus('error'))
    socket.on('assign', ({ gameId: id, color }: { gameId: string; color: Color }) => {
      setGameId(id)
      setPlayerColor(color)
    })
    socket.on('gameState', (state: GameState) => {
      setBoard(state.board)
      setTurn(state.turn)
      setLastMove(state.lastMove)
      setHistory(state.history)
      setCastlingRights(state.castlingRights)
      setEnPassantTarget(state.enPassantTarget)
      setSelected(null)
      setLegalMoves([])
      setPendingPromotion(null)
      setMatchStatus('idle')
      setGameOver(null)
      setTimerStarted(state.history.length > 0)
    })
    socket.on('opponentLeft', () => setConnectionStatus('error'))
    socket.on('matchStatus', (status: 'idle' | 'searching') => setMatchStatus(status))
    socket.on('timerUpdate', ({ whiteTime: wt, blackTime: bt }: { whiteTime: number; blackTime: number }) => {
      setWhiteTime(wt)
      setBlackTime(bt)
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [mode])

  // Start the timer only after the first move (avoid burning White's clock before play)
  useEffect(() => {
    if (mode !== 'online') {
      setTimerStarted(false)
      return
    }
    setTimerStarted(history.length > 0)
  }, [mode, history])

  useEffect(() => {
    if (mode !== 'online' || connectionStatus !== 'connected' || !playerColor || gameOver || !timerStarted) {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
      return
    }

    const currentTime = turn === 'white' ? whiteTime : blackTime
    if (currentTime <= 0) return

    timerIntervalRef.current = setInterval(() => {
      setWhiteTime((prev) => (turn === 'white' ? Math.max(0, prev - 1) : prev))
      setBlackTime((prev) => (turn === 'black' ? Math.max(0, prev - 1) : prev))
    }, 1000)

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    }
  }, [mode, connectionStatus, playerColor, turn, whiteTime, blackTime, gameOver, timerStarted])

  // Handle timeout
  useEffect(() => {
    if (mode !== 'online' || gameOver || !timerStarted) return

    if (whiteTime <= 0) {
      setGameOver({ winner: 'black', reason: 'timeout' })
    } else if (blackTime <= 0) {
      setGameOver({ winner: 'white', reason: 'timeout' })
    }
  }, [mode, gameOver, whiteTime, blackTime, timerStarted])

  const describeMove = (move: Move) => {
    const pieceLabel = move.piece.type === 'pawn' ? 'P' : move.piece.type[0].toUpperCase()
    const captureMark = move.captured ? 'x' : '→'
    return `${pieceLabel} ${formatSquare(move.from)} ${captureMark} ${formatSquare(move.to)}`
  }

  const getPlayerCaptures = (playerColor: Color) => {
    return history
      .filter((move) => move.turn === playerColor && move.captured)
      .map((move) => move.captured!)
  }

  const nextEnPassantTarget = (from: Position, to: Position, piece: Piece) => {
    if (piece.type !== 'pawn') return null
    if (Math.abs(to.row - from.row) === 2) {
      return { row: (from.row + to.row) / 2, col: from.col }
    }
    return null
  }

  const disableRookRightsIfNeeded = (rights: CastlingRights, pos: Position, color: Color) => {
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

  const performMove = (from: Position, to: Position, promotionType?: PieceType) => {
    const movingPiece = board[from.row][from.col]
    if (!movingPiece) return

    const targetPiece = board[to.row][to.col]
    const isEnPassant =
      movingPiece.type === 'pawn' && from.col !== to.col && !targetPiece && enPassantTarget &&
      enPassantTarget.row === to.row && enPassantTarget.col === to.col

    const capturedPos = isEnPassant ? { row: from.row, col: to.col } : { row: to.row, col: to.col }
    const capturedPiece = isEnPassant ? board[from.row][to.col] : targetPiece

    const nextBoard = moveWithSpecial(board, from, to, promotionType)

    let nextRights: CastlingRights = {
      white: { ...castlingRights.white },
      black: { ...castlingRights.black },
    }

    if (movingPiece.type === 'king') {
      nextRights[movingPiece.color] = { kingSide: false, queenSide: false }
    }

    if (movingPiece.type === 'rook') {
      nextRights = disableRookRightsIfNeeded(nextRights, from, movingPiece.color)
    }

    if (capturedPiece?.type === 'rook' && capturedPiece.color !== movingPiece.color) {
      nextRights = disableRookRightsIfNeeded(nextRights, capturedPos, capturedPiece.color)
    }

    const newEnPassant = nextEnPassantTarget(from, to, movingPiece)

    setBoard(nextBoard)
    setCastlingRights(nextRights)
    setEnPassantTarget(newEnPassant)
    setSelected(null)
    setLegalMoves([])
    setLastMove({ from, to })
    setHistory((prev) => [
      ...prev,
      {
        turn,
        from,
        to,
        piece: promotionType ? { type: promotionType, color: movingPiece.color } : movingPiece,
        captured: capturedPiece,
      },
    ])
    setPendingPromotion(null)

    const nextTurn = turn === 'white' ? 'black' : 'white'
    setTurn(nextTurn)
    if (isCheckmate(nextBoard, nextTurn, nextRights, newEnPassant)) {
      setGameOver({ winner: turn, reason: 'checkmate' })
    }
  }

  const emitMove = (from: Position, to: Position, promotionType?: PieceType) => {
    if (mode === 'online' && socketRef.current && playerColor) {
      socketRef.current.emit('move', { gameId, from, to, promotion: promotionType })
      setSelected(null)
      setLegalMoves([])
      setPendingPromotion(null)
    } else {
      performMove(from, to, promotionType)
    }
  }

  const handleSquareClick = (row: number, col: number) => {
    const piece = board[row][col]

    if (selected) {
      const isLegal = legalMoves.some((move) => move.row === row && move.col === col)
      if (isLegal) {
        const movingPiece = board[selected.row][selected.col]
        if (movingPiece?.type === 'pawn') {
          const promotionRank = movingPiece.color === 'white' ? 0 : 7
          if (row === promotionRank) {
            setPendingPromotion({ from: selected, to: { row, col }, piece: movingPiece, captured: board[row][col] })
            setSelected(null)
            setLegalMoves([])
            return
          }
        }

        emitMove(selected, { row, col })
        return
      }
    }

    const isMyTurnOnline = mode === 'online' ? playerColor === turn : true

    if (piece && piece.color === turn && isMyTurnOnline) {
      setSelected({ row, col })
      setLegalMoves(getLegalMoves(board, { row, col }, castlingRights, enPassantTarget))
    } else {
      setSelected(null)
      setLegalMoves([])
    }
  }

  const resetBoard = () => {
    setBoard(createInitialBoard())
    setSelected(null)
    setLegalMoves([])
    setTurn('white')
    setLastMove(null)
    setHistory([])
    setCastlingRights({
      white: { kingSide: true, queenSide: true },
      black: { kingSide: true, queenSide: true },
    })
    setEnPassantTarget(null)
    setPendingPromotion(null)
    setMode('local')
    setGameId('')
    setPlayerColor(null)
    setConnectionStatus('idle')
    setMatchStatus('idle')
    setWhiteTime(600)
    setBlackTime(600)
    setTimerStarted(false)
    setGameOver(null)
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
    }
  }

  return (
    <div className="page">
      <div className="hero">
        <div>
          <p className="eyebrow">Playground</p>
          <h1>Online Chess, locally</h1>
          <p className="lead">Click a piece to see legal moves. Castling, en passant, and promotion included.</p>
        </div>
        <div className="hero-actions">
          <button className="reset" onClick={resetBoard}>
            Reset board
          </button>
          <button className="ghost" onClick={() => setMode((m) => (m === 'local' ? 'online' : 'local'))}>
            {mode === 'local' ? 'Go online' : 'Go local'}
          </button>
        </div>
      </div>

      <div className="content">
        <div className="board-card">
          <div className="status-row">
            <span className={`pill ${turn}`}>
              {turn === 'white' ? 'White' : 'Black'} to move
            </span>
            <span className="status-text">{status}</span>
            {mode === 'online' && playerColor && (
              <div className="timers">
                <div className={`timer ${turn === 'white' ? 'active' : ''}`}>
                  {Math.floor(whiteTime / 60)}:{String(whiteTime % 60).padStart(2, '0')}
                </div>
                <div className={`timer ${turn === 'black' ? 'active' : ''}`}>
                  {Math.floor(blackTime / 60)}:{String(blackTime % 60).padStart(2, '0')}
                </div>
              </div>
            )}
          </div>

          {mode === 'online' ? (
            <div className="online-bar">
              <div>
                <div className="small-label">Game code</div>
                <input
                  className="input"
                  value={gameId}
                  onChange={(e) => setGameId(e.target.value.toUpperCase())}
                  placeholder="ABCD"
                  maxLength={8}
                />
              </div>
              <div className="online-actions">
                <button
                  className="reset ghost-btn"
                  onClick={() => {
                    if (!socketRef.current) return
                    socketRef.current.emit('createGame')
                  }}
                >
                  Create
                </button>
                <button
                  className="reset ghost-btn"
                  onClick={() => {
                    if (!socketRef.current || !gameId) return
                    socketRef.current.emit('joinGame', gameId)
                  }}
                >
                  Join
                </button>
                <button
                  className="reset ghost-btn"
                  onClick={() => {
                    if (!socketRef.current) return
                    if (matchStatus === 'searching') {
                      socketRef.current.emit('cancelMatchmake')
                      setMatchStatus('idle')
                    } else {
                      socketRef.current.emit('matchmake')
                      setMatchStatus('searching')
                    }
                  }}
                >
                  {matchStatus === 'searching' ? 'Cancel search' : 'Find match'}
                </button>
                <div className="chip">
                  {connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'connecting' ? 'Connecting…' : 'Offline'}
                  {playerColor ? ` · You are ${playerColor}` : ''}
                  {matchStatus === 'searching' ? ' · Searching…' : ''}
                </div>
              </div>
            </div>
          ) : (
            <div className="offline-bar">Local sandbox</div>
          )}

          <div className="board" role="grid" aria-label="Chess board">
            {board
              .map((row, idx) => ({ row, idx }))
              .sort((a, b) => (playerColor === 'black' && mode === 'online' ? b.idx - a.idx : a.idx - b.idx))
              .map(({ row, idx: rowIndex }) => (
                <div className="board-row" role="row" key={rowIndex}>
                  {(playerColor === 'black' && mode === 'online' ? [...row].reverse() : row).map((square, colIndexLocal) => {
                    const colIndex = playerColor === 'black' && mode === 'online' ? 7 - colIndexLocal : colIndexLocal
                    const isLight = (rowIndex + colIndex) % 2 === 0
                    const isSelected = selected?.row === rowIndex && selected?.col === colIndex
                    const isLegal = legalMoves.some((move) => move.row === rowIndex && move.col === colIndex)
                    const isLastMove =
                      lastMove &&
                      ((lastMove.from.row === rowIndex && lastMove.from.col === colIndex) ||
                        (lastMove.to.row === rowIndex && lastMove.to.col === colIndex))
                    const kingPos = findKing(board, turn)
                    const isKingChecked = isKingInCheck(board, turn) && kingPos?.row === rowIndex && kingPos?.col === colIndex

                    const classes = [
                      'square',
                      isLight ? 'light' : 'dark',
                      isSelected ? 'selected' : '',
                      isLegal ? 'legal' : '',
                      isLastMove ? 'last-move' : '',
                      isKingChecked ? 'checked' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')

                  return (
                    <button
                      type="button"
                      aria-label={`Square ${formatSquare({ row: rowIndex, col: colIndex })}`}
                      key={`${rowIndex}-${colIndex}`}
                      className={classes}
                      onClick={() => handleSquareClick(rowIndex, colIndex)}
                    >
                      {square ? <span className={`piece ${square.color}`}>{pieceSymbol[square.color][square.type]}</span> : null}
                      <span className="coord">{formatSquare({ row: rowIndex, col: colIndex })}</span>
                    </button>
                  )
                })}
              </div>
              ))}
          </div>
        </div>

        <aside className="side-panel">
          <div className="panel-card">
            <h2>Moves</h2>
            {history.length === 0 ? <p className="muted">No moves yet.</p> : null}
            <ol className="move-list">
              {history.map((move, index) => (
                <li key={`${move.from.row}-${move.from.col}-${move.to.row}-${move.to.col}-${index}`}>
                  <span className="move-index">{index + 1}.</span>
                  <span className={`move-turn ${move.turn}`}>{move.turn === 'white' ? 'White' : 'Black'}</span>
                  <span className="move-text">{describeMove(move)}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="panel-card">
            <h3>Captures</h3>
            <div className="captures-section">
              <div className="player-captures">
                <div className="capture-label">White</div>
                <div className="captured-pieces">
                  {getPlayerCaptures('white').map((piece, i) => (
                    <span key={`w-${i}`} className="captured-piece">
                      {pieceSymbol[piece.color][piece.type]}
                    </span>
                  ))}
                </div>
              </div>
              <div className="player-captures">
                <div className="capture-label">Black</div>
                <div className="captured-pieces">
                  {getPlayerCaptures('black').map((piece, i) => (
                    <span key={`b-${i}`} className="captured-piece">
                      {pieceSymbol[piece.color][piece.type]}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="panel-card subtle">
            <h3>Next up</h3>
            <ul className="todo">
              <li>Castling logic</li>
              <li>En passant</li>
              <li>Promotion chooser</li>
              <li>Online multiplayer</li>
            </ul>
          </div>
        </aside>
      </div>

      {pendingPromotion ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <h3>Choose promotion</h3>
            <div className="promotion-grid">
              {(['queen', 'rook', 'bishop', 'knight'] as PieceType[]).map((type) => (
                <button
                  key={type}
                  className="promotion-option"
                  onClick={() => performMove(pendingPromotion.from, pendingPromotion.to, type)}
                >
                  <span className={`piece ${pendingPromotion.piece.color}`}>{pieceSymbol[pendingPromotion.piece.color][type]}</span>
                  <span className="label">{type[0].toUpperCase() + type.slice(1)}</span>
                </button>
              ))}
            </div>
            <button className="ghost" onClick={() => setPendingPromotion(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {gameOver ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal game-over">
            <h2>Game Over</h2>
            <p className="result">
              {gameOver.winner === 'white' ? 'White' : 'Black'} wins by {gameOver.reason}
            </p>
            <button className="reset" onClick={resetBoard}>
              Play again
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default App
