// tracking.js: watches the player through the webcam and counts compressions.
// This is the ONLY file that uses MediaPipe.
//
// How to use it from another file:
//   await initTracking(videoElement, canvasElement);   // once
//   startTracking({ onCompression, onRate, onPause, onArmStatus, onArmDetected });
//   const stats = stopTracking();
//
// Two extra functions for the debug panel (to tune the tracking):
//   setSensitivity(value)   changes minMovement while the game runs
//   setGoodDepth(value)     changes minGoodDepth while the game runs
//   getDebugData()          the last 5 seconds of the signal, for a graph

import { PoseLandmarker, FilesetResolver, DrawingUtils }
  from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3";

// ============================================================
// 1. SETTINGS (the numbers you can tune)
// ============================================================
const TARGET_MIN = 100;          // guideline: 100 to 120 compressions per minute
const TARGET_MAX = 120;
const MIN_INTERVAL = 0.3;        // seconds: two compressions can't be closer than this
const PAUSE_AFTER = 2.0;         // seconds without a compression = a pause
const SMOOTHING = 0.5;           // 0 = very smooth (slow), 1 = no smoothing (jittery). Value for 30 images per second.
const STRAIGHT_ARM_ANGLE = 160;  // degrees: above this, the arm counts as straight
let minMovement = 0.07;          // how deep a dip must be, as a fraction of forearm length
                                 // (lower = counts smaller pushes, but also camera jitter)
let minGoodDepth = 0.15;         // how deep a push must be to count as "deep enough", in forearm lengths.
                                 // Guideline for adults: 5 to 6 cm. An adult forearm is about 25 cm,
                                 // so 5 cm is about 0.2 forearm. We use less (0.15, about 4 cm) so that
                                 // normal pushes on a cushion are not flagged as too shallow.
                                 // A webcam can only ESTIMATE this: check it with the debug panel.
const DEPTH_WINDOW = 3;          // judge the depth on the last 3 pushes, so one bad push doesn't flash a warning
const MIN_VISIBILITY = 0.6;      // only trust arm points the model is confident about (0 to 1)
const MAX_JUMP = 0.8;            // a wrist can't move more than 0.8 forearm in one frame
const MAX_GLITCH_FRAMES = 10;    // after this many "jump" frames, the person really moved

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

// MediaPipe body point numbers
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_ELBOW = 13;
const RIGHT_ELBOW = 14;
const LEFT_WRIST = 15;
const RIGHT_WRIST = 16;

// ============================================================
// 2. STATE OF THIS FILE
// ============================================================
// Camera and model (filled by initTracking)
let video = null;
let canvas = null;
let canvasContext = null;
let poseLandmarker = null;
let drawingUtils = null;
let lastVideoTime = -1;
let cameraStream = null;        // the webcam, so we can turn it off at the end
let animationFrameId = null;    // the next loop() call, so we can cancel it

// Are we counting compressions right now? (between startTracking and stopTracking)
let isTracking = false;
let callbacks = {};

// Signal: the arm height wave
let smoothedHeight = null;      // smoothed arm height
let forearmLength = null;       // smoothed forearm length (our ruler)
let glitchFrames = 0;           // how many frames in a row looked like a glitch
let direction = "down";         // are we pushing down or coming back up?
let lowestPoint = Infinity;     // lowest height reached during this push
let highestPoint = -Infinity;   // highest height reached while coming back up
let lowestTime = 0;             // when the lowest point happened
let lastFrameTime = null;       // when the previous image was analysed (for the smoothing)

// Results of the session
let compressionTimes = [];      // time of each compression (seconds)
let pushDepths = [];            // depth of each compression (in forearm lengths)
let deepPushCount = 0;          // compressions that were deep enough
let inRangeCount = 0;           // compressions done at a good rate
let pauseCount = 0;
let inPause = false;
let straightFrames = 0;         // frames where the arm was straight
let armFrames = 0;              // frames where we could see the arm

// Debug panel data
let debugHistory = [];          // last 5 seconds: { time, height, compression }
let frameTimes = [];            // times of the frames in the last second (to compute fps)

// Last values sent to the callbacks (so we only call them when something changes)
let lastArmDetected = null;
let lastArmStraight = null;
let lastDeepEnough = null;

// ============================================================
// 3. THE INTERFACE (the 3 functions other files can use)
// ============================================================

