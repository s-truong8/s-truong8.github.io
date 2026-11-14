// scenario.js: the steps before CPR (the "decisions" screen), like a game.
// Each step is a question with a timer. The player must find the right
// answer to validate the step and unlock the next one.
// A step only gives a point if it is right on the first try, before the timer ends.

import { game, showScreen } from "./main.js";
import { sfx } from "./sfx.js";
import { say, stopAudio } from "./audio.js";

// Mascot stickers for each reaction
const STICKERS = {
  thinking: "assets/mascot-stickers/04-confused.png",
  right: "assets/mascot-stickers/13-proud.png",
  wrong: "assets/mascot-stickers/14-unimpressed.png",
  tooSlow: "assets/mascot-stickers/06-shocked.png",
};

const NEXT_STEP_DELAY = 900;   // milliseconds to enjoy the "validated" message
const WRONG_STEP_DELAY = 3500; // after a wrong answer: more time to read the feedback and the right answer

// The phone call (step "call"): the phone rings once, then the dispatcher answers.
// ringing-phone.mp3 starts 0.45 s after the answer and only its first beep is
// played (1.85 s); the dispatcher speaks 0.25 s after the ring ends, or as soon
// as the dispatcher step appears if that is later.
const RING_START = 450;   // milliseconds after the answer
const RING_LENGTH = 1850; // milliseconds (the first beep)
const RING_GAP = 250;     // milliseconds of silence before the dispatcher answers
let ringEndTime = 0;      // performance.now() when the ring ends
let dispatcherVoiceId = null;
let ringStartId = null;   // starts the ring (and the shaking of the phone)
let ringStopId = null;    // ends the shaking, when the ring ends

// ============================================================
// PAGE ELEMENTS
// ============================================================
const stepMap = document.getElementById("step-map");
const stepTitle = document.getElementById("step-title");
const stepMascot = document.getElementById("step-mascot");
const stepBubble = document.getElementById("step-bubble");
const stepSpeaker = document.getElementById("step-speaker");
const lineText = document.getElementById("dispatcher-line");
const timerFill = document.getElementById("decision-timer");
const choicesBox = document.getElementById("choices");
const feedbackText = document.getElementById("decision-feedback");
const victimScene = document.getElementById("victim-scene");

// ============================================================
// STATE OF THIS FILE
// ============================================================
let steps = [];             // the steps from script.json
let currentStep = null;
let stepDone = false;       // true once the right answer is clicked
let stepMissed = false;     // true after a wrong answer or when time is up
let timerId = null;         // the countdown (setInterval)
let nextStepId = null;      // the "wait, then next step" (setTimeout)
let currentRecord = null;   // the line of game.decisionLog for the current step
let currentRecordStart = 0; // when the current step started (seconds)

// ============================================================
// THE INTERFACE
// ============================================================

// Downloads script.json. Returns a Promise with the list of steps.
export async function loadScript() {
  const response = await fetch("script.json");
  steps = await response.json();
  return steps;
}

// Shows one step: the question, the choices and the timer.
export function playStep(id) {
  const step = findStep(id);
  if (step === null) {
    console.error("playStep: there is no step called " + id);
    return;
  }
  clearTimers();
  currentStep = step;
  stepDone = false;
  stepMissed = false;

  // One record per step, for the evaluation grid (see score.js)
  currentRecord = {
    id: step.id,
    title: step.title,
    wrongAnswers: 0,     // how many wrong choices were clicked
    timedOut: false,     // true if the timer ran out
    seconds: null,       // time until the right answer
  };
  currentRecordStart = performance.now() / 1000;
  game.decisionLog.push(currentRecord);

  drawStepMap();
  stepTitle.textContent = "Step " + (steps.indexOf(step) + 1) + " of " + steps.length + ": " + step.title;
  showSpeaker(step.speaker);
  lineText.textContent = step.line;
  // The dispatcher answers out loud ("911, what is your emergency?"), after the ring
  if (step.speaker === "dispatcher") {
    const wait = Math.max(0, ringEndTime + RING_GAP - performance.now());
    dispatcherVoiceId = setTimeout(function () {
      say("dispatcher", { force: true });
    }, wait);
  }
  stepMascot.src = STICKERS.thinking;
  showFeedback("", "");
  drawChoices(step);
  startTimer(step.timeLimit);
}

