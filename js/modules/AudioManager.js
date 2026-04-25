export class AudioManager {
    constructor() {
        this.bgMusic = new Audio('assets/music/bgmusic.mp3');
        this.bgMusic.loop = true;
        this.bgMusic.volume = 0.4;

        // Use %20 for the space in 'battle stage.mp3' to ensure it loads on all browsers
        this.battleMusic = new Audio('assets/music/battlestage.mp3');
        this.battleMusic.loop = true;
        this.battleMusic.volume = 0.5;

        this.currentMusic = null;
    }

    playBGMusic() {
        if (this.currentMusic === this.bgMusic && !this.bgMusic.paused) return;
        
        // Pause battle music and reset it so it's fresh next time
        this.battleMusic.pause();
        this.battleMusic.currentTime = 0;

        // Play BG music (resumes from previous currentTime)
        this.bgMusic.play().catch(e => console.log("Audio play blocked:", e));
        this.currentMusic = this.bgMusic;
    }

    playBattleMusic() {
        if (this.currentMusic === this.battleMusic && !this.battleMusic.paused) return;
        
        // Just pause BG music (don't reset) so it can resume later
        this.bgMusic.pause();

        // Start battle music from the beginning
        this.battleMusic.currentTime = 0;
        this.battleMusic.play().catch(e => console.log("Audio play blocked:", e));
        this.currentMusic = this.battleMusic;
    }

    stopAll() {
        this.bgMusic.pause();
        this.bgMusic.currentTime = 0;
        this.battleMusic.pause();
        this.battleMusic.currentTime = 0;
        this.currentMusic = null;
    }

    pauseAll() {
        this.bgMusic.pause();
        this.battleMusic.pause();
    }

    resume() {
        if (this.currentMusic) {
            this.currentMusic.play().catch(e => console.log("Audio resume blocked:", e));
        }
    }
}
