import { useState } from 'react';
import { useCollab } from '@src/repl/CollabContext';
import { getCollabBadgeColor, getDisplayStatus } from '../collabStatus.mjs';

export function CollabTab({ context }) {
  const { status, peerCount, peers, isReady, username, roomName, setUsername, setRoomName, connect, disconnect } = useCollab();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const isConnected = status === 'connected';

  const handleConnect = async () => {
    if (!roomName) {
      return;
    }

    setIsConnecting(true);
    setError(null);
    try {
      await connect(roomName, username || 'Anonymous');
    } catch (err) {
      console.error('[collab] Connection failed:', err);
      setError(err.message || 'Failed to connect. Please try again.');
      disconnect();
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setError(null);
  };

  const displayStatus = getDisplayStatus(status, peerCount);
  const statusColors = getCollabBadgeColor(status, peerCount);

  return (
    <div className="p-4 space-y-4 text-foreground">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold mb-2">Collaborative Editing</h2>
        <span className={`px-2 py-1 rounded text-sm ${statusColors}`}>
          {displayStatus}
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
              disabled={!roomName || isConnecting || !isReady}
              className="w-full px-4 py-2 bg-foreground text-background rounded hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {!isReady ? 'Loading...' : isConnecting ? 'Connecting...' : 'Connect'}
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

      {error && (
        <div className="pt-4 border-t border-foreground/20">
          <div className="p-3 bg-red-600/20 border border-red-600/50 rounded text-red-400 text-sm">
            <div className="font-semibold mb-1">Connection Error</div>
            <div>{error}</div>
          </div>
        </div>
      )}

      {isConnected && !error && <PeerPanel peers={peers} />}
    </div>
  );
}

function PeerPanel({ peers }) {
  return (
    <div className="pt-4 border-t border-foreground/20">
      {peers.length
        ? <PeerList peers={peers} />
        : <p className="text-sm opacity-50">No other users connected</p>
      }
    </div>
  )
}


function PeerList({ peers }) {
  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <h3 className="mb-2">Active Peers</h3>
        <span className="font-mono">{peers.length}</span>
      </div>

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
    </>
  )
}
