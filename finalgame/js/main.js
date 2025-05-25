// Import core game modules and managers
import { Controller } from "./structure/Controller.js";
import { Game } from "./structure/Game.js";
import { Display } from "./structure/Display.js";
import { Engine } from "./structure/Engine.js";

import { SceneManager } from "./sceneManager.js";
import { UserDataManager } from "./userData.js";
import { SoundManager } from "./SoundManager.js";
import { ShopManager } from "./ShopManager.js";

// Initialize managers
export const userDataManager = new UserDataManager();     // Reset user data to defaults
userDataManager.retrieve();   // Retrieve saved user data

export const sceneManager = new SceneManager();
export const soundManager = new SoundManager();
export const shopManager = new ShopManager();

// Initialize core game objects
const controller = new Controller();
const game = new Game();
const display = new Display(document.getElementById("game"));

// Render function: draws everything on the canvas
const render = () => {
    display.renderColor(game.world.bgColor);           // Draw background color
    display.renderPlayer(game.world.player);           // Draw player
    display.renderPlayerArrow(game.world.player);      // Draw player arrow/indicator
    display.renderPlatforms(game.world.platforms);     // Draw platforms
    display.renderMilestones(game.world.milestones);   // Draw milestones/level markers
    display.renderCoins(game.world.coins);             // Draw coins
    display.renderViruses(game.world.viruses);         // Draw viruses
    display.render();                                  // Any additional rendering
}

// Update function: handles game logic and input
const update = () => {
    if(!game.active) return; // Pause update if game is not active

    // Handle player input
    if(controller.keys.left.isPressed) game.world.player.moveLeft();
    if(controller.keys.right.isPressed) game.world.player.moveRight();
    if(controller.keys.space.isPressed) game.world.player.jump();

    game.update(); // Update game world

    // If the game has ended, switch to the "ended" scene
    if(game.ended && sceneManager.current !== "ended"){
        sceneManager.display("ended");
    }
}

// Start the game engine (game loop)
const engine = new Engine(1000/75, update, render);
engine.start();

// Set up keyboard controls
controller.handleKeyDownUp();

// Pregame: handle scene switching and music on keydown
window.addEventListener("keydown", (e) => {
    if(sceneManager.current === "premenu"){
        sceneManager.display("menu");
        soundManager.playBackgroundMusic("assets/sounds/bgmusic.mp3", 0.5);
        //soundManager.play("click", 2)
    } else if (sceneManager.current == "active" || sceneManager.current == "pause") {
        if (e.key === "Escape") {
            if(game.active){
                sceneManager.display("pause");
                game.active = false;
            } else {
                sceneManager.display("active");
                game.active = true;
            }
            //soundManager.play("click", 2);
        }
    }
});

// Resume game from pause
document.getElementById("resume").addEventListener("click", () => {
    sceneManager.display("active");
    game.active = true;
    //soundManager.play("click", 2);
});

// Start game from menu
document.getElementById("start").addEventListener("click", () => {
    sceneManager.display("active");
    document.getElementById("score").innerHTML = "0m";
    game.active = true;
    //soundManager.play("click", 2);
});

// Open shop
document.getElementById("shop").addEventListener("click", () => {
    shopManager.openShop();
});

// Menu and restart buttons
document.getElementById("menuButton").addEventListener("click", () => {
    sceneManager.display("menu");
    game.restart();
    //soundManager.play("click", 2);
});

document.getElementById("playAgain").addEventListener("click", () => {
    sceneManager.display("menu");
    game.restart();
    //soundManager.play("click", 2);
});

document.getElementById("restart").addEventListener("click", () => {
    sceneManager.display("menu");
    game.restart();
    //soundManager.play("click", 2);
});

document.getElementById("back").addEventListener("click", () => {
    sceneManager.display("menu");
    game.restart();
    //soundManager.play("click", 2);
});

document.getElementById("backButton").addEventListener("click", () => {
    sceneManager.display("menu");
    //soundManager.play("click", 2);
});

// Settings and instructions
document.getElementById("settings").addEventListener("click", () => {
    sceneManager.display("settings");
    //soundManager.play("click", 2);
});

// Music volume control
document.getElementById("music").addEventListener("input", (e) => {
    const value = e.target.value;
    soundManager.backgroundMusic.volume = value / 100;
});

// Show instructions
document.getElementById("instructions").addEventListener("click", () => {
    sceneManager.display("instructions");
    //soundManager.play("click", 2);
});