// camera.js: connects tracking.js to the two screens that use the webcam.
// - setup screen: turn on the camera and check that we can see the player's arm
// - compressions screen: live feedback while the player does compressions
//
// main.js calls the 4 functions at the bottom when the player enters or
// leaves one of these screens.

import { sfx } from "./sfx.js";
import { say, stopAudio, resetAudio, msSinceLastVoice, onVoiceChange } from "./audio.js";
import { initTracking, startTracking, stopTracking, stopCamera, setSensitivity, setGoodDepth, getDebugData } from "./tracking.js";

// Same target as in tracking.js: 100 to 120 compressions per minute
const TARGET_MIN = 100;
const TARGET_MAX = 120;

// ============================================================
// PAGE ELEMENTS
// ============================================================
const cameraBox = document.getElementById("camera-box");
const video = document.getElementById("camera-video");
const canvas = document.getElementById("camera-canvas");

// Setup screen
const cameraButton = document.getElementById("camera-button");
const setupContinue = document.getElementById("setup-continue"); // locked until the camera works
const setupStatus = document.getElementById("setup-status");
const setupArm = document.getElementById("setup-arm");
const setupCount = document.getElementById("setup-count");
const setupRate = document.getElementById("setup-rate");
const setupDepth = document.getElementById("setup-depth");

// Debug panel (setup screen)
const debugPanel = document.getElementById("debug-panel");
const debugCanvas = document.getElementById("debug-canvas");
const debugContext = debugCanvas.getContext("2d");
const debugInfo = document.getElementById("debug-info");
const debugSlider = document.getElementById("debug-slider");
const debugSliderValue = document.getElementById("debug-slider-value");
const depthSlider = document.getElementById("depth-slider");
const depthSliderValue = document.getElementById("depth-slider-value");

// Compressions screen
const liveRate = document.getElementById("live-rate");
const liveFeedback = document.getElementById("live-feedback");
const liveCount = document.getElementById("live-count");
const livePauses = document.getElementById("live-pauses");
const liveArms = document.getElementById("live-arms");
const liveDepth = document.getElementById("live-depth");
const liveDepthReminder = document.getElementById("live-depth-reminder");
const livePanda = document.getElementById("live-panda");

// ============================================================
// STATE OF THIS FILE
// ============================================================
let cameraReady = false;     // true once initTracking has finished
let cameraLoading = false;   // true while initTracking is working
let isCounting = false;      // true between startTracking and stopTracking
let currentScreen = "";      // "setup", "compressions" or "" (another screen)
let compressionCount = 0;
let pauseCount = 0;
// Voice state (compressions screen), so a line plays when something CHANGES
const ENCOURAGE_EVERY = 15;   // seconds of good work between two encouragements
const REPEAT_RATE_WARNING = 10; // seconds before "Faster!" or "Slower" is said again
let rateState = null;         // "slow", "fast", "ok" or null (not known yet)
let lastRateWarning = 0;      // performance.now() of the last "Faster!"/"Slower"
let tooShallowNow = false;
let armsBent = false;
let armVisible = true;
let lastCompressionTime = 0;  // performance.now()
let encouragementTimer = null;
let encouragementIndex = 0;
const ENCOURAGEMENTS = ["You're doing great!", "Amazing, keep going!", "You're keeping them alive!"];
let wasTooShallow = false; // true after a "Push deeper!", so we can say "That's the right depth!"

// ============================================================
// TURNING ON THE CAMERA (setup screen)
// ============================================================
cameraButton.addEventListener("click", turnOnCamera);

async function turnOnCamera() {
  if (cameraReady || cameraLoading) {
    return;
  }
  cameraLoading = true;
  cameraButton.disabled = true;
  setupStatus.textContent = "Loading the pose model and the camera… (allow camera access if the browser asks)";

  try {
    await initTracking(video, canvas);
  } catch (error) {
    // Most common reasons: the player refused the camera, or there is no internet
    console.error(error);
    setupStatus.textContent = "The camera could not start: " + error.message;
    cameraLoading = false;
    cameraButton.disabled = false;
    return;
  }

  cameraLoading = false;
  cameraReady = true;
  cameraButton.textContent = "Camera is on";
  setupContinue.disabled = false;
  setupStatus.textContent = "Camera ready. Kneel beside your cushion, with your side to the camera, and try a few compressions.";

  // The player may have moved to another screen while the model was loading
  if (currentScreen === "setup") {
    startSetupCheck();
  }
  if (currentScreen === "compressions") {
    startLiveFeedback(gameForCompressions);
  }
}

