import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { yCollab, yRemoteSelectionsTheme } from 'y-codemirror.next';
import { Awareness } from 'y-protocols/awareness';
import { Compartment, StateEffect } from '@codemirror/state';
import { EventEmitter } from 'events';

const signaling = [
  'wss://flok.cc/signal',
]

const userColors = [
  { color: '#30bced' },
  { color: '#6eeb83' },
  { color: '#ffbc42' },
  { color: '#ecd444' },
  { color: '#ee6352' },
  { color: '#9ac2c9' },
  { color: '#8acb88' },
  { color: '#1be7ff' }
];

const pickUserColor = () => userColors[Math.floor(Math.random() * userColors.length)];

const STATUS = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
};

export class YjsCollabSession extends EventEmitter {
  constructor(editor) {
    super();
    this.editor = editor;
    this.ydoc = null;
    this.ytext = null;
    this.ymeta = null;
    this.provider = null;
    this.status = STATUS.DISCONNECTED;
    this.peerCount = 0;
    this.lastEvaluateTime = 0;
    this.lobbyId = null;
    this.collabCompartment = new Compartment();
  }

  getExtension() {
    return this.collabCompartment.of([]);
  }

  initialize() {
    this.editor.dispatch({
      effects: StateEffect.appendConfig.of(this.getExtension())
    });
  }

  initializeYjsDocument() {
    this.ydoc = new Y.Doc();
    this.ytext = this.ydoc.getText('codemirror');
    this.ymeta = this.ydoc.getMap('meta');
  }

  createAwareness(username) {
    const awareness = new Awareness(this.ydoc);
    awareness.setLocalStateField('user', {
      ...pickUserColor(),
      name: username,
    });
    return awareness;
  }

  createProvider(awareness) {
    this.provider = new WebrtcProvider(this.lobbyId, this.ydoc, {
      signaling,
      awareness,
      password: null,
      filterBcConns: false,
    });
  }

  handleInitialSync(localContent, myTicket) {
    let winner = myTicket;
    this.ymeta.forEach((value, key) => {
      if (key.startsWith('ticket_') && value.timestamp < winner.timestamp) {
        winner = value;
      }
    });
    
    if (winner.id === myTicket.id && this.ytext.length === 0 && localContent.length > 0) {
      this.ytext.insert(0, localContent);
    }
    
    const ytextContent = this.ytext.toString();
    this.editor.dispatch({
      changes: { from: 0, to: this.editor.state.doc.length, insert: ytextContent }
    });
    
    this.editor.dispatch({
      effects: this.collabCompartment.reconfigure([
        yCollab(this.ytext, this.provider.awareness),
        yRemoteSelectionsTheme,
      ])
    });
  }

  handleProviderStatus({ connected }) {
    const newStatus = connected ? STATUS.CONNECTED : STATUS.DISCONNECTED;
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.emit('statusChange');
    }
  }

  handlePeerCountChange() {
    const states = this.provider.awareness.getStates();
    const newPeerCount = states.size - 1;
    
    if (this.peerCount !== newPeerCount) {
      this.peerCount = newPeerCount;
      this.emit('peerCountChange');
    }
  }

  handlePeerEvaluate({ added, updated }) {
    [...added, ...updated].forEach(clientID => {
      if (clientID === this.provider.awareness.clientID) return; // Skip self
      const state = this.provider.awareness.getStates().get(clientID);
      if (state?.evaluate && state.evaluate !== this.lastEvaluateTime) {
        this.lastEvaluateTime = state.evaluate;
        this.emit('evaluate');
      }
    });
  }

  registerTicket() {
    const localContent = this.editor?.state?.doc?.toString() || '';
    const myTicket = {
      id: Math.random().toString(36).substring(2, 11),
      timestamp: Date.now()
    };
    this.ymeta.set(`ticket_${myTicket.id}`, myTicket);
    return { localContent, myTicket };
  }

  async connect(lobbyId, username = 'Anonymous') {
    this.lobbyId = lobbyId;
    this.status = STATUS.CONNECTING;
    this.peerCount = 0;
    this.emit('statusChange');

    this.initializeYjsDocument();
    const awareness = this.createAwareness(username);
    this.createProvider(awareness);
    const { localContent, myTicket } = this.registerTicket();
    
    const connectionPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout: Unable to connect to signaling server. Please check your network connection.'));
      }, 10000);
      
      this.provider.once('status', (e) => {
        if (e.connected) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
    
    this.provider.once('synced', () => this.handleInitialSync(localContent, myTicket));
    this.provider.on('status', (e) => this.handleProviderStatus(e));
    this.provider.awareness.on('change', () => this.handlePeerCountChange());
    this.provider.awareness.on('change', (e) => this.handlePeerEvaluate(e));
    
    try {
      await connectionPromise;
    } catch (err) {
      this.disconnect();
      throw err;
    }
  }

  getConnectionInfo() {
    return {
      status: this.status,
      peerCount: this.peerCount,
    };
  }

  broadcastEvaluate() {
    if (!this.provider) return;

    const currentState = this.provider.awareness.getLocalState() || {};
    this.provider.awareness.setLocalState({
      ...currentState,
      evaluate: Date.now(),
    });
  }

  disconnect() {
    if (this.editor && this.collabCompartment) {
      this.editor.dispatch({
        effects: this.collabCompartment.reconfigure([])
      });
    }
    
    this.provider?.destroy();
    this.ydoc?.destroy();
    this.provider = null;
    this.ydoc = null;
    this.ytext = null;
    this.status = STATUS.DISCONNECTED;
    this.peerCount = 0;
    this.emit('statusChange');
    this.emit('peerCountChange');
  }

  isConnected() {
    return this.status === STATUS.CONNECTED;
  }
}
