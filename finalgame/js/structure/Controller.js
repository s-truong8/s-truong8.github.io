export class Controller {
    constructor() {
        // Define keys and their associated key codes
        this.keys = {
            up: new Controller.ButtonInput([87, 38]),    // W, Up Arrow
            left: new Controller.ButtonInput([65, 37]),   // A, Left Arrow
            right: new Controller.ButtonInput([68, 39]),  // D, Right Arrow
            down: new Controller.ButtonInput([83, 40]),    // S, Down Arrow
            space: new Controller.ButtonInput([32]) // Spacebar
        };

        this.handleKeyDownUp(); // Set up event listeners for key input
    }

    // Represents a button input (can have multiple key codes)
    static ButtonInput = class {
        constructor(keyCodes) {
            this.isPressed = false; // Is the button currently pressed?
            this.keyCodes = keyCodes; // Array of key codes for this button
        }
    }

    // Set up keydown and keyup event listeners
    handleKeyDownUp() {
        // Handle keydown event
        document.addEventListener("keydown", (e) => {
            const keyCode = e.keyCode;
            for (const key in this.keys) {
                if (this.keys[key].keyCodes.includes(keyCode)) {
                    this.keys[key].isPressed = true; // Mark as pressed
                }
            }
        });

        // Handle keyup event
        document.addEventListener("keyup", (e) => {
            const keyCode = e.keyCode;

            for (const key in this.keys) {
                if (this.keys[key].keyCodes.includes(keyCode)) {
                    this.keys[key].isPressed = false; // Mark as released
                }
            }
        });
    }
}