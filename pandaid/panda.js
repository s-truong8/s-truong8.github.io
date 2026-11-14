// panda.js: the panda coach is IN the game, not only in the text box.
// He stands behind the dialogue box (his feet are hidden by it) and shows the
// same face as the active screen: scenario.js and camera.js keep changing the
// small pictures (.dialogue-portrait, #live-panda), and we copy them here.
// When camera.js makes #live-panda "speaking", the big panda talks too.

const panda = document.getElementById("scene-panda");

function sourceImage() {
  const screen = document.querySelector(".game-screen.active");
  if (!screen) {
    return null;
  }
  return screen.querySelector("#live-panda") || screen.querySelector(".dialogue-portrait");
}

// Put the panda's feet just behind the top edge of the dialogue box
function placePanda() {
  const box = document.querySelector(".game-screen.active .dialogue");
  if (!box) {
    return;
  }
  const top = box.getBoundingClientRect().top;
  panda.style.bottom = Math.round(window.innerHeight - top - 16) + "px";
}

function syncPanda() {
  const source = sourceImage();
  if (!source) {
    return;
  }
  const file = source.getAttribute("src");
  if (file && panda.getAttribute("src") !== file) {
    panda.setAttribute("src", file);
    // a little hop each time he changes his face
    panda.classList.remove("hop");
    void panda.offsetWidth;
    panda.classList.add("hop");
  }
  panda.classList.toggle("speaking", source.classList.contains("speaking"));
  placePanda();
}

// Something changed in the page: a new screen, a new face, the voice...
new MutationObserver(syncPanda).observe(document.body, {
  subtree: true,
  attributes: true,
  attributeFilter: ["src", "class", "data-screen"],
});
window.addEventListener("resize", syncPanda);

// The dialogue box slides in (0.3 s) and can change height: place again after
setInterval(placePanda, 400);
syncPanda();