// Loads the pose model and turns on the camera.
// Returns a Promise: it finishes when the camera image is ready.
// After this, the skeleton is drawn on the canvas until stopCamera().
// It can be called again after stopCamera(): the model is only loaded once.
export async function initTracking(videoElement, canvasElement) {
  video = videoElement;
  canvas = canvasElement;
  canvasContext = canvas.getContext("2d");

  // Load the pose model (only the first time: it is slow)
  if (poseLandmarker === null) {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numPoses: 1,
    });
  }

  // Turn on the camera (the browser asks the player for permission)
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480 },
  });
  cameraStream = stream;
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await new Promise(function (resolve) {
    video.onloadedmetadata = resolve;
  });
  await video.play();

  // The canvas must have the same size as the video so the skeleton lines up
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  drawingUtils = new DrawingUtils(canvasContext);

  lastVideoTime = -1;
  animationFrameId = requestAnimationFrame(loop);
}

// Turns the camera off (the webcam light goes off) and stops the loop.
// Call it at the end of the game. initTracking() turns it on again.
export function stopCamera() {
  isTracking = false;
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  if (cameraStream !== null) {
    for (const track of cameraStream.getTracks()) {
      track.stop();
    }
    cameraStream = null;
  }
  if (video !== null) {
    video.srcObject = null;
  }
  if (canvasContext !== null) {
    canvasContext.clearRect(0, 0, canvas.width, canvas.height);
  }
}

// Starts counting compressions. All callbacks are optional:
//   onCompression(time)       each compression. time is in seconds (performance.now() / 1000)
//   onRate(rate)              new rate in compressions per minute (from the 3rd compression)
//   onPause()                 once, each time the player stops for more than PAUSE_AFTER seconds
//   onArmStatus(isStraight)   when the arm changes between straight and bent
//   onArmDetected(isDetected) when we start or stop seeing the arm
//   onDepth(isDeepEnough)     when the last pushes change between deep enough and too shallow
export function startTracking(newCallbacks) {
  callbacks = newCallbacks || {};
  resetSession();
  isTracking = true;
}

// Debug: change how deep a dip must be (fraction of forearm length)
export function setSensitivity(value) {
  minMovement = value;
}

// Debug: change how deep a push must be to be "deep enough" (fraction of forearm length)
export function setGoodDepth(value) {
  minGoodDepth = value;
}

// Debug: what the tracker sees right now
export function getDebugData() {
  let threshold = null;
  let goodDepth = null;
  if (forearmLength !== null) {
    threshold = minMovement * forearmLength;
    goodDepth = minGoodDepth * forearmLength;
  }
  let lastDepth = null;
  if (pushDepths.length > 0) {
    lastDepth = pushDepths[pushDepths.length - 1];
  }
  return {
    history: debugHistory,          // last 5 seconds of the signal
    threshold: threshold,           // the minimum dip to count, in the same unit as height
    goodDepth: goodDepth,           // the dip needed to be deep enough, in the same unit as height
    lastDepth: lastDepth,           // depth of the last push, in forearm lengths
    fps: frameTimes.length,         // camera images analysed per second
    minMovement: minMovement,
    minGoodDepth: minGoodDepth,
  };
}

// Stops counting and returns the statistics of the session.
export function stopTracking() {
  isTracking = false;

  const count = compressionTimes.length;

  // Average rate over the whole session
  let averageRate = 0;
  if (count >= 2) {
    const totalSeconds = compressionTimes[count - 1] - compressionTimes[0];
    averageRate = Math.round(((count - 1) / totalSeconds) * 60);
  }

  // The rate only exists from the 3rd compression, so 2 are not rated
  const ratedCompressions = Math.max(0, count - 2);
  let percentInRange = 0;
  if (ratedCompressions > 0) {
    percentInRange = Math.round((inRangeCount / ratedCompressions) * 100);
  }

  let percentArmsStraight = 0;
  if (armFrames > 0) {
    percentArmsStraight = Math.round((straightFrames / armFrames) * 100);
  }

  // The depth is only measured from the 2nd push (it needs a top before it)
  let percentDeepEnough = 0;
  if (pushDepths.length > 0) {
    percentDeepEnough = Math.round((deepPushCount / pushDepths.length) * 100);
  }

  return {
    count: count,
    averageRate: averageRate,
    percentInRange: percentInRange,
    pauses: pauseCount,
    percentArmsStraight: percentArmsStraight,
    percentDeepEnough: percentDeepEnough,
  };
}

