export class Engine {
    constructor(timeStep, update, render) {
        this.timeStep = timeStep; // Desired time between updates (ms)
        this.update = update;     // Update function (game logic)
        this.render = render;     // Render function (drawing)

        this.animationFrameRequest = undefined; // Stores the requestAnimationFrame id
        this.time = undefined;                  // Last timestamp
    }

    // Main loop function, called by requestAnimationFrame
    run = (timeStamp) => {
        if (!this.time) {
            this.time = timeStamp; // Initialize time on first run
        }

        const deltaTime = timeStamp - this.time; // Time since last frame

        // Only update game logic if enough time has passed
        if (deltaTime >= this.timeStep) {
            this.update();
            this.time = timeStamp;
        }

        this.render(); // Always render

        // Request the next frame
        this.animationFrameRequest = requestAnimationFrame(this.run);
    }

    // Start the game loop
    start() {
        this.animationFrameRequest = requestAnimationFrame(this.run);
    }

    // Stop the game loop
    stop() {
        cancelAnimationFrame(this.animationFrameRequest);
    }
}