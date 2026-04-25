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
        
        // FIX: Flat Uint8Array instead of string-keyed object for O(1) zero-allocation lookups
        this.collisionArray = null;
        this.hasCollisionLayer = false;
        
        // Performance: render map once to offscreen canvases (one per layer to preserve z-indexing)
        this.layerCanvases = {};

        // The draw tile size used during pre-render — needed to know if we must re-render on resize
        this._preRenderedTileSize = null;
        
        this.loaded = false;
    }

    /**
     * Load the map and all its tileset images
     * @param {number} [drawTileSize] - Optional: pixel size to render each tile at.
     *   Pass your game's current tile draw size here so the offscreen canvases are
     *   pre-baked at the correct scale and require NO per-frame scaling.
     *   Defaults to the map's native tilewidth if omitted.
     * @returns {Promise<void>}
     */
    async load(drawTileSize) {
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
                    imagePath: ts.image
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

        // 5. Pre-render the visual map layers for high performance
        const tileSize = drawTileSize ?? this.tileWidth;
        this.preRenderMap(tileSize);

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
            img.onerror = () => {
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
     * Pre-render static layers to individual offscreen canvases.
     * 
     * FIX: Canvases are now baked at `drawTileSize` scale so that drawLayers()
     * performs a true 1:1 pixel blit with zero GPU scaling work per frame.
     * Previously the canvases were 1:1 with native tile size and scaled every
     * frame inside drawLayers(), causing GPU spikes whenever new regions scrolled
     * into view on mobile.
     * 
     * @param {number} drawTileSize - The actual pixel size each tile will be drawn at.
     */
    preRenderMap(drawTileSize = this.tileWidth) {
        this.layerCanvases = {};
        this._preRenderedTileSize = drawTileSize;

        for (const layer of this.layers) {
            // Skip collision layer and hidden layers
            if (layer.nameLower === 'collision' || !layer.visible) continue;

            const canvas = document.createElement('canvas');
            // FIX: Pre-render at the ACTUAL display resolution — no runtime scaling needed
            canvas.width = this.mapWidth * drawTileSize;
            canvas.height = this.mapHeight * drawTileSize;
            const offCtx = canvas.getContext('2d');

            offCtx.imageSmoothingEnabled = false;
            offCtx.globalAlpha = layer.opacity;

            for (let y = 0; y < layer.height; y++) {
                for (let x = 0; x < layer.width; x++) {
                    const index = y * layer.width + x;
                    const gid = layer.data[index];
                    if (gid === 0) continue;

                    // FIX: Draw tiles at drawTileSize so the canvas is render-ready
                    this.drawTile(offCtx, gid, x * drawTileSize, y * drawTileSize, drawTileSize);
                }
            }

            this.layerCanvases[layer.name] = canvas;
        }

        console.log(`🗺️ Map pre-rendered at ${drawTileSize}px/tile: ${Object.keys(this.layerCanvases).length} layer canvases generated`);
    }

    /**
     * Call this if the game's drawTileSize changes at runtime (e.g. window resize /
     * DPI change). Re-bakes all offscreen canvases at the new scale.
     * @param {number} newDrawTileSize
     */
    resize(newDrawTileSize) {
        if (newDrawTileSize === this._preRenderedTileSize) return; // Nothing to do
        if (!this.loaded) return;
        console.log(`🔄 Re-rendering map at new tile size: ${newDrawTileSize}px`);
        this.preRenderMap(newDrawTileSize);
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
        if (gid === 0) return;

        const ts = this.getTilesetForGid(gid);
        if (!ts || !ts.image) return;

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
     * Draw all visible layers onto the main canvas.
     * 
     * KEY FIX: Only blits the visible viewport region from each offscreen canvas.
     * Previously the entire map canvas was passed to drawImage() on every frame,
     * forcing the GPU to process the full texture even though only a small viewport
     * is visible. On mobile this causes a spike every time the camera moves into a
     * new region. Now we compute a tight source rect from the camera and only upload
     * exactly the pixels that will appear on screen — a fraction of the total map.
     * 
     * @param {CanvasRenderingContext2D} ctx
     * @param {object} camera - { x, y, width, height } in pixels
     * @param {number} drawTileSize - Must match the size passed to load() / preRenderMap().
     * @param {string[]} [layerNames] - Optional: only draw these layers. If null, draw all.
     */
    drawLayers(ctx, camera, drawTileSize, layerNames = null) {
        if (!this.loaded) return;

        // Snap camera to integers to avoid sub-pixel jitter
        const camX = Math.round(camera.x);
        const camY = Math.round(camera.y);

        // --- Compute the visible source rect on the offscreen canvas ---
        // Add a 1-tile bleed on each edge so tiles never pop in at the border
        const bleed = drawTileSize;
        const mapPixelW = this.mapWidth  * drawTileSize;
        const mapPixelH = this.mapHeight * drawTileSize;

        const srcX = Math.max(0, camX - bleed);
        const srcY = Math.max(0, camY - bleed);
        const srcRight  = Math.min(mapPixelW, camX + camera.width  + bleed);
        const srcBottom = Math.min(mapPixelH, camY + camera.height + bleed);
        const srcW = srcRight  - srcX;
        const srcH = srcBottom - srcY;

        if (srcW <= 0 || srcH <= 0) return;

        // Destination on screen: offset by how much bleed we added on the left/top
        const dstX = srcX - camX;
        const dstY = srcY - camY;

        // No transform needed — destination coords are already in screen space
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        for (const layer of this.layers) {
            if (layer.nameLower === 'collision') continue;
            if (!layer.visible) continue;
            if (layerNames && !layerNames.includes(layer.name)) continue;

            const offscreenCanvas = this.layerCanvases[layer.name];
            if (!offscreenCanvas) continue;

            // Blit only the visible slice — tiny texture upload, no scaling
            ctx.drawImage(
                offscreenCanvas,
                srcX, srcY, srcW, srcH,   // source: visible region of the pre-rendered canvas
                dstX, dstY, srcW, srcH    // dest:   same pixel dimensions → true 1:1 blit
            );
        }
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
     * FIX: Uses a flat Uint8Array instead of a string-keyed object.
     * isSolid() no longer allocates a new string on every call, eliminating
     * GC pressure in the hot path.
     */
    buildCollisionMap() {
        // FIX: Flat typed array — index by (y * mapWidth + x), zero-allocation lookups
        this.collisionArray = new Uint8Array(this.mapWidth * this.mapHeight);

        const collisionLayer = this.layers.find(
            l => l.name.toLowerCase() === 'collision'
        );

        if (collisionLayer) {
            this.hasCollisionLayer = true;
            for (let y = 0; y < collisionLayer.height; y++) {
                for (let x = 0; x < collisionLayer.width; x++) {
                    const gid = collisionLayer.data[y * collisionLayer.width + x];
                    if (gid !== 0) {
                        this.collisionArray[y * this.mapWidth + x] = 1;
                    }
                }
            }
            const count = this.collisionArray.reduce((a, b) => a + b, 0);
            console.log(`🧱 Collision layer has ${count} solid tiles`);
        } else {
            this.hasCollisionLayer = false;
            const fallbackLayers = this.layers.filter(
                l => ['walls', 'other'].includes(l.name.toLowerCase())
            );
            for (const layer of fallbackLayers) {
                for (let y = 0; y < layer.height; y++) {
                    for (let x = 0; x < layer.width; x++) {
                        const gid = layer.data[y * layer.width + x];
                        if (gid !== 0) {
                            this.collisionArray[y * this.mapWidth + x] = 1;
                        }
                    }
                }
            }
            const count = this.collisionArray.reduce((a, b) => a + b, 0);
            console.log(`🧱 Fallback collision from walls+other: ${count} solid tiles`);
        }
    }

    /**
     * Check if a tile position is solid (blocks movement).
     * 
     * FIX: O(1) typed array lookup with zero string allocation.
     * Previously created a new `` `${x},${y}` `` string on every call.
     */
    isSolid(x, y) {
        if (x < 0 || x >= this.mapWidth || y < 0 || y >= this.mapHeight) return true;
        return this.collisionArray[y * this.mapWidth + x] === 1;
    }
}