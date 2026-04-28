const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');

const wss = new WebSocketServer({ port: 8080 });

// roomId -> { id, seed, host, players: [{ id, ws, name, role }], status }
const rooms = new Map();
// For quick play matchmaking - holds the roomId of a waiting quick room
let pendingQuickRoom = null;

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function generateSeed() {
  return Math.floor(Math.random() * 2147483647);
}

function getRoomInfo(room) {
  return {
    id: room.id,
    seed: room.seed,
    status: room.status,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      role: p.role,
    })),
  };
}

function getPartner(room, playerId) {
  return room.players.find(p => p.id !== playerId);
}

function sendTo(ws, type, payload) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

function broadcastToRoom(room, type, payload, excludeId = null) {
  room.players.forEach(p => {
    if (p.id !== excludeId) {
      sendTo(p.ws, type, payload);
    }
  });
}

function cleanupRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  if (pendingQuickRoom === roomId) {
    pendingQuickRoom = null;
  }
  rooms.delete(roomId);
  console.log(`[Server] Room ${roomId} deleted`);
}

wss.on('connection', (ws) => {
  ws.id = uuidv4();
  ws.roomId = null;
  console.log(`[Server] Player connected: ${ws.id}`);

  sendTo(ws, 'WELCOME', { id: ws.id });

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      const { type, payload } = data;

      switch (type) {

        // ─── Create a private room ───
        case 'CREATE_ROOM': {
          const roomId = generateRoomId();
          const seed = generateSeed();
          const room = {
            id: roomId,
            seed,
            host: ws.id,
            players: [{ id: ws.id, ws, name: payload.name || 'Player 1', role: 'rider' }],
            status: 'LOBBY',
          };
          rooms.set(roomId, room);
          ws.roomId = roomId;
          sendTo(ws, 'ROOM_CREATED', { roomId, role: 'rider', seed, room: getRoomInfo(room) });
          console.log(`[Server] Room ${roomId} created by ${payload.name}`);
          break;
        }

        // ─── Join a private room by code ───
        case 'JOIN_ROOM': {
          const roomId = (payload.roomId || '').toUpperCase();
          const room = rooms.get(roomId);

          if (!room) {
            sendTo(ws, 'ERROR', { message: 'Room not found' });
            break;
          }
          if (room.status !== 'LOBBY') {
            sendTo(ws, 'ERROR', { message: 'Game already in progress' });
            break;
          }
          if (room.players.length >= 2) {
            sendTo(ws, 'ERROR', { message: 'Room is full' });
            break;
          }

          room.players.push({ id: ws.id, ws, name: payload.name || 'Player 2', role: 'pillion' });
          ws.roomId = roomId;

          // Tell the joiner their info
          sendTo(ws, 'ROOM_JOINED', { roomId, role: 'pillion', seed: room.seed, room: getRoomInfo(room) });
          // Tell the host the room updated
          broadcastToRoom(room, 'ROOM_UPDATED', { room: getRoomInfo(room) }, ws.id);
          console.log(`[Server] ${payload.name} joined room ${roomId}`);
          break;
        }

        // ─── Quick Play: Create a quick room and wait ───
        case 'CREATE_QUICK_ROOM': {
          // If there's already a pending quick room, reject (use JOIN_QUICK instead)
          if (pendingQuickRoom && rooms.has(pendingQuickRoom)) {
            sendTo(ws, 'ERROR', { message: 'A quick room already exists. Use Join Quick instead.' });
            break;
          }

          const roomId = 'Q-' + generateRoomId();
          const seed = generateSeed();
          const room = {
            id: roomId,
            seed,
            host: ws.id,
            players: [{ id: ws.id, ws, name: payload.name || 'Player 1', role: 'rider' }],
            status: 'LOBBY',
          };
          rooms.set(roomId, room);
          ws.roomId = roomId;
          pendingQuickRoom = roomId;
          sendTo(ws, 'ROOM_CREATED', { roomId, role: 'rider', seed, room: getRoomInfo(room) });
          console.log(`[Server] Quick room ${roomId} created by ${payload.name}`);
          break;
        }

        // ─── Quick Play: Join the pending quick room ───
        case 'JOIN_QUICK_ROOM': {
          if (!pendingQuickRoom || !rooms.has(pendingQuickRoom)) {
            sendTo(ws, 'ERROR', { message: 'No quick room available. Create one first.' });
            break;
          }

          const room = rooms.get(pendingQuickRoom);
          if (room.players.length >= 2) {
            sendTo(ws, 'ERROR', { message: 'Quick room is full' });
            pendingQuickRoom = null;
            break;
          }

          room.players.push({ id: ws.id, ws, name: payload.name || 'Player 2', role: 'pillion' });
          ws.roomId = pendingQuickRoom;

          sendTo(ws, 'ROOM_JOINED', { roomId: room.id, role: 'pillion', seed: room.seed, room: getRoomInfo(room) });
          broadcastToRoom(room, 'ROOM_UPDATED', { room: getRoomInfo(room) }, ws.id);

          // Auto-start for quick rooms
          room.status = 'PLAYING';
          broadcastToRoom(room, 'GAME_STARTED', { seed: room.seed, room: getRoomInfo(room) });
          pendingQuickRoom = null;

          console.log(`[Server] ${payload.name} joined quick room ${room.id} — game auto-started`);
          break;
        }

        // ─── Host starts the game (for private rooms) ───
        case 'START_GAME': {
          if (!ws.roomId) break;
          const room = rooms.get(ws.roomId);
          if (!room) break;
          if (room.host !== ws.id) {
            sendTo(ws, 'ERROR', { message: 'Only the host can start' });
            break;
          }
          if (room.players.length < 2) {
            sendTo(ws, 'ERROR', { message: 'Need 2 players to start' });
            break;
          }
          room.status = 'PLAYING';
          broadcastToRoom(room, 'GAME_STARTED', { seed: room.seed, room: getRoomInfo(room) });
          console.log(`[Server] Game started in room ${room.id}`);
          break;
        }

        // ─── Input relay (pillion sends keys to host) ───
        case 'INPUT': {
          if (!ws.roomId) break;
          const room = rooms.get(ws.roomId);
          if (!room || room.status !== 'PLAYING') break;

          const partner = getPartner(room, ws.id);
          if (partner) {
            sendTo(partner.ws, 'PARTNER_INPUT', payload);
          }
          break;
        }

        // ─── State sync (host sends authoritative state to pillion) ───
        case 'STATE_SYNC': {
          if (!ws.roomId) break;
          const room2 = rooms.get(ws.roomId);
          if (!room2 || room2.status !== 'PLAYING') break;

          const partner2 = getPartner(room2, ws.id);
          if (partner2) {
            sendTo(partner2.ws, 'STATE_SYNC', payload);
          }
          break;
        }

        default:
          console.log(`[Server] Unknown message type: ${type}`);
      }

    } catch (err) {
      console.error('[Server] Error processing message:', err.message);
    }
  });

  ws.on('close', () => {
    console.log(`[Server] Player disconnected: ${ws.id}`);

    if (ws.roomId) {
      const room = rooms.get(ws.roomId);
      if (room) {
        // Notify partner
        broadcastToRoom(room, 'PLAYER_DISCONNECTED', { playerId: ws.id });

        // Remove from room
        room.players = room.players.filter(p => p.id !== ws.id);

        if (room.players.length === 0) {
          cleanupRoom(ws.roomId);
        } else {
          // Remaining player becomes host
          room.host = room.players[0].id;
          room.status = 'LOBBY';
          broadcastToRoom(room, 'ROOM_UPDATED', { room: getRoomInfo(room) });
        }
      }
    }
  });
});

console.log('🛵 Scooter Chaos Backend running on port 8080');
