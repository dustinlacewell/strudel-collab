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
    this.onEvaluate = null;
    this.lobbyId = null;
    this.knownPeers = new Set(); // All known peer IDs
    this.authorityId = null; // Current authority peer ID
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
        this.authorityId = this.peerId;
        this.knownPeers.add(this.peerId);
        this.status = 'solo';
        this.onStatusChange?.();
        this.peer.destroy();
        this.peer = new Peer(this.lobbyId);
        
        this.peer.on('connection', (conn) => {
          console.log('[collab] Peer joined:', conn.peer);
          this.knownPeers.add(conn.peer);
          this.setupConnection(conn);
          // Send current code to new peer
          conn.on('open', () => {
            // Tell new peer about all existing peers (exclude self since they know lobby ID)
            const peersToSend = Array.from(this.knownPeers).filter(id => id !== this.peerId);
            conn.send({
              type: 'sync',
              code: this.editor.state.doc.toString(),
              peers: peersToSend,
              authorityId: this.lobbyId
            });
            // Tell all other peers about new peer
            this.broadcast({
              type: 'peerJoined',
              peerId: conn.peer
            }, conn.peer);
            this.status = 'connected';
            this.onStatusChange?.();
          });
        });
      }
    }, 1000);
    
    lobbyConn.on('open', () => {
      connected = true;
      console.log('[collab] Connected to lobby');
      this.authorityId = this.lobbyId;
      this.knownPeers.add(this.lobbyId);
      this.knownPeers.add(this.peerId);
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
        // Receive full code sync + peer list
        this.ignoreChanges = true;
        const changes = {
          from: 0,
          to: this.editor.state.doc.length,
          insert: data.code
        };
        this.editor.dispatch({ changes });
        this.ignoreChanges = false;
        // Update known peers
        if (data.peers) {
          data.peers.forEach(id => this.knownPeers.add(id));
        }
        if (data.authorityId) {
          this.authorityId = data.authorityId;
        }
        console.log('[collab] Synced with peer, known peers:', this.knownPeers.size);
      } else if (data.type === 'change') {
        // Receive incremental change
        if (!this.ignoreChanges) {
          this.ignoreChanges = true;
          this.editor.dispatch({
            changes: { from: 0, to: this.editor.state.doc.length, insert: data.code }
          });
          this.ignoreChanges = false;
          
          // If authority, relay to all other peers
          if (this.isAuthority) {
            this.broadcast({
              type: 'change',
              code: data.code
            }, conn.peer); // Exclude sender
          }
        }
      } else if (data.type === 'requestSync') {
        // Send current code
        const peersToSend = this.isAuthority 
          ? Array.from(this.knownPeers).filter(id => id !== this.peerId)
          : Array.from(this.knownPeers);
        conn.send({
          type: 'sync',
          code: this.editor.state.doc.toString(),
          peers: peersToSend,
          authorityId: this.isAuthority ? this.lobbyId : this.authorityId
        });
      } else if (data.type === 'evaluate') {
        // Receive evaluate request
        this.onEvaluate?.();
        
        // If authority, relay to all other peers
        if (this.isAuthority) {
          this.broadcast({
            type: 'evaluate'
          }, conn.peer); // Exclude sender
        }
      } else if (data.type === 'peerJoined') {
        // New peer joined
        this.knownPeers.add(data.peerId);
        console.log('[collab] Peer joined:', data.peerId, 'total:', this.knownPeers.size);
        this.onStatusChange?.();
      } else if (data.type === 'peerLeft') {
        // Peer left
        this.knownPeers.delete(data.peerId);
        console.log('[collab] Peer left:', data.peerId, 'total:', this.knownPeers.size);
        this.onStatusChange?.();
      }
    });

    conn.on('close', () => {
      console.log('[collab] Connection closed:', conn.peer, 'authorityId:', this.authorityId, 'isAuthority:', this.isAuthority);
      this.connections.delete(conn.peer);
      this.knownPeers.delete(conn.peer);
      
      // If authority, notify all peers
      if (this.isAuthority) {
        this.broadcast({
          type: 'peerLeft',
          peerId: conn.peer
        });
        if (this.connections.size === 0) {
          this.status = 'solo';
        }
      } else if (conn.peer === this.lobbyId) {
        // Authority disconnected (we lost connection to lobby), reconnect
        console.log('[collab] Authority disconnected, reconnecting to lobby...');
        this.reconnectToLobby();
      }
      
      this.onStatusChange?.();
    });
  }
  
  reconnectToLobby() {
    console.log('[collab] Reconnecting to lobby:', this.lobbyId);
    console.log('[collab] Known peers:', Array.from(this.knownPeers));
    
    // Determine who should be new authority (lexicographically smallest)
    const sortedPeers = Array.from(this.knownPeers).filter(id => id !== this.lobbyId).sort();
    const newAuthority = sortedPeers[0];
    const shouldBeAuthority = newAuthority === this.peerId;
    
    console.log('[collab] New authority should be:', newAuthority);
    console.log('[collab] Am I authority?', shouldBeAuthority);
    
    // Disconnect and reconnect
    this.peer?.destroy();
    this.connections.clear();
    this.isAuthority = false;
    this.status = 'connecting';
    this.onStatusChange?.();
    
    if (shouldBeAuthority) {
      // I'm the new authority - become lobby immediately
      console.log('[collab] I am the new authority, taking over lobby');
      this.peer = new Peer(this.lobbyId);
      
      this.peer.on('open', (id) => {
        this.peerId = id;
        this.isAuthority = true;
        this.authorityId = this.lobbyId;
        this.knownPeers.clear();
        this.knownPeers.add(this.peerId);
        this.status = 'solo';
        console.log('[collab] Now authority with lobby ID:', id);
        this.onStatusChange?.();
      });
      
      this.peer.on('connection', (conn) => {
        console.log('[collab] Peer joined:', conn.peer);
        this.knownPeers.add(conn.peer);
        this.setupConnection(conn);
        conn.on('open', () => {
          const peersToSend = Array.from(this.knownPeers).filter(id => id !== this.peerId);
          conn.send({
            type: 'sync',
            code: this.editor.state.doc.toString(),
            peers: peersToSend,
            authorityId: this.lobbyId
          });
          this.broadcast({
            type: 'peerJoined',
            peerId: conn.peer
          }, conn.peer);
          this.status = 'connected';
          this.onStatusChange?.();
        });
      });
    } else {
      // Not authority - wait 1 second then reconnect to lobby
      console.log('[collab] Not authority, waiting 1s then reconnecting...');
      setTimeout(() => {
        this.peer = new Peer();
        
        this.peer.on('open', (id) => {
          this.peerId = id;
          this.knownPeers.clear();
          this.knownPeers.add(this.peerId);
          console.log('[collab] Reconnected with ID:', id);
          this.connectToLobby();
        });

        this.peer.on('connection', (conn) => {
          this.setupConnection(conn);
        });
      }, 1000);
    }
  }
  
  getConnectionInfo() {
    return {
      status: this.status,
      peerCount: Math.max(0, this.knownPeers.size - 1), // Exclude self
      isAuthority: this.isAuthority
    };
  }

  broadcast(msg, exclude) {
    for (let [id, conn] of this.connections) {
      if (id !== exclude) {
        conn.send(msg);
      }
    }
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
  
  broadcastEvaluate() {
    console.log('[collab] Broadcasting evaluate to', this.connections.size, 'peers');
    for (let conn of this.connections.values()) {
      conn.send({
        type: 'evaluate'
      });
    }
  }

  disconnect() {
    console.log('[collab] Disconnecting...');
    this.peer?.destroy();
    this.connections.clear();
    this.knownPeers.clear();
    this.peer = null;
    this.isAuthority = false;
    this.authorityId = null;
    this.status = 'disconnected';
    this.onStatusChange?.();
  }
  
  isConnected() {
    return this.status === 'connected' || this.status === 'solo';
  }
}