// ============================================================
// 4. MAIN LOOP: runs on every video frame
// ============================================================
function loop() {
  // Only do the work when the camera gives us a new image
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const nowMilliseconds = performance.now();
    countFrame(nowMilliseconds / 1000);
    const result = poseLandmarker.detectForVideo(video, nowMilliseconds);
    handleResult(result, nowMilliseconds / 1000);
  }
  animationFrameId = requestAnimationFrame(loop);
}

function handleResult(result, time) {
  canvasContext.clearRect(0, 0, canvas.width, canvas.height);

  // Find the arm (null if nobody is in the image or the arm is not clear)
  let arm = null;
  if (result.landmarks.length > 0) {
    const points = result.landmarks[0];
    arm = pickArm(points);
    drawSkeleton(points, arm);
  }

  if (!isTracking) {
    return;
  }

  reportArmDetected(arm !== null);
  if (arm !== null) {
    processFrame(arm, time);
  }
  checkForPause(time);
}

// Draw only the upper body (points 11 to 24), so the legs don't distract.
// The arm we're tracking is drawn in red, with a big dot on the wrist.
function drawSkeleton(points, arm) {
  const upperBody = PoseLandmarker.POSE_CONNECTIONS.filter(function (connection) {
    return connection.start >= 11 && connection.start <= 24
        && connection.end >= 11 && connection.end <= 24;
  });
  drawingUtils.drawConnectors(points, upperBody, { color: "#3ecf8e", lineWidth: 3 });
  drawingUtils.drawLandmarks(points.slice(11, 25), { color: "#ffffff", radius: 3 });

  if (arm !== null) {
    drawingUtils.drawConnectors(points, arm.connections, { color: "#ff4d4d", lineWidth: 6 });
    drawingUtils.drawLandmarks([arm.wrist], { color: "#ff4d4d", radius: 8 });
  }
}

// ============================================================
// 5. CHOOSE WHICH ARM TO TRACK
// ============================================================
// In a side view, the arm far from the camera is hidden, and the model
// sometimes "guesses" its wrist somewhere wrong (often near the legs).
// So we only trust an arm whose 3 points are clearly visible and whose
// shape looks like a real arm. Returns null if no arm can be trusted.
function pickArm(points) {
  const leftArm = makeArm(points, LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST);
  const rightArm = makeArm(points, RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST);

  // Visibility check: keep the arm the model sees best
  let arm = rightArm;
  if (armVisibility(leftArm) >= armVisibility(rightArm)) {
    arm = leftArm;
  }
  if (armVisibility(arm) < MIN_VISIBILITY) {
    return null;
  }

  // Shape check: in a real arm, the forearm is roughly as long as the upper arm
  const upperArmLength = distance(arm.shoulder, arm.elbow);
  const lowerArmLength = distance(arm.elbow, arm.wrist);
  if (lowerArmLength < 0.5 * upperArmLength || lowerArmLength > 1.6 * upperArmLength) {
    return null;
  }

  // During compressions, the wrist is always below the shoulder
  // (in the image, y grows DOWNWARD, so "below" means a bigger y)
  if (arm.wrist.y < arm.shoulder.y) {
    return null;
  }

  return arm;
}

function makeArm(points, shoulderIndex, elbowIndex, wristIndex) {
  return {
    shoulder: points[shoulderIndex],
    elbow: points[elbowIndex],
    wrist: points[wristIndex],
    // Which lines to draw for this arm: shoulder to elbow, elbow to wrist
    connections: [
      { start: shoulderIndex, end: elbowIndex },
      { start: elbowIndex, end: wristIndex },
    ],
  };
}

// An arm is only as visible as its least visible point
function armVisibility(arm) {
  return Math.min(arm.shoulder.visibility, arm.elbow.visibility, arm.wrist.visibility);
}

// ============================================================
// 6. TURN THE ARM POSITION INTO COMPRESSIONS
// ============================================================
function processFrame(arm, time) {
  // Forearm length (smoothed): our ruler. Movement is measured in forearm
  // lengths, so it works whether the player is near or far from the camera.
  const forearmNow = distance(arm.elbow, arm.wrist);
  if (forearmLength === null) {
    forearmLength = forearmNow;
  } else {
    forearmLength = 0.05 * forearmNow + 0.95 * forearmLength;
  }

  // Arm height = the average height of shoulder, elbow and wrist.
  // During a compression the whole arm goes down together, and the
  // average of 3 points shakes less than one point alone.
  // In the image, y grows DOWNWARD, so height = -y
  // (pushing down makes the height go down).
  const height = -(arm.shoulder.y + arm.elbow.y + arm.wrist.y) / 3;

  if (isGlitch(height)) {
    return;
  }

  // Smooth the signal to remove jitter
  if (smoothedHeight === null) {
    smoothedHeight = height;
  } else {
    const weight = smoothingWeight(time);
    smoothedHeight = weight * height + (1 - weight) * smoothedHeight;
  }
  lastFrameTime = time;

  const compressionHere = detectDip(time);
  checkArmStraight(arm);
  saveDebugPoint(time, compressionHere);
}

