import type { Transport } from "@syncpty/transport";
import { ApprovalState } from "./state";

export interface ClientSessionCallbacks {
  onOutput(data: string | Uint8Array): void;

  onDisconnect(reason?: string): void;

  onApprovalStatus(status: ApprovalState): void;
}

export interface ClientSessionOptions {
  transport: Transport;
  callbacks: ClientSessionCallbacks;
}
