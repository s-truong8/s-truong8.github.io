import { userDataManager, sceneManager, soundManager } from "./main.js";


class ShopManager {
    constructor() {
        this.currentCategory = "none";
        this.userDataManager = userDataManager;
        this.guiManager = sceneManager;
        this.soundManager = soundManager;
        this.categoryList = document.querySelector(".itemsContainer");
        this.showcasePreview = document.querySelector(".preview");
        this.description = document.querySelector(".description");
        this.buyButton = document.getElementById("buy");
        this.priceTag = document.getElementById("shopPrice");
        this.playerCoins = document.getElementById("playerCoins");

        // Default skins data (This can be refactored as an external module if needed)
        this.shopItems = {
            skins: {
                default: {
                    name: "Vert",
                    src: "assets/images/player/default.png",
                    price: 0,
                    description: "L'ordinateur par défaut.",
                },
                blue: {
                    name: "Bleu",
                    src: "assets/images/player/blue.png",
                    price: 100,
                    description: "Un ordinateur bleu.",
                },
                red: {
                    name: "Rouge",
                    src: "assets/images/player/red.png",
                    price: 200,
                    description: "Un ordinateur rouge.",
                },
                yellow: {
                    name: "Jaune",
                    src: "assets/images/player/yellow.png",
                    price: 400,
                    description: "Un ordinateur jaune.",
                },
                purple: {
                    name: "Mauve",
                    src: "assets/images/player/purple.png",
                    price: 500,
                    description: "Un ordinateur mauve.",
                },
            },
        };
    }

    // Open shop GUI.
    openShop() {
        this.guiManager.display("shop");
        this.displayCategory("skins");
        this.updateCoins();
    }

    // Closes shop GUI and displays menu.
    closeShop() {
        this.guiManager.display("menu");
        this.categoryList.innerHTML = "";
        this.showcasePreview.style.backgroundImage = "";
        this.description.innerHTML = "";
        this.showcasePreview.style.visibility = "hidden";
        this.currentCategory = "none";
        this.clearListeners();
    }

    // Showcase item image and description.
    showcase(key, item, category) {
        this.clearListeners();
        this.showcasePreview.style.backgroundImage = `url(${item.src})`;
        this.description.innerHTML = item.description;
        this.showcasePreview.style.visibility = "visible";
        this.priceTag.innerHTML = item.price;

        // If player owns item
        if (this.userDataManager.getUserData().owned[category].includes(key)) {
            if (this.userDataManager.getUserData().info.activeSkin == key) {
                this.buyButton.innerHTML = "Actif";
            } else if (this.userDataManager.getUserData().info.activePerks.includes(key)) {
                this.buyButton.innerHTML = "Actif";
            } else {
                this.buyButton.innerHTML = "Choisir";
                this.buyButton.onclick = () => {
                    if (category == "skins") {
                        this.userDataManager.setSkin(key);
                        this.showcase(key, item, category);
                    }
                    this.soundManager.play("click2");
                };
            }
        } else {
            this.buyButton.innerHTML = "Acheter";
            this.buyButton.onclick = () => {
                this.buy(category, key);
            };
        }
    }

    // Clear buy button's listeners
    clearListeners() {
        const newBtn = this.buyButton.cloneNode(true);
        this.buyButton.parentNode.replaceChild(newBtn, this.buyButton);
        this.buyButton = document.getElementById("buy");
    }

    // Displays a category and its items
    displayCategory(category) {
        if (this.currentCategory !== category) {
            this.soundManager.play("click", 2);
            this.clearListeners();
            this.showcasePreview.style.backgroundImage = "";
            this.description.innerHTML = "";
            this.showcasePreview.style.visibility = "hidden";
            this.currentCategory = category;
            document.querySelectorAll(".category button").forEach((btn) => {
                if (btn.classList) {
                    btn.classList.remove("active");
                }
            });
            this.categoryList.innerHTML = "";
            const items = Object.entries(this.shopItems[category]);
            items.forEach((i) => {
                const li = document.createElement("li");
                li.innerHTML = i[1].name;
                this.categoryList.appendChild(li);
                li.addEventListener("click", () => {
                    this.soundManager.play("click", 2);
                    this.categoryList.childNodes.forEach((c) => {
                        if (c.classList) c.classList.remove("active");
                    });
                    li.classList.add("active");
                    this.showcase(i[0], i[1], category);
                });
            });
        }
    }

    // Update coins amount
    updateCoins() {
        console.log(this.userDataManager.getUserData())
        
        this.playerCoins.innerHTML = this.userDataManager.getUserData().info.coins;
    }

    // Buy items
    buy(category, id) {
        const price = this.shopItems[category][id].price;
        if (this.userDataManager.getUserData().info.coins >= price) {
            this.userDataManager.getUserData().owned[category].push(id);
            this.showcase(id, this.shopItems[category][id], category);
            this.userDataManager.removeCoins(price);
            this.soundManager.play("cash");
            this.updateCoins();
        } else {
            this.soundManager.play("error", 0.5);
        }
    }
}

// Export the ShopManager class
export {ShopManager};