// Jump check: a real wrist can't teleport between two frames, so we ignore
// sudden jumps. If the "jump" lasts more than MAX_GLITCH_FRAMES frames,
// the person really moved: we start fresh from the new position.
function isGlitch(height) {
  if (smoothedHeight === null) {
    return false;
  }

  const jump = Math.abs(height - smoothedHeight);
  if (jump <= MAX_JUMP * forearmLength) {
    glitchFrames = 0;
    return false;
  }

  glitchFrames = glitchFrames + 1;
  if (glitchFrames > MAX_GLITCH_FRAMES) {
    smoothedHeight = null;
    direction = "down";
    lowestPoint = Infinity;
    highestPoint = -Infinity;
    glitchFrames = 0;
  }
  return true;
}

// A compression is a dip in the arm height wave:
// the arm goes down, reaches a lowest point, then comes back up.
// Returns true if a compression was counted on this frame.
function detectDip(time) {
  const threshold = minMovement * forearmLength;
  let compressionHere = false;

  if (direction === "down") {
    // Keep track of the lowest point of this push
    if (smoothedHeight < lowestPoint) {
      lowestPoint = smoothedHeight;
      lowestTime = time;
    }
    // Once we've come back up by at least the threshold, the dip is complete
    if (smoothedHeight > lowestPoint + threshold) {
      const depth = (highestPoint - lowestPoint) / forearmLength; // in forearm lengths
      compressionHere = registerCompression(lowestTime, depth);
      direction = "up";
      highestPoint = smoothedHeight;
    }
  } else {
    // Coming back up: track the highest point
    if (smoothedHeight > highestPoint) {
      highestPoint = smoothedHeight;
    }
    // Once we've gone down by at least the threshold, a new push has started
    if (smoothedHeight < highestPoint - threshold) {
      direction = "down";
      lowestPoint = smoothedHeight;
      lowestTime = time;
    }
  }
  return compressionHere;
}

// Called once per detected dip. Returns true if it was counted.
function registerCompression(time, depth) {
  // Too close to the previous one: it's noise, ignore it
  const previousTime = compressionTimes[compressionTimes.length - 1];
  if (previousTime !== undefined && time - previousTime < MIN_INTERVAL) {
    return false;
  }

  compressionTimes.push(time);
  inPause = false;
  callIfGiven("onCompression", time);

  // Depth of this push (only meaningful once we've seen a top before it)
  if (isFinite(depth) && depth > 0) {
    checkDepth(depth);
  }

  // The rate needs at least 2 intervals, so it starts at the 3rd compression
  if (compressionTimes.length >= 3) {
    const rate = currentRate();
    if (rate >= TARGET_MIN && rate <= TARGET_MAX) {
      inRangeCount = inRangeCount + 1;
    }
    callIfGiven("onRate", rate);
  }
  return true;
}

// Rate = 60 / median of the last intervals between compressions (up to 5).
// The median ignores one odd interval better than the average does.
function currentRate() {
  const intervals = [];
  const firstIndex = Math.max(1, compressionTimes.length - 5);
  for (let i = firstIndex; i < compressionTimes.length; i++) {
    intervals.push(compressionTimes[i] - compressionTimes[i - 1]);
  }
  return 60 / median(intervals);
}

// Depth: is the push deep enough?
// depth = how far the arm went down, from the top before the push
// to the bottom of the push, measured in forearm lengths (our ruler).
function checkDepth(depth) {
  pushDepths.push(depth);
  if (depth >= minGoodDepth) {
    deepPushCount = deepPushCount + 1;
  }

  // Wait for a few pushes, then judge the median of the last ones
  // (the median ignores one odd push)
  if (pushDepths.length < DEPTH_WINDOW) {
    return;
  }
  const recentDepth = median(pushDepths.slice(-DEPTH_WINDOW));
  const isDeepEnough = recentDepth >= minGoodDepth;

  if (isDeepEnough !== lastDeepEnough) {
    lastDeepEnough = isDeepEnough;
    callIfGiven("onDepth", isDeepEnough);
  }
}

