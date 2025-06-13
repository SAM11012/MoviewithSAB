// src/pages/api/socket.ts
import { Server } from 'socket.io';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { Server as HTTPServer } from 'http';
import type { Socket as NetSocket } from 'net';

export const config = {
    api: {
        bodyParser: false,
    },
};

type NextApiResponseWithSocket = NextApiResponse & {
    socket: NetSocket & {
        server: HTTPServer & {
            io?: Server;
        };
    };
};

export default function handler(req: NextApiRequest, res: NextApiResponseWithSocket) {
    if (res.socket.server.io) {
        res.status(200).end();
        return;
    }

    if (req.method !== 'GET') {
        res.status(405).end();
        return;
    }

    const io = new Server(res.socket.server, {
        path: '/api/socket',
        addTrailingSlash: false,
    });

    io.on('connection', (socket) => {
        console.log('Socket connected:', socket.id);

        socket.on('join-room', (roomId) => {
            socket.join(roomId);
            console.log(`User ${socket.id} joined room ${roomId}`);
            socket.to(roomId).emit('user-joined');
        });

        socket.on('chat-message', ({ roomId, sender, message }) => {
            console.log(`Message from ${sender} in ${roomId}: ${message}`);
            io.to(roomId).emit('chat-message', { sender, message }); // 💡 send to all including sender
        });

        socket.on('offer', ({ roomId, offer }) => {
            socket.to(roomId).emit('offer', offer);
        });

        socket.on('answer', ({ roomId, answer }) => {
            socket.to(roomId).emit('answer', answer);
        });

        socket.on('ice-candidate', ({ roomId, candidate }) => {
            socket.to(roomId).emit('ice-candidate', { candidate });
        });

        socket.on('disconnect', () => {
            console.log('Socket disconnected:', socket.id);
        });
    });

    res.socket.server.io = io;
    res.status(200).end();
}
