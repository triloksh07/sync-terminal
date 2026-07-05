# SyncPTY

Instant, trusted, end-to-end terminal sharing engineered for real-time collaboration and remote debugging.

SyncPTY allows developers to securely share their live terminal sessions directly with trusted peers without exposing full SSH access. It prioritizes stream fidelity, binary efficiency, and crisp terminal control lifecycle management.

---

## 🏗️ Monorepo Architecture

The project is structured as a type-safe TypeScript monorepo managed via `pnpm` and `turborepo` to isolate engine boundaries cleanly:

```ini
syncpty/
├── apps/
│   ├── host-agent/      # Initiates TCP loops, spawns authoritative shells, and manages prompts
│   └── cli-client/      # Swaps terminal context to raw mode, serving as a streaming rendering proxy
└── packages/
    ├── pty-core/        # Native pseudo-terminal configuration and OS state restoration management
    ├── protocol/        # Ultra-fast MessagePack binary serialization layer with runtime validation
    └── transport/       # Abstract network communication sockets (TCP/UDS/P2P)
```

---

## 🚦 System Specification Roadmap

- [x] **Phase 1: Core Engine Proof-of-Concept** -> Native compilation of terminal bindings on Linux systems.
- [x] **Phase 2: Local Socket Streaming (Current Hardening Phase)** -> Decoupled client/host communication over optimized loopback channels with comprehensive binary encoding boundaries.
- [x] **Phase 3: Signaling Matchmaker** -> Introduction of an external broker orchestration gateway managing ephemeral connection routing.
- [x] **Phase 4: True Peer-to-Peer Traversal** -> Native WebRTC DataChannel streaming bypassing strict firewalls.

---

## 🛠️ Local Workspace Development

### Prerequisites

- Node.js (v18+ recommended)
- Linux-based environment (verified on Ubuntu/Debian variations)
- Build essentials for compiling native modules (`node-gyp` requirements)

### Initial Setup & Compilation

Clone the repository and install the internal dependencies using workspace links:

```bash
# Install package dependencies
pnpm install

# Build internal primitives across all packages
pnpm build

```

### Executing Local Package Validation Tests

You can verify the functional state of the underlying modules completely offline without loading application configurations:

```bash
# Validate core pseudo-terminal capturing and state behavior
pnpm dlx tsx packages/pty-core/src/test-core.ts

# Validate protocol binary packing integrity and structural guard rails
pnpm dlx tsx packages/protocol/src/test-protocol.ts

```
