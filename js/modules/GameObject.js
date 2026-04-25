/**
 * GameObject - Base class for all game entities
 * Handles position, sprite, and basic rendering
 */
import { SpriteAnimator } from './SpriteAnimator.js';

export class GameObject {
    constructor(config) {
        this.x = config.x || 0;           // Grid X position
        this.y = config.y || 0;           // Grid Y position
        this.direction = config.direction || 'down';
        this.sprite = config.sprite || null;  // Image or null for placeholder
        this.color = config.color || '#ff00ff'; // Fallback color if no sprite
        this.tileSize = config.tileSize || 32; // Dynamic from WorldMap
    }

    // Convert grid position to pixel position
    get pixelX() {
        return this.x * this.tileSize;
    }

    get pixelY() {
        return this.y * this.tileSize;
    }

    update(deltaTime, game) {
        // Override in subclasses
    }

    draw(ctx, camera) {
        const screenX = this.pixelX - camera.x;
        const screenY = this.pixelY - camera.y;

        if (this.sprite) {
            // TODO: Draw sprite with direction-based frame selection
            ctx.drawImage(this.sprite, screenX, screenY, this.tileSize, this.tileSize);
        } else {
            // Placeholder rectangle
            ctx.fillStyle = this.color;
            ctx.fillRect(screenX, screenY, this.tileSize, this.tileSize);
        }
    }
}

/**
 * Person - A movable character (Player or NPC)
 * NPCs can patrol and chase the player
 */
export class Person extends GameObject {
    constructor(config) {
        super(config);
        this.isMoving = false;
        this.moveProgress = 0;
        this.moveDuration = config.moveDuration || 160;  // ms to cross one tile (lower = faster)
this.moveProgress = 0;                            // 0..1, now driven by real elapsed ms


        this.startX = this.x;
        this.startY = this.y;
        this.targetX = this.x;
        this.targetY = this.y;

        // Identity
        this.isPlayerControlled = config.isPlayerControlled || false;
        this.name = config.name || 'Stranger';
        this.dialogue = config.dialogue || ['...'];
        this.eventId = config.eventId || null;

        // Sprite animation (optional - uses SpriteAnimator if config provided)
        this.spriteAnimator = null;
        if (config.spriteConfig) {
            this.spriteAnimator = new SpriteAnimator(config.spriteConfig);
        }

        // NPC AI
        this.aiState = 'patrol'; // 'patrol', 'chase', 'idle', 'defeated'
        this.patrolRoute = config.patrolRoute || this.generatePatrolRoute(config.x, config.y);
        this.patrolIndex = 0;
        this.chaseRange = config.chaseRange || 5; // Tiles
        this.moveDelay = 0; // Timer between moves
        this.moveInterval = config.moveInterval || 400; // ms between moves

        // Player gets slightly faster movement than NPCs, but slower than before
        if (this.isPlayerControlled) {
    this.moveDuration = 160; // ms per tile for player
} else {
    this.moveDuration = config.moveDuration || 300; // ms per tile for NPCs (slower)
}
    }

    generatePatrolRoute(startX, startY) {
        // Generate a simple square patrol around starting position
        return [
            { x: startX, y: startY },
            { x: startX + 2, y: startY },
            { x: startX + 2, y: startY + 2 },
            { x: startX, y: startY + 2 },
        ];
    }

    startMove(direction, map, ignoreNPCCollision = false) {
        if (this.isMoving) return false;

        const directionMap = {
            up: { x: 0, y: -1 },
            down: { x: 0, y: 1 },
            left: { x: -1, y: 0 },
            right: { x: 1, y: 0 }
        };

        this.direction = direction;
        const delta = directionMap[direction];
        if (!delta) return false;

        const nextX = this.x + delta.x;
        const nextY = this.y + delta.y;

        // Check collision with walls
        if (map.isWall(nextX, nextY)) {
            return false;
        }

        // Check collision with other objects (unless ignoring for chase)
        if (!ignoreNPCCollision) {
            const objectAtTarget = map.getObjectAt(nextX, nextY);
            if (objectAtTarget && objectAtTarget !== this) {
                return false;
            }
        }

        // Start the move
        this.startX = this.x;
        this.startY = this.y;
        this.targetX = nextX;
        this.targetY = nextY;
        this.isMoving = true;
        this.moveProgress = 0;
        return true;
    }

