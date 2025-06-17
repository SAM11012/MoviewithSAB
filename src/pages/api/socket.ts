// pages/api/socket.ts
import { NextApiRequest } from 'next';
import { Server as ServerIO } from 'socket.io';
import { NextApiResponse } from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { Socket } from 'net';
export interface ServerWithIO extends HTTPServer {
    io?: SocketIOServer | undefined;
}

export interface SocketWithIO extends Socket {
    server: ServerWithIO;
}

export interface NextApiResponseServerIO extends NextApiResponse {
    socket: SocketWithIO;
}

// Event types for better type safety
export interface ServerToClientEvents {
    'user-joined': (userId: string) => void;
    'user-left': (userId: string) => void;
    'room-users': (users: string[]) => void;
    'offer': (offer: RTCSessionDescriptionInit) => void;
    'answer': (answer: RTCSessionDescriptionInit) => void;
    'ice-candidate': (data: { candidate: RTCIceCandidateInit }) => void;
    'chat-message': (data: { sender: string; message: string }) => void;
}

export interface ClientToServerEvents {
    'join-room': (roomId: string) => void;
    'offer': (data: { roomId: string; offer: RTCSessionDescriptionInit }) => void;
    'answer': (data: { roomId: string; answer: RTCSessionDescriptionInit }) => void;
    'ice-candidate': (data: { roomId: string; candidate: RTCIceCandidateInit }) => void;
    'chat-message': (data: { roomId: string; sender: string; message: string }) => void;
}

export interface InterServerEvents {
    ping: () => void;
}

export interface SocketData {
    userId: string;
    roomId?: string;
}
export const config = {
    api: {
        bodyParser: false,
    },
};

const SocketHandler = (req: NextApiRequest, res: NextApiResponseServerIO) => {
    if (req.method !== 'GET' && req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    if (!res.socket.server.io) {
        console.log('Setting up Socket.IO server...');

        const io = new ServerIO<
            ClientToServerEvents,
            ServerToClientEvents,
            InterServerEvents,
            SocketData
        >(res.socket.server, {
            path: '/api/socket',
            addTrailingSlash: false,
            cors: {
                origin: process.env.NODE_ENV === 'production'
                    ? process.env.NEXT_PUBLIC_APP_URL
                    : "*",
                methods: ["GET", "POST"],
                credentials: true
            },
            transports: ['websocket', 'polling'],
            allowEIO3: true
        });

        // Store active rooms and users
        const rooms = new Map<string, Set<string>>();

        io.on('connection', (socket) => {
            console.log('User connected:', socket.id);

            socket.on('join-room', (roomId: string) => {
                console.log(`User ${socket.id} joining room ${roomId}`);
                socket.join(roomId);

                // Track users in room
                if (!rooms.has(roomId)) {
                    rooms.set(roomId, new Set<string>());
                }
                rooms.get(roomId)?.add(socket.id);

                // Notify others in the room
                socket.to(roomId).emit('user-joined', socket.id);

                // Send current room participants to the new user
                const roomUsers = Array.from(rooms.get(roomId) || []);
                socket.emit('room-users', roomUsers);
            });

            socket.on('offer', ({ roomId, offer }: { roomId: string; offer: RTCSessionDescriptionInit }) => {
                console.log(`Offer from ${socket.id} to room ${roomId}`);
                socket.to(roomId).emit('offer', offer);
            });

            socket.on('answer', ({ roomId, answer }: { roomId: string; answer: RTCSessionDescriptionInit }) => {
                console.log(`Answer from ${socket.id} to room ${roomId}`);
                socket.to(roomId).emit('answer', answer);
            });

            socket.on('ice-candidate', ({ roomId, candidate }: { roomId: string; candidate: RTCIceCandidateInit }) => {
                console.log(`ICE candidate from ${socket.id} to room ${roomId}`);
                socket.to(roomId).emit('ice-candidate', { candidate });
            });

            socket.on('chat-message', ({ roomId, sender, message }: { roomId: string; sender: string; message: string }) => {
                console.log(`Chat message from ${sender} in room ${roomId}`);
                io.to(roomId).emit('chat-message', { sender, message });
            });

            socket.on('disconnect', () => {
                console.log('User disconnected:', socket.id);

                // Remove user from all rooms
                rooms.forEach((users, roomId) => {
                    if (users.has(socket.id)) {
                        users.delete(socket.id);
                        socket.to(roomId).emit('user-left', socket.id);

                        // Clean up empty rooms
                        if (users.size === 0) {
                            rooms.delete(roomId);
                        }
                    }
                });
            });
        });

        res.socket.server.io = io;
    } else {
        console.log('Socket.IO server already running');
    }

    res.end();
};

export default SocketHandler;