/**
 * GameEngine - Main controller for the Retro Wedding RPG
 * Manages game loop, state transitions, and core systems
 */
import { InputHandler } from './InputHandler.js';
import { OverworldState } from './OverworldState.js';
import { BattleState } from './BattleState.js';
import { createWeddingMap } from './WorldMap.js';

export class GameEngine {
    constructor(canvasId, guestName = 'Guest', audioManager) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.guestName = guestName;
        this.audioManager = audioManager;

        // Core systems
        this.input = new InputHandler();
        this.map = createWeddingMap();

        // Game states
        this.overworldState = new OverworldState(this, this.map, this.guestName);
        this.battleState = new BattleState(this);
        this.currentState = null;

        // Victory overlay
        this.victoryShown = false;
        this.onVictory = null; // Callback set by main.js

        // Timing
        this.lastTime = 0;
        

        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.map.tiledMap.resize(this.tileSize);
    }

    resize() {
        // Make canvas fill the game section
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        // Critical for pixel art: disable smoothing after every resize
        this.ctx.imageSmoothingEnabled = false;
        // Prefix fallbacks for older mobile browsers
        this.ctx.webkitImageSmoothingEnabled = false;
        this.ctx.mozImageSmoothingEnabled = false;
        this.ctx.msImageSmoothingEnabled = false;
    }

    async start() {
        console.log('🎮 Game Engine Started - Wedding RPG');

        // Show loading screen
        this.drawLoading('Loading map...');

        // Load the tiled map assets and character sprites
        await this.map.loadTiledMap();
        await this.map.loadSprites();

        // Enter overworld state
        this.currentState = this.overworldState;
        this.currentState.enter();

        // Start the game loop
        this.lastTime = performance.now();
        this.loop();
    }

    drawLoading(message) {
        const w = this.canvas.width;
        const h = this.canvas.height;
        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, w, h);
        this.ctx.fillStyle = '#FFD700';
        this.ctx.font = '28px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(message, w / 2, h / 2);
        this.ctx.fillStyle = '#888';
        this.ctx.font = '16px Arial';
        this.ctx.fillText('🎮 Epic Wedding RPG', w / 2, h / 2 + 40);
    }

    loop(timestamp = 0) {
    if (this.lastTime === 0) this.lastTime = timestamp;

 
    let deltaTime = timestamp - this.lastTime;
    if (deltaTime > 100) deltaTime = 100; // cap: prevent big jumps after tab switch
    this.lastTime = timestamp;
 
    // Single update per frame with real elapsed time
    if (this.currentState && !this.victoryShown) {
        this.currentState.update(deltaTime);
    }
    this.input.clearJustPressed();
 
    if (this.currentState) {
        this.currentState.draw(this.ctx);
    }
 
    if (this.victoryShown) this.drawVictory();
 
    requestAnimationFrame((ts) => this.loop(ts));
}

    startBattle(npc) {
        console.log('⚔️ Switching to Battle State');
        if (this.audioManager) this.audioManager.playBattleMusic();
        this.currentState.exit();
        this.currentState = this.battleState;
        this.currentState.enter(npc);
    }

    endBattle() {
        console.log('🌍 Returning to Overworld');
        if (this.audioManager) this.audioManager.playBGMusic();
        this.currentState.exit();
        this.currentState = this.overworldState;
        this.currentState.enter();
    }

    showVictory() {
        if (this.victoryShown) return;
        this.victoryShown = true;
        console.log('🎉 Victory!');
        
        // Trigger the HTML victory overlay via callback
        if (this.onVictory) {
            this.onVictory();
        }
    }
}
