/**
 * SpriteAnimator - Loads Piskel-exported spritesheets (PNG + JSON)
 * and handles frame-based animation for characters.
 * 
 * Each direction (down, up, left, right) has its own spritesheet.
 */
export class SpriteAnimator {
    /**
     * @param {object} config - Sprite configuration
     * @param {string} config.down  - Path to the front/down walking spritesheet PNG
     * @param {string} config.up    - Path to the back/up walking spritesheet PNG
     * @param {string} config.left  - Path to the side walking spritesheet PNG (will be flipped for right)
     * @param {string} [config.right] - Optional separate right spritesheet, otherwise mirrors left
     * @param {string} config.downJson  - Path to the front JSON
     * @param {string} config.upJson    - Path to the back JSON
     * @param {string} config.leftJson  - Path to the side JSON
     * @param {string} [config.rightJson] - Optional separate right JSON
     * @param {number} [config.animSpeed] - Milliseconds per frame (default: 200)
     */
    constructor(config) {
        this.sheets = {};       // { direction: Image }
        this.frameData = {};    // { direction: [ {x, y, w, h}, ... ] }
        this.loaded = false;
        this.animSpeed = config.animSpeed || 200; // ms per frame
        this.animTimer = 0;
        this.currentFrame = 0;
        this.flipRight = !config.right; // If no separate right sprite, flip left
        this.idleLoop = config.idleLoop || false; // If true, animate even when standing still

        this.config = config;
    }

    /**
     * Load all spritesheets and their JSON metadata
     */
    async load() {
        const directions = ['down', 'up', 'left'];
        if (this.config.right) directions.push('right');

        const promises = directions.map(async (dir) => {
            const imgPath = this.config[dir];
            const jsonPath = this.config[dir + 'Json'];

            if (!imgPath || !jsonPath) return;

            // Load image
            const img = await this.loadImage(imgPath);
            this.sheets[dir] = img;

            // Load JSON frame data
            const response = await fetch(jsonPath);
            const json = await response.json();

            // Parse frames from Piskel format
            // Piskel exports frames as named entries in "frames" object
            const frames = [];
            const frameKeys = Object.keys(json.frames);
            
            // Sort frame keys to ensure correct order
            frameKeys.sort();

            for (const key of frameKeys) {
                const f = json.frames[key].frame;
                frames.push({ x: f.x, y: f.y, w: f.w, h: f.h });
            }

            this.frameData[dir] = frames;
        });

        await Promise.all(promises);

        // If no separate right, copy left data for right
        if (this.flipRight && this.sheets.left) {
            this.sheets.right = this.sheets.left;
            this.frameData.right = this.frameData.left;
        }

        this.loaded = true;
        console.log('🎨 Sprite loaded:', Object.keys(this.sheets));
    }

    loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load sprite: ${src}`));
            img.src = src;
        });
    }

    /**
     * Update animation frame based on movement
     * @param {number} deltaTime - ms since last frame 
     * @param {boolean} isMoving - whether the character is currently walking
     * @param {number} moveProgress - progress from 0.0 to 1.0
     * @param {string} direction - current facing direction
     */
    update(deltaTime, isMoving, moveProgress = 0, direction = 'down') {
        this._lastDirection = direction;
        
        if (!isMoving) {
            if (this.idleLoop) {
                // Idle loop: cycle through frames on a timer (for breathing/blinking animations)
                const frames = this.frameData[direction];
                if (!frames || frames.length <= 1) {
                    this.currentFrame = 0;
                    return;
                }
                this.animTimer += deltaTime;
                if (this.animTimer >= this.animSpeed) {
                    this.animTimer -= this.animSpeed;
                    this.currentFrame = (this.currentFrame + 1) % frames.length;
                }
            } else {
                // Normal idle: reset to first frame
                this.currentFrame = 0;
            }
            return;
        }

        const frames = this.frameData[direction];
        if (!frames || frames.length === 0) return;

        // Based on moveProgress (0 to 1), find which frame to show
        const frameIndex = Math.floor(moveProgress * frames.length);
        this.currentFrame = Math.min(frameIndex, frames.length - 1);
    }

    /**
     * Draw the current animation frame
     * @param {CanvasRenderingContext2D} ctx
     * @param {string} direction - 'up', 'down', 'left', 'right'
     * @param {number} destX - Screen X to draw at
     * @param {number} destY - Screen Y to draw at
     * @param {number} destSize - Size of the tile on screen
     */
    draw(ctx, direction, destX, destY, destSize) {
        if (!this.loaded) return false;

        this._lastDirection = direction;

        const sheet = this.sheets[direction];
        const frames = this.frameData[direction];
        if (!sheet || !frames || frames.length === 0) return false;

        const frame = frames[this.currentFrame % frames.length];

        // Calculate aspect ratio to fit within destSize
        // The sprites are taller than wide (384x682), so we fit height to tile
        // and the character will be a bit narrower — or we can stretch to fill
        const aspectRatio = frame.w / frame.h;
        
        // Scale: fit the sprite height to the tile size, width proportional
        const drawH = destSize;
        const drawW = destSize * aspectRatio;
        
        // Center horizontally within the tile
        const offsetX = (destSize - drawW) / 2;

        ctx.save();

        // The original side sprite faces RIGHT.
        // So we flip horizontally for LEFT direction if we use the mirrored sprite.
        if (direction === 'left' && this.flipRight) {
            ctx.translate(destX + destSize, destY);
            ctx.scale(-1, 1);
            ctx.drawImage(
                sheet,
                frame.x, frame.y, frame.w, frame.h,
                -offsetX, 0, drawW, drawH
            );
        } else {
            ctx.drawImage(
                sheet,
                frame.x, frame.y, frame.w, frame.h,
                destX + offsetX, destY, drawW, drawH
            );
        }

        ctx.restore();
        return true; // Successfully drew sprite
    }
}
