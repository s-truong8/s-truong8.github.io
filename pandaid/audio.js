// audio.js: the voice of Pandaid during the compressions.
// Files are in assets/audio. Use: say("faster"), stopAudio().
//
// Rules, so the voice stays useful and never talks over itself:
// - one voice line at a time: a new line is ignored while another is playing
//   (except "start-compressions", which always plays)
// - the same line is not repeated within COOLDOWN seconds
// - msSinceLastVoice() lets camera.js know when it is time for encouragement

import { isMuted } from "./sfx.js";

const FOLDER = "assets/audio/";
const COOLDOWN = 6; // seconds before the same line can play again

const NAMES = [
  "ringing-phone",
  "dispatcher",
  "start-compressions",
  "faster",
  "slower",
  "good-rhythm",
  "push-deeper",
  "good-depth",
  "keep-going",
  "straighten-arms",
  "cant-see-arm",
  "doing-great-1",
  "doing-great-2",
  "doing-great-3",
];

// Load every file now, so a line starts without delay
const clips = {};
for (const name of NAMES) {
  const clip = new Audio(FOLDER + name + ".mp3");
  clip.preload = "auto";
  clips[name] = clip;
}

// camera.js listens to know when the panda is talking: callback(isTalking, name)
let voiceListener = null;
export function onVoiceChange(callback) {
  voiceListener = callback;
}
function tellListener(isTalking, name) {
  if (voiceListener !== null) {
    voiceListener(isTalking, name);
  }
}

let current = null;       // the clip that is playing, or null
let stopTimer = null;     // ends a clip early (see the stopAfter option)
const FADE_MS = 120;
let lastVoiceTime = 0;    // performance.now() when a line last started
const lastPlayed = {};    // name -> performance.now() of its last start

export function say(name, options) {
  const clip = clips[name];
  if (!clip) {
    return false;
  }
  if (isMuted()) {
    return false;
  }
  const force = options && options.force;
  const now = performance.now();
  if (!force) {
    if (current !== null) {
      return false;
    }
    if (lastPlayed[name] !== undefined && now - lastPlayed[name] < COOLDOWN * 1000) {
      return false;
    }
  }
  if (current !== null && current !== clip) {
    current.pause();
  }
  clip.currentTime = 0;
  current = clip;
  tellListener(true, name);
  lastPlayed[name] = now;
  lastVoiceTime = now;
  clip.onended = function () {
    if (current === clip) {
      current = null;
      tellListener(false, name);
    }
  };
  // The browser may refuse to play (no click on the page yet): ignore it
  // stopAfter (seconds): play only the start of the file, with a short fade out
  // (used for the phone: only the first beep)
  clearTimeout(stopTimer);
  clip.volume = 1;
  if (options && options.stopAfter) {
    stopTimer = setTimeout(function () {
      fadeOutAndStop(clip, name);
    }, Math.max(0, options.stopAfter * 1000 - FADE_MS));
  }
  clip.play().catch(function () {
    if (current === clip) {
      current = null;
      tellListener(false, name);
    }
  });
  return true;
}

// Mute button pressed: the voice stops at once
window.addEventListener("pandaid-mute", function () {
  stopAudio();
});

function fadeOutAndStop(clip, name) {
  if (current !== clip) {
    return; // already replaced or stopped
  }
  const startTime = performance.now();
  const fade = setInterval(function () {
    const left = 1 - (performance.now() - startTime) / FADE_MS;
    if (current !== clip || left <= 0) {
      clearInterval(fade);
      if (current === clip) {
        clip.pause();
        current = null;
        tellListener(false, name);
      }
      clip.volume = 1;
    } else {
      clip.volume = left;
    }
  }, 20);
}

export function stopAudio() {
  clearTimeout(stopTimer);
  if (current !== null) {
    current.pause();
    current = null;
    tellListener(false, "");
  }
}

// Forget the cooldowns (a new game starts)
export function resetAudio() {
  stopAudio();
  for (const name of Object.keys(lastPlayed)) {
    delete lastPlayed[name];
  }
  lastVoiceTime = performance.now();
}

export function msSinceLastVoice() {
  return performance.now() - lastVoiceTime;
}
