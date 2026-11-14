// score.js: turns the game into a grade (out of 100) and an evaluation grid.
//
// computeScore(game) reads the game object from main.js and returns:
//   rows:  the evaluation grid (one row per criterion, see makeRow below)
//   steps: one line per dispatcher step (shown under "The calls")
//   total, grade, gradeLabel, tip
//   speed, decisions, rate, pauses: the old fields, kept for compatibility
//
// THE RULES (all the numbers you can tune are in section 1):
//
//   The calls     30  Each dispatcher step has ONE answer. Right and in time = full points.
//                     Right but after the timer ended = half. A wrong answer = 0.
//   Fast start    15  Time from the collapse to the first compression.
//                     Full points up to FAST_START seconds, then a straight line down to 0
//                     at SLOW_START seconds.
//   Rhythm        20  Share of compressions done at 100 to 120 per minute.
//   Depth         15  Share of compressions that were deep enough.
//   Straight arms 10  Share of the time the arms were straight.
//   Keep going    10  Doing enough compressions in the time (80% of the target number),
//                     minus 3 points for each pause of more than 2 seconds.
//
// Rhythm, depth and arms are "share of the time" scores: doing the wrong thing
// for a long time costs points in proportion to how long it lasted.

// ============================================================
// 1. SETTINGS
// ============================================================
const MAX_POINTS = {
  calls: 30,
  speed: 15,
  rhythm: 20,
  depth: 15,
  arms: 10,
  continuity: 10,
};

const FAST_START = 60;   // seconds: this fast or faster = full points
const SLOW_START = 150;  // seconds: this slow or slower = 0 points

const TARGET_RATE = 100;           // compressions per minute (lowest good rate)
const ENOUGH_SHARE = 0.8;          // you must reach 80% of the target number of compressions
const PAUSE_PENALTY = 3;           // points lost for each pause

const GRADES = [
  { min: 90, letter: "A", label: "Excellent" },
  { min: 75, letter: "B", label: "Good" },
  { min: 60, letter: "C", label: "Fair" },
  { min: 40, letter: "D", label: "Needs practice" },
  { min: 0,  letter: "F", label: "Try again" },
];

// One sentence of advice for each criterion (the weakest one is shown)
const TIPS = {
  calls: "Read each question calmly and answer before the timer ends. You only get one answer per step, and a wrong one is worth 0.",
  speed: "Start the compressions sooner: every second without them matters. Don't waste time between steps.",
  rhythm: "Keep a steady rhythm of 100 to 120 compressions per minute. Follow the beat of the red dot.",
  depth: "Push deeper: use your body weight, not just your arms.",
  arms: "Lock your elbows and keep your arms straight, so the force comes from your shoulders.",
  continuity: "Don't stop: every pause of more than 2 seconds costs points. Keep pushing until help arrives.",
};

// ============================================================
// 2. THE INTERFACE
// ============================================================
export function computeScore(game) {
  const stats = game.compressionStats; // null if the camera was never used
  const seconds = game.compressionSeconds || 30;

  const calls = scoreCalls(game);
  const speed = scoreSpeed(game);
  const rhythm = scoreShare(
    MAX_POINTS.rhythm,
    stats === null ? 0 : stats.percentInRange,
    stats === null ? "No compressions measured" : stats.percentInRange + "% of pushes at 100 to 120 / min (average " + stats.averageRate + ")"
  );
  const depth = scoreShare(
    MAX_POINTS.depth,
    stats === null ? 0 : stats.percentDeepEnough,
    stats === null ? "No compressions measured" : stats.percentDeepEnough + "% of pushes deep enough"
  );
  const arms = scoreShare(
    MAX_POINTS.arms,
    stats === null ? 0 : stats.percentArmsStraight,
    stats === null ? "No compressions measured" : stats.percentArmsStraight + "% of the time with straight arms"
  );
  const continuity = scoreContinuity(stats, seconds);

  const rows = [
    makeRow("calls", "The calls", "One answer per step: right, and before the timer ends", "Every step right and on time", calls),
    makeRow("speed", "Fast start", "Time from the collapse to your first compression", "Under " + FAST_START + " s", speed),
    makeRow("rhythm", "Rhythm", "Compressions at 100 to 120 per minute", "Most pushes in range", rhythm),
    makeRow("depth", "Depth", "Pushes that go deep enough", "Most pushes deep enough", depth),
    makeRow("arms", "Straight arms", "Time spent with your arms straight", "Arms straight all the time", arms),
    makeRow("continuity", "Keep going", "Enough compressions, and no pauses over 2 s", "No pauses", continuity),
  ];

  let total = 0;
  for (const row of rows) {
    total = total + row.points;
  }
  total = Math.max(0, Math.min(100, total));

  const grade = gradeFor(total);

  return {
    rows: rows,
    steps: calls.steps,
    total: total,
    grade: grade.letter,
    gradeLabel: grade.label,
    tip: pickTip(rows, total, stats),

    // Old fields, kept so nothing else breaks
    speed: speed.points,
    decisions: calls.points,
    rate: rhythm.points,
    pauses: continuity.points,
  };
}