// Stops the timer and the "next step" delay (when the player quits).
export function stopScenario() {
  clearTimers();
  clearTimeout(ringStartId);
  stopPhoneShake();
  stopAudio(); // the ring or a line of the dispatcher is cut if the player quits
}

function stopPhoneShake() {
  clearTimeout(ringStopId);
  victimScene.classList.remove("phone-ringing");
}

// Timers only: playStep uses this, so the phone ring is not cut between two steps
function clearTimers() {
  clearInterval(timerId);
  clearTimeout(nextStepId);
  clearTimeout(dispatcherVoiceId);
}

// ============================================================
// DRAWING THE STEP
// ============================================================

// The row of checkpoints at the top: done, current, or locked
function drawStepMap() {
  stepMap.innerHTML = "";
  const currentIndex = steps.indexOf(currentStep);
  for (let i = 0; i < steps.length; i++) {
    const item = document.createElement("li");
    item.className = "step-dot";
    if (i < currentIndex) {
      // Done, or failed if the player gave a wrong answer in this step
      item.classList.add(wasAnsweredWrong(steps[i].id) ? "failed" : "done");
    } else if (i === currentIndex) {
      item.classList.add("current");
    } else {
      item.classList.add("locked");
    }
    item.textContent = i + 1;
    item.title = steps[i].title;
    stepMap.appendChild(item);
  }
}

// Did the player click a wrong answer in this step? (read from the log of main.js)
function wasAnsweredWrong(stepId) {
  for (const record of game.decisionLog) {
    if (record.id === stepId && record.wrongAnswers > 0) {
      return true;
    }
  }
  return false;
}

// The bubble looks different when the dispatcher speaks
function showSpeaker(speaker) {
  if (speaker === "dispatcher") {
    stepSpeaker.textContent = "Dispatcher";
    stepBubble.classList.add("bubble-blue");
  } else {
    stepSpeaker.textContent = "Pandaid";
    stepBubble.classList.remove("bubble-blue");
  }
}

// One button per choice. Keys 1, 2, 3 also work.
function drawChoices(step) {
  choicesBox.innerHTML = "";
  for (let i = 0; i < step.choices.length; i++) {
    const choice = step.choices[i];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice";

    const key = document.createElement("span");
    key.className = "choice-key";
    key.textContent = i + 1;
    button.appendChild(key);
    button.appendChild(document.createTextNode(choice.text));

    button.addEventListener("click", function () {
      pickChoice(choice, button);
    });
    choicesBox.appendChild(button);
  }
}

// colorClass is "good", "bad" or "" (see style.css)
function showFeedback(text, colorClass) {
  feedbackText.textContent = text;
  feedbackText.className = colorClass;
}

