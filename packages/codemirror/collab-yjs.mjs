import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { yCollab, yRemoteSelectionsTheme } from 'y-codemirror.next';
import { Awareness } from 'y-protocols/awareness';
import { Compartment } from '@codemirror/state';

// Predefined color palette for user cursors (from y-codemirror.next example)
const userColors = [
  { color: '#30bced', light: '#30bced33' },
  { color: '#6eeb83', light: '#6eeb8333' },
  { color: '#ffbc42', light: '#ffbc4233' },
  { color: '#ecd444', light: '#ecd44433' },
  { color: '#ee6352', light: '#ee635233' },
  { color: '#9ac2c9', light: '#9ac2c933' },
  { color: '#8acb88', light: '#8acb8833' },
  { color: '#1be7ff', light: '#1be7ff33' }
];

export class YjsCollabSession {
  constructor(editor) {
    this.editor = editor;
    this.ydoc = null;
    this.provider = null;
    this.ytext = null;
    this.status = 'disconnected';
    this.onStatusChange = null;
    this.onEvaluate = null;
    this.lobbyId = null;
    this.connections = new Map(); // For API compatibility (not used by Yjs)
  }

  // Get Yjs CodeMirror extension (called during editor setup)
  getExtension() {
    // Create a compartment for the collab extension
    this.collabCompartment = new Compartment();
    // Start with empty extension, will be filled when connecting
    return this.collabCompartment.of([]);
  }