// ============================================================
// SETUP SCREEN: check that the arm is visible and compressions are counted
// ============================================================
function startSetupCheck() {
  compressionCount = 0;
  setupCount.textContent = "0";
  setupRate.textContent = "–";
  setupArm.textContent = "Looking for your arm…";
  setupArm.className = "";
  setupDepth.textContent = "";
  setupDepth.className = "";

  startTracking({
    onArmDetected: function (isDetected) {
      if (isDetected) {
        setupArm.textContent = "I can see your arm.";
        setupArm.className = "good";
      } else {
        setupArm.textContent = "I can't see your arm. Turn your side to the camera.";
        setupArm.className = "warn";
      }
    },
    onCompression: function () {
      sfx("thump");
      compressionCount = compressionCount + 1;
      setupCount.textContent = compressionCount;
    },
    // The rate appears from the 3rd compression (it needs 2 gaps between pushes)
    onRate: function (rate) {
      setupRate.textContent = Math.round(rate);
    },
    // When the player stops, the old rate is no longer true: hide it
    onPause: function () {
      setupRate.textContent = "–";
    },
    // The depth appears after a few pushes
    onDepth: function (isDeepEnough) {
      if (isDeepEnough) {
        setupDepth.textContent = "Depth: good";
        setupDepth.className = "good";
      } else {
        setupDepth.textContent = "Depth: push deeper";
        setupDepth.className = "bad";
      }
    },
  });
  isCounting = true;
}

// ============================================================
// DEBUG PANEL: the arm height wave, like in the prototype
// ============================================================
// Blue line = arm height. Green dot = a counted compression.
// Grey bar on the left = the minimum dip needed to count one.
//   If the dips are smaller than the grey bar, lower "Min. movement".
//   If dots appear while you are still, raise it.
// Orange bar = the dip needed to be "deep enough".
//   Push at a depth you know is right (about 5 cm into the cushion)
//   and move "Good depth" until your dips just reach the orange bar.
debugSlider.addEventListener("input", function () {
  const value = parseFloat(debugSlider.value);
  setSensitivity(value);
  debugSliderValue.textContent = value.toFixed(2);
});

depthSlider.addEventListener("input", function () {
  const value = parseFloat(depthSlider.value);
  setGoodDepth(value);
  depthSliderValue.textContent = value.toFixed(2);
});

function drawDebugLoop() {
  if (currentScreen !== "setup") {
    return; // stop drawing when we leave the setup screen
  }
  if (debugPanel.open && cameraReady) {
    drawDebugGraph(getDebugData());
  }
  requestAnimationFrame(drawDebugLoop);
}

function drawDebugGraph(data) {
  const width = debugCanvas.width;
  const height = debugCanvas.height;
  debugContext.clearRect(0, 0, width, height);
  let info = "Camera: " + data.fps + " images per second (below 15, counting gets harder).";
  if (data.lastDepth !== null) {
    info = info + " Last push: " + data.lastDepth.toFixed(2) + " forearm (good: " + data.minGoodDepth.toFixed(2) + " or more).";
  }
  debugInfo.textContent = info;

  const history = data.history;
  if (history.length < 2) {
    return;
  }

  // Vertical scale: from the lowest to the highest value of the last 5 s.
  // The range is at least 2 thresholds (so camera jitter doesn't fill the whole graph)
  // and a bit more than the good depth (so the orange bar fits).
  let lowest = Infinity;
  let highest = -Infinity;
  for (const point of history) {
    lowest = Math.min(lowest, point.height);
    highest = Math.max(highest, point.height);
  }
  const range = Math.max(highest - lowest, 2 * data.threshold, 1.2 * data.goodDepth, 0.001);
  const lastTime = history[history.length - 1].time;

  function toX(time) {
    return width - ((lastTime - time) / 5) * width;
  }
  function toY(value) {
    return height - 10 - ((value - lowest) / range) * (height - 20);
  }

  // Grey bar: the size of the minimum dip
  const barHeight = (data.threshold / range) * (height - 20);
  debugContext.fillStyle = "#c8c8c8";
  debugContext.fillRect(4, height - 10 - barHeight, 8, barHeight);

  // Orange bar: the size of a deep enough dip
  const goodBarHeight = (data.goodDepth / range) * (height - 20);
  debugContext.fillStyle = "#e08a1e";
  debugContext.fillRect(16, height - 10 - goodBarHeight, 8, goodBarHeight);

  // Blue line: the arm height
  debugContext.strokeStyle = "#2f6fdb";
  debugContext.lineWidth = 2;
  debugContext.beginPath();
  for (let i = 0; i < history.length; i++) {
    const point = history[i];
    if (i === 0) {
      debugContext.moveTo(toX(point.time), toY(point.height));
    } else {
      debugContext.lineTo(toX(point.time), toY(point.height));
    }
  }
  debugContext.stroke();

  // Green dots: counted compressions
  debugContext.fillStyle = "#2e7d32";
  for (const point of history) {
    if (point.compression) {
      debugContext.beginPath();
      debugContext.arc(toX(point.time), toY(point.height), 5, 0, Math.PI * 2);
      debugContext.fill();
    }
  }
}

