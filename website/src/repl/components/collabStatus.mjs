export function getDisplayStatus(status, peerCount) {
  if (status === 'connected' && peerCount === 0) {
    return 'solo';
  }
  return status;
}

export function getCollabLedColor(status, peerCount) {
  const displayStatus = getDisplayStatus(status, peerCount);
  
  switch (displayStatus) {
    case 'connected':
      return 'collab-led-connected';
    case 'solo':
      return 'collab-led-solo';
    case 'connecting':
      return 'collab-led-connecting';
    case 'disconnected':
    default:
      return 'collab-led-disconnected';
  }
}

export function getCollabBadgeColor(status, peerCount) {
  const displayStatus = getDisplayStatus(status, peerCount);
  
  switch (displayStatus) {
    case 'connected':
      return 'collab-status-connected';
    case 'solo':
      return 'collab-status-solo';
    case 'connecting':
      return 'collab-status-connecting';
    case 'disconnected':
    default:
      return 'collab-status-disconnected';
  }
}
