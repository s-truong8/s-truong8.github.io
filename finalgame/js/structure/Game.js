import { soundManager, userDataManager } from "../main.js";

// Main Game class
export class Game {
    constructor() {
        this.world = new Game.World("#dd7272"); // Initialize the game world with background color
        this.cameraActive = false;              // Camera follow state
        this.active = false;                    // Game active state
        this.ended = false;                     // Game ended state
        document.getElementById("coins").innerText =
            userDataManager.getUserData().info.coins; // Set initial coin count in UI
        document.getElementById("score").innerText = "0m"; // Set initial score in UI
    }

    // World class: contains all game objects and world logic
    static World = class {
        constructor(bgColor) {
            this.bgColor = bgColor;
            this.player = new Game.Player(
                100, 670, 48, 48, 0, 0, 2, userDataManager.getUserData().info.activeSkin
            ); // Create player
            this.platforms = [];
            this.milestones = [];
            this.coins = [];
            this.powerups = [];
            this.viruses = [];
            this.vy = 0; // Camera/world vertical speed
            this.generatePlatforms(); // Generate platforms
            this.trueDistance = 0;    // Total distance climbed
            this.loadMilestones();    // Generate milestones
            this.generateCoins();     // Generate coins
            this.generateViruses();   // Generate viruses
        }

        // Generate coins in zones up to y = -50000
        generateCoins() {
            const zoneHeight = 1000;
            const minCoinsPerZone = 2;
            const maxCoinsPerZone = 5;
            const coinWidth = 32;
            const coinHeight = 32;

            for (let zone = 0; zone < 50; zone++) {
                const zoneTop = -zone * zoneHeight;
                const zoneBottom = zoneTop - zoneHeight;
                const coinsInZone =
                    Math.floor(
                        Math.random() * (maxCoinsPerZone - minCoinsPerZone + 1)
                    ) + minCoinsPerZone;

                for (let i = 0; i < coinsInZone; i++) {
                    const x = Math.random() * (1280 - coinWidth);
                    const y =
                        zoneBottom +
                        Math.random() * (zoneTop - zoneBottom - coinHeight);

                    this.coins.push(
                        new Game.Collectable(
                            x, y, coinWidth, coinHeight, 0, 0, "coin"
                        )
                    );
                }
            }
        }

        // Generate viruses randomly, some can move vertically
        generateViruses() {
            const virusCount = 60;
            const virusWidth = 64;
            const virusHeight = 64;

            for (let i = 0; i < virusCount; i++) {
                const y = -10000 - Math.random() * 40000;
                const x = Math.random() * (1280 - virusWidth);

                let vx = Math.random() * 2;
                let vy = 0;
                if (y <= -20000) {
                    vy = (Math.random() - 0.5) * 4; // Only move vertically if y <= -20000
                }

                this.viruses.push(
                    new Game.Collectable(
                        x, y, virusWidth, virusHeight, vx, vy, "virus"
                    )
                );
            }
        }

        // Generate milestone markers for levels
        loadMilestones() {
            let lastY = 0;
            for (let i = 0; i < 20; i++) {
                lastY -= 1000;
                const level = i / 5 + 1;
                const distance = Math.abs(lastY / 10);
                let text;
                if (i % 5 === 0) {
                    text = `${distance}m - Niveau ${level}`;
                } else {
                    text = `${distance}m`;
                }
                if (level == 10) {
                    text = `${distance}m - Niveau ${level} - Fin du jeu!`;
                }
                this.milestones.push(
                    new Game.Milestone(
                        50, 720 + lastY, 200, 100, 0, 0, "white", text
                    )
                );
            }
        }

        // Generate platforms for all levels
        generatePlatforms() {
            let lastY = 600;
            let lastX = 640; // Start roughly in the middle

            // Base platform at the bottom
            this.platforms.push(
                new Game.Platform(0, 720, 1280, 20, 0, 0, "normal")
            );

            for (let i = 0; i < 1000; i++) {
                // Random vertical gap between platforms
                let verticalGap;
                if (Math.random() < 0.5) {
                    verticalGap = 100 + Math.random() * 100;
                } else {
                    verticalGap = 0;
                }

                lastY -= verticalGap;

                let type = "normal";
                const absY = Math.abs(lastY);

                // Platform type selection by level
                if (absY < 5000) {
                    let rand = Math.random();
                    if (rand < 0.8) {
                        type = "normal";
                    } else {
                        type = "jumping";
                    }
                }
                else if (absY < 10000) {
                    let rand = Math.random();
                    if (rand < 0.6) {
                        type = "normal";
                    } else if (rand < 0.8) {
                        type = "moving";
                    } else {
                        type = "jumping";
                    }
                }
                else if (absY < 15000) {
                    type = "moving";
                }
                else if (absY < 20000) {
                    let rand = Math.random();
                    if (rand < 0.5) {
                        type = "normal";
                    } else if (rand < 0.7) {
                        type = "moving";
                    } else if (rand < 0.85) {
                        type = "jumping";
                    } else {
                        type = "disappearing";
                    }
                }
                else if (absY < 25000) {
                    type = "normal";
                }
                else if (absY < 30000) {
                    let rand = Math.random();
                    if (rand < 0.4) {
                        type = "normal";
                    } else if (rand < 0.7) {
                        type = "moving";
                    } else if (rand < 0.9) {
                        type = "jumping";
                    } else {
                        type = "disappearing";
                    }
                }
                else if (absY < 35000) {
                    type = "moving";
                }
                else if (absY < 40000) {
                    let rand = Math.random();
                    if (rand < 0.3) {
                        type = "normal";
                    } else if (rand < 0.6) {
                        type = "moving";
                    } else if (rand < 0.8) {
                        type = "jumping";
                    } else {
                        type = "disappearing";
                    }
                }
                else if (absY < 45000) {
                    type = "moving";
                }
                else if (absY < 50000) {
                    let rand = Math.random();
                    if (rand < 0.25) {
                        type = "normal";
                    } else if (rand < 0.5) {
                        type = "moving";
                    } else if (rand < 0.75) {
                        type = "jumping";
                    } else {
                        type = "disappearing";
                    }
                }
                else {
                    type = "normal"; // Fallback for beyond level 10
                }

                this.platforms.push(
                    new Game.Platform(
                        Math.random() * (1280 - 96),
                        lastY,
                        96,
                        24,
                        0,
                        0,
                        type
                    )
                );
            }
        }
    };

