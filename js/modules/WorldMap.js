/**
 * WorldMap - Uses TiledMapLoader to render the Tiled map
 * Handles collision, NPC placement, and game entities on top of the tiled world
 */
import { TiledMapLoader } from './TiledMapLoader.js';
import { Person } from './GameObject.js';

export class WorldMap {
    constructor(config) {
        // Dynamic tile size based on screen
        this.baseTileSize = 32;
        this.tileSize = this.calculateTileSize();

        // Map dimensions (will be overwritten once tiled map loads)
        this.width = config.width || 40;
        this.height = config.height || 30;

        this.gameObjects = [];
        this.player = null;
        this.goal = null;

        // Tiled map loader
        this.tiledMap = new TiledMapLoader(config.mapPath || 'assets/maps/mapa.tmj');
        this.tiledMapLoaded = false;

        // Fallback colors (used if tiled map hasn't loaded yet)
        this.groundColor = config.groundColor || '#4a7c59';
        this.wallColor = config.wallColor || '#5c4033';

        this.setupEntities(config);

        window.addEventListener('resize', () => {
    this.tileSize = this.calculateTileSize();
    if (this.tiledMapLoaded) {
        this.tiledMap.resize(this.tileSize);
        }});
    }

    calculateTileSize() {
        const screenWidth = window.innerWidth;
        // Larger tiles on mobile = zoomed-in camera, better sprite visibility
        if (screenWidth < 480) return 64;
        else if (screenWidth < 768) return 56;
        return 32;
    }

    /**
     * Load the Tiled map asynchronously
     * Call this before starting the game loop
     */
    async loadTiledMap() {
        try {
            await this.tiledMap.load(this.tileSize);
            this.width = this.tiledMap.mapWidth;
            this.height = this.tiledMap.mapHeight;
            this.tiledMapLoaded = true;
            console.log('🗺️ Tiled map integrated into WorldMap');
        } catch (err) {
            console.error('Failed to load Tiled map, using fallback:', err);
        }
    }

    setupEntities(config) {
        // Create player with sprite config
        this.player = new Person({
            x: config.playerStart?.x || 20,
            y: config.playerStart?.y || 27,
            color: '#4169E1',
            isPlayerControlled: true,
            name: 'Carlos',
            tileSize: this.tileSize,
            spriteConfig: config.playerSprite || null
        });

        // Create NPCs
        if (config.npcs) {
            config.npcs.forEach(npcData => {
                const npc = new Person({
                    x: npcData.x,
                    y: npcData.y,
                    color: npcData.color || '#DC143C',
                    name: npcData.name,
                    dialogue: npcData.dialogue,
                    eventId: npcData.eventId,
                    tileSize: this.tileSize,
                    spriteConfig: npcData.spriteConfig || null
                });
                this.gameObjects.push(npc);
            });
        }

        // Goal position (bride/altar)
        this.goal = config.goalPosition || { x: 20, y: 3 };

        // Create bride as an idle entity at the goal position
        if (config.brideSprite) {
            this.bride = new Person({
                x: this.goal.x,
                y: this.goal.y,
                color: '#FF69B4',
                name: 'Ana',
                dialogue: ['You made it!'],
                tileSize: this.tileSize,
                spriteConfig: config.brideSprite
            });
            // Bride is not a regular NPC — she doesn't patrol/chase
            this.bride.aiState = 'idle';
        }
    }

    /**
     * Load all sprite animations for entities that have them
     */
    async loadSprites() {
        const loadPromises = [];

        if (this.player.spriteAnimator) {
            loadPromises.push(this.player.spriteAnimator.load());
        }

        for (const obj of this.gameObjects) {
            if (obj.spriteAnimator) {
                loadPromises.push(obj.spriteAnimator.load());
            }
        }

        // Load bride sprite
        if (this.bride && this.bride.spriteAnimator) {
            loadPromises.push(this.bride.spriteAnimator.load());
        }

        if (loadPromises.length > 0) {
            await Promise.all(loadPromises);
            console.log(`🎨 Loaded ${loadPromises.length} sprite animator(s)`);
        }
    }

