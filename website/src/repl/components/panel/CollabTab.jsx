import { useState } from 'react';

export function CollabTab({ context }) {
  const { editorRef, collabInfo, handleConnectCollab, handleDisconnectCollab } = context;
  const [username, setUsername] = useState('');
  const [roomName, setRoomName] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const collabSession = editorRef?.current?.collabSession;
  const isConnected = collabInfo?.status === 'connected' || collabInfo?.status === 'solo';

  const handleConnect = async () => {
    if (!roomName) {
      console.log('[CollabTab] No room name, returning');
      return;
    }

    setIsConnecting(true);
    try {
      // Set username in awareness before connecting
      if (username && collabSession) {
        // Store username to set after connection
        collabSession._pendingUsername = username;
      }

      await handleConnectCollab(roomName);

      // Set username in awareness after connection
      if (username && collabSession?.provider) {
        collabSession.provider.awareness.setLocalStateField('user', {
          name: username || 'Anonymous',
          color: `#${Math.floor(Math.random() * 16777215).toString(16)}`, // Random color
        });
      }
    } catch (err) {
      console.error('[CollabTab] Connection failed:', err);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    handleDisconnectCollab();
  };

  return (
    <div className="p-4 space-y-4 text-foreground">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold mb-2">Collaborative Editing</h2>
        <span className={`px-2 py-1 rounded text-sm ${
          collabInfo?.status === 'connected' ? 'bg-green-600/20 text-green-400' :
          collabInfo?.status === 'solo' ? 'bg-orange-600/20 text-orange-400' :
          collabInfo?.status === 'connecting' ? 'bg-yellow-600/20 text-yellow-400' :
          'bg-foreground/10 opacity-50'
        }`}>
          {collabInfo?.status || 'disconnected'}
        </span>
      </div>

      <div className="space-y-3">
        <div className="grid gap-2">
          <label>Your Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your name..."
            disabled={isConnected}
            className="p-2 bg-background rounded-md text-foreground border border-foreground disabled:opacity-50"
          />
        </div>

        <div className="grid gap-2">
          <label>Room Name</label>
          <p className="text-xs opacity-50">
            Anyone with the same room name will join your session
          </p>
          <input
            type="text"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder="Enter room name..."
            disabled={isConnected}
            className="p-2 bg-background rounded-md text-foreground border border-foreground disabled:opacity-50"
          />
        </div>

        <div>
          {!isConnected ? (
            <button
              onClick={handleConnect}
              disabled={!roomName || isConnecting}
              className="w-full px-4 py-2 bg-foreground text-background rounded hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isConnecting ? 'Connecting...' : 'Connect'}
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              className="w-full px-4 py-2 bg-red-600 text-white rounded hover:opacity-80"
            >
              Disconnect
            </button>
          )}
        </div>
      </div>

      {isConnected && (
        <div className="pt-4 border-t border-foreground/20">
          <div className="flex items-center justify-between mb-2">
            <h3 className="mb-2">Active Peers</h3>
            <span className="font-mono">{collabInfo?.peerCount || 0}</span>
          </div>
          <PeerList collabSession={collabSession} />
        </div>
      )}
    </div>
  );
}

function PeerList({ collabSession }) {
  const [peers, setPeers] = useState([]);

  // Update peer list when awareness changes
  useState(() => {
    if (!collabSession?.provider) return;

    const updatePeers = () => {
      const states = collabSession.provider.awareness.getStates();
      const peerList = [];
      states.forEach((state, clientID) => {
        if (clientID !== collabSession.provider.awareness.clientID) {
          peerList.push({
            id: clientID,
            name: state.user?.name || 'Anonymous',
            color: state.user?.color || '#888',
          });
        }
      });
      setPeers(peerList);
    };

    updatePeers();
    collabSession.provider.awareness.on('change', updatePeers);

    return () => {
      collabSession.provider.awareness.off('change', updatePeers);
    };
  }, [collabSession]);

  if (peers.length === 0) {
    return <p className="text-sm opacity-50">No other users connected</p>;
  }

  return (
    <ul className="space-y-2">
      {peers.map((peer) => (
        <li key={peer.id} className="flex items-center space-x-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: peer.color }}
          />
          <span>{peer.name}</span>
        </li>
      ))}
    </ul>
  );
}