    // Collectable class for coins, viruses, etc.
    static Collectable = class {
        constructor(x, y, w, h, vx, vy, type) {
            this.x = x;
            this.y = y;
            this.w = w;
            this.h = h;
            this.vx = vx;
            this.vy = vy;
            this.type = type;
        }

        update() {
            this.x += this.vx;
            this.y += this.vy;

            // Bounce horizontally if out of bounds
            if (this.x < 0 || this.x > 1280 - this.w) {
                this.vx *= -1;
            }
        }
    };

    // Platform class for all platform types
    static Platform = class {
        constructor(x, y, w, h, vx, vy, type = "normal") {
            this.x = x;
            this.y = y;
            this.w = w;
            this.h = h;
            this.vx = vx;
            this.vy = vy;
            this.type = type;
            // Set color and movement for special platforms
            if (this.type == "moving") {
                this.vx = 5;
                this.color = "#00ccf0";
            }
            if (this.type == "jumping") {
                this.color = "#3ef837";
            }
            if (this.type == "disappearing") {
                this.color = "#f0a500";
            }
            if (this.type == "normal") {
                this.color = "#000000";
            }
        }

        update() {
            this.x += this.vx;
            this.y += this.vy;

            // Reverse direction if moving platform hits edge
            if (this.type == "moving") {
                if (this.x < 0 || this.x > 1280 - this.w) {
                    this.vx *= -1;
                }
            }
        }
    };

