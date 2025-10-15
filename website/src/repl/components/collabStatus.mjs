// Centralized collaboration status colors and utilities

export function getCollabStatusColor(status) {
  switch (status) {
    case 'connected':
      return {
        led: 'bg-green-500',
        badge: 'bg-green-600/20 text-green-400',
      };
    case 'solo':
      return {
        led: 'bg-orange-500',
        badge: 'bg-orange-600/20 text-orange-400',
      };
    case 'connecting':
      return {
        led: 'bg-yellow-500 animate-pulse',
        badge: 'bg-yellow-600/20 text-yellow-400',
      };
    case 'disconnected':
    default:
      return {
        led: 'bg-gray-500',
        badge: 'bg-foreground/10 opacity-50',
      };
  }
}