    update(deltaTime, game) {
    if (this.isMoving) {
        // FIX: advance by real elapsed time, not a fixed fraction per tick
        this.moveProgress += deltaTime / this.moveDuration;
 
        if (this.moveProgress >= 1) {
            this.moveProgress = 1; // clamp before snapping so draw() sees t=1 cleanly
            this.x = this.targetX;
            this.y = this.targetY;
            this.isMoving = false;
            this.moveProgress = 0;
        }
    }


        // Update sprite animation
        if (this.spriteAnimator && this.spriteAnimator.loaded) {
            this.spriteAnimator.update(deltaTime, this.isMoving, this.moveProgress, this.direction);
        }

        // NPC AI logic (skip for player-controlled, defeated, or idle entities like the bride)
        if (!this.isPlayerControlled && this.aiState !== 'defeated' && this.aiState !== 'idle') {
            this.updateAI(deltaTime, game);
        }
    }

    updateAI(deltaTime, game) {
        const map = game.map;
        const player = map.player;

        // Calculate distance to player
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const distance = Math.abs(dx) + Math.abs(dy); // Manhattan distance

        // Check if touching player (same tile or moving into player)
        if (distance <= 1 && !player.isMoving) {
            // TOUCH! Start battle immediately
            if (game.currentState === game.overworldState) {
                this.aiState = 'defeated'; // Prevent re-triggering
                game.startBattle(this);
                return;
            }
        }

        // State machine
        if (distance <= this.chaseRange) {
            this.aiState = 'chase';
        } else {
            this.aiState = 'patrol';
        }

        // Movement timer
        this.moveDelay -= deltaTime;
        if (this.moveDelay > 0 || this.isMoving) return;

        // Execute AI behavior
        if (this.aiState === 'chase') {
            this.chasePlayer(player, map);
            this.moveDelay = this.moveInterval * 0.6; // Chase faster
        } else if (this.aiState === 'patrol') {
            this.patrol(map);
            this.moveDelay = this.moveInterval;
        }
    }

    chasePlayer(player, map) {
        const dx = player.x - this.x;
        const dy = player.y - this.y;

        // Prefer the axis with greater distance
        let direction = null;
        if (Math.abs(dx) > Math.abs(dy)) {
            direction = dx > 0 ? 'right' : 'left';
        } else if (dy !== 0) {
            direction = dy > 0 ? 'down' : 'up';
        }

        if (direction) {
            const moved = this.startMove(direction, map, true);
            // If blocked, try the other axis
            if (!moved) {
                if (Math.abs(dx) <= Math.abs(dy)) {
                    direction = dx > 0 ? 'right' : 'left';
                } else {
                    direction = dy > 0 ? 'down' : 'up';
                }
                this.startMove(direction, map, true);
            }
        }
    }

    patrol(map) {
        if (this.patrolRoute.length === 0) return;

        const target = this.patrolRoute[this.patrolIndex];
        const dx = target.x - this.x;
        const dy = target.y - this.y;

        // Reached patrol point?
        if (dx === 0 && dy === 0) {
            this.patrolIndex = (this.patrolIndex + 1) % this.patrolRoute.length;
            return;
        }

        // Move towards patrol point
        let direction = null;
        if (dx !== 0) {
            direction = dx > 0 ? 'right' : 'left';
        } else if (dy !== 0) {
            direction = dy > 0 ? 'down' : 'up';
        }

        if (direction) {
            this.startMove(direction, map);
        }
    }

