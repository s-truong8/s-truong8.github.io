// sfx.js: the sound effects of the game, made with the Web Audio API
// (no sound files: each effect is a few notes drawn by code).
//
//   sfx("correct")        play one effect (see EFFECTS below)
//   isMuted(), setMuted() the mute button; the choice is remembered
//
// The browser only allows sound after a click on the page: the audio context
// is created at the first click (the player always clicks "Start" first).

let context = null;
let master = null;
let muted = false;
try {
  muted = localStorage.getItem("pandaid-muted") === "1";
} catch (error) {
  // no storage (private window): sound stays on
}

const listeners = [];
export function isMuted() {
  return muted;
}
export function setMuted(value) {
  muted = value;
  try {
    localStorage.setItem("pandaid-muted", value ? "1" : "0");
  } catch (error) {
    // ignore
  }
  if (master) {
    master.gain.value = muted ? 0 : 0.5;
  }
  if (muted) {
    window.dispatchEvent(new Event("pandaid-mute")); // audio.js stops the voice
  }
  for (const listener of listeners) {
    listener(muted);
  }
}
export function onMuteChange(listener) {
  listeners.push(listener);
}

function ensureContext() {
  if (context === null) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      return null;
    }
    context = new Ctx();
    master = context.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(context.destination);
  }
  if (context.state === "suspended") {
    context.resume();
  }
  return context;
}
// Create it at the first click or key (browsers require a gesture)
for (const type of ["pointerdown", "keydown"]) {
  window.addEventListener(type, ensureContext, { once: true, capture: true });
}

// ------------------------------------------------------------
// Building blocks
// ------------------------------------------------------------
// One note: frequency (Hz), start (seconds from now), length, wave, volume.
// slideTo: the pitch glides to this frequency during the note.
function tone(freq, start, length, wave, volume, slideTo) {
  const t0 = context.currentTime + start;
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) {
    osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + length);
  }
  // Short attack and a smooth fade, so there is no click
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
  osc.connect(gain);
  gain.connect(master);
  osc.start(t0);
  osc.stop(t0 + length + 0.05);
}

// Musical notes, by name, for the little melodies
const NOTE = { C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.5,
               G4: 392, A4: 440, C4: 261.63, E4: 329.63 };

// ------------------------------------------------------------
// The effects
// ------------------------------------------------------------
const EFFECTS = {
  // a soft tap on every button
  click() { tone(660, 0, 0.07, "triangle", 0.18, 520); },

  // "Start the simulation": a rising "ready, go"
  start() {
    tone(NOTE.C5, 0, 0.12, "triangle", 0.25);
    tone(NOTE.E5, 0.1, 0.12, "triangle", 0.25);
    tone(NOTE.G5, 0.2, 0.22, "triangle", 0.28);
  },

  // the man collapses: two urgent alert beeps
  alert() {
    for (let i = 0; i < 2; i++) {
      tone(880, i * 0.28, 0.2, "square", 0.12);
      tone(660, i * 0.28 + 0.1, 0.16, "square", 0.1);
    }
  },

  // right answer: a bright two-note "ding ding"
  correct() {
    tone(NOTE.G5, 0, 0.16, "sine", 0.3);
    tone(NOTE.C6, 0.12, 0.34, "sine", 0.3);
    tone(NOTE.E6, 0.12, 0.34, "sine", 0.08);
  },

  // wrong answer: a low, short buzz
  wrong() {
    tone(180, 0, 0.28, "sawtooth", 0.16, 110);
  },

  // the phone: two rings (when the call is made)
  phone() {
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 4; j++) {
        const t = i * 0.55 + j * 0.06;
        tone(1400, t, 0.045, "square", 0.05);
        tone(1100, t + 0.03, 0.04, "square", 0.04);
      }
    }
  },

  // the last seconds of a timer: a tick
  tick() { tone(1000, 0, 0.05, "square", 0.1); },

  // too slow: a falling "womp"
  timeup() {
    tone(330, 0, 0.18, "triangle", 0.25);
    tone(247, 0.17, 0.3, "triangle", 0.25, 196);
  },

  // the compressions begin: "go!"
  go() {
    tone(NOTE.A4, 0, 0.1, "triangle", 0.25);
    tone(NOTE.A4, 0.16, 0.1, "triangle", 0.25);
    tone(NOTE.E5, 0.32, 0.3, "triangle", 0.3);
  },

  // one compression: a soft thump, like a heartbeat
  thump() {
    tone(150, 0, 0.14, "sine", 0.4, 55);
  },

  // the ambulance: a two-tone siren, three cycles
  siren() {
    for (let i = 0; i < 3; i++) {
      tone(960, i * 0.7, 0.34, "triangle", 0.14, 940);
      tone(720, i * 0.7 + 0.35, 0.34, "triangle", 0.14, 700);
    }
  },

  // help has arrived: a happy little fanfare
  arrived() {
    const notes = [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6];
    notes.forEach(function (note, i) {
      tone(note, i * 0.11, 0.2, "triangle", 0.25);
    });
    tone(NOTE.C6, 0.5, 0.5, "triangle", 0.25);
    tone(NOTE.E6, 0.5, 0.5, "sine", 0.1);
  },

  // the grade stamp: a thud, then a jingle (better for a good grade)
  stampGood() {
    tone(110, 0.35, 0.2, "sine", 0.5, 45);
    const notes = [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6];
    notes.forEach(function (note, i) {
      tone(note, 0.5 + i * 0.1, 0.22, "triangle", 0.22);
    });
  },
  stampOk() {
    tone(110, 0.35, 0.2, "sine", 0.5, 45);
    tone(NOTE.E5, 0.5, 0.2, "triangle", 0.22);
    tone(NOTE.G5, 0.62, 0.3, "triangle", 0.22);
  },
};