// ============================================================
// THE PLAYER ANSWERS
// ============================================================
function pickChoice(choice, button) {
  if (stepDone) {
    return;
  }

  // ONE answer per step: the first click ends the step, right or wrong.
  stepDone = true;
  clearInterval(timerId);
  currentRecord.seconds = performance.now() / 1000 - currentRecordStart;
  disableAllChoices();
  game.totalDecisions = game.totalDecisions + 1;

  const rightChoice = findCorrectChoice(currentStep);
  let delay = NEXT_STEP_DELAY;

  if (choice.correct) {
    button.classList.add("correct");
    stepMascot.src = STICKERS.right;
    sfx("correct");
    if (!stepMissed) {
      game.correctDecisions = game.correctDecisions + 1;
    }
    let message = "Step validated! ";
    if (choice.feedback) {
      message = message + choice.feedback;
    }
    showFeedback(message, "good");
    setStepDot("done");
  } else {
    // Wrong: no second try. We show why, and which answer was right.
    stepMissed = true;
    currentRecord.wrongAnswers = currentRecord.wrongAnswers + 1;
    button.classList.add("wrong");
    highlightChoice(rightChoice);
    stepMascot.src = STICKERS.wrong;
    sfx("wrong");
    showFeedback("Wrong answer. " + (choice.feedback || "") + " The right answer was highlighted.", "bad");
    setStepDot("failed");
    delay = WRONG_STEP_DELAY;
  }

  // Update the drawing of the man: for example "after-call" shows the phone
  victimScene.classList.add("after-" + currentStep.id);

  // The phone appears in the scene and rings (right or wrong answer: the story goes on)
  if (currentStep.id === "call") {
    ringEndTime = performance.now() + RING_START + RING_LENGTH;
    clearTimeout(ringStartId);
    clearTimeout(ringStopId);
    ringStartId = setTimeout(function () {
      say("ringing-phone", { force: true, stopAfter: RING_LENGTH / 1000 });
      victimScene.classList.add("phone-ringing"); // the phone shakes (style.css)
      ringStopId = setTimeout(stopPhoneShake, RING_LENGTH);
    }, RING_START);
  }

  // The story goes on, with the next step of the right answer
  nextStepId = setTimeout(function () {
    if (rightChoice.next === "end") {
      showScreen("tutorial"); // all steps played: time for compressions
    } else {
      playStep(rightChoice.next);
    }
  }, delay);
}

// The choice with "correct": true
function findCorrectChoice(step) {
  for (const choice of step.choices) {
    if (choice.correct) {
      return choice;
    }
  }
  return step.choices[0];
}

// Shows the right answer (after a wrong click)
function highlightChoice(choice) {
  const buttons = choicesBox.querySelectorAll(".choice");
  for (let i = 0; i < currentStep.choices.length; i++) {
    if (currentStep.choices[i] === choice) {
      buttons[i].classList.add("correct");
    }
  }
}

// Colors the dot of the current step: "done" or "failed"
function setStepDot(status) {
  const dots = stepMap.querySelectorAll(".step-dot");
  dots[steps.indexOf(currentStep)].className = "step-dot " + status;
}

function disableAllChoices() {
  const buttons = choicesBox.querySelectorAll(".choice");
  for (const button of buttons) {
    button.disabled = true;
  }
}

// Keys 1, 2, 3... pick a choice (only on the decisions screen)
document.addEventListener("keydown", function (event) {
  if (document.body.dataset.screen !== "decisions") {
    return;
  }
  const number = parseInt(event.key, 10);
  const buttons = choicesBox.querySelectorAll(".choice");
  if (number >= 1 && number <= buttons.length && !buttons[number - 1].disabled) {
    buttons[number - 1].click();
  }
});

// ============================================================
// THE TIMER
// ============================================================
// We read the real clock each time, because setInterval can run late
// when the computer is busy (the camera tracking runs at the same time).
function startTimer(seconds) {
  const startTime = performance.now() / 1000;
  timerFill.style.width = "100%";
  timerFill.classList.remove("urgent");

  let lastTick = null;
  timerId = setInterval(function () {
    const timeLeft = seconds - (performance.now() / 1000 - startTime);
    // one tick per second during the last 3 seconds
    const second = Math.ceil(timeLeft);
    if (timeLeft > 0 && timeLeft <= 3 && second !== lastTick) {
      sfx("tick");
    }
    lastTick = second;
    timerFill.style.width = Math.max(0, (timeLeft / seconds) * 100) + "%";
    if (timeLeft <= 3) {
      timerFill.classList.add("urgent"); // last 3 seconds: red
    }
    if (timeLeft <= 0) {
      timeUp();
    }
  }, 100);
}

// Too slow: the step is missed, but the player must still answer
function timeUp() {
  clearInterval(timerId);
  stepMissed = true;
  currentRecord.timedOut = true;
  stepMascot.src = STICKERS.tooSlow;
  sfx("timeup");
  showFeedback("Time's up! Every second counts. Choose now!", "bad");
}

// ============================================================
// SMALL HELPERS
// ============================================================
function findStep(id) {
  for (const step of steps) {
    if (step.id === id) {
      return step;
    }
  }
  return null;
}
