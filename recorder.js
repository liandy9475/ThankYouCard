let mediaRecorder;
let recordedChunks = [];
let isRecording = false;

function setupRecorder() {
  const recordBtn = document.getElementById('recordBtn');
  
  // Force the initial text to be simple so you don't have to edit index.html
  if (recordBtn) {
    recordBtn.innerText = "Export";
  }
  
  recordBtn.addEventListener('click', () => {
    if (!isRecording) {
      startRecording();
      // Change to Stop and fill with a solid, light grey
      recordBtn.innerText = "Stop"; 
      recordBtn.style.backgroundColor = "#e0e0e0"; 
    } else {
      stopRecording();
      // Revert to Export and make transparent again
      recordBtn.innerText = "Export"; 
      recordBtn.style.backgroundColor = "transparent"; 
    }
  });
}

function startRecording() {
  recordedChunks = [];
  const canvas = document.getElementById('kineticCanvas');
  
  // 1. Match p5 frameRate exactly
  const videoStream = canvas.captureStream(60);
  
  const audioCtx = getAudioContext();
  const audioDest = audioCtx.createMediaStreamDestination();
  
  // Reroute playing audio into the recorder
  if (typeof track !== 'undefined' && track) {
      track.connect(audioDest);
  }

  // Combine visuals and audio
  const combinedStream = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...audioDest.stream.getAudioTracks()
  ]);

  // 2. Prioritize hardware-accelerated codecs
  const types = [
    'video/webm;codecs=h264',
    'video/webm;codecs=vp8',
    'video/webm'
  ];
  
  // LOWERED BITRATE: 20 Mbps is plenty for this art style and stops the encoder from dropping frames.
  let options = { videoBitsPerSecond: 20000000 }; 
  
  for (let type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      options.mimeType = type;
      break;
    }
  }

  try {
    mediaRecorder = new MediaRecorder(combinedStream, options);
  } catch (e) {
    console.warn("Preferred codecs not supported, falling back to browser default.");
    mediaRecorder = new MediaRecorder(combinedStream, { videoBitsPerSecond: 20000000 });
  }

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };

  mediaRecorder.onstop = () => {
    const actualMime = options.mimeType || 'video/webm';
    const blob = new Blob(recordedChunks, { type: actualMime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    
    const ext = actualMime.includes('mp4') ? 'mp4' : 'webm';
    a.download = `Metaball_Kinetic_Audio_HighRes.${ext}`;
    
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Start recording with a 250ms timeslice to prevent garbage collection frame drops.
  mediaRecorder.start(250);
  isRecording = true;

  // PLAYBACK AT NORMAL SPEED
  if (typeof track !== 'undefined' && track) {
      if (!track.isPlaying()) {
        track.play();
      }
      const playBtn = document.getElementById('playBtn');
      if(playBtn) playBtn.innerText = "Pause";
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  isRecording = false;
}

function captureFrame(canvasElt) {
    // Handled natively by MediaRecorder
}