    // Milestone class for level markers
    static Milestone = class {
        constructor(x, y, w, h, vx, vy, color, text) {
            this.x = x;
            this.y = y;
            this.w = w;
            this.h = h;
            this.vx = vx;
            this.vy = vy;
            this.color = color;
            this.text = text;
        }

        update() {
            this.x += this.vx;
            this.y += this.vy;
        }
    };

    // Player class with movement, jumping, and collision logic
    static Player = class {
        constructor(x, y, w, h, vx, vy, gravity, skin) {
            this.x = x;
            this.y = y;
            this.w = w;
            this.h = h;
            this.vx = vx;
            this.vy = vy;
            this.gravity = gravity;
            this.skin = skin;
            this.isJumping = false;
            this.floorY = 720;
            this.floorPlatform = null;
            this.trueDistance = 0;
            this.highestDistance = 0;
            this.alive = true;
            this.flipped = false;
        }

        moveLeft() {
            this.x -= 15;
            this.flipped = true;
        }

        moveRight() {
            this.x += 15;
            this.flipped = false;
        }

        // Check which platform the player is standing on
        checkPlatforms(platforms) {
            if (!this.alive) {
                this.floorY = 800;
                return;
            }
            this.floorY = 800;
            let count = 0;
            this.floorPlatform = null;
            platforms.forEach((platform) => {
                if (
                    this.x + this.w > platform.x &&
                    this.x < platform.x + platform.w
                ) {
                    // on platform x axis
                    if (this.y + this.h <= platform.y) {
                        // If no floorPlatform yet, or this platform is higher
                        if (
                            this.floorPlatform === null ||
                            platform.y < this.floorPlatform.y ||
                            (this.floorPlatform.type === "normal" &&
                                platform.type !== "normal" &&
                                platform.y <= this.floorPlatform.y)
                        ) {
                            this.floorY = platform.y;
                            this.floorPlatform = platform;
                        }
                        count++;
                    }
                }
            });
        }

        // Player jump logic
        jump() {
            if (this.y + this.h >= this.floorY && this.alive) {
                this.vy = -40; // Jump velocity
                this.isJumping = true;
                soundManager.play("jump")
            }
        }

        update() {
            // Apply gravity if jumping or in air
            if (this.isJumping || this.y < this.floorY) {
                this.vy += this.gravity;
            }
            this.prevY = this.y;
            this.y += this.vy;

            // Death if player falls below screen
            if (this.y > 720) {
                this.alive = false;
            }

            // Land on platform
            if (this.y + this.h >= this.floorY) {
                this.y = this.floorY - this.h;
                this.vy = 0;
                this.isJumping = false;
                if (this.floorPlatform) {
                    if (this.floorPlatform.type == "jumping") {
                        soundManager.play("coil", 0.5)
                        this.vy = -80;
                    }
                    if (this.floorPlatform.type == "moving") {
                        this.x += this.floorPlatform.vx;
                    }
                    if (this.floorPlatform.type == "disappearing") {
                        this.floorPlatform.y = 1000;
                        soundManager.play("crack", 0.5)
                    }
                }
            }

            // Wrap around horizontally
            if (this.x < 0 - this.w) {
                this.x = 1280;
            } else if (this.x > 1280) {
                this.x = 0 - this.w;
            }

            this.trueDistance -= this.vy;

            // Update score if new highest distance reached
            if (this.trueDistance > this.highestDistance) {
                document.getElementById("score").innerText =
                    Math.abs(Math.floor(this.trueDistance / 10)) + "m";
                this.highestDistance = this.trueDistance;
            }
        }
    };

