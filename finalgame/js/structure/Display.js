import { ShopManager } from "../ShopManager.js";

// Handles all rendering and image management for the game
export class Display {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");

        // Set canvas size
        this.canvas.width = 1280;
        this.canvas.height = 720;

        // Preload images for all game objects
        this.images = {
            player: new Image(),
            platforms: {
                normal: new Image(),
                moving: new Image(),
                jumping: new Image(),
                disappearing: new Image(),
            },
            milestone: new Image(),
            coin: new Image(),
            powerup: new Image(),
            arrow: new Image(),
            virus: new Image(),
        };
        this.shopManager = new ShopManager();

        // Set image sources
        this.images.platforms.normal.src = "assets/images/platforms/normal.png";
        this.images.platforms.moving.src = "assets/images/platforms/moving.png";
        this.images.platforms.jumping.src = "assets/images/platforms/jumping.png";
        this.images.platforms.disappearing.src = "assets/images/platforms/disappearing.png";

        this.images.player.src = "assets/images/player/default.png";
        this.images.coin.src = "assets/images/collectables/coin.png";
        this.images.powerup.src = "assets/images/collectables/powerup.png";
        this.images.arrow.src = "assets/images/arrow.png";
        this.images.virus.src = "assets/images/collectables/virus.png";
    }

    render() {
        // Placeholder for any additional rendering
    }

    // Draw all coins on the canvas
    renderCoins(coins) {
        coins.forEach((coin) => {
            if (coin.y < 0 || coin.y - coin.h > 720) return; // Skip if off screen

            this.ctx.drawImage(
                this.images.coin,
                coin.x,
                coin.y,
                coin.w,
                coin.h
            );
        });
    }

    // Draw all viruses on the canvas
    renderViruses(viruses) {
        viruses.forEach((virus) => {
            if (virus.y + virus.h < 0 || virus.y - virus.h > 720) return; // Skip if off screen

            this.ctx.drawImage(
                this.images.virus,
                virus.x,
                virus.y,
                virus.w,
                virus.h
            );
        });
    }

    // Draw the player, flipping horizontally if needed
    renderPlayer(player) {
        // Change player image if skin changed
        if (
            this.images.player.src !==
            this.shopManager.shopItems.skins[player.skin].src
        ) {
            this.images.player.src =
                this.shopManager.shopItems.skins[player.skin].src;
        }
        if (player.flipped) {
            this.ctx.save();
            this.ctx.translate(player.x + player.w, player.y);
            this.ctx.scale(-1, 1); // Flip horizontally
            this.ctx.drawImage(this.images.player, 0, 0, player.w, player.h);
            this.ctx.restore();
        } else {
            this.ctx.drawImage(
                this.images.player,
                player.x,
                player.y,
                player.w,
                player.h
            );
        }
    }

    // Draw an arrow above the player if they are off the top of the screen
    renderPlayerArrow(player) {
        if (player.y > 0) return;
        this.ctx.drawImage(
            this.images.arrow,
            player.x + player.w / 2 - 16,
            10,
            32,
            32
        );
    }

    // Fill the background with the given color and clear the canvas
    renderColor(color) {
        this.ctx.fillStyle = color;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Draw all platforms
    renderPlatforms(platforms) {
        platforms.forEach((platform) => {
            if (platform.y + platform.h < 0 || platform.y > 720) return; // Skip if off screen

            this.ctx.drawImage(
                this.images.platforms[platform.type],
                platform.x,
                platform.y,
                platform.w,
                platform.h
            );
        });
    }

    // Draw all milestone texts with outline and fill
    renderMilestones(milestones) {
        milestones.forEach((milestone) => {
            if (milestone.y < 0 || milestone.y - milestone.h > 720) return; // Skip if off screen

            this.ctx.fillStyle = milestone.color;
            this.ctx.strokeStyle = "black"; // Outline color
            this.ctx.lineWidth = 8; // Outline thickness
            this.ctx.font = "32px Start2P";

            // Draw outline
            this.ctx.strokeText(milestone.text, milestone.x, milestone.y);
            // Draw fill
            this.ctx.fillText(milestone.text, milestone.x, milestone.y);
        });
    }
}
