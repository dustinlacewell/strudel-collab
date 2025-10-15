import Peer from 'peerjs';

// Fixed lobby - everyone joins the same room
const LOBBY_ID = 'strudel-jam-session';

export class CollabSession {
  constructor(editor) {
    this.editor = editor;
    this.peer = null;
    this.connections = new Map();
    this.peerId = null;
    this.isAuthority = false;
    this.ignoreChanges = false;
  }

  async start() {
    return new Promise((resolve) => {
      this.peer = new Peer();
      
      this.peer.on('open', (id) => {
        this.peerId = id;
        console.log('[collab] My Peer ID:', id);
        this.connectToLobby();
        resolve(id);
      });

      this.peer.on('connection', (conn) => {
        this.setupConnection(conn);
      });
    });
  }

  connectToLobby() {
    // Try to connect to the lobby
    const lobbyConn = this.peer.connect(LOBBY_ID);
    let connected = false;
    
    setTimeout(() => {
      if (!connected) {
        // If can't connect, become the lobby
        console.log('[collab] Becoming lobby coordinator');
        this.isAuthority = true;
        this.peer.destroy();
        this.peer = new Peer(LOBBY_ID);
        
        this.peer.on('connection', (conn) => {
          console.log('[collab] Peer joined:', conn.peer);
          this.setupConnection(conn);
          // Send current code to new peer
          conn.on('open', () => {
            conn.send({
              type: 'sync',
              code: this.editor.state.doc.toString()
            });
          });
        });
      }
    }, 1000);
    
    lobbyConn.on('open', () => {
      connected = true;
      console.log('[collab] Connected to lobby');
      this.setupConnection(lobbyConn);
      // Request current code
      lobbyConn.send({ type: 'requestSync' });
    });
  }

  setupConnection(conn) {
    this.connections.set(conn.peer, conn);

    conn.on('data', (data) => {
      if (data.type === 'sync') {
        // Receive full code sync
        this.ignoreChanges = true;
        const changes = {
          from: 0,
          to: this.editor.state.doc.length,
          insert: data.code
        };
        this.editor.dispatch({ changes });
        this.ignoreChanges = false;
        console.log('[collab] Synced with peer');
      } else if (data.type === 'change') {
        // Receive incremental change
        if (!this.ignoreChanges) {
          this.ignoreChanges = true;
          this.editor.dispatch({
            changes: { from: 0, to: this.editor.state.doc.length, insert: data.code }
          });
          this.ignoreChanges = false;
        }
      } else if (data.type === 'requestSync') {
        // Send current code
        conn.send({
          type: 'sync',
          code: this.editor.state.doc.toString()
        });
      }
    });

    conn.on('close', () => {
      console.log('[collab] Peer left:', conn.peer);
      this.connections.delete(conn.peer);
    });
  }

  broadcastChange(code) {
    if (this.ignoreChanges) return;
    
    for (let conn of this.connections.values()) {
      conn.send({
        type: 'change',
        code
      });
    }
  }

  destroy() {
    this.peer?.destroy();
    this.connections.clear();
  }
}
