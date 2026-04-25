/**
 * TiledMapLoader - Loads and parses Tiled .tmj (JSON) map files
 * Handles tileset loading, layer rendering, and collision detection
 */
export class TiledMapLoader {
    /**
     * @param {string} mapPath - Path to the .tmj file (e.g. 'assets/maps/mapa.tmj')
     */
    constructor(mapPath) {
        this.mapPath = mapPath;
        this.basePath = mapPath.substring(0, mapPath.lastIndexOf('/') + 1);
        
        this.mapData = null;
        this.tilesets = [];     // { firstgid, image, imageWidth, imageHeight, tileWidth, tileHeight, columns, tilecount }
        this.layers = [];       // { name, data[], width, height, visible }
        
        this.tileWidth = 32;
        this.tileHeight = 32;
        this.mapWidth = 0;      // In tiles
        this.mapHeight = 0;     // In tiles
        
        // Collision map: { "x,y": true } - precomputed for fast lookups
        this.collisionMap = {};
        this.hasCollisionLayer = false;
        
        // Performance: render Map once to offscreen canvas
        this.offscreenCanvas = null;
        this.offscreenCtx = null;
        
        this.loaded = false;
    }

    /**
     * Load the map and all its tileset images
     * @returns {Promise<void>}
     */
    async load() {
        // 1. Fetch the map JSON
        const response = await fetch(this.mapPath);
        this.mapData = await response.json();

        this.tileWidth = this.mapData.tilewidth;
        this.tileHeight = this.mapData.tileheight;
        this.mapWidth = this.mapData.width;
        this.mapHeight = this.mapData.height;

        // 2. Parse tilesets - load .tsx references and their images
        const tilesetPromises = this.mapData.tilesets.map(async (ts) => {
            let tilesetInfo;

            if (ts.source) {
                // External tileset (.tsx) - fetch and parse it
                tilesetInfo = await this.loadExternalTileset(ts.source, ts.firstgid);
            } else {
                // Embedded tileset
                tilesetInfo = {
                    firstgid: ts.firstgid,
                    tileWidth: ts.tilewidth,
                    tileHeight: ts.tileheight,
                    columns: ts.columns,
                    tilecount: ts.tilecount,
                    imageSource: ts.image
                };
            }

            // Load the tileset image
            tilesetInfo.image = await this.loadImage(tilesetInfo.imagePath);
            return tilesetInfo;
        });

        this.tilesets = await Promise.all(tilesetPromises);
        // Sort by firstgid descending for quick lookup
        this.tilesets.sort((a, b) => b.firstgid - a.firstgid);

        // 3. Parse ALL tile layers (including hidden ones for collision)
        this.layers = this.mapData.layers
            .filter(l => l.type === 'tilelayer')
            .map(l => ({
                name: l.name,
                nameLower: l.name.toLowerCase(),
                data: l.data,
                width: l.width,
                height: l.height,
                visible: l.visible !== false,
                opacity: l.opacity ?? 1
            }));

        // 4. Build collision map
        this.buildCollisionMap();

        this.loaded = true;
        console.log(`✅ Tiled map loaded: ${this.mapWidth}x${this.mapHeight} tiles, ${this.tilesets.length} tilesets, ${this.layers.length} layers`);
        console.log(`🧱 Collision layer: ${this.hasCollisionLayer ? 'found' : 'not found (using walls+other fallback)'}`);
    }

    /**
     * Parse an external .tsx tileset XML file
     */
    async loadExternalTileset(tsxSource, firstgid) {
        const tsxPath = this.basePath + tsxSource;
        const response = await fetch(tsxPath);
        const text = await response.text();

        // Parse XML
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/xml');
        const tilesetEl = doc.querySelector('tileset');
        const imageEl = doc.querySelector('image');

        const rawImageSource = imageEl.getAttribute('source');

        // Resolve image path relative to the .tsx file location
        // The .tsx is in the same dir as .tmj (assets/maps/)
        // The image source could be "Texture/TX Tileset Grass.png" or "Texture/Extra/TX Plant.png"
        const imagePath = this.basePath + rawImageSource;

        return {
            firstgid: firstgid,
            tileWidth: parseInt(tilesetEl.getAttribute('tilewidth')),
            tileHeight: parseInt(tilesetEl.getAttribute('tileheight')),
            columns: parseInt(tilesetEl.getAttribute('columns')),
            tilecount: parseInt(tilesetEl.getAttribute('tilecount')),
            imageWidth: parseInt(imageEl.getAttribute('width')),
            imageHeight: parseInt(imageEl.getAttribute('height')),
            imagePath: imagePath
        };
    }

