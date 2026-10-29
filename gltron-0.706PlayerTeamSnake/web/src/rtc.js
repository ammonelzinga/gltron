import { open, seal } from './crypto.js';

const rtcConfiguration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

function completeIceGathering(peer) {
  if (peer.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise(resolve => {
    const handler = () => {
      if (peer.iceGatheringState === 'complete') {
        peer.removeEventListener('icegatheringstatechange', handler);
        resolve();
      }
    };
    peer.addEventListener('icegatheringstatechange', handler);
    setTimeout(resolve, 5000);
  });
}
function monitor(peer, onState) {
  const update = () => {
    const state = peer.connectionState;
    if (state === 'failed') onState?.(state, new Error('Direct connection failed. This network may require a TURN relay.'));
    else if (state === 'disconnected') onState?.(state, new Error('The connection to the host was interrupted.'));
    else onState?.(state);
  };
  peer.addEventListener('connectionstatechange', update);
  update();
}

export async function hostPeer({ store, code, guest, password, salt, canvas, signalKey = guest.id, onInput, onState }) {
  const peer = new RTCPeerConnection(rtcConfiguration);
  monitor(peer, onState);
  const stream = canvas.captureStream(30);
  stream.getTracks().forEach(track => peer.addTrack(track, stream));
  const channel = peer.createDataChannel('controls', { ordered: false, maxRetransmits: 0 });
  let resolveConnected;
  const connected = new Promise(resolve => { resolveConnected = resolve; setTimeout(() => resolve(false), 10000); });
  channel.onopen = () => { resolveConnected(true); onState?.('connected'); store.set(`signals/${code}/${signalKey}`, null).catch(() => {}); };
  channel.onmessage = event => {
    try { onInput(JSON.parse(event.data), guest); } catch { /* ignore malformed peer data */ }
  };
  await peer.setLocalDescription(await peer.createOffer());
  await completeIceGathering(peer);
  await store.set(`signals/${code}/${signalKey}`, { authUid: guest.authUid, hostUid: store.uid, offer: await seal(peer.localDescription.toJSON(), password, salt) });
  const stop = store.watch(`signals/${code}/${signalKey}/answer`, async envelope => {
    if (!envelope || peer.remoteDescription) return;
    try { await peer.setRemoteDescription(await open(envelope, password, salt)); } catch (error) { onState?.('failed', error); }
  });
  return { peer, channel, connected, close() { stop(); channel.close(); peer.close(); stream.getTracks().forEach(track => track.stop()); store.set(`signals/${code}/${signalKey}`, null).catch(() => {}); } };
}

export async function guestPeer({ store, code, guest, password, salt, video, signalKey = guest.id, onState }) {
  const peer = new RTCPeerConnection(rtcConfiguration);
  monitor(peer, onState);
  let channel;
  let connectionTimer;
  peer.ondatachannel = event => { channel = event.channel; channel.onopen = () => { clearTimeout(connectionTimer); onState?.('connected'); }; };
  peer.ontrack = event => { video.srcObject = event.streams[0]; video.play().catch(() => {}); };
  const stop = store.watch(`signals/${code}/${signalKey}/offer`, async envelope => {
    if (!envelope || peer.remoteDescription) return;
    try {
      await peer.setRemoteDescription(await open(envelope, password, salt));
      await peer.setLocalDescription(await peer.createAnswer());
      await completeIceGathering(peer);
      await store.set(`signals/${code}/${signalKey}/answer`, await seal(peer.localDescription.toJSON(), password, salt));
      connectionTimer = setTimeout(() => {
        if (!['connected', 'completed'].includes(peer.connectionState)) onState?.('failed', new Error('Could not reach the host directly. This network may require a TURN relay.'));
      }, 20000);
    } catch (error) { onState?.('failed', error); }
  });
  return {
    peer,
    send(message) { if (channel?.readyState === 'open') channel.send(JSON.stringify(message)); },
    close() { clearTimeout(connectionTimer); stop(); channel?.close(); peer.close(); }
  };
}
