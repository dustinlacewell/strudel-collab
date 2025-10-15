import Peer from 'peerjs';

export class CollabSession {
  constructor(editor) {
    this.editor = editor;
    this.peer = null;
    this.connections = new Map();
    this.peerId = null;
    this.isAuthority = false;
    this.ignoreChanges = false;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'solo'
    this.onStatusChange = null;
    this.lobbyId = null;
  }

  async connect(lobbyId) {
    if (this.peer) {
      this.disconnect();
    }
    
    this.lobbyId = lobbyId || 'strudel-jam-session';
    this.status = 'connecting';
    this.onStatusChange?.();
    
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
    const lobbyConn = this.peer.connect(this.lobbyId);
    let connected = false;
    
    setTimeout(() => {
      if (!connected) {
        // If can't connect, become the lobby
        console.log('[collab] Becoming lobby coordinator');
        this.isAuthority = true;
        this.status = 'solo';
        this.onStatusChange?.();
        this.peer.destroy();
        this.peer = new Peer(this.lobbyId);
        
        this.peer.on('connection', (conn) => {
          console.log('[collab] Peer joined:', conn.peer);
          this.setupConnection(conn);
          // Send current code to new peer
          conn.on('open', () => {
            conn.send({
              type: 'sync',
              code: this.editor.state.doc.toString()
            });
            this.status = 'connected';
            this.onStatusChange?.();
          });
        });
      }
    }, 1000);
    
    lobbyConn.on('open', () => {
      connected = true;
      console.log('[collab] Connected to lobby');
      this.status = 'connected';
      this.onStatusChange?.();
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
      if (this.connections.size === 0 && this.isAuthority) {
        this.status = 'solo';
      }
      this.onStatusChange?.();
    });
  }
  
  getConnectionInfo() {
    return {
      status: this.status,
      peerCount: this.connections.size,
      isAuthority: this.isAuthority
    };
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

  disconnect() {
    console.log('[collab] Disconnecting...');
    this.peer?.destroy();
    this.connections.clear();
    this.peer = null;
    this.isAuthority = false;
    this.status = 'disconnected';
    this.onStatusChange?.();
  }
  
  isConnected() {
    return this.status === 'connected' || this.status === 'solo';
  }
}
