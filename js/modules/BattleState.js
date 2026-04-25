/**
 * BattleState - Retro RPG-style battle screen with sprite animations
 * Uses background image, groom back-view, NPC front-view, and action result images.
 * Features breathing idle animation and attack dash + flash sequence.
 */
export class BattleState {
    constructor(game) {
        this.game = game;
        this.npc = null;
        this.dialogueIndex = 0;
        this.menuIndex = 0;
        this.phase = 'dialogue'; // 'dialogue', 'menu', 'attack', 'result'

        this.menuOptions = [];
        this.resultMessage = '';
        this.resultTimer = 0;

        // ============================================================
        // EASY-ADJUST POSITIONING CONFIG
        // All values are proportions of canvas width (w) or height (h)
        // Tweak these to reposition sprites on the battle stage
        // MOBILE and DESKTOP have separate configs for best fit
        // ============================================================
        this.layouts = {
            mobile: {
                groom: {
                    x: 0.30,       // horizontal center (fraction of w)
                    y: 0.75,       // vertical bottom anchor (fraction of h)
                    scale: 0.50,   // size relative to canvas height
                },
                npc: {
                    x: 0.85,       // horizontal center (fraction of w)
                    y: 0.40,       // vertical bottom anchor (fraction of h)
                    scale: 0.30,   // size relative to canvas height
                },
                actionImage: {
                    y: 0.25,       // vertical center (fraction of h)
                    scale: 0.30,   // size relative to canvas height
                },
                box: {
                    topY: 0.60,    // where the box starts (fraction of h)
                    bottomY: 0.98, // where the box ends (fraction of h)
                    marginX: 0.03, // horizontal margin (fraction of w)
                }
            },
            desktop: {
                groom: {
                    x: 0.35,
                    y: 0.85,
                    scale: 0.60,
                },
                npc: {
                    x: 0.72,
                    y: 0.35,
                    scale: 0.30,
                },
                actionImage: {
                    y: 0.30,
                    scale: 0.50,
                },
                box: {
                    topY: 0.62,
                    bottomY: 0.96,
                    marginX: 0.04,
                }
            }
        };

        // Animation state
        this.animTime = 0;           // cumulative time for breathing
        this.attackAnim = null;      // { progress: 0..1 } during attack
        this.flashAlpha = 0;         // white flash overlay alpha
        this.flashTriggered = false;  // prevents flash from re-triggering
        this.currentActionImage = null; // loaded Image for action result
        this.currentAction = null;

        // Preload background
        this.bgImage = new Image();
        this.bgImage.src = 'assets/sprites/battlestage/battlebg.png';

        // Groom back sprite (shared across all battles)
        this.groomSprite = new Image();
        this.groomSprite.src = 'assets/sprites/battlestage/groombattleback.png';

        // NPC front sprites mapped by eventId
        this.npcSprites = {};
        this._preloadNpcSprite('drunk_uncle', 'assets/sprites/battlestage/drunkardunclebattlefront.png');
        this._preloadNpcSprite('gossip_aunt', 'assets/sprites/battlestage/gossipauntbattlefront.png');
        this._preloadNpcSprite('photographer', 'assets/sprites/battlestage/photographerbattlefront.png');
        this._preloadNpcSprite('grandma', 'assets/sprites/battlestage/grandmabattlefront.png');
        this._preloadNpcSprite('dj', 'assets/sprites/battlestage/djbattlefront.png');

        // Action result images mapped by filename
        this.actionImages = {};
        const actionFiles = [
            'photographerpose', 'photographergrin',
            'uncletequila', 'unclestory',
            'grandmahug', 'grandmablessing',
            'gossipauntsecret', 'gossipaunttea',
            'djmixtape', 'djhypecrowd',
            'groomflee'
        ];
        actionFiles.forEach(name => {
            this.actionImages[name] = new Image();
            this.actionImages[name].src = `assets/sprites/battlestage/${name}.png`;
        });

        // Map (npc eventId + action) => image key
        this.actionImageMap = {
            'photographer_pose':   'photographerpose',
            'photographer_smile':  'photographergrin',
            'drunk_uncle_drink':   'uncletequila',
            'drunk_uncle_listen':  'unclestory',
            'grandma_hug':         'grandmahug',
            'grandma_blessing':    'grandmablessing',
            'gossip_aunt_gossip':  'gossipauntsecret',
            'gossip_aunt_tea':     'gossipaunttea',
            'dj_song':             'djmixtape',
            'dj_hype':             'djhypecrowd',
            '_flee':               'groomflee'
        };
    }

