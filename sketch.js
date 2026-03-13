// --- OPTIMIZED PARAMETER CACHE ---
let params = {
  textStr: "Thank You",
  textMode: "outline",
  bgColor: [1, 1, 1],
  colorCore: [1, 0, 0], 
  colorMid: [0.88, 0.24, 0.74], 
  colorDark: [0.82, 0.82, 0.82], 
  meltAmount: 12,
  outlineThickness: 0.9,
  zoom: 4.6,
  lensStrength: -0.6,
  
  // Base values kept lower for headroom
  vfWght: 200, 
  vfWdth: 50,  
  
  cols: 9,
  rows: 13,
  animSpeed: 0.1,
  freqX: 0.09,
  freqY: 0.89
};

function setupSlider(id, paramKey, isFloat = true) {
  const slider = document.getElementById(id);
  const label = document.getElementById(id + 'Val');
  if (!slider) return;
  
  slider.value = params[paramKey];
  label.innerText = params[paramKey];
  
  slider.addEventListener('input', () => { 
    label.innerText = slider.value; 
    params[paramKey] = isFloat ? parseFloat(slider.value) : parseInt(slider.value);
  });
}

function setupColor(id, paramKey) {
  const input = document.getElementById(id);
  if (!input) return;
  input.addEventListener('input', () => {
    params[paramKey] = hexToRgbNormalized(input.value);
  });
}

// --- UI & WebGL Variables ---
let fontBlobUrl = null;
let isFontLoaded = false;
let currentFontFamily = 'RobotoFlex_Base';

// Font Caching System
let fontCache = {};
let dynamicStyleSheet;

let theShader, textBuffer;
let mainCanvas; 
const scaleRes = 1.5;

// --- AUDIO VARIABLES ---
let track;
let fft;
let amplitude;
let energy = {};
const bassEmphasis = 0.55;

const bands = {
  "bass": [20 * bassEmphasis, 140 * bassEmphasis],
  "lowMid": [140 * bassEmphasis, 400],
  "mid": [400, 2600],
  "highMid": [2600, 5200],
  "treble": [5200, 14000]
};

const energyThresholds = {
  bass: 120, lowMid: 120, mid: 120, highMid: 120, treble: 120
};

// --- SHADERS ---
const vertSource = `
  attribute vec3 aPosition;
  attribute vec2 aTexCoord;
  varying vec2 vTexCoord;
  void main() {
    vTexCoord = aTexCoord;
    vec4 positionVec4 = vec4(aPosition, 1.0);
    positionVec4.xy = positionVec4.xy * 2.0 - 1.0;
    gl_Position = positionVec4;
  }
`;

