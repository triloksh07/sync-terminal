import { WebSocketServer, WebSocket } from "ws";
import crypto from "crypto";

// 1. Explicit Signaling Frame Contracts (JSON, not MessagePack)
export enum SignalType {
  HOST_REGISTER = "HOST_REGISTER",
  HOST_REGISTERED = "HOST_REGISTERED",
  CLIENT_LOOKUP = "CLIENT_LOOKUP",
  MATCH_SUCCESS = "MATCH_SUCCESS",
  MATCH_FAILED = "MATCH_FAILED",
  SIGNAL_FORWARD = "SIGNAL_FORWARD",
  APPROVAL_REQUEST = "APPROVAL_REQUEST",
  APPROVAL_RESPONSE = "APPROVAL_RESPONSE",
}

interface SignalMessage {
  type: SignalType;
  payload: any;
}

// 2. Ephemeral State Maps
interface HostSession {
  hostSocket: WebSocket;
  createdAt: number;
}

const activeSessions = new Map<string, HostSession>(); // Key: 6-digit code
const socketToSession = new Map<WebSocket, string>(); // Key: Socket -> 6-digit code

const wss = new WebSocketServer({ port: 8080 });

console.log("🚀 SyncPTY Matchmaker Signaling Server running on port 8080");

wss.on("connection", (ws) => {
  ws.on("message", (rawMessage) => {
    try {
      const msg = JSON.parse(rawMessage.toString()) as SignalMessage;
      handleSignalingMessage(ws, msg);
    } catch (err) {
      console.error("Malformed signaling frame dropped.");
    }
  });

  ws.on("close", () => {
    // Teardown logic: If a host disconnects, destroy the 6-digit code
    const code = socketToSession.get(ws);
    if (code) {
      const session = activeSessions.get(code);
      // ONLY destroy the session if the socket disconnecting belongs to the HOST
      if (session && session.hostSocket === ws) {
        activeSessions.delete(code);
        // console.log(`[Teardown] Session ${code} destroyed.`);
        console.log(`[Teardown] Host left. Session ${code} destroyed.`);
      }
      socketToSession.delete(ws);
      console.log(`[Teardown] Session ${code} destroyed.`);
    }
  });
});

function handleSignalingMessage(ws: WebSocket, msg: SignalMessage) {
  switch (msg.type) {
    case SignalType.HOST_REGISTER:
      // Generate a collision-free 6-digit code
      let code;
      do {
        code = crypto.randomInt(100000, 999999).toString();
      } while (activeSessions.has(code));

      activeSessions.set(code, { hostSocket: ws, createdAt: Date.now() });
      socketToSession.set(ws, code);

      console.log(`[Register] Host created session: ${code}`);

      ws.send(
        JSON.stringify({
          type: SignalType.HOST_REGISTERED,
          payload: { code },
        })
      );
      break;

    case SignalType.CLIENT_LOOKUP:
      const targetSession = activeSessions.get(msg.payload.code);
      if (!targetSession) {
        ws.send(
          JSON.stringify({
            type: SignalType.MATCH_FAILED,
            payload: { reason: "Invalid or expired session code" },
          })
        );
        return;
      }

      // Link the client socket to the session temporarily for signaling routing
      socketToSession.set(ws, msg.payload.code);

      // Alert both peers that a lookup succeeded so they can begin approval/ICE exchange
      ws.send(
        JSON.stringify({
          type: SignalType.MATCH_SUCCESS,
          payload: { role: "client" },
        })
      );
      targetSession.hostSocket.send(
        JSON.stringify({
          type: SignalType.MATCH_SUCCESS,
          payload: { role: "host" },
        })
      );
      break;

    case SignalType.SIGNAL_FORWARD:
    case SignalType.APPROVAL_REQUEST:
    case SignalType.APPROVAL_RESPONSE:
      // Dumb Proxy: Route payloads between the matched sockets
      const activeCode = socketToSession.get(ws);
      if (!activeCode) return;

      const session = activeSessions.get(activeCode);
      if (!session) return;

      // In a real 1-to-1 WebRTC setup, if the sender is the host, forward to the client.
      // Since this is a temporary mapping, we will broadcast to the "other" socket in the room.
      wss.clients.forEach((client) => {
        if (
          client !== ws &&
          socketToSession.get(client) === activeCode &&
          client.readyState === WebSocket.OPEN
        ) {
          client.send(JSON.stringify(msg));
        }
      });
      break;
  }
}
