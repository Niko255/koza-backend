// koza-panel | backend/server.js
// Lance avec : node server.js

const http      = require('http');
const WebSocket = require('ws');
const path      = require('path');
const fs        = require('fs');

const PORT = 3000;

// ── Serveur HTTP (sert le panel HTML) ────────────────────────────────────────
const server = http.createServer((req, res) => {
    // Sert le panel
    if (req.url === '/' || req.url === '/index.html') {
        const file = path.join(__dirname, '../frontend/index.html');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        fs.createReadStream(file).pipe(res);
        return;
    }

    // API : liste des joueurs en stream
    if (req.url === '/api/streams') {
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        });
        const list = [...streams.keys()].map((id) => ({ playerId: id }));
        res.end(JSON.stringify(list));
        return;
    }

    res.writeHead(404);
    res.end('Not found');
});

// ── WebSocket Server ──────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ server });

// streams  : playerId → WebSocket du jeu (FiveM NUI)
// viewers  : playerId → Set<WebSocket> (panels qui regardent)
const streams = new Map();
const viewers = new Map();

wss.on('connection', (ws, req) => {
    const url = req.url; // ex: /stream/42  ou  /watch/42

    // ── Connexion depuis FiveM (joueur qui envoie son écran) ─────────────────
    const streamMatch = url.match(/^\/stream\/(\d+)$/);
    if (streamMatch) {
        const playerId = streamMatch[1];
        console.log(`[KOZA] Joueur ${playerId} connecté au stream`);

        streams.set(playerId, ws);

        // Notifie les viewers que ce joueur est maintenant en live
        broadcastToViewers(playerId, JSON.stringify({ type: 'live', playerId }));

        ws.on('message', (data) => {
            // data = frame JPEG en binaire → on la retransmet à tous les viewers
            const playerViewers = viewers.get(playerId);
            if (!playerViewers) return;
            for (const viewer of playerViewers) {
                if (viewer.readyState === WebSocket.OPEN) {
                    viewer.send(data);
                }
            }
        });

        ws.on('close', () => {
            console.log(`[KOZA] Joueur ${playerId} déconnecté`);
            streams.delete(playerId);
            broadcastToViewers(playerId, JSON.stringify({ type: 'offline', playerId }));
        });

        return;
    }

    // ── Connexion depuis le panel (admin qui regarde) ─────────────────────────
    const watchMatch = url.match(/^\/watch\/(\d+)$/);
    if (watchMatch) {
        const playerId = watchMatch[1];
        console.log(`[KOZA] Admin regarde le joueur ${playerId}`);

        if (!viewers.has(playerId)) viewers.set(playerId, new Set());
        viewers.get(playerId).add(ws);

        // Si le joueur est déjà en stream, on le signale
        if (streams.has(playerId)) {
            ws.send(JSON.stringify({ type: 'live', playerId }));
        }

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
        if (viewer.readyState === WebSocket.OPEN) {
            viewer.send(message);
        }
    }
}

// ── Démarrage ─────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
    console.log(`[KOZA] Backend démarré sur http://localhost:${PORT}`);
    console.log(`[KOZA] Panel : http://localhost:${PORT}/`);
});