const fragSource = `
  precision mediump float;
  varying vec2 vTexCoord;
  uniform sampler2D u_text_map;
  uniform float u_time;
  uniform vec2 u_resolution;
  uniform vec3 u_bgColor;
  uniform vec3 u_colorDark;
  uniform vec3 u_colorMid;
  uniform vec3 u_colorCore;
  uniform float u_meltAmount;
  uniform float u_lensStrength;

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1; i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m; m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
    vec2 uv = vec2(vTexCoord.x, 1.0 - vTexCoord.y);
    vec2 centerP = uv * 2.0 - 1.0; 
    float r = dot(centerP, centerP); 
    float f = 1.0 + r * u_lensStrength; 
    uv = (centerP * f) * 0.5 + 0.5; 

    float rawText = texture2D(u_text_map, uv).r;
    float blurText = 0.0;
    vec2 off = vec2(u_meltAmount) / u_resolution; 
    
    // OPTIMIZED 5-TAP BLUR 
    blurText += texture2D(u_text_map, uv).r;
    blurText += texture2D(u_text_map, uv + vec2(off.x, 0.0)).r;
    blurText += texture2D(u_text_map, uv + vec2(-off.x, 0.0)).r;
    blurText += texture2D(u_text_map, uv + vec2(0.0, off.y)).r;
    blurText += texture2D(u_text_map, uv + vec2(0.0, -off.y)).r;
    blurText /= 5.0; 
    
    float heatNoise = snoise(uv * 4.0 - vec2(0.0, u_time * 0.7));
    float flameDensity = (blurText * 1.3) + (heatNoise * 0.35);

    vec3 finalColor = u_bgColor; 
    if(flameDensity > 0.45) {
      float depth = smoothstep(0.45, 1.0, flameDensity);
      if (depth < 0.4) finalColor = mix(u_colorDark, u_colorMid, depth / 0.4);
      else if (depth < 0.8) finalColor = mix(u_colorMid, u_colorCore, (depth - 0.4) / 0.4);
      else finalColor = u_colorCore;
    }
    
    finalColor = mix(finalColor, u_bgColor, rawText);
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

// --- NEW: PRELOAD AUDIO SO IT'S READY IMMEDIATELY ---
function preload() {
  track = loadSound('resources/1_Jamburana.mp3');
}

function setup() {
  frameRate(60); 

  let canvasWidth = 1080 * scaleRes; 
  let canvasHeight = 1350 * scaleRes;
  
  mainCanvas = createCanvas(canvasWidth, canvasHeight, WEBGL);
  pixelDensity(1);
  mainCanvas.parent('canvas-container');
  mainCanvas.id('kineticCanvas'); 
  
  textBuffer = createGraphics(canvasWidth, canvasHeight);
  textBuffer.pixelDensity(1);
  textBuffer.textAlign(CENTER, CENTER);
  theShader = createShader(vertSource, fragSource);

  let styleTag = document.createElement("style");
  document.head.appendChild(styleTag);
  dynamicStyleSheet = styleTag.sheet;

  // --- AUDIO SETUP ---
  fft = new p5.FFT(0.8, 1024);
  amplitude = new p5.Amplitude();

  const audioUpload = document.getElementById('audioUpload');
  const playBtn = document.getElementById('playBtn');
  const recordBtn = document.getElementById('recordBtn');

  // --- PLAY AUDIO ON START ---
  track.play();
  
  if (playBtn) {
    playBtn.disabled = false;
    if (track.isPlaying()) {
      playBtn.innerText = "Pause";
    } else {
      playBtn.innerText = "Play";
    }
  }

  if (audioUpload) {
    audioUpload.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (file) {
        if (track) track.stop();
        track = loadSound(URL.createObjectURL(file), () => {
          playBtn.disabled = false;
          playBtn.innerText = "Play";
        });
      }
    });
  }

  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (!track) return;
      if (track.isPlaying()) {
        track.pause();
        playBtn.innerText = "Play";
      } else {
        track.play();
        playBtn.innerText = "Pause";
      }
    });
  }

  // REWIND ON RECORD
  if (recordBtn) {
    recordBtn.addEventListener('click', () => {
      if (track) {
        track.jump(0); 
        if (!track.isPlaying()) {
          track.play();
          if (playBtn) playBtn.innerText = "Pause";
        }
      }
    });
  }

  // --- BIND HTML TO PARAMS OBJECT ---
  const textInput = document.getElementById('textStr');
  if (textInput) textInput.addEventListener('input', () => { params.textStr = textInput.value; });
  
  const textModeSelect = document.getElementById('textMode');
  if (textModeSelect) textModeSelect.addEventListener('change', () => { params.textMode = textModeSelect.value; });

  setupColor('bgColor', 'bgColor');
  setupColor('colorCore', 'colorCore');
  setupColor('colorMid', 'colorMid');
  setupColor('colorDark', 'colorDark');

  setupSlider('meltAmount', 'meltAmount');
  setupSlider('outlineThickness', 'outlineThickness');
  setupSlider('zoom', 'zoom');
  setupSlider('lensStrength', 'lensStrength');
  setupSlider('vfWght', 'vfWght');
  setupSlider('vfWdth', 'vfWdth');
  setupSlider('cols', 'cols', false);
  setupSlider('rows', 'rows', false);
  setupSlider('animSpeed', 'animSpeed');
  setupSlider('freqX', 'freqX');
  setupSlider('freqY', 'freqY');

  if (typeof setupRecorder === 'function') setupRecorder();

  fetch('resources/RobotoFlex.ttf').then(r => r.blob()).then(blob => {
    fontBlobUrl = URL.createObjectURL(blob);
    isFontLoaded = true;
    preloadFontGrid(); 
  }).catch(err => console.error("Error loading font:", err));
}

function preloadFontGrid() {
  if (!isFontLoaded) return;
  for (let wght = 100; wght <= 1000; wght += 40) {
    for (let wdth = 20; wdth <= 160; wdth += 10) {
      let fontKey = `Roboto_${wght}_${wdth}`;
      let rule = `@font-face { font-family: '${fontKey}'; src: url('${fontBlobUrl}'); font-variation-settings: "wght" ${wght}, "wdth" ${wdth}; }`;
      dynamicStyleSheet.insertRule(rule, dynamicStyleSheet.cssRules.length);
      fontCache[fontKey] = true;
    }
  }
}

function getActiveFont(audioWghtBoost = 0, audioWdthBoost = 0) {
  if (!isFontLoaded) return 'sans-serif';

  let wght = Math.round(constrain(params.vfWght + audioWghtBoost, 100, 1000) / 40) * 40;
  let wdth = Math.round(constrain(params.vfWdth + audioWdthBoost, 20, 160) / 10) * 10;
  let fontKey = `Roboto_${wght}_${wdth}`;

  if (!fontCache[fontKey]) {
    return fontCache['Roboto_420_100'] ? 'Roboto_420_100' : 'sans-serif'; 
  }

  return fontKey;
}

function updateAudioData() {
  fft.analyze();
  for (let band in bands) {
    energy[band] = fft.getEnergy(bands[band][0], bands[band][1]);
  }
}

function analyzeEnergyBassVal() {
  let bass = energy.bass > energyThresholds.bass ? energy.bass : 0;
  return bass === 0 ? 0 : map(bass, energyThresholds.bass, 255, 0, 100);
}

function analyzeEnergyMidVal() {
  let mid = energy.mid > energyThresholds.mid ? energy.mid : 0;
  return mid === 0 ? 0 : map(mid, energyThresholds.mid, 255, 0, 100);
}

// In case autoplay is blocked, waking up the audio context on click guarantees it starts
function touchStarted() {
  if (getAudioContext().state !== 'running') {
    getAudioContext().resume();
  }
}

function draw() {
  let audioWghtBoost = 0;
  let audioWdthBoost = 0;
  let audioSizeBoost = 0;

  let timeSecs = millis() / 1000.0;

  if (track && track.isPlaying()) {
    updateAudioData();
    let dynamicBass = analyzeEnergyBassVal(); 
    let dynamicMid = analyzeEnergyMidVal();   

    let bassFactor = dynamicBass / 100.0;
    let midFactor = dynamicMid / 100.0;

    audioWghtBoost = Math.pow(bassFactor, 1.5) * 500; 
    audioWdthBoost = Math.pow(midFactor, 1.5) * 75;   
    audioSizeBoost = Math.pow(bassFactor, 1.5) * 0.75; 
  }

  currentFontFamily = getActiveFont(audioWghtBoost, audioWdthBoost);
  let animTime = timeSecs * (params.animSpeed * 20.0); 
  
  textBuffer.push();
  textBuffer.background(0); 
  
  textBuffer.translate(textBuffer.width / 2, textBuffer.height / 2);
  textBuffer.scale(params.zoom);
  textBuffer.translate(-textBuffer.width / 2, -textBuffer.height / 2);

  textBuffer.textFont(`'${currentFontFamily}', sans-serif`);
  textBuffer.textSize(24 * scaleRes);

  if (params.textMode === 'outline') {
    textBuffer.noFill();
    textBuffer.stroke(255);
    let baseThickness = Math.max(0.1, params.outlineThickness * 2);
    textBuffer.strokeWeight(baseThickness * scaleRes); 
  } else {
    textBuffer.fill(255);
    textBuffer.noStroke();
  }

  let words = params.textStr.split(' ').filter(w => w.length > 0);
  if (words.length === 0) words = [""]; 

  let spaceX = 22 * scaleRes;
  let spaceY = 20 * scaleRes; 

  let startX = textBuffer.width / 2 - ((params.cols - 1) * spaceX) / 2;
  let startY = textBuffer.height / 2 - ((params.rows - 1) * spaceY) / 2;

  const totalCols = params.cols;
  const fX = params.freqX;
  const fY = params.freqY;

  for (let j = 0; j < params.rows; j++) {
    let currentWord = words[j % words.length];
    let wordLen = currentWord.length;
    let startCol = Math.floor((totalCols - wordLen) / 2);
    let rowOffsetY = startY + (j * spaceY);

    for (let i = 0; i < totalCols; i++) {
      let charIndex = i - startCol;
      
      if (charIndex >= 0 && charIndex < wordLen) {
        let wave = sin((i * fX) + (j * fY) + animTime);
        let scaleX = map(wave, -1, 1, 0.2, 1.5) + audioSizeBoost;
        let scaleY = 1.0 + (audioSizeBoost * 0.5); 
        
        textBuffer.push();
        textBuffer.translate(startX + (i * spaceX), rowOffsetY); 
        textBuffer.scale(scaleX, scaleY); 
        textBuffer.text(currentWord.charAt(charIndex), 0, 0); 
        textBuffer.pop();
      }
    }
  }
  textBuffer.pop();

  // Draw Shader
  shader(theShader);
  theShader.setUniform('u_resolution', [width, height]);
  theShader.setUniform('u_text_map', textBuffer);
  theShader.setUniform('u_time', timeSecs);
  theShader.setUniform('u_bgColor', params.bgColor);
  theShader.setUniform('u_colorCore', params.colorCore);
  theShader.setUniform('u_colorMid', params.colorMid);
  theShader.setUniform('u_colorDark', params.colorDark);
  theShader.setUniform('u_lensStrength', params.lensStrength);
  theShader.setUniform('u_meltAmount', params.meltAmount * scaleRes);
  
  rect(-width / 2, -height / 2, width, height);
}

function hexToRgbNormalized(hex) {
  return [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
}