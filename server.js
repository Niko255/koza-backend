// koza-panel | backend/server.js

const http      = require('http');
const https     = require('https');
const WebSocket = require('ws');
const path      = require('path');
const fs        = require('fs');

const PORT        = process.env.PORT || 3000;
const FIVEM_IP    = '82.27.128.213';
const FIVEM_PORT  = '30120';

// ── Récupère les joueurs depuis l'API FiveM ───────────────────────────────────
function getFiveMPlayers() {
    return new Promise((resolve) => {
        const url = `http://${FIVEM_IP}:${FIVEM_PORT}/players.json`;
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const players = JSON.parse(data);
                    resolve(players);
                } catch {
                    resolve([]);
                }
            });
        }).on('error', () => resolve([]));
    });
}

// ── Serveur HTTP ──────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {

    // Headers CORS pour toutes les requêtes
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // API : liste des joueurs FiveM connectés
    if (req.url === '/api/players') {
        const players = await getFiveMPlayers();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(players.map(p => ({
            id:     String(p.id),
            name:   p.name,
            ping:   p.ping,
            live:   streams.has(String(p.id)),
        }))));
        return;
    }

    // API : liste des streams actifs
    if (req.url === '/api/streams') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const list = [...streams.keys()].map(id => ({ playerId: id }));
        res.end(JSON.stringify(list));
        return;
    }

    res.writeHead(404);
    res.end('Not found');
});

// ── WebSocket ─────────────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ server });

const streams = new Map(); // playerId → WS du joueur
const viewers = new Map(); // playerId → Set<WS> des admins

wss.on('connection', (ws, req) => {
    const url = req.url;

    // Joueur FiveM qui envoie son écran
    const streamMatch = url.match(/^\/stream\/(\d+)$/);
    if (streamMatch) {
        const playerId = streamMatch[1];
        console.log(`[KOZA] Joueur ${playerId} en stream`);
        streams.set(playerId, ws);
        broadcastToViewers(playerId, JSON.stringify({ type: 'live', playerId }));

        ws.on('message', (data) => {
            const playerViewers = viewers.get(playerId);
            if (!playerViewers) return;
            for (const viewer of playerViewers) {
                if (viewer.readyState === WebSocket.OPEN) viewer.send(data);
            }
        });

        ws.on('close', () => {
            console.log(`[KOZA] Joueur ${playerId} déconnecté`);
            streams.delete(playerId);
            broadcastToViewers(playerId, JSON.stringify({ type: 'offline', playerId }));
        });
        return;
    }

    // Admin qui regarde un joueur
    const watchMatch = url.match(/^\/watch\/(\d+)$/);
    if (watchMatch) {
        const playerId = watchMatch[1];
        console.log(`[KOZA] Admin regarde joueur ${playerId}`);
        if (!viewers.has(playerId)) viewers.set(playerId, new Set());
        viewers.get(playerId).add(ws);
        if (streams.has(playerId)) ws.send(JSON.stringify({ type: 'live', playerId }));
        ws.on('close', () => {
            const v = viewers.get(playerId);
            if (v) v.delete(ws);
        });
        return;
    }

    ws.close();
});

function broadcastToViewers(playerId, message) {
    const playerViewers = viewers.get(playerId);
    if (!playerViewers) return;
    for (const viewer of playerViewers) {
        if (viewer.readyState === WebSocket.OPEN) viewer.send(message);
    }
}

server.listen(PORT, () => {
    console.log(`[KOZA] Backend démarré sur le port ${PORT}`);
});