    // Override draw for interpolated movement + visual feedback
    draw(ctx, camera, ts) {
        const tileSize = ts || this.tileSize;
        let drawX, drawY;

        if (this.isMoving) {
            drawX = (this.startX + (this.targetX - this.startX) * this.moveProgress) * tileSize;
            drawY = (this.startY + (this.targetY - this.startY) * this.moveProgress) * tileSize;
        } else {
            drawX = this.x * tileSize;
            drawY = this.y * tileSize;
        }

        // New code:
const camX = Math.round(camera.x);
const camY = Math.round(camera.y);
const screenX = Math.round(drawX) - camX;
const screenY = Math.round(drawY) - camY;

        // Draw shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(screenX + tileSize / 2, screenY + tileSize - 2, tileSize * 0.35, tileSize * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();

        // Try to draw sprite if available
        let spriteDrawn = false;
        if (this.spriteAnimator && this.spriteAnimator.loaded) {
            spriteDrawn = this.spriteAnimator.draw(ctx, this.direction, screenX, screenY, tileSize);
        }

        // Fallback: draw colored placeholder if no sprite
        if (!spriteDrawn) {
            ctx.fillStyle = this.color;
            ctx.fillRect(screenX + 4, screenY + 4, tileSize - 8, tileSize - 8);

            // Draw direction indicator arrow
            ctx.fillStyle = 'white';
            const cx = screenX + tileSize / 2;
            const cy = screenY + tileSize / 2;
            ctx.beginPath();
            const arrowSize = tileSize * 0.2;
            if (this.direction === 'up') {
                ctx.moveTo(cx, screenY + 8);
                ctx.lineTo(cx - arrowSize, screenY + 8 + arrowSize);
                ctx.lineTo(cx + arrowSize, screenY + 8 + arrowSize);
            } else if (this.direction === 'down') {
                ctx.moveTo(cx, screenY + tileSize - 8);
                ctx.lineTo(cx - arrowSize, screenY + tileSize - 8 - arrowSize);
                ctx.lineTo(cx + arrowSize, screenY + tileSize - 8 - arrowSize);
            } else if (this.direction === 'left') {
                ctx.moveTo(screenX + 8, cy);
                ctx.lineTo(screenX + 8 + arrowSize, cy - arrowSize);
                ctx.lineTo(screenX + 8 + arrowSize, cy + arrowSize);
            } else if (this.direction === 'right') {
                ctx.moveTo(screenX + tileSize - 8, cy);
                ctx.lineTo(screenX + tileSize - 8 - arrowSize, cy - arrowSize);
                ctx.lineTo(screenX + tileSize - 8 - arrowSize, cy + arrowSize);
            }
            ctx.closePath();
            ctx.fill();
        }

        // Draw "chase mode" indicator (red outline) for NPCs
        if (this.aiState === 'chase') {
            ctx.strokeStyle = '#FF0000';
            ctx.lineWidth = 3;
            ctx.strokeRect(screenX + 2, screenY + 2, tileSize - 4, tileSize - 4);

            // Exclamation mark
            ctx.fillStyle = '#FF0000';
            ctx.font = `bold ${tileSize * 0.5}px Arial`;
            ctx.textAlign = 'center';
            ctx.fillText('!', screenX + tileSize / 2, screenY - 5);
        }

        // Draw name above NPC (not player)
        if (!this.isPlayerControlled && this.aiState !== 'defeated') {
            ctx.fillStyle = 'white';
            ctx.font = `${Math.max(10, tileSize * 0.3)}px Arial`;
            ctx.textAlign = 'center';
            ctx.fillText(this.name, screenX + tileSize / 2, screenY - 8);
        }
    }

    getFacingTile() {
        const directionMap = {
            up: { x: 0, y: -1 },
            down: { x: 0, y: 1 },
            left: { x: -1, y: 0 },
            right: { x: 1, y: 0 }
        };
        const delta = directionMap[this.direction];
        return { x: this.x + delta.x, y: this.y + delta.y };
    }
}