// ============================================================
// 3. ONE FUNCTION PER CRITERION
// Each returns { points, max, result } (and "steps" for the calls)
// ============================================================

// The calls: one line per step. Right and on time = full, right but too late = half, wrong = 0
function scoreCalls(game) {
  const log = game.decisionLog || [];
  const max = MAX_POINTS.calls;
  if (log.length === 0) {
    return { points: 0, max: max, result: "No steps played", steps: [] };
  }

  const perStep = max / log.length;
  const steps = [];
  let points = 0;
  let wrongAnswers = 0;
  let timeouts = 0;

  for (const entry of log) {
    wrongAnswers = wrongAnswers + entry.wrongAnswers;
    if (entry.timedOut) {
      timeouts = timeouts + 1;
    }

    // There is only ONE answer per step: a wrong answer is final (0 points).
    // Answering right but too late (time-out) gives half the points.
    let share = 0;
    let verdict = "Wrong answer";
    let status = "bad";
    if (entry.wrongAnswers > 0) {
      verdict = entry.timedOut ? "Wrong answer, too slow" : "Wrong answer";
    } else if (entry.timedOut) {
      share = 0.5;
      verdict = "Right, but too slow";
      status = "warn";
    } else {
      share = 1;
      verdict = "Right on time";
      status = "good";
    }
    points = points + perStep * share;
    steps.push({
      label: entry.title,
      result: verdict,
      points: round1(perStep * share),
      max: round1(perStep),
      status: status,
    });
  }

  const result = wrongAnswers + " wrong answer" + (wrongAnswers === 1 ? "" : "s") +
    ", " + timeouts + " time-out" + (timeouts === 1 ? "" : "s");
  return { points: points, max: max, result: result, steps: steps };
}

// Fast start: straight line from full points (FAST_START) to 0 (SLOW_START)
function scoreSpeed(game) {
  const max = MAX_POINTS.speed;
  if (game.startTime === null || game.firstCompressionTime === null) {
    return { points: 0, max: max, result: "No compression was done" };
  }
  const delay = game.firstCompressionTime - game.startTime;
  let share = 1 - (delay - FAST_START) / (SLOW_START - FAST_START);
  share = Math.max(0, Math.min(1, share));
  return { points: max * share, max: max, result: "First push after " + Math.round(delay) + " s" };
}

// A "share of the time" score: 80% of the pushes right = 80% of the points
function scoreShare(max, percent, result) {
  return { points: max * (percent / 100), max: max, result: result };
}

// Keep going: enough compressions, minus a penalty for each pause
function scoreContinuity(stats, seconds) {
  const max = MAX_POINTS.continuity;
  if (stats === null) {
    return { points: 0, max: max, result: "No compressions measured" };
  }
  const wanted = (TARGET_RATE * seconds / 60) * ENOUGH_SHARE;
  const enough = Math.min(1, stats.count / wanted);
  const points = Math.max(0, max * enough - PAUSE_PENALTY * stats.pauses);
  const result = stats.count + " compressions, " + stats.pauses + " pause" + (stats.pauses === 1 ? "" : "s");
  return { points: points, max: max, result: result };
}

// ============================================================
// 4. HELPERS
// ============================================================

// One line of the grid. The points are rounded, so the grid always adds up.
function makeRow(id, label, measured, target, part) {
  const points = Math.round(part.points);
  const ratio = part.max === 0 ? 0 : points / part.max;
  let status = "bad";
  if (ratio >= 0.8) {
    status = "good";
  } else if (ratio >= 0.5) {
    status = "warn";
  }
  return {
    id: id,
    label: label,
    measured: measured,
    target: target,
    result: part.result,
    points: points,
    max: part.max,
    status: status,
  };
}

function gradeFor(total) {
  for (const grade of GRADES) {
    if (total >= grade.min) {
      return grade;
    }
  }
  return GRADES[GRADES.length - 1];
}

// The tip is about the criterion where you lost the most points
function pickTip(rows, total, stats) {
  if (stats === null || stats.count === 0) {
    return "The camera didn't see any compressions. Put it at your side so it sees your whole arm, and check it in the camera check before you start.";
  }
  let worst = rows[0];
  let mostLost = -1;
  for (const row of rows) {
    const lost = row.max - row.points;
    if (lost > mostLost) {
      mostLost = lost;
      worst = row;
    }
  }
  if (total >= 95) {
    return "Excellent work. You are ready: now try to stay this calm in a real emergency.";
  }
  return TIPS[worst.id];
}

function round1(number) {
  return Math.round(number * 10) / 10;
}
