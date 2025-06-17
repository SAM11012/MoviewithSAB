"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { useUser } from "@clerk/nextjs";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Send,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export default function MeetingInner() {
  const { user } = useUser();
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [chatMessages, setChatMessages] = useState<
      { sender: string; message: string }[]
  >([]);
  const [chatInput, setChatInput] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const socket = useRef<Socket | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);

  const params = useSearchParams();
  const meetingId = params!.get("id");

  useEffect(() => {
    if (!meetingId) return;

    const initSocketAndMedia = async () => {
      try {
        // Initialize socket connection with proper configuration
        const socketUrl = process.env.NODE_ENV === 'production'
            ? window.location.origin
            : 'http://localhost:3000';

        socket.current = io(socketUrl, {
          path: '/api/socket',
          transports: ['websocket', 'polling'],
          upgrade: true,
          rememberUpgrade: true,
          timeout: 20000,
          forceNew: true,
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
        });

        // Socket connection handlers
        socket.current.on('connect', () => {
          console.log('Socket connected:', socket.current?.id);
          setIsConnected(true);
          setConnectionError(null);
        });

        socket.current.on('disconnect', (reason) => {
          console.log('Socket disconnected:', reason);
          setIsConnected(false);
        });

        socket.current.on('connect_error', (error) => {
          console.error('Socket connection error:', error);
          setConnectionError(error.message);
          setIsConnected(false);
        });

        // Get user media
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
        });

        setLocalStream(stream);
        if (videoRef.current) videoRef.current.srcObject = stream;

        // Initialize WebRTC peer connection
        pc.current = new RTCPeerConnection({
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun2.l.google.com:19302" }
          ],
          iceCandidatePoolSize: 10,
        });

        // Add local stream tracks to peer connection
        stream.getTracks().forEach((track) => {
          pc.current!.addTrack(track, stream);
        });

        // Handle remote stream
        pc.current.ontrack = (event) => {
          console.log('Received remote track');
          const [remote] = event.streams;
          setRemoteStream(remote);
          if (remoteRef.current) remoteRef.current.srcObject = remote;
        };

        // Handle ICE candidates
        pc.current.onicecandidate = (event) => {
          if (event.candidate && socket.current?.connected) {
            socket.current.emit("ice-candidate", {
              roomId: meetingId,
              candidate: event.candidate,
            });
          }
        };

        // Handle connection state changes
        pc.current.onconnectionstatechange = () => {
          console.log('Connection state:', pc.current?.connectionState);
        };

        // Socket event handlers
        socket.current.on("user-joined", async (userId) => {
          console.log('User joined:', userId);
          try {
            const offer = await pc.current!.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true,
            });
            await pc.current!.setLocalDescription(offer);
            socket.current?.emit("offer", { roomId: meetingId, offer });
          } catch (error) {
            console.error('Error creating offer:', error);
          }
        });

        socket.current.on("offer", async (offer) => {
          try {
            await pc.current!.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.current!.createAnswer();
            await pc.current!.setLocalDescription(answer);
            socket.current?.emit("answer", { roomId: meetingId, answer });
          } catch (error) {
            console.error('Error handling offer:', error);
          }
        });

        socket.current.on("answer", async (answer) => {
          try {
            await pc.current!.setRemoteDescription(new RTCSessionDescription(answer));
          } catch (error) {
            console.error('Error handling answer:', error);
          }
        });

        socket.current.on("ice-candidate", async ({ candidate }) => {
          try {
            await pc.current!.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (error) {
            console.error("Failed to add ICE candidate:", error);
          }
        });

        socket.current.on("chat-message", ({ sender, message }) => {
          setChatMessages((prev) => [...prev, { sender, message }]);
        });

        socket.current.on("user-left", (userId) => {
          console.log('User left:', userId);
          // Handle user leaving logic
        });

        // Join the room after everything is set up
        socket.current.emit("join-room", meetingId);

      } catch (error) {
        console.error('Error initializing socket and media:', error);
        setConnectionError('Failed to initialize connection');
      }
    };

    initSocketAndMedia();

    return () => {
      // Cleanup
      if (socket.current) {
        socket.current.disconnect();
      }
      if (pc.current) {
        pc.current.close();
      }
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [meetingId]);

  const sendMessage = () => {
    if (!chatInput.trim() || !socket.current?.connected) return;

    const sender = user?.fullName || "Anonymous";
    const message = chatInput.trim();

    socket.current.emit("chat-message", {
      roomId: meetingId,
      sender,
      message,
    });

    setChatInput("");
  };

  const toggleCamera = () => {
    setIsCameraOff(!isCameraOff);
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
    }
  };

  const handleLeaveMeeting = () => {
    console.log("Leaving meeting...");
    // Add navigation logic here
    window.location.href = '/';
  };

  return (
      <div className="min-h-screen bg-background text-foreground flex flex-col animate-fade-in">
        <header className="p-4 border-b border-border flex justify-between items-center">
          <h1 className="text-xl font-bold text-primary">Video Conference</h1>
          <div className="flex items-center gap-4">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-muted-foreground">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
            <div className="text-sm text-muted-foreground">
              Meeting ID:{" "}
              <span className="font-mono bg-muted px-2 py-1 rounded">
              {meetingId}
            </span>
            </div>
          </div>
        </header>

        {connectionError && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 m-4 rounded-lg">
              Connection Error: {connectionError}
            </div>
        )}

        <main className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col p-4 gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
              <div className="bg-muted rounded-lg overflow-hidden relative aspect-video">
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                />
                <div className="absolute bottom-2 left-2 bg-black/50 text-white text-sm px-2 py-1 rounded">
                  You {isCameraOff && "(Camera Off)"}
                </div>
              </div>
              <div className="bg-muted rounded-lg overflow-hidden relative flex items-center justify-center aspect-video">
                <video
                    ref={remoteRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                />
                <div className="flex items-center justify-center h-full absolute">
                  {!remoteStream && (
                      <p className="text-muted-foreground">
                        Waiting for others to join...
                      </p>
                  )}
                </div>
                {remoteStream && (
                    <div className="absolute bottom-2 left-2 bg-black/50 text-white text-sm px-2 py-1 rounded">
                      Remote User
                    </div>
                )}
              </div>
            </div>
          </div>

          {isChatOpen && (
              <aside className="w-full md:w-80 lg:w-96 bg-zinc-900/50 border-l border-border flex flex-col transition-all duration-300">
                <div className="p-4 border-b border-border">
                  <h2 className="text-lg font-semibold">Chat</h2>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {chatMessages.map((msg, idx) => (
                      <div
                          key={idx}
                          className={cn(
                              "flex flex-col",
                              msg.sender === (user?.fullName || "Anonymous")
                                  ? "items-end"
                                  : "items-start"
                          )}
                      >
                        <div
                            className={cn(
                                "rounded-lg px-3 py-2 max-w-xs",
                                msg.sender === (user?.fullName || "Anonymous")
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted"
                            )}
                        >
                          <p className="font-bold text-sm">{msg.sender}</p>
                          <p>{msg.message}</p>
                        </div>
                      </div>
                  ))}
                </div>
                <div className="p-4 border-t border-border">
                  <div className="flex gap-2">
                    <Input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                        placeholder="Type a message..."
                        className="flex-1"
                        disabled={!isConnected}
                    />
                    <Button onClick={sendMessage} size="icon" disabled={!isConnected}>
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </aside>
          )}
        </main>

        <footer className="p-4 border-t border-border flex justify-center items-center gap-4 bg-zinc-900/50">
          <Button
              variant={isMuted ? "destructive" : "secondary"}
              size="lg"
              className="rounded-full w-16 h-16"
              onClick={toggleMute}
          >
            {isMuted ? (
                <MicOff className="w-6 h-6" />
            ) : (
                <Mic className="w-6 h-6" />
            )}
          </Button>
          <Button
              variant={isCameraOff ? "destructive" : "secondary"}
              size="lg"
              className="rounded-full w-16 h-16"
              onClick={toggleCamera}
          >
            {isCameraOff ? (
                <VideoOff className="w-6 h-6" />
            ) : (
                <Video className="w-6 h-6" />
            )}
          </Button>
          <Button
              variant="secondary"
              size="lg"
              className="rounded-full w-16 h-16"
              onClick={() => setIsChatOpen(!isChatOpen)}
          >
            <MessageSquare className="w-6 h-6" />
          </Button>
          <Button
              variant="destructive"
              size="lg"
              className="rounded-full w-20 h-16"
              onClick={handleLeaveMeeting}
          >
            <PhoneOff className="w-6 h-6" />
          </Button>
        </footer>
      </div>
  );
}