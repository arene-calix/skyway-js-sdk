const Peer = window.Peer;
window.__SKYWAY_KEY__ = 'b93e6be4-9b4b-4e1f-bf9e-5b6347b358f0';

(async function main() {
  const localVideo = document.getElementById('js-local-stream');
  const localId = document.getElementById('js-local-id');
  const callTrigger = document.getElementById('js-call-trigger');
  const closeTrigger = document.getElementById('js-close-trigger');
  const remoteVideo = document.getElementById('js-remote-stream');
  const remoteId = document.getElementById('js-remote-id');
  const meta = document.getElementById('js-meta');
  const sdkSrc = document.querySelector('script[src*=skyway]');

  meta.innerText = `
    UA: ${navigator.userAgent}
    SDK: ${sdkSrc ? sdkSrc.src : 'unknown'}
  `.trim();

  const localStream = await navigator.mediaDevices
    .getUserMedia({
      audio: true,
      // video: true,
      video: { facingMode: 'user', width: 200, height: 150 }, // 液晶側のカメラ
      //video: { facingMode: 'environment', width: 200, height: 150 },
    })
    .catch(console.error);

  // Render local stream
  localVideo.srcObject = localStream;
  localVideo.muted = true; // 自分の音声を自分のスピーカーから聞こえなくする。相手には届く。
  localVideo.playsInline = true;
  localVideo.autoplay = true;

  const peer = (window.peer = new Peer({
    key: window.__SKYWAY_KEY__,
    debug: 2,
  }));

  // Register caller handler
  callTrigger.addEventListener('click', () => {
    // Note that you need to ensure the peer has connected to signaling server
    // before using methods of peer instance.
    if (!peer.open) {
      return;
    }

    const mediaConnection = peer.call(remoteId.value, localStream);

    mediaConnection.on('stream', async stream => {
      // Render remote stream for caller
      remoteVideo.srcObject = stream;
      remoteVideo.playsInline = true;
      // ※ここでgetTracks()すると取れない場合がある
      await remoteVideo.play().catch(console.error);
      //@@ iPhoneでremoteStream.getVideoTracks()がとれない場合がある現象の確認: START
      // ※ここでgetTracks()すると取れる
      console.log(`remoteStream.getTracks()↓`);
      console.dir(stream.getTracks());
      console.log(`remoteStream.getVideoTracks()↓`);
      console.dir(stream.getVideoTracks());
      console.log(`remoteStream.getVideoTracks()[0]↓`);
      console.dir(stream.getVideoTracks()[0]);
      //@@ iPhoneでremoteStream.getVideoTracks()がとれない場合がある現象の確認: END
    });

    mediaConnection.once('close', () => {
      remoteVideo.srcObject.getTracks().forEach(track => track.stop());
      remoteVideo.srcObject = null;
    });

    closeTrigger.addEventListener('click', () => mediaConnection.close(true));
  });

  peer.once('open', id => (localId.textContent = id));

  // Register callee handler
  peer.on('call', mediaConnection => {
    mediaConnection.answer(localStream);

    mediaConnection.on('stream', async stream => {
      // Render remote stream for callee
      remoteVideo.srcObject = stream;
      remoteVideo.playsInline = true;
      await remoteVideo.play().catch(console.error);
    });

    mediaConnection.once('close', () => {
      remoteVideo.srcObject.getTracks().forEach(track => track.stop());
      remoteVideo.srcObject = null;
    });

    closeTrigger.addEventListener('click', () => mediaConnection.close(true));
  });

  peer.on('error', console.error);

  // Mute
  const toggleCamera = document.getElementById('js-toggle-camera');
  const toggleMicrophone = document.getElementById('js-toggle-microphone');
  const cameraStatus = document.getElementById('camera-status');
  const microphoneStatus = document.getElementById('microphone-status');
  cameraStatus.textContent = 'カメラON';
  microphoneStatus.textContent = 'マイクON';

  toggleCamera.addEventListener('click', () => {
    console.log('toggleCamera');
    const videoTracks = localStream.getVideoTracks()[0];
    videoTracks.enabled = !videoTracks.enabled;
    cameraStatus.textContent = `カメラ${videoTracks.enabled ? 'ON' : 'OFF'}`;
  });

  toggleMicrophone.addEventListener('click', () => {
    console.log('toggleMicrophone');
    const audioTracks = localStream.getAudioTracks()[0];
    audioTracks.enabled = !audioTracks.enabled;
    microphoneStatus.textContent = `マイク${
      audioTracks.enabled ? 'ON' : 'OFF'
    }`;
  });
})();
