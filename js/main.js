import { GameEngine } from './modules/GameEngine.js';
import { DeviceManager } from './modules/DeviceManager.js';
import { AudioManager } from './modules/AudioManager.js';

// Init Device Manager (safe to run before DOM)
const deviceManager = new DeviceManager();
const audioManager = new AudioManager();

// Global state to store guest name
window.guestName = "";

// State Management
const STATE = {
    NAME_INPUT: 'name',
    LANDING: 'landing',
    VIDEO: 'video',
    GAME: 'game',
    VICTORY: 'victory',
    INFO: 'info'
};

let currentState = STATE.NAME_INPUT;
let gameInstance = null;

// Wait for DOM to be ready before accessing elements
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const nameSection = document.getElementById('name-section');
    const landingSection = document.getElementById('landing-section');
    const videoSection = document.getElementById('video-section');
    const gameSection = document.getElementById('game-section');
    const infoSection = document.getElementById('info-section');
    
    const nameInput = document.getElementById('guest-name-input');
    const nameSubmitBtn = document.getElementById('name-submit-btn');
    const startBtn = document.getElementById('start-btn');
    const skipBtn = document.getElementById('skip-btn');
    const introVideo = document.getElementById('intro-video');
    
    const victoryOverlay = document.getElementById('victory-overlay');
    const victoryContinueBtn = document.getElementById('victory-continue-btn');
    const skipToInfoBtn = document.getElementById('skip-to-info-btn');
    const infoGuestName = document.getElementById('info-guest-name');
    const rsvpBtn = document.getElementById('rsvp-btn');

    // Verify elements exist
    if (!nameSection || !nameSubmitBtn) {
        console.error('Critical DOM elements not found!');
        return;
    }

    // === Event Listeners ===

    // Name Submit
    if (nameSubmitBtn) {
        nameSubmitBtn.addEventListener('click', () => {
            const name = nameInput.value.trim();
            if (name) {
                window.guestName = name;
                transitionTo(STATE.LANDING);
                audioManager.playBGMusic(); // Start music on first interaction
            } else {
                nameInput.focus();
            }
        });
    }

    // Allow Enter key to submit name
    if (nameInput) {
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                nameSubmitBtn.click();
            }
        });
    }

    // Start button (landing → video)
    startBtn.addEventListener('click', () => {
        transitionTo(STATE.VIDEO);
    });

    // Skip video button
    if (skipBtn) {
        skipBtn.addEventListener('click', () => {
            if (introVideo) introVideo.pause();
            transitionTo(STATE.GAME);
        });
    }

    // Video ended
    if (introVideo) {
        introVideo.addEventListener('ended', () => {
            transitionTo(STATE.GAME);
        });
    }

    // Victory "Open the Sacred Scroll" button
    if (victoryContinueBtn) {
        victoryContinueBtn.addEventListener('click', () => {
            transitionTo(STATE.INFO);
        });
    }

    // Skip to Invitation button (from landing or game)
    if (skipToInfoBtn) {
        skipToInfoBtn.addEventListener('click', () => {
            if (introVideo) introVideo.pause();
            transitionTo(STATE.INFO);
            audioManager.playBGMusic(); // Ensure music plays if skipped from landing
        });
    }

    // === Transition Logic ===

    function transitionTo(newState) {
        // Hide all sections
        nameSection?.classList.remove('active-section');
        landingSection?.classList.remove('active-section');
        videoSection?.classList.remove('active-section');
        gameSection?.classList.remove('active-section');
        infoSection?.classList.remove('active-section');

        // Hide victory overlay
        if (victoryOverlay) victoryOverlay.classList.add('hidden');

        // Hide skip-to-info button by default
        if (skipToInfoBtn) skipToInfoBtn.classList.add('hidden');

        // Reset body classes for non-scrollable states
        document.body.classList.add('overflow-hidden', 'touch-none');

        // Show new state
        switch (newState) {
            case STATE.NAME_INPUT:
                nameSection?.classList.add('active-section');
                break;

            case STATE.LANDING:
                landingSection?.classList.add('active-section');
                // Show skip button on landing
                if (skipToInfoBtn) skipToInfoBtn.classList.remove('hidden');
                audioManager.playBGMusic();
                break;

            case STATE.VIDEO:
                videoSection?.classList.add('active-section');
                audioManager.pauseAll(); // Stop music for video
                if (introVideo) {
                    introVideo.play().catch(e => {
                        console.log("Auto-play blocked, skipping to game:", e);
                        transitionTo(STATE.GAME);
                    });
                } else {
                    transitionTo(STATE.GAME);
                }
                break;

            case STATE.GAME:
                gameSection?.classList.add('active-section');
                // Show skip button during game
                if (skipToInfoBtn) skipToInfoBtn.classList.remove('hidden');
                audioManager.resume(); // Resume music when entering game
                initGame();
                break;

            case STATE.VICTORY:
                // Keep game section visible behind the overlay
                gameSection?.classList.add('active-section');
                if (victoryOverlay) victoryOverlay.classList.remove('hidden');
                audioManager.playBGMusic(); // Back to bg music for victory
                break;

            case STATE.INFO:
                infoSection?.classList.add('active-section');
                // Allow scrolling on the info page
                document.body.classList.remove('overflow-hidden', 'touch-none');
                // Personalize the info page with the guest name
                if (infoGuestName && window.guestName) {
                    infoGuestName.textContent = `Dear ${window.guestName}`;
                }
                
                // Dynamically update the RSVP link to carry the guest name
                if (rsvpBtn && window.guestName) {
                    // Note: Google Forms short links (forms.gle) sometimes drop URL parameters. 
                    // For best results, use the full long URL (https://docs.google.com/forms/d/e/.../viewform)
                    // Replace 'entry.YOUR_FIELD_ID' with the actual entry ID from "Get pre-filled link"
                    const baseUrl = rsvpBtn.href.split('?')[0];
                    rsvpBtn.href = `${baseUrl}?usp=pp_url&entry.154091357=${encodeURIComponent(window.guestName)}`;
                }
                
                audioManager.playBGMusic(); // Ensure music plays on info page
                break;
        }
        currentState = newState;
    }

    function initGame() {
        if (gameInstance) return; // Already initialized

        console.log("Initializing Game Engine with guest:", window.guestName);
        try {
            gameInstance = new GameEngine('gameCanvas', window.guestName, audioManager);
            
            // Listen for victory event from the game engine
            gameInstance.onVictory = () => {
                transitionTo(STATE.VICTORY);
            };
            
            gameInstance.start();
        } catch (err) {
            console.error("Failed to init game:", err);
        }
    }

    // Start on Name Input
    transitionTo(STATE.NAME_INPUT);
});