    _preloadNpcSprite(eventId, path) {
        const img = new Image();
        img.onerror = () => console.error(`❌ Failed to load battle sprite: ${path}`);
        img.onload = () => console.log(`✅ Loaded battle sprite: ${path}`);
        img.src = path;
        this.npcSprites[eventId] = img;
    }

    enter(npc) {
        console.log(`Battle started with: ${npc.name}`);
        this.npc = npc;
        this.dialogueIndex = 0;
        this.menuIndex = 0;
        this.phase = 'dialogue';
        this.animTime = 0;
        this.attackAnim = null;
        this.flashAlpha = 0;
        this.currentActionImage = null;
        this.currentAction = null;

        // Define specific actions based on NPC name
        this.menuOptions = [];
        const lowerName = npc.name.toLowerCase();

        if (lowerName.includes('photographer') || lowerName.includes('fotógrafo')) {
            this.menuOptions.push({ label: '📸 Strike a Pose', action: 'pose' });
            this.menuOptions.push({ label: '😊 Smile', action: 'smile' });
        } else if (lowerName.includes('uncle') || lowerName.includes('tío')) {
            this.menuOptions.push({ label: '🍻 Offer a Tequila', action: 'drink' });
            this.menuOptions.push({ label: '🗣️ Listen to story', action: 'listen' });
        } else if (lowerName.includes('grandma') || lowerName.includes('abuela')) {
            this.menuOptions.push({ label: '👵 Give a Hug', action: 'hug' });
            this.menuOptions.push({ label: '🙏 Ask for blessing', action: 'blessing' });
        } else if (lowerName.includes('gossip') || lowerName.includes('chismosa') || lowerName.includes('aunt')) {
            this.menuOptions.push({ label: '🤫 Share a secret', action: 'gossip' });
            this.menuOptions.push({ label: '☕ Sip tea', action: 'tea' });
        } else if (lowerName.includes('dj') || lowerName.includes('music')) {
            this.menuOptions.push({ label: '🎵 Request a song', action: 'song' });
            this.menuOptions.push({ label: '🔥 Hype the crowd', action: 'hype' });
        } else {
            this.menuOptions.push({ label: '👋 Say Hello', action: 'greet' });
            this.menuOptions.push({ label: '🎉 Celebrate', action: 'celebrate' });
        }

        // Flee is always an option
        this.menuOptions.push({ label: '🏃 Flee', action: 'flee' });
        this.resultMessage = '';
    }

    exit() {
        console.log('Exiting Battle State');
    }

    update(deltaTime) {
        const input = this.game.input;
        this.animTime += deltaTime;

        switch (this.phase) {
            case 'dialogue':
                if (input.isJustPressed('INTERACT')) {
                    this.dialogueIndex++;
                    if (this.dialogueIndex >= this.npc.dialogue.length) {
                        this.phase = 'menu';
                    }
                }
                break;

            case 'menu':
                if (input.isJustPressed('UP')) {
                    this.menuIndex = (this.menuIndex - 1 + this.menuOptions.length) % this.menuOptions.length;
                }
                if (input.isJustPressed('DOWN')) {
                    this.menuIndex = (this.menuIndex + 1) % this.menuOptions.length;
                }
                if (input.isJustPressed('INTERACT')) {
                    this.executeAction(this.menuOptions[this.menuIndex].action);
                }
                if (input.isJustPressed('CANCEL')) {
                    this.executeAction('flee');
                }
                break;

            case 'attack':
                // Advance attack animation
                if (this.attackAnim) {
                    this.attackAnim.progress += deltaTime / 600; // 600ms total dash

                    // Trigger flash ONCE when dash completes
                    if (this.attackAnim.progress >= 1.0 && !this.flashTriggered) {
                        this.flashAlpha = 1.0;
                        this.flashTriggered = true;
                    }

                    // Fade flash out and transition to result
                    if (this.flashTriggered && this.attackAnim.progress >= 1.2) {
                        this.flashAlpha -= deltaTime / 300; // fade over 300ms
                        if (this.flashAlpha <= 0) {
                            this.flashAlpha = 0;
                            this.showResult(this.currentAction);
                        }
                    }
                }
                break;

            case 'result':
                this.resultTimer -= deltaTime;
                if (this.resultTimer <= 0 || input.isJustPressed('INTERACT')) {
                    this.endBattle();
                }
                break;
        }
    }

    executeAction(action) {
        console.log(`Action selected: ${action}`);
        this.currentAction = action;

        // Determine the action image key
        const eventId = this.npc.eventId || '';
        const imageKey = action === 'flee'
            ? this.actionImageMap['_flee']
            : this.actionImageMap[`${eventId}_${action}`];

        this.currentActionImage = imageKey ? (this.actionImages[imageKey] || null) : null;

        // Start the attack animation
        this.phase = 'attack';
        this.attackAnim = { progress: 0 };
        this.flashAlpha = 0;
        this.flashTriggered = false;
    }