export function sfx(name) {
  const effect = EFFECTS[name];
  if (!effect || muted) {
    return;
  }
  if (ensureContext() === null) {
    return;
  }
  // The context can still be "suspended" before the first click: nothing plays
  if (context.state !== "running") {
    return;
  }
  effect();
}

// ------------------------------------------------------------
// The metronome: a steady beat to follow during the compressions.
// 110 beats per minute is the middle of the target (100 to 120).
// Notes are scheduled a little ahead on the audio clock (exact timing, even
// if the page is busy with the camera), in a loop that wakes up every 25 ms.
// ------------------------------------------------------------
export const METRONOME_BPM = 110;
const LOOKAHEAD = 0.12;       // seconds scheduled in advance
let metronomeTimer = null;
let nextBeatTime = 0;
let beatCount = 0;
let beatListener = null;

// callback(isAccent) runs at each beat, on time (for the pulsing dot)
export function onBeat(callback) {
  beatListener = callback;
}

// A short white-noise burst, made once: the "click" of the wooden beater
let noiseBuffer = null;
function getNoise() {
  if (noiseBuffer === null) {
    const length = Math.floor(context.sampleRate * 0.04);
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }
  return noiseBuffer;
}

// One beat, like a wooden mechanical metronome: a dry "tok" made of a
// woody resonance (a quick falling pitch) and a tiny noise click on the attack.
function clickAt(time, accent) {
  const level = accent ? 1 : 0.75;

  // the wood: a sine that falls fast and fades in about 70 ms
  const wood = context.createOscillator();
  const woodGain = context.createGain();
  wood.type = "sine";
  wood.frequency.setValueAtTime(accent ? 1250 : 1000, time);
  wood.frequency.exponentialRampToValueAtTime(accent ? 800 : 640, time + 0.05);
  woodGain.gain.setValueAtTime(0.0001, time);
  woodGain.gain.exponentialRampToValueAtTime(0.5 * level, time + 0.002);
  woodGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.075);
  wood.connect(woodGain);
  woodGain.connect(master);
  wood.start(time);
  wood.stop(time + 0.1);

  // the attack: a very short filtered noise burst
  const click = context.createBufferSource();
  click.buffer = getNoise();
  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 2200;
  filter.Q.value = 2;
  const clickGain = context.createGain();
  clickGain.gain.setValueAtTime(0.35 * level, time);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.02);
  click.connect(filter);
  filter.connect(clickGain);
  clickGain.connect(master);
  click.start(time);
  click.stop(time + 0.04);
}

export function startMetronome() {
  stopMetronome();
  if (ensureContext() === null) {
    return;
  }
  beatCount = 0;
  nextBeatTime = context.currentTime + 0.3;
  const period = 60 / METRONOME_BPM;
  metronomeTimer = setInterval(function () {
    if (context.state !== "running") {
      // Not allowed to play yet: keep the beat moving, silently
      nextBeatTime = Math.max(nextBeatTime, context.currentTime + 0.1);
      return;
    }
    while (nextBeatTime < context.currentTime + LOOKAHEAD) {
      const accent = beatCount % 4 === 0;
      if (!muted) {
        clickAt(nextBeatTime, accent);
      }
      if (beatListener) {
        const delay = Math.max(0, (nextBeatTime - context.currentTime) * 1000);
        setTimeout(function () { beatListener(accent); }, delay);
      }
      nextBeatTime += period;
      beatCount += 1;
    }
  }, 25);
}

export function stopMetronome() {
  clearInterval(metronomeTimer);
  metronomeTimer = null;
}

// Click sound on every button, except the answers (they have their own sound)
document.addEventListener("click", function (event) {
  const target = event.target.closest("button, a.link-button, a.nav-link");
  if (target && !target.classList.contains("choice") && !target.classList.contains("start-button") && target.id !== "mute-button") {
    sfx("click");
  }
}, true);
