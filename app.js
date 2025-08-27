import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import Peer from 'simple-peer';
import './App.css';

function App() {
  const [socket, setSocket] = useState(null);
  const [roomId, setRoomId] = useState('');
  const [joined, setJoined] = useState(false);
  const [stream, setStream] = useState(null);
  const [peers, setPeers] = useState({});
  const myVideo = useRef();
  const peersRef = useRef([]);
  const roomIdRef = useRef();

  useEffect(() => {
    const newSocket = io('http://localhost:5000');
    setSocket(newSocket);

    return () => newSocket.close();
  }, []);

  useEffect(() => {
    if (!socket) return;

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        setStream(stream);
        if (myVideo.current) {
          myVideo.current.srcObject = stream;
        }
      })
      .catch(err => console.error('Error accessing media devices:', err));

    socket.on('user-connected', (userId) => {
      console.log('User connected:', userId);
      // Call the new user
      callUser(userId);
    });

    socket.on('offer', handleReceiveCall);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleNewICECandidate);
    socket.on('user-disconnected', handleUserDisconnected);

    return () => {
      socket.off('user-connected');
      socket.off('offer');
      socket.off('answer');
      socket.off('ice-candidate');
      socket.off('user-disconnected');
    };
  }, [socket]);

  const joinRoom = () => {
    if (roomId.trim() === '') return;
    
    socket.emit('join-room', roomId);
    setJoined(true);
    roomIdRef.current = roomId;
  };

  const callUser = (userId) => {
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream: stream,
    });

    peer.on('signal', (signal) => {
      socket.emit('offer', { 
        roomId: roomIdRef.current, 
        offer: signal 
      });
    });

    peer.on('stream', (remoteStream) => {
      // Add the remote stream to peers state
      setPeers(prev => ({ ...prev, [userId]: { stream: remoteStream } }));
    });

    peersRef.current.push({
      peerID: userId,
      peer,
    });
  };

  const handleReceiveCall = (data) => {
    const { offer, from } = data;
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream: stream,
    });

    peer.on('signal', (signal) => {
      socket.emit('answer', { 
        roomId: roomIdRef.current, 
        answer: signal,
        to: from 
      });
    });

    peer.on('stream', (remoteStream) => {
      setPeers(prev => ({ ...prev, [from]: { stream: remoteStream } }));
    });

    peer.signal(offer);

    peersRef.current.push({
      peerID: from,
      peer,
    });
  };

  const handleAnswer = (data) => {
    const { answer, from } = data;
    const peerObj = peersRef.current.find(p => p.peerID === from);
    if (peerObj) {
      peerObj.peer.signal(answer);
    }
  };

  const handleNewICECandidate = (data) => {
    const { candidate, from } = data;
    const peerObj = peersRef.current.find(p => p.peerID === from);
    if (peerObj) {
      peerObj.peer.signal(candidate);
    }
  };

  const handleUserDisconnected = (userId) => {
    const peerObj = peersRef.current.find(p => p.peerID === userId);
    if (peerObj) {
      peerObj.peer.destroy();
    }
    
    setPeers(prev => {
      const newPeers = { ...prev };
      delete newPeers[userId];
      return newPeers;
    });
    
    peersRef.current = peersRef.current.filter(p => p.peerID !== userId);
  };

  const leaveRoom = () => {
    setJoined(false);
    setRoomId('');
    // Clean up all peer connections
    peersRef.current.forEach(({ peer }) => {
      peer.destroy();
    });
    peersRef.current = [];
    setPeers({});
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Простой видео-мессенджер</h1>
      </header>
      
      <div className="container">
        {!joined ? (
          <div className="join-container">
            <input
              type="text"
              placeholder="Введите ID комнаты"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
            />
            <button onClick={joinRoom}>Присоединиться к комнате</button>
          </div>
        ) : (
          <div className="room-container">
            <div className="video-container">
              <div className="video-wrapper">
                <video
                  ref={myVideo}
                  autoPlay
                  muted
                  className="video-element"
                />
                <span>Вы</span>
              </div>
              
              {Object.keys(peers).map((peerId) => (
                <div key={peerId} className="video-wrapper">
                  <video
                    autoPlay
                    className="video-element"
                    ref={video => {
                      if (video && peers[peerId]?.stream) {
                        video.srcObject = peers[peerId].stream;
                      }
                    }}
                  />
                  <span>Участник {peerId.substring(0, 5)}</span>
                </div>
              ))}
            </div>
            
            <button onClick={leaveRoom} className="leave-button">
              Покинуть комнату
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