    showResult(action) {
        this.phase = 'result';
        this.resultTimer = 3000; // 3 seconds to admire the action image

        if (action === 'flee') {
            this.resultMessage = `You ran away from ${this.npc.name}!`;
        } else {
            const actionObj = this.menuOptions.find(o => o.action === action);
            const actionName = actionObj
                ? actionObj.label.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '').trim()
                : 'Action';
            this.resultMessage = `✨ ${actionName} was super effective!`;
            this.npc.x = -100; // Remove NPC from overworld
        }
    }

    endBattle() {
        this.game.endBattle();
    }

    // ================================================================
    // DRAW — The main rendering loop for the battle screen
    // ================================================================
    draw(ctx) {
        const w = this.game.canvas.width;
        const h = this.game.canvas.height;
        const isMobile = w < 768;
        const L = isMobile ? this.layouts.mobile : this.layouts.desktop;

        // The arena is the top portion, above the dialogue box
        const arenaH = h * L.box.topY;

        // --- Black fill behind everything ---
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);

        // --- 1. Draw Background (clipped to arena) ---
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, arenaH);
        ctx.clip();

        if (this.bgImage.complete && this.bgImage.naturalWidth > 0) {
            const bgRatio = this.bgImage.naturalWidth / this.bgImage.naturalHeight;
            const arenaRatio = w / arenaH;
            let bgW, bgH;
            if (arenaRatio > bgRatio) {
                bgW = w;
                bgH = w / bgRatio;
            } else {
                bgH = arenaH;
                bgW = arenaH * bgRatio;
            }
            ctx.drawImage(this.bgImage, (w - bgW) / 2, (arenaH - bgH) / 2, bgW, bgH);
        } else {
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, 0, w, arenaH);
        }

        // --- 2. Draw Sprites within arena (idle or attack phase) ---
        if (this.phase !== 'result') {
            this._drawBattleSprites(ctx, w, arenaH);
        }

        // --- 3. Draw action result image within arena (result phase) ---
        if (this.phase === 'result' && this.currentActionImage && this.currentActionImage.complete) {
            this._drawActionImage(ctx, w, arenaH);
        }

        ctx.restore(); // remove clip

        // --- 4. White flash overlay (full screen for impact) ---
        if (this.flashAlpha > 0) {
            ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, this.flashAlpha)})`;
            ctx.fillRect(0, 0, w, h);
        }

        // --- 5. Draw dialogue/menu box (below the arena) ---
        this._drawDialogueBox(ctx, w, h, isMobile);
    }

    // ----- Helper: Draw groom + NPC with breathing animation -----
    // NOTE: h here is arenaH (the space above the dialogue box), NOT full canvas height
    _drawBattleSprites(ctx, w, arenaH) {
        const L = w < 768 ? this.layouts.mobile : this.layouts.desktop;
        const breathCycle = Math.sin(this.animTime / 800) * 0.02;

        // Groom (back view) — bottom-left patch
        const groomImg = this.groomSprite;
        if (groomImg.complete && groomImg.naturalWidth > 0) {
            const baseH = arenaH * L.groom.scale;
            const ratio = groomImg.naturalWidth / groomImg.naturalHeight;
            const drawH = baseH * (1 + breathCycle);
            const drawW = drawH * ratio;
            let cx = w * L.groom.x;
            const cy = arenaH * L.groom.y;

            // Attack dash: move groom right toward center
            if (this.phase === 'attack' && this.attackAnim) {
                const dashProgress = Math.min(this.attackAnim.progress, 1.0);
                const dashDistance = w * 0.25;
                cx += dashDistance * this._easeInOut(dashProgress);
            }

            ctx.drawImage(groomImg, cx - drawW / 2, cy - drawH, drawW, drawH);
        }

        // NPC (front view) — top-right patch
        const npcImg = this.npcSprites[this.npc.eventId];
        if (npcImg && npcImg.complete && npcImg.naturalWidth > 0) {
            const baseH = arenaH * L.npc.scale;
            const ratio = npcImg.naturalWidth / npcImg.naturalHeight;
            const breathOffset = Math.sin(this.animTime / 900 + 1) * 0.015;
            const drawH = baseH * (1 + breathOffset);
            const drawW = drawH * ratio;
            const cx = w * L.npc.x;
            const cy = arenaH * L.npc.y;

            ctx.drawImage(npcImg, cx - drawW / 2, cy - drawH, drawW, drawH);
        }
    }

    // ----- Helper: Draw action result image (fills the arena area) -----
    // NOTE: h here is arenaH (the space above the dialogue box), NOT full canvas height
    _drawActionImage(ctx, w, arenaH) {
        const img = this.currentActionImage;
        const ratio = img.naturalWidth / img.naturalHeight;

        // Fill the arena as much as possible (cover fit)
        let drawW, drawH;
        const arenaRatio = w / arenaH;

        if (arenaRatio > ratio) {
            // Arena is wider than image — match width, center vertically
            drawW = w;
            drawH = w / ratio;
        } else {
            // Arena is taller than image — match height, center horizontally
            drawH = arenaH;
            drawW = arenaH * ratio;
        }

        const dx = (w - drawW) / 2;
        const dy = (arenaH - drawH) / 2;
        ctx.drawImage(img, dx, dy, drawW, drawH);
    }

    // ----- Helper: Dialogue box, menu, and result text -----
    _drawDialogueBox(ctx, w, h, isMobile) {
        const L = isMobile ? this.layouts.mobile : this.layouts.desktop;
        const boxX = w * L.box.marginX;
        const boxY = h * L.box.topY;
        const boxW = w - (boxX * 2);
        const boxH = (h * L.box.bottomY) - boxY;
        const fontSize = Math.max(13, Math.min(22, w * 0.04));
        const padX = boxW * 0.06;
        const continueText = isMobile ? '[TAP] Continue...' : '[SPACE] Continue...';
        const continueY = boxY + boxH - (fontSize * 1.2);

        // Box background + border
        ctx.fillStyle = 'rgba(26,26,26,0.95)';
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.strokeStyle = '#D4AF37';
        ctx.lineWidth = 2;
        ctx.strokeRect(boxX, boxY, boxW, boxH);

        // Inner gold line accent at top of box
        ctx.fillStyle = '#D4AF37';
        ctx.fillRect(boxX + 1, boxY + 1, boxW - 2, 3);

        ctx.fillStyle = 'white';
        ctx.font = `${fontSize}px Lato, sans-serif`;
        ctx.textAlign = 'left';

        switch (this.phase) {
            case 'dialogue': {
                const dialogue = this.npc.dialogue[this.dialogueIndex] || '...';
                this._wrapText(ctx, dialogue, boxX + padX, boxY + fontSize * 2, boxW - padX * 2, fontSize * 1.4);

                ctx.font = `${fontSize * 0.7}px Lato, sans-serif`;
                ctx.fillStyle = '#888';
                ctx.fillText(continueText, boxX + padX, continueY);
                break;
            }

            case 'menu': {
                ctx.fillStyle = '#D4AF37';
                ctx.font = `bold ${fontSize}px Cinzel, serif`;
                ctx.fillText('What will you do?', boxX + padX, boxY + fontSize * 1.8);

                const menuStartY = boxY + fontSize * 3.2;
                const menuSpacing = fontSize * 1.5;

                ctx.font = `${fontSize}px Lato, sans-serif`;
                this.menuOptions.forEach((opt, i) => {
                    ctx.fillStyle = i === this.menuIndex ? '#FFD700' : 'white';
                    const prefix = i === this.menuIndex ? '▶ ' : '   ';
                    ctx.fillText(prefix + opt.label, boxX + padX * 1.5, menuStartY + (i * menuSpacing));
                });
                break;
            }

            case 'attack': {
                ctx.fillStyle = '#D4AF37';
                ctx.textAlign = 'center';
                ctx.font = `bold ${fontSize}px Cinzel, serif`;
                ctx.fillText('...', w / 2, boxY + boxH / 2);
                break;
            }

            case 'result': {
                ctx.fillStyle = '#D4AF37';
                ctx.textAlign = 'center';
                ctx.font = `bold ${fontSize}px Cinzel, serif`;
                ctx.fillText(this.resultMessage, w / 2, boxY + fontSize * 2);

                ctx.fillStyle = '#888';
                ctx.font = `${fontSize * 0.7}px Lato, sans-serif`;
                ctx.fillText(continueText, w / 2, continueY);
                break;
            }
        }
    }

    // ----- Utility: Simple word wrapping -----
    _wrapText(ctx, text, x, y, maxWidth, lineHeight) {
        const words = text.split(' ');
        let line = '';
        let currentY = y;

        for (const word of words) {
            const testLine = line + word + ' ';
            if (ctx.measureText(testLine).width > maxWidth && line !== '') {
                ctx.fillText(line, x, currentY);
                line = word + ' ';
                currentY += lineHeight;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line, x, currentY);
    }

    // ----- Utility: Smooth ease-in-out -----
    _easeInOut(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }
}