    // Main game update loop
    update() {
        // Update all platforms
        this.world.platforms.forEach((platform) => {
            platform.update();
        });

        // Update all viruses and check for collision with player
        this.world.viruses.forEach((virus) => {
            virus.update();
            if (
                this.world.player.x < virus.x + virus.w &&
                this.world.player.x + this.world.player.w > virus.x &&
                this.world.player.y < virus.y + virus.h &&
                this.world.player.y + this.world.player.h > virus.y
            ) {
                if(this.world.platforms.length !== 0){
                    soundManager.play("error2")
                }
                // Remove all platforms on virus collision
                this.world.platforms = [];
            }
        });

        // Remove platforms and coins that are below the screen
        this.world.platforms = this.world.platforms.filter(
            (platform) => platform.y <= 720
        );
        this.world.coins = this.world.coins.filter((coin) => coin.y <= 720);

        // Check which platform the player is standing on
        this.world.player.checkPlatforms(this.world.platforms);

        // Check for coin collection
        this.world.coins.forEach((coin) => {
            if (
                this.world.player.x < coin.x + coin.w &&
                this.world.player.x + this.world.player.w > coin.x &&
                this.world.player.y < coin.y + coin.h &&
                this.world.player.y + this.world.player.h > coin.y
            ) {
                this.world.coins = this.world.coins.filter((c) => c !== coin);
                this.addCoin(1);
                soundManager.play("coin")
            }
        });

        // Update player physics and state
        this.world.player.update();

        // Camera follow logic: keep player at y = 200
        const cameraAnchor = 200;
        const cameraActivationY = 200;
        this.world.vy = 0;
        if (!this.cameraActive && this.world.player.y < cameraActivationY) {
            this.cameraActive = true;
        }

        if (this.cameraActive) {
            let diff = this.world.player.y - cameraAnchor;
            const speedFactor = 0.1;
            const maxSpeed = 1000;

            if (Math.abs(diff) > 10) {
                this.world.vy = -(
                    Math.sign(diff) *
                    Math.min(Math.abs(diff) * speedFactor, maxSpeed)
                );

                // Only move up if player is near bottom and alive
                if (
                    diff > 10 &&
                    this.world.player.y < 740 - this.world.player.h &&
                    this.world.player.alive
                ) {
                    this.world.vy = 0;
                }
            } else {
                this.world.vy = 0;
            }
        }

        // Hard mode: increase camera speed
        if (
            document.getElementById("difficulty").checked &&
            this.world.player.trueDistance > 200
        ) {
            this.world.vy += 2;
        }

        // Move all world objects by vy
        this.world.platforms.forEach((platform) => {
            platform.y += this.world.vy;
        });
        this.world.milestones.forEach((milestone) => {
            milestone.y += this.world.vy;
        });
        this.world.coins.forEach((coin) => {
            coin.y += this.world.vy;
        });
        this.world.viruses.forEach((virus) => {
            virus.y += this.world.vy;
        });

        this.world.trueDistance += this.world.vy;

        // Move the player by vy only if alive
        if (this.world.player.alive) {
            this.world.player.y += this.world.vy;
        }

        // End the game and show final score if player just died
        if (this.world.player.alive == false && !this.ended) {
            this.ended = true;
            soundManager.play("fall")
            document.getElementById("finalScore").innerText =
                "Score final: " +
                Math.abs(Math.floor(this.world.player.highestDistance / 10)) +
                "m";
        }
    }

    // Add coins to the user and update UI
    addCoin(amount) {
        //if (this.powerups.coins) {
        //    amount *= 2;
        //}
        //soundManager.play("coin");
        userDataManager.addCoins(amount);
        document.getElementById("coins").innerText =
            userDataManager.getUserData().info.coins;
    }

    // Pause the game
    pause() {
        this.active = false;
    }

    // Resume the game
    resume() {
        this.active = true;
    }

    // Restart the game world and reset state
    restart() {
        this.world = new Game.World();
        this.cameraActive = false;
        this.active = false;
        this.ended = false;
    }
}