// ============================================================
// COMPRESSIONS SCREEN: live feedback
// ============================================================
// The game object of main.js, kept while the compressions screen is open
let gameForCompressions = null;

function startLiveFeedback(game) {
  compressionCount = 0;
  pauseCount = 0;
  liveCount.textContent = "0";
  livePauses.textContent = "0";
  liveRate.textContent = "–";
  liveArms.textContent = "–";
  liveArms.className = "";
  liveDepth.textContent = "–";
  liveDepth.className = "";
  liveDepthReminder.textContent = "";
  updatePanda();
  wasTooShallow = false;
  rateState = null;
  tooShallowNow = false;
  armsBent = false;
  armVisible = true;
  lastCompressionTime = 0;
  encouragementIndex = 0;
  resetAudio();
  say("start-compressions", { force: true });
  startEncouragement();
  showFeedback("Place your hands in the center of the chest and push hard and fast!", "");

  startTracking({
    onCompression: function (time) {
      pressVictimChest();
      sfx("thump");
      lastCompressionTime = performance.now();
      compressionCount = compressionCount + 1;
      liveCount.textContent = compressionCount;
      // Remember when the very first compression happened (used for the score)
      if (game.firstCompressionTime === null) {
        game.firstCompressionTime = time;
      }
    },
    onRate: function (rate) {
      liveRate.textContent = Math.round(rate);
      let newState = "ok";
      if (rate < TARGET_MIN) {
        newState = "slow";
        showFeedback("Faster!", "warn");
      } else if (rate > TARGET_MAX) {
        newState = "fast";
        showFeedback("A bit slower.", "warn");
      } else {
        showFeedback("Good rhythm, keep it up!", "good");
      }
      // Voice: when the state changes, or the problem lasts
      const now = performance.now();
      const stillWrong = newState !== "ok" && now - lastRateWarning > REPEAT_RATE_WARNING * 1000;
      if (newState !== rateState || stillWrong) {
        if (newState === "slow") {
          if (say("faster")) { lastRateWarning = now; }
        } else if (newState === "fast") {
          if (say("slower")) { lastRateWarning = now; }
        } else if (rateState === "slow" || rateState === "fast") {
          say("good-rhythm");
        }
        rateState = newState;
      }
    },
    onPause: function () {
      liveRate.textContent = "–"; // the old rate is no longer true
      pauseCount = pauseCount + 1;
      livePauses.textContent = pauseCount;
      showFeedback("Don't stop, keep going!", "bad");
      rateState = null; // the old rhythm is no longer true
      say("keep-going");
    },
    onArmStatus: function (isStraight) {
      if (isStraight) {
        liveArms.textContent = "Straight";
        liveArms.className = "good";
        armsBent = false;
      } else {
        armsBent = true;
        say("straighten-arms");
        liveArms.textContent = "Bent";
        liveArms.className = "warn";
        showFeedback("Keep your arms straight.", "warn");
      }
    },
    onArmDetected: function (isDetected) {
      armVisible = isDetected;
      if (!isDetected) {
        showFeedback("I can't see your arms. Turn your side to the camera.", "warn");
        say("cant-see-arm");
      }
    },
    // Separate line from the rhythm feedback, so "Push deeper!" stays
    // visible even when the rhythm is good
    onDepth: function (isDeepEnough) {
      if (isDeepEnough) {
        liveDepth.textContent = "Good";
        liveDepth.className = "good";
        // Praise only right after a "Push deeper!"
        liveDepthReminder.textContent = wasTooShallow ? "That's the right depth!" : "";
        liveDepthReminder.className = "good";
        updatePanda();
        if (wasTooShallow) {
          say("good-depth");
        }
        wasTooShallow = false;
        tooShallowNow = false;
      } else {
        wasTooShallow = true;
        tooShallowNow = true;
        say("push-deeper");
        liveDepthReminder.className = "bad";
        liveDepth.textContent = "Too shallow";
        liveDepth.className = "warn";
        liveDepthReminder.textContent = "Push deeper!";
        updatePanda();
      }
    },
  });
  isCounting = true;
}

