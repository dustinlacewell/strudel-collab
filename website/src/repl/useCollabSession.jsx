import { useState, useEffect, useRef } from 'react';
import { YjsCollabSession } from '@strudel/codemirror/collab-yjs.mjs';


export function useCollabSession(editorRef) {
  const [status, setStatus] = useState('disconnected');
  const [peerCount, setPeerCount] = useState(0);
  const [peers, setPeers] = useState([]);
  const [isReady, setIsReady] = useState(false);
  const [username, setUsername] = useState('');
  const [roomName, setRoomName] = useState('');
  const sessionRef = useRef(null);
  
  useEffect(() => {
    const cmEditor = editorRef.current?.editor;
    if (!cmEditor) return;
    
    const session = new YjsCollabSession(cmEditor);
    sessionRef.current = session;
    session.initialize();
    
    const handleStatusChange = () => {
      setStatus(session.getConnectionInfo().status);
    };
    
    const handlePeerCountChange = () => {
      const info = session.getConnectionInfo();
      setPeerCount(info.peerCount);
      
      if (session.provider) {
        const states = session.provider.awareness.getStates();
        const peerList = [];
        states.forEach((state, clientID) => {
          if (clientID !== session.provider.awareness.clientID) {
            peerList.push({
              id: clientID,
              name: state.user?.name || 'Anonymous',
              color: state.user?.color || '#888',
            });
          }
        });
        setPeers(peerList);
      }
    };
    
    const handleRemoteEvaluate = async () => {
      const strudelMirror = editorRef.current;
      if (!strudelMirror?.repl?.scheduler?.started) return;
      
      try {
        strudelMirror.flash();
        // strudelMirror.evaluate would cause rebroadcast
        await strudelMirror.repl.evaluate(strudelMirror.code);
      } catch (err) {
        console.warn('[collab] Peer code evaluation failed:', err.message);
      }
    };
    
    const handleLocalEvaluate = () => {
      session.broadcastEvaluate();
    };
    
    session.on('evaluate', handleRemoteEvaluate);
    session.on('statusChange', handleStatusChange);
    session.on('peerCountChange', handlePeerCountChange);
    editorRef.current?.on('afterEvaluate', handleLocalEvaluate);
    
    setStatus(session.getConnectionInfo().status);
    setPeerCount(session.getConnectionInfo().peerCount);
    setIsReady(true);
    
    return () => {
      session.off('statusChange', handleStatusChange);
      session.off('peerCountChange', handlePeerCountChange);
      session.off('evaluate', handleRemoteEvaluate);
      editorRef.current?.off('afterEvaluate', handleLocalEvaluate);
      
      session.disconnect();
      sessionRef.current = null;
      setIsReady(false);
    };
  }, [editorRef.current]);
  
  const connect = async (lobbyId, user) => {
    if (!sessionRef.current) {
      throw new Error('Collaboration session not initialized. Please refresh the page.');
    }
    setUsername(user);
    setRoomName(lobbyId);
    await sessionRef.current.connect(lobbyId, user);
  };
  
  const disconnect = () => {
    sessionRef.current?.disconnect();
  };
  
  return {
    status,
    peerCount,
    peers,
    isReady,
    username,
    roomName,
    setUsername,
    setRoomName,
    connect,
    disconnect,
  };
}