    /**
     * Load an image and return a promise
     */
    loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = (e) => {
                console.error(`Failed to load tileset image: ${src}`);
                // Try alternative path (some tsx reference Extra/ subfolder but file may be flat)
                const altSrc = src.replace('/Extra/', '/');
                if (altSrc !== src) {
                    console.log(`Trying alternative path: ${altSrc}`);
                    const img2 = new Image();
                    img2.onload = () => resolve(img2);
                    img2.onerror = () => reject(new Error(`Failed to load: ${src} and ${altSrc}`));
                    img2.src = altSrc;
                } else {
                    reject(new Error(`Failed to load: ${src}`));
                }
            };
            img.src = src;
        });
    }

    /**
     * Find which tileset a global tile ID belongs to
     * @param {number} gid - The global tile ID
     * @returns {object|null} - The tileset info
     */
    getTilesetForGid(gid) {
        if (gid === 0) return null; // 0 = empty tile
        for (const ts of this.tilesets) {
            if (gid >= ts.firstgid) {
                return ts;
            }
        }
        return null;
    }

    /**
     * Draw a single tile from its global ID
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} gid - Global tile ID from the layer data
     * @param {number} destX - Destination X on canvas (pixels)
     * @param {number} destY - Destination Y on canvas (pixels)
     * @param {number} drawSize - Size to draw at (for scaling)
     */
    drawTile(ctx, gid, destX, destY, drawSize) {
        if (gid === 0) return; // Empty tile

        const ts = this.getTilesetForGid(gid);
        if (!ts || !ts.image) return;

        // Calculate position within the tileset image
        const localId = gid - ts.firstgid;
        const srcX = (localId % ts.columns) * ts.tileWidth;
        const srcY = Math.floor(localId / ts.columns) * ts.tileHeight;

        ctx.drawImage(
            ts.image,
            srcX, srcY, ts.tileWidth, ts.tileHeight,
            destX, destY, drawSize, drawSize
        );
    }

    /**
     * Draw all visible layers
     * @param {CanvasRenderingContext2D} ctx
     * @param {object} camera - { x, y, width, height } in pixels
     * @param {number} drawTileSize - Size to render each tile (for scaling)
     * @param {string[]} [layerNames] - Optional: only draw these layers. If null, draw all visible.
     */
    drawLayers(ctx, camera, drawTileSize, layerNames = null) {
        if (!this.loaded) return;

        const ts = drawTileSize;

        // Determine visible tile range with +2/-2 margin to prevent edge popping on mobile
        const startTileX = Math.max(0, Math.floor(camera.x / ts) - 2);
        const startTileY = Math.max(0, Math.floor(camera.y / ts) - 2);
        const endTileX = Math.min(this.mapWidth, Math.ceil((camera.x + camera.width) / ts) + 2);
        const endTileY = Math.min(this.mapHeight, Math.ceil((camera.y + camera.height) / ts) + 2);

        // Snap camera coordinates to integers to avoid sub-pixel map jittering
        // This Math.round matches EXACTLY the Math.round calculation in GameObject.js!
        const camX = Math.round(camera.x);
        const camY = Math.round(camera.y);

        ctx.save();
        ctx.translate(-camX, -camY);

        for (const layer of this.layers) {
            // Never render the collision layer
            if (layer.nameLower === 'collision') continue;
            // Skip invisible layers
            if (!layer.visible) continue;
            if (layerNames && !layerNames.includes(layer.name)) continue;

            ctx.globalAlpha = layer.opacity;

            for (let y = startTileY; y < endTileY; y++) {
                for (let x = startTileX; x < endTileX; x++) {
                    const index = y * layer.width + x;
                    const gid = layer.data[index];
                    if (gid === 0) continue;

                    // Math.round forces pixel-perfect alignment globally alongside the translated camera
                    const destX = Math.round(x * ts);
                    const destY = Math.round(y * ts);
                    
                    // ts + 0.5 creates a tiny overlap fixing grid-gaps/tearing on mobile displays 
                    this.drawTile(ctx, gid, destX, destY, ts + 0.5);
                }
            }

            ctx.globalAlpha = 1;
        }
        
        ctx.restore();
    }

    /**
     * Get tile data at (x,y) for a specific layer
     * @returns {number} The GID at that position, or 0
     */
    getTileAt(layerName, x, y) {
        const lowerName = layerName.toLowerCase();
        const layer = this.layers.find(l => l.nameLower === lowerName);
        if (!layer) return 0;
        if (x < 0 || x >= layer.width || y < 0 || y >= layer.height) return 0;
        return layer.data[y * layer.width + x];
    }

    /**
     * Build a precomputed collision map from the Tiled layers.
     * 
     * Strategy:
     * 1. If a layer named 'collision' exists → ONLY use that layer for collision.
     *    (This gives you full control from Tiled)
     * 2. If no 'collision' layer → fallback: treat all non-zero tiles on 'walls'
     *    and 'other' as solid.
     */
    buildCollisionMap() {
        this.collisionMap = {};

        const collisionLayer = this.layers.find(
            l => l.name.toLowerCase() === 'collision'
        );

        if (collisionLayer) {
            // Use the dedicated collision layer
            this.hasCollisionLayer = true;
            for (let y = 0; y < collisionLayer.height; y++) {
                for (let x = 0; x < collisionLayer.width; x++) {
                    const gid = collisionLayer.data[y * collisionLayer.width + x];
                    if (gid !== 0) {
                        this.collisionMap[`${x},${y}`] = true;
                    }
                }
            }
            const count = Object.keys(this.collisionMap).length;
            console.log(`🧱 Collision layer has ${count} solid tiles`);
        } else {
            // Fallback: check walls + other layers
            this.hasCollisionLayer = false;
            const fallbackLayers = this.layers.filter(
                l => ['walls', 'other'].includes(l.name.toLowerCase())
            );
            for (const layer of fallbackLayers) {
                for (let y = 0; y < layer.height; y++) {
                    for (let x = 0; x < layer.width; x++) {
                        const gid = layer.data[y * layer.width + x];
                        if (gid !== 0) {
                            this.collisionMap[`${x},${y}`] = true;
                        }
                    }
                }
            }
            const count = Object.keys(this.collisionMap).length;
            console.log(`🧱 Fallback collision from walls+other: ${count} solid tiles`);
        }
    }

    /**
     * Check if a tile position is solid (blocks movement)
     * Uses precomputed collision map for O(1) lookup
     */
    isSolid(x, y) {
        if (x < 0 || x >= this.mapWidth || y < 0 || y >= this.mapHeight) return true;
        return this.collisionMap[`${x},${y}`] === true;
    }
}