    isWall(x, y) {
        // Out of bounds = wall
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
            return true;
        }

        // If tiled map is loaded, check the 'walls' layer
        if (this.tiledMapLoaded) {
            return this.tiledMap.isSolid(x, y);
        }

        return false;
    }

    getObjectAt(x, y) {
        return this.gameObjects.find(obj => obj.x === x && obj.y === y);
    }

    update(deltaTime, game) {
        this.player.tileSize = this.tileSize;
        this.player.update(deltaTime, game);

        this.gameObjects.forEach(obj => {
            obj.tileSize = this.tileSize;
            obj.update(deltaTime, game);
        });

        // Update bride (idle animation)
        if (this.bride) {
            this.bride.tileSize = this.tileSize;
            this.bride.update(deltaTime, game);
        }
    }

    draw(ctx, camera) {
        const ts = this.tileSize;

        if (this.tiledMapLoaded) {
            // Pass 1: Draw bottom layers (ground + walls) — entities sit on top of these
            this.tiledMap.drawLayers(ctx, camera, ts, ['ground', 'walls']);

            // Pass 2: Draw entities between the layer groups
            // Bride (at goal position)
            if (this.bride) {
                this.bride.draw(ctx, camera, ts);
            }

            // NPCs
            this.gameObjects.forEach(obj => obj.draw(ctx, camera, ts));
            // Player
            this.player.draw(ctx, camera, ts);

            // Pass 3: Draw top layers (other + decor) — these overlay on top of entities
            this.tiledMap.drawLayers(ctx, camera, ts, ['other', 'decor']);
        } else {
            // Fallback: draw placeholder colored tiles
            this.drawFallback(ctx, camera, ts);

            // Draw goal marker
            const goalScreenX = this.goal.x * ts - camera.x;
            const goalScreenY = this.goal.y * ts - camera.y;
            ctx.fillStyle = 'rgba(255, 215, 0, 0.5)';
            ctx.fillRect(goalScreenX, goalScreenY, ts, ts);
            ctx.fillStyle = '#FF69B4';
            ctx.font = `${ts * 0.75}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('💒', goalScreenX + ts / 2, goalScreenY + ts / 2);

            // NPCs + Player
            this.gameObjects.forEach(obj => obj.draw(ctx, camera, ts));
            this.player.draw(ctx, camera, ts);
        }
    }

    drawFallback(ctx, camera, ts) {
        const startTileX = Math.floor(camera.x / ts);
        const startTileY = Math.floor(camera.y / ts);
        const tilesX = Math.ceil(camera.width / ts) + 2;
        const tilesY = Math.ceil(camera.height / ts) + 2;

        for (let y = startTileY; y < startTileY + tilesY; y++) {
            for (let x = startTileX; x < startTileX + tilesX; x++) {
                if (x < 0 || x >= this.width || y < 0 || y >= this.height) continue;

                const screenX = x * ts - camera.x;
                const screenY = y * ts - camera.y;

                ctx.fillStyle = this.groundColor;
                ctx.fillRect(screenX, screenY, ts, ts);

                ctx.strokeStyle = 'rgba(0,0,0,0.1)';
                ctx.strokeRect(screenX, screenY, ts, ts);
            }
        }
    }
}

/**
 * Creates the wedding map with entity/NPC configuration
 * Map tiles come from mapa.tmj, entities are configured here
 */
export function createWeddingMap() {
    return new WorldMap({
        mapPath: 'assets/maps/mapa.tmj',
        width: 40,
        height: 30,

        // Groom starts at bottom-left entrance
        playerStart: { x: 4, y: 27 },
        
        // Sprite configuration for the groom
        playerSprite: {
            down: 'assets/sprites/groomfront.png',
            downJson: 'assets/sprites/groomfront.json',
            up: 'assets/sprites/groomback.png',
            upJson: 'assets/sprites/groomback.json',
            left: 'assets/sprites/groomsidewalk.png',
            leftJson: 'assets/sprites/groomsidewalk.json',
            // right will automatically mirror left since we don't provide right/rightJson
            animSpeed: 200 // ms per frame
        },

        // Bride is at center of altar (top area)
        goalPosition: { x: 33, y: 6 },

        // Bride idle sprite (breathing/blinking animation)
        brideSprite: {
            down: 'assets/sprites/bride.png',
            downJson: 'assets/sprites/bride.json',
            animSpeed: 300,
            idleLoop: true
        },

        npcs: [
            {
                // Left garden area (open space at y=7)
                x: 4, y: 7,
                name: 'Drunk Uncle',
                color: '#8B0000',
                dialogue: ['Nephew! Did you see the cake yet?', 'Let me tell you about your dad...', 'Cheers!'],
                eventId: 'drunk_uncle',
                spriteConfig: {
                    down: 'assets/sprites/drunkard uncle front.png',
                    downJson: 'assets/sprites/drunkard uncle front.json',
                    up: 'assets/sprites/drunkard uncle back.png',
                    upJson: 'assets/sprites/drunkard uncle back.json',
                    left: 'assets/sprites/drunkard uncle sidewalk.png',
                    leftJson: 'assets/sprites/drunkard uncle sidewalk.json',
                    animSpeed: 200
                }
            },
            {
                // Central area, blocking the main path
                x: 13, y: 18,
                name: 'Gossip Aunt',
                color: '#FF6347',
                dialogue: ['So, when are the babies coming?', 'You look so handsome!', 'I heard that the bride...'],
                eventId: 'gossip_aunt',
                spriteConfig: {
                    down: 'assets/sprites/gossipaunt front.png',
                    downJson: 'assets/sprites/gossipaunt front.json',
                    up: 'assets/sprites/gossipaunt back.png',
                    upJson: 'assets/sprites/gossipaunt back.json',
                    left: 'assets/sprites/gossipaunt  sidewalk.png',
                    leftJson: 'assets/sprites/gossipaunt  sidewalk.json',
                    animSpeed: 200
                }
            },
            {
                // Center of the map, open row 21
                x: 18, y: 21,
                name: 'Photographer',
                color: '#4682B4',
                dialogue: ['Smile for the camera!', 'Hold that pose...', 'Perfect!'],
                eventId: 'photographer',
                spriteConfig: {
                    down: 'assets/sprites/photographer front.png',
                    downJson: 'assets/sprites/photographer front.json',
                    up: 'assets/sprites/photographer back.png',
                    upJson: 'assets/sprites/photographer back.json',
                    left: 'assets/sprites/photographer sidewalk.png',
                    leftJson: 'assets/sprites/photographer sidewalk.json',
                    animSpeed: 200
                }
            },
            {
                // Bottom left, row 22
                x: 5, y: 22,
                name: 'Grandma',
                color: '#DDA0DD',
                dialogue: ['Oh my sweet boy...', 'Did you eat enough?', 'I am so proud of you.'],
                eventId: 'grandma',
                spriteConfig: {
                    down: 'assets/sprites/grandma front.png',
                    downJson: 'assets/sprites/grandma front.json',
                    up: 'assets/sprites/grandma back.png',
                    upJson: 'assets/sprites/grandma back.json',
                    left: 'assets/sprites/grandmawalkright.png',
                    leftJson: 'assets/sprites/grandmawalkright.json',
                    animSpeed: 200
                }
            },
            {
                // Bottom right, row 21
                x: 33, y: 21,
                name: 'DJ',
                color: '#9370DB',
                dialogue: ['Ready for the party?', 'What song should I play next?'],
                eventId: 'dj',
                spriteConfig: {
                    down: 'assets/sprites/dj front.png',
                    downJson: 'assets/sprites/dj front.json',
                    up: 'assets/sprites/dj back.png',
                    upJson: 'assets/sprites/dj back.json',
                    left: 'assets/sprites/dj sidewalk.png',
                    leftJson: 'assets/sprites/dj sidewalk.json',
                    animSpeed: 200
                }
            }
        ]
    });
}
