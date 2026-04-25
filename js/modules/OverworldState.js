/**
 * OverworldState - Handles exploration/walking phase of the game
 */
export class OverworldState {
    constructor(game, map, guestName = 'Guest') {
        this.game = game;
        this.map = map;
        this.guestName = guestName;
        this.camera = {
            x: 0,
            y: 0,
            width: game.canvas.width,
            height: game.canvas.height
        };
        this.interactionPrompt = null; // { text, x, y } when near NPC
        this.gamePaused = false;
        this.welcomeShown = false; // Add flag to track if welcome was already shown
        
        // Setup welcome popup elements
        this.welcomePopup = document.getElementById('game-welcome-popup');
        this.welcomeText = document.getElementById('game-welcome-text');
        this.welcomeBtn = document.getElementById('game-welcome-btn');
        
        if (this.welcomeBtn) {
            this.welcomeBtn.addEventListener('click', () => {
                if (this.welcomePopup) this.welcomePopup.style.display = 'none';
                this.gamePaused = false;
            });
        }
    }

    enter() {
        console.log('Entered Overworld State');
        this.centerCameraOnPlayer();

        // Show welcome popup only the first time
        if (this.welcomePopup && this.welcomeText && !this.game.victoryShown && !this.welcomeShown) {
            this.gamePaused = true;
            this.welcomeShown = true;
            this.welcomeText.innerHTML = `Hello ${this.guestName}, please help Carlos reach Ana at the altar by avoiding or defeating the guests!`;
            this.welcomePopup.style.display = 'flex';
        }
    }

    exit() {
        console.log('Exiting Overworld State');
    }

    update(deltaTime) {
        if (this.gamePaused) return;

        const input = this.game.input;
        const player = this.map.player;

        // Handle movement
        if (!player.isMoving) {
            const direction = input.getDirection();
            if (direction) {
                player.startMove(direction, this.map);
            }
        }

        // Handle interaction
        if (input.isJustPressed('INTERACT') && !player.isMoving) {
            this.tryInteract();
        }

        // Update map (player, NPCs)
        this.map.update(deltaTime, this.game);

        // Update camera to follow player
        this.centerCameraOnPlayer();

        // Check for goal (reaching the bride) — adjacent tile counts
        const goalDx = Math.abs(player.x - this.map.goal.x);
        const goalDy = Math.abs(player.y - this.map.goal.y);
        if ((goalDx + goalDy) <= 1 && !player.isMoving) {
            this.onReachGoal();
        }

        // Check for nearby NPCs for interaction prompt
        this.checkInteractionPrompt();
    }

    draw(ctx) {
        // Clear canvas
        ctx.fillStyle = '#222';
        ctx.fillRect(0, 0, this.game.canvas.width, this.game.canvas.height);

        // Update camera dimensions in case of resize
        this.camera.width = this.game.canvas.width;
        this.camera.height = this.game.canvas.height;

        // Draw the map (ground, walls, objects, player)
        this.map.draw(ctx, this.camera);

        // Draw interaction prompt if present
        if (this.interactionPrompt) {
            this.drawInteractionPrompt(ctx);
        }
    }

    centerCameraOnPlayer() {
    const player = this.map.player;
    const ts = this.map.tileSize;

    // Compute player's actual pixel position including mid-move interpolation
    const px = player.isMoving
        ? (player.startX + (player.targetX - player.startX) * player.moveProgress) * ts
        : player.x * ts;
    const py = player.isMoving
        ? (player.startY + (player.targetY - player.startY) * player.moveProgress) * ts
        : player.y * ts;

    // Center camera on player, clamped to map bounds
    const maxX = this.map.width  * ts - this.game.canvas.width;
    const maxY = this.map.height * ts - this.game.canvas.height;

    // Integer camera — no sub-pixel drift
    this.camera.x = Math.round(Math.max(0, Math.min(px - this.game.canvas.width  / 2 + ts / 2, maxX)));
    this.camera.y = Math.round(Math.max(0, Math.min(py - this.game.canvas.height / 2 + ts / 2, maxY)));
}

    tryInteract() {
        const player = this.map.player;
        const facingTile = player.getFacingTile();
        const npc = this.map.getObjectAt(facingTile.x, facingTile.y);

        if (npc && npc.eventId) {
            console.log(`Interacting with: ${npc.name}`);
            // Transition to Battle/Event state
            this.game.startBattle(npc);
        }
    }

    checkInteractionPrompt() {
        const player = this.map.player;
        const facingTile = player.getFacingTile();
        const npc = this.map.getObjectAt(facingTile.x, facingTile.y);

        if (npc && !player.isMoving) {
            this.interactionPrompt = {
                text: `[SPACE] Talk to ${npc.name}`,
                x: this.game.canvas.width / 2,
                y: this.game.canvas.height - 60
            };
        } else {
            this.interactionPrompt = null;
        }
    }

    drawInteractionPrompt(ctx) {
        const prompt = this.interactionPrompt;
        ctx.save();

        // Background box
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        const textWidth = ctx.measureText(prompt.text).width + 40;
        ctx.fillRect(prompt.x - textWidth / 2, prompt.y - 20, textWidth, 40);

        // Text
        ctx.fillStyle = '#FFD700';
        ctx.font = '18px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(prompt.text, prompt.x, prompt.y);

        ctx.restore();
    }
    onReachGoal() {
        console.log('🎉 Player reached the goal!');
        this.game.showVictory();
    }
}
