export enum PacketType {
  // control plane
  AUTHZ_REQUEST = 0,
  AUTHZ_RESPONSE = 1,

  SESSION_CLOSE = 2,
  HEARTBEAT = 3,

  // data plane
  PTY_INPUT = 4,
  PTY_OUTPUT = 5,

  RESIZE = 6,
}