// Arm straightness: the angle at the elbow
function checkArmStraight(arm) {
  const angle = elbowAngle(arm.shoulder, arm.elbow, arm.wrist);
  const isStraight = angle >= STRAIGHT_ARM_ANGLE;

  armFrames = armFrames + 1;
  if (isStraight) {
    straightFrames = straightFrames + 1;
  }

  if (isStraight !== lastArmStraight) {
    lastArmStraight = isStraight;
    callIfGiven("onArmStatus", isStraight);
  }
}

// A pause = more than PAUSE_AFTER seconds since the last compression.
// Each pause is counted once, until the next compression ends it.
function checkForPause(time) {
  const lastCompressionTime = compressionTimes[compressionTimes.length - 1];
  if (lastCompressionTime === undefined) {
    return; // the player has not started yet
  }
  if (time - lastCompressionTime > PAUSE_AFTER && !inPause) {
    inPause = true;
    pauseCount = pauseCount + 1;
    callIfGiven("onPause");
  }
}

function reportArmDetected(isDetected) {
  if (isDetected !== lastArmDetected) {
    lastArmDetected = isDetected;
    callIfGiven("onArmDetected", isDetected);
  }
}

// ============================================================
// 7. SMALL HELPERS
// ============================================================

// Put everything back to zero before a new session
function resetSession() {
  smoothedHeight = null;
  forearmLength = null;
  glitchFrames = 0;
  direction = "down";
  lowestPoint = Infinity;
  highestPoint = -Infinity;
  lowestTime = 0;
  lastFrameTime = null;
  compressionTimes = [];
  pushDepths = [];
  deepPushCount = 0;
  inRangeCount = 0;
  pauseCount = 0;
  inPause = false;
  straightFrames = 0;
  armFrames = 0;
  lastArmDetected = null;
  lastArmStraight = null;
  lastDeepEnough = null;
  debugHistory = [];
}

// How much the new image counts in the smoothing.
// SMOOTHING is the right value at 30 images per second. With fewer images
// per second (a slow webcam), each image must count more, otherwise the
// smoothing flattens the dips and the pushes look less deep than they are.
// The formula gives the same smoothing per second at any frame rate.
function smoothingWeight(time) {
  if (lastFrameTime === null) {
    return SMOOTHING;
  }
  const framesAt30 = (time - lastFrameTime) * 30; // 1 at 30 fps, 2 at 15 fps
  return 1 - Math.pow(1 - SMOOTHING, framesAt30);
}

// Debug: remember the signal of the last 5 seconds
function saveDebugPoint(time, compressionHere) {
  debugHistory.push({ time: time, height: smoothedHeight, compression: compressionHere });
  while (debugHistory.length > 0 && time - debugHistory[0].time > 5) {
    debugHistory.shift();
  }
}

// Debug: keep the times of the frames of the last second, to count fps
function countFrame(time) {
  frameTimes.push(time);
  while (frameTimes.length > 0 && time - frameTimes[0] > 1) {
    frameTimes.shift();
  }
}

// Call a callback only if the other file gave it to startTracking
function callIfGiven(name, value) {
  if (typeof callbacks[name] === "function") {
    callbacks[name](value);
  }
}

// Distance between two body points.
// x is a fraction of the width and y a fraction of the height:
// we convert x to the same scale as y using the video's aspect ratio.
function distance(a, b) {
  const aspect = video.videoWidth / video.videoHeight;
  const dx = (a.x - b.x) * aspect;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Angle at the elbow, in degrees. 180 = perfectly straight arm.
function elbowAngle(shoulder, elbow, wrist) {
  const aspect = video.videoWidth / video.videoHeight;
  // Two arrows starting at the elbow: one to the shoulder, one to the wrist
  const toShoulder = { x: (shoulder.x - elbow.x) * aspect, y: shoulder.y - elbow.y };
  const toWrist = { x: (wrist.x - elbow.x) * aspect, y: wrist.y - elbow.y };
  const dot = toShoulder.x * toWrist.x + toShoulder.y * toWrist.y;
  const lengths = Math.hypot(toShoulder.x, toShoulder.y) * Math.hypot(toWrist.x, toWrist.y);
  const cosine = Math.min(1, Math.max(-1, dot / lengths));
  return Math.acos(cosine) * 180 / Math.PI;
}

// Middle value of a list
function median(list) {
  const sorted = list.slice().sort(function (a, b) {
    return a - b;
  });
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}
