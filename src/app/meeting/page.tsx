'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { useUser } from '@clerk/nextjs';

export default function MeetingPage() {
    const { user } = useUser();
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [chatMessages, setChatMessages] = useState<{ sender: string; message: string }[]>([]);
    const [chatInput, setChatInput] = useState('');

    const videoRef = useRef<HTMLVideoElement>(null);
    const remoteRef = useRef<HTMLVideoElement>(null);
    const socket = useRef<Socket | null>(null);
    const pc = useRef<RTCPeerConnection | null>(null);

    const params = useSearchParams();
    const meetingId = params!.get('id');

    useEffect(() => {
        if (!meetingId) return;

        const initSocketAndMedia = async () => {
            await fetch('/api/socket'); // wake up the socket server

            socket.current = io({ path: '/api/socket' });

            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            setLocalStream(stream);
            if (videoRef.current) videoRef.current.srcObject = stream;

            pc.current = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
            });

            stream.getTracks().forEach(track => pc.current!.addTrack(track, stream));

            pc.current.ontrack = (event) => {
                const [remote] = event.streams;
                setRemoteStream(remote);
                if (remoteRef.current) remoteRef.current.srcObject = remote;
            };

            pc.current.onicecandidate = (event) => {
                if (event.candidate && socket.current) {
                    socket.current.emit('ice-candidate', {
                        roomId: meetingId,
                        candidate: event.candidate,
                    });
                }
            };

            socket.current.emit('join-room', meetingId);

            socket.current.on('user-joined', async () => {
                const offer = await pc.current!.createOffer();
                await pc.current!.setLocalDescription(offer);
                socket.current?.emit('offer', { roomId: meetingId, offer });
            });

            socket.current.on('offer', async (offer) => {
                await pc.current!.setRemoteDescription(new RTCSessionDescription(offer));
                const answer = await pc.current!.createAnswer();
                await pc.current!.setLocalDescription(answer);
                socket.current?.emit('answer', { roomId: meetingId, answer });
            });

            socket.current.on('answer', async (answer) => {
                await pc.current!.setRemoteDescription(new RTCSessionDescription(answer));
            });

            socket.current.on('ice-candidate', async ({ candidate }) => {
                try {
                    await pc.current!.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (err) {
                    console.error('Failed to add ICE candidate:', err);
                }
            });

            socket.current.on('chat-message', ({ sender, message }) => {
                setChatMessages(prev => [...prev, { sender, message }]);
            });
        };

        initSocketAndMedia();

        return () => {
            socket.current?.disconnect();
            pc.current?.close();
            localStream?.getTracks().forEach(track => track.stop());
        };
    }, [meetingId]);

    const sendMessage = () => {
        if (!chatInput.trim() || !socket.current) return;

        const sender = user?.fullName || 'Anonymous';
        const message = chatInput.trim();

        socket.current.emit('chat-message', {
            roomId: meetingId,
            sender,
            message,
        });

        setChatInput('');
    };

    return (
        <div className="flex flex-col items-center gap-4 p-4">
            <h2 className="text-xl font-bold">Meeting ID: {meetingId}</h2>

            <div className="flex w-full gap-4 justify-center">
                <video ref={videoRef} autoPlay playsInline muted className="border w-1/2 rounded-lg" />
                <video ref={remoteRef} autoPlay playsInline className="border w-1/2 rounded-lg" />
            </div>

            <div className="w-full max-w-xl border rounded-lg p-4 mt-4">
                <div className="h-64 overflow-y-auto border p-2 mb-2 rounded bg-gray-50">
                    {chatMessages.map((msg, idx) => (
                        <div key={idx} className="mb-1">
                            <strong>{msg.sender}:</strong> {msg.message}
                        </div>
                    ))}
                </div>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                        className="flex-1 border rounded px-2 py-1"
                        placeholder="Type a message..."
                    />
                    <button
                        onClick={sendMessage}
                        className="px-4 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
}
