import { createServer } from 'http'
import { Server } from 'socket.io'
import { applyMove, createInitialState, getLegalMoves } from './chess.js'

const port = process.env.PORT || 4000
const httpServer = createServer()
const io = new Server(httpServer, {
  cors: { origin: '*' },
})

const games = new Map()
let waitingPlayer = null

const makeCode = () => Math.random().toString(36).slice(2, 6).toUpperCase()

const createGameState = () => {
  const baseState = createInitialState()
  return { ...baseState, whiteTime: 600, blackTime: 600 }
}

const snapshot = (state) => ({
  board: state.board,
  turn: state.turn,
  lastMove: state.lastMove,
  history: state.history,
  castlingRights: state.castlingRights,
  enPassantTarget: state.enPassantTarget,
  whiteTime: state.whiteTime,
  blackTime: state.blackTime,
})

io.on('connection', (socket) => {
  socket.on('createGame', () => {
    const code = makeCode()
    const state = createGameState()
    games.set(code, { state, players: { white: socket.id, black: null } })
    socket.join(code)
    socket.emit('assign', { gameId: code, color: 'white' })
    socket.emit('gameState', snapshot(state))
  })

  socket.on('joinGame', (code) => {
    const game = games.get(code)
    if (!game) return
    if (game.players.black && game.players.white) return

    const color = game.players.white ? 'black' : 'white'
    game.players[color] = socket.id
    socket.join(code)
    socket.emit('assign', { gameId: code, color })
    io.to(code).emit('gameState', snapshot(game.state))
  })

  socket.on('move', ({ gameId, from, to, promotion }) => {
    const game = games.get(gameId)
    if (!game) return

    const color = game.players.white === socket.id ? 'white' : game.players.black === socket.id ? 'black' : null
    if (!color || color !== game.state.turn) return

    const legal = getLegalMoves(game.state.board, from, game.state.castlingRights, game.state.enPassantTarget)
    const isLegal = legal.some((m) => m.row === to.row && m.col === to.col)
    if (!isLegal) return

    game.state = applyMove(game.state, from, to, promotion)
    io.to(gameId).emit('gameState', snapshot(game.state))
  })

  socket.on('disconnect', () => {
    if (waitingPlayer === socket.id) waitingPlayer = null
    games.forEach((game, code) => {
      if (game.players.white === socket.id) game.players.white = null
      if (game.players.black === socket.id) game.players.black = null
      if (!game.players.white && !game.players.black) {
        games.delete(code)
      } else {
        io.to(code).emit('opponentLeft')
      }
    })
  })

  socket.on('matchmake', () => {
    if (waitingPlayer && waitingPlayer !== socket.id) {
      const code = makeCode()
      const state = createGameState()
      games.set(code, { state, players: { white: waitingPlayer, black: socket.id } })
      io.sockets.sockets.get(waitingPlayer)?.join(code)
      socket.join(code)
      io.to(waitingPlayer).emit('assign', { gameId: code, color: 'white' })
      socket.emit('assign', { gameId: code, color: 'black' })
      io.to(code).emit('gameState', snapshot(state))
      io.to(code).emit('matchStatus', 'idle')
      waitingPlayer = null
    } else {
      waitingPlayer = socket.id
      socket.emit('matchStatus', 'searching')
    }
  })

  socket.on('cancelMatchmake', () => {
    if (waitingPlayer === socket.id) {
      waitingPlayer = null
      socket.emit('matchStatus', 'idle')
    }
  })
})

httpServer.listen(port, () => {
  console.log(`Chess socket server listening on ${port}`)
})
