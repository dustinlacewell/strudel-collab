# 🎵 Strudel Collaborative Live Coding

Everyone now codes together in the same live session!

## How It Works

**P2P collaborative editing** powered by PeerJS + CodeMirror's operational transformation.

- **First person** becomes the lobby coordinator
- **Everyone else** auto-connects to the same lobby
- **All changes sync** instantly across all connected peers
- **Shared evaluation** - everyone hears the same pattern

## Try It

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Start the dev server:**
   ```bash
   cd website
   pnpm dev
   ```

3. **Open multiple browser tabs** at `http://localhost:4321/`
   
4. **Start typing** - watch changes appear in all tabs! 🎉

5. **Press Ctrl+Enter** - pattern evaluates for everyone

## Implementation

- `packages/codemirror/collab.mjs` - P2P session manager (150 lines)
- `packages/codemirror/codemirror.mjs` - Integration into StrudelMirror
- `website/src/repl/useReplContext.jsx` - Enabled with `enableCollab: true`

## Architecture

```
┌─────────────────────────────────────────┐
│  Fixed Lobby: "strudel-jam-session"    │
└─────────────────────────────────────────┘
                    ↓
        First Peer = Authority
                    ↓
    ┌───────────────┼───────────────┐
    │               │               │
  Peer 2         Peer 3          Peer 4
```

All peers sync via PeerJS data connections. Changes are transformed using operational transformation to handle concurrent edits.

## Tech Stack

- **PeerJS** - WebRTC data connections (P2P)
- **@codemirror/collab** - Operational transformation
- **CodeMirror 6** - Editor with collab support

## Hackathon-Ready ⚡

Minimal, clean, working implementation:
- ✅ Real-time collaborative editing
- ✅ Automatic peer discovery
- ✅ Conflict resolution via OT
- ✅ Connection indicator in UI
- ✅ ~200 lines of collab code

Ready to demo! 🚀