// Every ENCOURAGE_EVERY seconds without any voice line, if the player is
// doing everything right, one of the 3 "doing great" lines (in turn)
function startEncouragement() {
  stopEncouragement();
  encouragementTimer = setInterval(function () {
    const compressingNow = performance.now() - lastCompressionTime < 2000;
    const allGood = rateState === "ok" && !tooShallowNow && !armsBent && armVisible;
    if (compressingNow && allGood && msSinceLastVoice() > ENCOURAGE_EVERY * 1000) {
      const line = ENCOURAGEMENTS[encouragementIndex];
      if (say("doing-great-" + (encouragementIndex + 1))) {
        // the panda says it, so the bubble shows it too
        showFeedback(line, "good");
      }
      encouragementIndex = (encouragementIndex + 1) % 3;
    }
  }, 1000);
}

function stopEncouragement() {
  clearInterval(encouragementTimer);
  encouragementTimer = null;
}

// The chest of the man in the drawing goes down for one compression,
// then back up after 150 milliseconds (see .press in style.css)
const victimScene = document.getElementById("victim-scene");

function pressVictimChest() {
  victimScene.classList.add("press");
  setTimeout(function () {
    victimScene.classList.remove("press");
  }, 150);
}

// colorClass is "good", "warn", "bad" or "" (see style.css)
function showFeedback(text, colorClass) {
  liveFeedback.textContent = text;
  liveFeedback.className = colorClass;
  updatePanda();
}

// The panda on the compressions screen makes a face that matches the
// worst message shown: "Push deeper!" or a red feedback = shocked, etc.
const PANDA_FACES = {
  bad: "06-shocked.png",
  warn: "10-nervous.png",
  good: "13-proud.png",
  "": "05-cool.png",
};

// While a voice line plays, the panda "talks": it bobs and its bubble lights up
// (the .speaking class, see style.css). It stops when the line ends.
onVoiceChange(function (isTalking) {
  livePanda.classList.toggle("speaking", isTalking);
  const bubble = livePanda.parentElement.querySelector(".live-bubble");
  bubble.classList.toggle("speaking", isTalking);
});

function updatePanda() {
  let mood = liveFeedback.className;
  if (liveDepthReminder.textContent !== "" && liveDepthReminder.className === "bad") {
    mood = "bad";
  }
  const file = PANDA_FACES[mood] || PANDA_FACES[""];
  const src = "assets/mascot-stickers/" + file;
  if (!livePanda.src.endsWith(src)) {
    livePanda.src = src;
    // a little hop each time the panda changes its face
    livePanda.classList.remove("talk");
    void livePanda.offsetWidth;
    livePanda.classList.add("talk");
  }
}

// ============================================================
// CALLED BY main.js WHEN THE PLAYER ENTERS OR LEAVES A CAMERA SCREEN
// ============================================================
// End of the game: turn the camera off and put the setup screen back
// to its first state, ready for the next game.
export function turnOffCamera() {
  if (!cameraReady) {
    return;
  }
  stopCamera();
  cameraReady = false;
  isCounting = false;
  cameraButton.disabled = false;
  cameraButton.textContent = "Turn on the camera";
  setupContinue.disabled = true;
  setupStatus.textContent = "Put the camera to your side, so it sees you and the cushion. Then turn it on.";
}

// True once the camera and the pose model are working.
// The game flow uses it to skip the setup screen when the player plays again.
export function isCameraReady() {
  return cameraReady;
}

export function enterSetupScreen() {
  currentScreen = "setup";
  cameraBox.classList.add("visible");
  if (cameraReady) {
    startSetupCheck();
  }
  requestAnimationFrame(drawDebugLoop);
}

export function leaveSetupScreen() {
  currentScreen = "";
  cameraBox.classList.remove("visible");
  if (isCounting) {
    stopTracking(); // the test compressions are not kept
    isCounting = false;
  }
}

export function enterCompressionsScreen(game) {
  currentScreen = "compressions";
  gameForCompressions = game;
  cameraBox.classList.add("visible");
  if (cameraReady) {
    startLiveFeedback(game);
  } else {
    showFeedback("The camera is not on. Go back to the setup screen first.", "bad");
  }
}

// Stops the tracking and saves the statistics in game.compressionStats
export function leaveCompressionsScreen(game) {
  currentScreen = "";
  cameraBox.classList.remove("visible");
  stopEncouragement();
  stopAudio();
  if (isCounting) {
    game.compressionStats = stopTracking();
    isCounting = false;
  }
}