  async connect(lobbyId) {
    if (this.provider) {
      this.disconnect();
    }

    this.lobbyId = lobbyId || 'strudel-jam-session';
    this.status = 'connecting';
    this.onStatusChange?.();

    // Create Yjs document if not exists
    if (!this.ydoc) {
      this.ydoc = new Y.Doc();
      this.ytext = this.ydoc.getText('codemirror');
      
      // DON'T insert local content - let the first peer's content be the source of truth
      // The yCollab extension will sync the shared state to this editor
    }

    // Create awareness instance
    const awareness = new Awareness(this.ydoc);
    // Select a random color from the predefined palette
    const userColor = userColors[Math.floor(Math.random() * userColors.length)];
    awareness.setLocalStateField('user', {
      name: `peer-${Math.random().toString(36).substr(2, 9)}`,
      color: userColor.color,
      colorLight: userColor.light,
    });

    // Create WebRTC provider with multiple signaling servers for redundancy
    this.provider = new WebrtcProvider(this.lobbyId, this.ydoc, {
      signaling: [
        'wss://flok.cc/signal'
      ],
      password: null, // Public room
      awareness: awareness,
    });

    console.log('[yjs] Connecting to room:', this.lobbyId);
    
    // Save local content
    const localContent = this.editor?.state?.doc?.toString() || '';
    console.log('[yjs] localContent:', localContent);
    
    // Handle initial sync: populate ytext if empty, then activate yCollab
    let hasHandledInitialSync = false;
    const handleInitialSync = () => {
      if (hasHandledInitialSync) return;
      hasHandledInitialSync = true;
      
      console.log('[yjs] Handling initial sync');
      console.log('[yjs] ytext.length:', this.ytext.length);
      console.log('[yjs] ytext.toString():', this.ytext.toString());
      
      // If ytext is empty (we're first), populate it with local content
      if (this.ytext.length === 0 && localContent) {
        console.log('[yjs] Room is empty, inserting local content');
        this.ytext.insert(0, localContent);
      }
      
      console.log('[yjs] Final ytext:', this.ytext.toString());
      
      // Replace editor content with ytext (the source of truth)
      const ytextContent = this.ytext.toString();
      console.log('[yjs] Replacing editor content with ytext');
      this.editor.dispatch({
        changes: { from: 0, to: this.editor.state.doc.length, insert: ytextContent }
      });
      
      // NOW activate yCollab extension - editor and ytext are in sync
      if (this.editor && this.collabCompartment) {
        this.editor.dispatch({
          effects: this.collabCompartment.reconfigure([
            yCollab(this.ytext, this.provider.awareness),
            yRemoteSelectionsTheme,
          ])
        });
        console.log('[yjs] Collaboration extension activated');
      }
    };
    
    // Wait a moment for initial sync from other peers, then handle it
    setTimeout(handleInitialSync, 100);

    // Listen for connection status
    this.provider.on('status', ({ status }) => {
      console.log('[yjs] Status event:', status);
      if (status === 'connected') {
        this.status = 'connected';
      } else if (status === 'disconnected') {
        this.status = 'disconnected';
      }
      this.onStatusChange?.();
    });

    // Listen for peer changes - update status based on peer count
    this.provider.awareness.on('change', () => {
      const states = this.provider.awareness.getStates?.() || this.provider.awareness.states || new Map();
      const peerCount = states.size - 1; // Exclude self
      
      // Update status based on peer count
      if (peerCount > 0) {
        this.status = 'connected';
      } else if (this.status === 'connected' || this.status === 'connecting') {
        this.status = 'solo'; // Alone in the room
      }
      
      console.log('[yjs] Awareness change, peers:', peerCount, 'status:', this.status);
      this.onStatusChange?.();
    });

    // Listen for evaluate broadcasts
    this.provider.awareness.on('change', ({ added, updated }) => {
      [...added, ...updated].forEach(clientID => {
        if (clientID === this.provider.awareness.clientID) return; // Skip self
        
        const state = this.provider.awareness.getStates().get(clientID);
        if (state?.evaluate && state.evaluate !== this.lastEvaluateTime) {
          console.log('[yjs] Received evaluate from peer');
          this.lastEvaluateTime = state.evaluate;
          this.onEvaluate?.();
        }
      });
    });

    // Listen for sync
    this.provider.on('synced', () => {
      console.log('[yjs] Synced with peers');
      if (this.status === 'connecting') {
        // Check if there are any other peers
        const states = this.provider.awareness.getStates?.() || this.provider.awareness.states || new Map();
        const peerCount = states.size - 1; // Exclude self
        this.status = peerCount > 0 ? 'connected' : 'solo';
        this.onStatusChange?.();
      }
    });

    return new Promise((resolve) => {
      // Resolve immediately with client ID
      resolve(this.provider.awareness.clientID);
      
      // Update status when synced
      const checkSync = () => {
        if (this.provider.synced) {
          this.status = 'connected';
          this.onStatusChange?.();
        } else {
          setTimeout(checkSync, 100);
        }
      };
      checkSync();
    });
  }

  getConnectionInfo() {
    if (!this.provider || !this.provider.awareness) {
      return {
        status: this.status || 'disconnected',
        peerCount: 0,
        isAuthority: false,
      };
    }

    // Count peers (excluding self)
    const states = this.provider.awareness.getStates?.() || this.provider.awareness.states || new Map();
    const peerCount = states.size - 1;

    return {
      status: this.status,
      peerCount: Math.max(0, peerCount),
      isAuthority: false, // No authority in Yjs!
    };
  }

  broadcastEvaluate() {
    if (!this.provider) return;

    // Use awareness to broadcast evaluate event
    const currentState = this.provider.awareness.getLocalState() || {};
    this.provider.awareness.setLocalState({
      ...currentState,
      evaluate: Date.now(), // Timestamp to trigger change
    });

    console.log('[yjs] Broadcasting evaluate to', this.getConnectionInfo().peerCount, 'peers');
  }

  disconnect() {
    console.log('[yjs] Disconnecting...');
    this.provider?.destroy();
    this.ydoc?.destroy();
    this.provider = null;
    this.ydoc = null;
    this.ytext = null;
    this.status = 'disconnected';
    this.onStatusChange?.();
  }

  isConnected() {
    return this.status === 'connected';
  }
}
