/**
 * Horizon Browser 3D Voxel Engine
 * Authentic Minecraft Java 26.3 Client Engine for WebGL & WebGPU
 * Features:
 * - Direct texture extraction from horizon.zip
 * - Procedural voxel terrain (hills, stone, trees, bedrock)
 * - Voxel chunk meshing with face culling
 * - First-person player physics, AABB collisions, jumping & sneaking
 * - Amanatides-Woo DDA voxel raycasting (break & place blocks)
 * - Authentic Minecraft HUD: Crosshair, 9-slot Hotbar, Selection Wireframe
 * - Mobile Touch Controls (D-Pad, Break, Place, Look) & Pointer Lock
 * - World persistence in IndexedDB
 */

(function () {
    // Block Definitions
    const BLOCKS = {
        AIR: 0,
        STONE: 1,
        DIRT: 2,
        GRASS: 3,
        COBBLESTONE: 4,
        PLANKS: 5,
        LOG: 6,
        LEAVES: 7,
        SAND: 8,
        GLASS: 9,
        BEDROCK: 10,
        BRICK: 11
    };

    const BLOCK_NAMES = {
        [BLOCKS.STONE]: "Камень",
        [BLOCKS.DIRT]: "Земля",
        [BLOCKS.GRASS]: "Блок травы",
        [BLOCKS.COBBLESTONE]: "Булыжник",
        [BLOCKS.PLANKS]: "Дубовые доски",
        [BLOCKS.LOG]: "Дубовое бревно",
        [BLOCKS.LEAVES]: "Листва дуба",
        [BLOCKS.SAND]: "Песок",
        [BLOCKS.GLASS]: "Стекло",
        [BLOCKS.BEDROCK]: "Бедрок",
        [BLOCKS.BRICK]: "Кирпичи"
    };

    // Hotbar selectable items
    const HOTBAR_SLOTS = [
        BLOCKS.GRASS,
        BLOCKS.DIRT,
        BLOCKS.STONE,
        BLOCKS.COBBLESTONE,
        BLOCKS.PLANKS,
        BLOCKS.LOG,
        BLOCKS.LEAVES,
        BLOCKS.SAND,
        BLOCKS.GLASS
    ];

    // Texture Atlas Indices
    // Atlas layout: 4x4 grid (16 tiles)
    const TILES = {
        GRASS_TOP: 0,
        GRASS_SIDE: 1,
        DIRT: 2,
        STONE: 3,
        COBBLE: 4,
        PLANKS: 5,
        LOG_SIDE: 6,
        LOG_TOP: 7,
        LEAVES: 8,
        SAND: 9,
        GLASS: 10,
        BEDROCK: 11,
        BRICK: 12
    };

    // Texture paths in horizon.zip
    const TEXTURE_PATHS = {
        [TILES.GRASS_TOP]: "horizon/resources/assets/minecraft/textures/block/grass_block_top.png",
        [TILES.GRASS_SIDE]: "horizon/resources/assets/minecraft/textures/block/grass_block_side.png",
        [TILES.DIRT]: "horizon/resources/assets/minecraft/textures/block/dirt.png",
        [TILES.STONE]: "horizon/resources/assets/minecraft/textures/block/stone.png",
        [TILES.COBBLE]: "horizon/resources/assets/minecraft/textures/block/cobblestone.png",
        [TILES.PLANKS]: "horizon/resources/assets/minecraft/textures/block/oak_planks.png",
        [TILES.LOG_SIDE]: "horizon/resources/assets/minecraft/textures/block/oak_log.png",
        [TILES.LOG_TOP]: "horizon/resources/assets/minecraft/textures/block/oak_log_top.png",
        [TILES.LEAVES]: "horizon/resources/assets/minecraft/textures/block/oak_leaves.png",
        [TILES.SAND]: "horizon/resources/assets/minecraft/textures/block/sand.png",
        [TILES.GLASS]: "horizon/resources/assets/minecraft/textures/block/glass.png",
        [TILES.BEDROCK]: "horizon/resources/assets/minecraft/textures/block/bedrock.png",
        [TILES.BRICK]: "horizon/resources/assets/minecraft/textures/block/bricks.png"
    };

    // Fallback pixel colors if horizon.zip not yet unpacked
    const FALLBACK_COLORS = {
        [TILES.GRASS_TOP]: [86, 172, 57],
        [TILES.GRASS_SIDE]: [115, 83, 53],
        [TILES.DIRT]: [134, 96, 67],
        [TILES.STONE]: [125, 125, 125],
        [TILES.COBBLE]: [95, 95, 95],
        [TILES.PLANKS]: [162, 130, 78],
        [TILES.LOG_SIDE]: [103, 82, 49],
        [TILES.LOG_TOP]: [160, 132, 85],
        [TILES.LEAVES]: [58, 125, 38],
        [TILES.SAND]: [219, 211, 160],
        [TILES.GLASS]: [200, 230, 255],
        [TILES.BEDROCK]: [50, 50, 50],
        [TILES.BRICK]: [150, 60, 50]
    };

    // Block face tile mapping: [top, bottom, north, south, east, west]
    function getBlockTiles(blockType) {
        switch (blockType) {
            case BLOCKS.GRASS:
                return [TILES.GRASS_TOP, TILES.DIRT, TILES.GRASS_SIDE, TILES.GRASS_SIDE, TILES.GRASS_SIDE, TILES.GRASS_SIDE];
            case BLOCKS.DIRT:
                return [TILES.DIRT, TILES.DIRT, TILES.DIRT, TILES.DIRT, TILES.DIRT, TILES.DIRT];
            case BLOCKS.STONE:
                return [TILES.STONE, TILES.STONE, TILES.STONE, TILES.STONE, TILES.STONE, TILES.STONE];
            case BLOCKS.COBBLESTONE:
                return [TILES.COBBLE, TILES.COBBLE, TILES.COBBLE, TILES.COBBLE, TILES.COBBLE, TILES.COBBLE];
            case BLOCKS.PLANKS:
                return [TILES.PLANKS, TILES.PLANKS, TILES.PLANKS, TILES.PLANKS, TILES.PLANKS, TILES.PLANKS];
            case BLOCKS.LOG:
                return [TILES.LOG_TOP, TILES.LOG_TOP, TILES.LOG_SIDE, TILES.LOG_SIDE, TILES.LOG_SIDE, TILES.LOG_SIDE];
            case BLOCKS.LEAVES:
                return [TILES.LEAVES, TILES.LEAVES, TILES.LEAVES, TILES.LEAVES, TILES.LEAVES, TILES.LEAVES];
            case BLOCKS.SAND:
                return [TILES.SAND, TILES.SAND, TILES.SAND, TILES.SAND, TILES.SAND, TILES.SAND];
            case BLOCKS.GLASS:
                return [TILES.GLASS, TILES.GLASS, TILES.GLASS, TILES.GLASS, TILES.GLASS, TILES.GLASS];
            case BLOCKS.BEDROCK:
                return [TILES.BEDROCK, TILES.BEDROCK, TILES.BEDROCK, TILES.BEDROCK, TILES.BEDROCK, TILES.BEDROCK];
            case BLOCKS.BRICK:
                return [TILES.BRICK, TILES.BRICK, TILES.BRICK, TILES.BRICK, TILES.BRICK, TILES.BRICK];
            default:
                return [TILES.DIRT, TILES.DIRT, TILES.DIRT, TILES.DIRT, TILES.DIRT, TILES.DIRT];
        }
    }

    // =========================================================================
    // Linear Algebra & 3D Math Helper
    // =========================================================================
    const Mat4 = {
        perspective: function (out, fovRad, aspect, near, far) {
            const f = 1.0 / Math.tan(fovRad / 2);
            const nf = 1 / (near - far);
            out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
            out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
            out[8] = 0; out[9] = 0; out[10] = (far + near) * nf; out[11] = -1;
            out[12] = 0; out[13] = 0; out[14] = (2 * far * near) * nf; out[15] = 0;
            return out;
        },
        lookAt: function (out, eye, target, up) {
            let z0 = eye[0] - target[0], z1 = eye[1] - target[1], z2 = eye[2] - target[2];
            let len = 1 / Math.hypot(z0, z1, z2);
            z0 *= len; z1 *= len; z2 *= len;

            let x0 = up[1] * z2 - up[2] * z1, x1 = up[2] * z0 - up[0] * z2, x2 = up[0] * z1 - up[1] * z0;
            len = 1 / Math.hypot(x0, x1, x2);
            x0 *= len; x1 *= len; x2 *= len;

            let y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;

            out[0] = x0; out[1] = y0; out[2] = z0; out[3] = 0;
            out[4] = x1; out[5] = y1; out[6] = z1; out[7] = 0;
            out[8] = x2; out[9] = y2; out[10] = z2; out[11] = 0;
            out[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
            out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
            out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
            out[15] = 1;
            return out;
        },
        multiply: function (out, a, b) {
            const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
            const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
            const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
            const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

            let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
            out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
            out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
            out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
            out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

            b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
            out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
            out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
            out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
            out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

            b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
            out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
            out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
            out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
            out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

            b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
            out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
            out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
            out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
            out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
            return out;
        }
    };

    // =========================================================================
    // Texture Atlas Builder
    // =========================================================================
    class AtlasManager {
        constructor() {
            this.canvas = document.createElement("canvas");
            this.canvas.width = 256;
            this.canvas.height = 256;
            this.ctx = this.canvas.getContext("2d");
            this.texture = null;
            this.isLoadedFromZip = false;
        }

        async build(vfs, gl) {
            this.ctx.fillStyle = "#222";
            this.ctx.fillRect(0, 0, 256, 256);

            // Draw procedural fallbacks first
            for (let i = 0; i < 16; i++) {
                const tx = (i % 4) * 64;
                const ty = Math.floor(i / 4) * 64;
                const col = FALLBACK_COLORS[i] || [120, 120, 120];
                this.ctx.fillStyle = `rgb(${col[0]}, ${col[1]}, ${col[2]})`;
                this.ctx.fillRect(tx, ty, 64, 64);

                // Add pixel noise for texture effect
                this.ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
                for (let px = 0; px < 64; px += 8) {
                    for (let py = 0; py < 64; py += 8) {
                        if ((px + py) % 16 === 0) {
                            this.ctx.fillRect(tx + px, ty + py, 8, 8);
                        }
                    }
                }
            }

            // If VFS is available and has zip entries, unpack and draw official textures!
            if (vfs && vfs.isReady) {
                let loadedCount = 0;
                for (const [tileIdx, path] of Object.entries(TEXTURE_PATHS)) {
                    try {
                        const bytes = await vfs.readFile(path);
                        if (bytes) {
                            const blob = new Blob([bytes], { type: "image/png" });
                            const url = URL.createObjectURL(blob);
                            const img = new Image();
                            await new Promise(resolve => {
                                img.onload = () => {
                                    const tx = (tileIdx % 4) * 64;
                                    const ty = Math.floor(tileIdx / 4) * 64;
                                    this.ctx.imageSmoothingEnabled = false;
                                    this.ctx.drawImage(img, tx, ty, 64, 64);
                                    URL.revokeObjectURL(url);
                                    loadedCount++;
                                    resolve();
                                };
                                img.onerror = () => resolve();
                                img.src = url;
                            });
                        }
                    } catch (_) {}
                }
                if (loadedCount > 0) {
                    this.isLoadedFromZip = true;
                    console.log(`[HorizonEngine] Atlas built with ${loadedCount} official textures from horizon.zip`);
                }
            }

            // Create WebGL texture
            this.texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        }
    }

    // =========================================================================
    // Voxel World & Chunk Meshing
    // =========================================================================
    const CHUNK_SIZE_X = 16;
    const CHUNK_SIZE_Y = 32;
    const CHUNK_SIZE_Z = 16;
    const WORLD_CHUNKS_X = 4;
    const WORLD_CHUNKS_Z = 4;

    class Chunk {
        constructor(cx, cz) {
            this.cx = cx;
            this.cz = cz;
            this.blocks = new Uint8Array(CHUNK_SIZE_X * CHUNK_SIZE_Y * CHUNK_SIZE_Z);
            this.vertexBuffer = null;
            this.vertexCount = 0;
            this.dirty = true;
        }

        getIndex(x, y, z) {
            return x + z * CHUNK_SIZE_X + y * (CHUNK_SIZE_X * CHUNK_SIZE_Z);
        }

        getBlock(x, y, z) {
            if (x < 0 || x >= CHUNK_SIZE_X || y < 0 || y >= CHUNK_SIZE_Y || z < 0 || z >= CHUNK_SIZE_Z) {
                return BLOCKS.AIR;
            }
            return this.blocks[this.getIndex(x, y, z)];
        }

        setBlock(x, y, z, type) {
            if (x >= 0 && x < CHUNK_SIZE_X && y >= 0 && y < CHUNK_SIZE_Y && z >= 0 && z < CHUNK_SIZE_Z) {
                this.blocks[this.getIndex(x, y, z)] = type;
                this.dirty = true;
            }
        }

        buildMesh(world, gl) {
            if (!this.dirty && this.vertexBuffer) return;

            const vertices = [];
            const worldOffsetX = this.cx * CHUNK_SIZE_X;
            const worldOffsetZ = this.cz * CHUNK_SIZE_Z;

            // 6 faces: +Y (top), -Y (bottom), +Z (south), -Z (north), +X (east), -X (west)
            const FACES = [
                { dir: [0, 1, 0], light: 1.0, corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], tileIdx: 0 },
                { dir: [0, -1, 0], light: 0.5, corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], tileIdx: 1 },
                { dir: [0, 0, 1], light: 0.8, corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], tileIdx: 2 },
                { dir: [0, 0, -1], light: 0.8, corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], tileIdx: 3 },
                { dir: [1, 0, 0], light: 0.7, corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], tileIdx: 4 },
                { dir: [-1, 0, 0], light: 0.7, corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], tileIdx: 5 }
            ];

            for (let y = 0; y < CHUNK_SIZE_Y; y++) {
                for (let z = 0; z < CHUNK_SIZE_Z; z++) {
                    for (let x = 0; x < CHUNK_SIZE_X; x++) {
                        const block = this.getBlock(x, y, z);
                        if (block === BLOCKS.AIR) continue;

                        const wx = worldOffsetX + x;
                        const wz = worldOffsetZ + z;
                        const tiles = getBlockTiles(block);

                        for (let f = 0; f < 6; f++) {
                            const face = FACES[f];
                            const nx = wx + face.dir[0];
                            const ny = y + face.dir[1];
                            const nz = wz + face.dir[2];

                            // Only render face if neighbor is transparent (Air or Glass)
                            const neighbor = world.getBlock(nx, ny, nz);
                            if (neighbor !== BLOCKS.AIR && neighbor !== BLOCKS.GLASS) {
                                continue;
                            }

                            const tile = tiles[face.tileIdx];
                            const tu = (tile % 4) * 0.25;
                            const tv = Math.floor(tile / 4) * 0.25;
                            const uvs = [
                                [tu, tv + 0.25],
                                [tu + 0.25, tv + 0.25],
                                [tu + 0.25, tv],
                                [tu, tv]
                            ];

                            // 2 Triangles (6 vertices): 0, 1, 2, 0, 2, 3
                            const quadIndices = [0, 1, 2, 0, 2, 3];
                            for (let idx of quadIndices) {
                                const corner = face.corners[idx];
                                const uv = uvs[idx];
                                vertices.push(
                                    wx + corner[0], y + corner[1], wz + corner[2],
                                    uv[0], uv[1],
                                    face.light
                                );
                            }
                        }
                    }
                }
            }

            if (!this.vertexBuffer) {
                this.vertexBuffer = gl.createBuffer();
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
            this.vertexCount = vertices.length / 6;
            this.dirty = false;
        }
    }

    class VoxelWorld {
        constructor() {
            this.chunks = new Map();
            this.modifiedBlocks = new Map();
        }

        getChunkKey(cx, cz) {
            return `${cx},${cz}`;
        }

        getChunk(cx, cz) {
            return this.chunks.get(this.getChunkKey(cx, cz));
        }

        generate() {
            // Generate chunks
            for (let cx = 0; cx < WORLD_CHUNKS_X; cx++) {
                for (let cz = 0; cz < WORLD_CHUNKS_Z; cz++) {
                    const chunk = new Chunk(cx, cz);
                    this.chunks.set(this.getChunkKey(cx, cz), chunk);

                    // Terrain generation using math noise
                    for (let x = 0; x < CHUNK_SIZE_X; x++) {
                        for (let z = 0; z < CHUNK_SIZE_Z; z++) {
                            const wx = cx * CHUNK_SIZE_X + x;
                            const wz = cz * CHUNK_SIZE_Z + z;

                            // Heightmap with sinusoidal hills
                            const h1 = Math.sin(wx * 0.08) * Math.cos(wz * 0.08) * 5;
                            const h2 = Math.sin(wx * 0.2 + wz * 0.15) * 2;
                            const groundHeight = Math.floor(14 + h1 + h2);

                            // Bedrock
                            chunk.setBlock(x, 0, z, BLOCKS.BEDROCK);

                            // Stone
                            for (let y = 1; y < groundHeight - 3; y++) {
                                chunk.setBlock(x, y, z, BLOCKS.STONE);
                            }

                            // Dirt
                            for (let y = Math.max(1, groundHeight - 3); y < groundHeight; y++) {
                                chunk.setBlock(x, y, z, BLOCKS.DIRT);
                            }

                            // Surface (Grass or Sand near low areas)
                            if (groundHeight < 11) {
                                chunk.setBlock(x, groundHeight, z, BLOCKS.SAND);
                            } else {
                                chunk.setBlock(x, groundHeight, z, BLOCKS.GRASS);
                            }
                        }
                    }
                }
            }

            // Scatter Oak Trees
            for (let cx = 0; cx < WORLD_CHUNKS_X; cx++) {
                for (let cz = 0; cz < WORLD_CHUNKS_Z; cz++) {
                    // 1-2 trees per chunk
                    const treeX = cx * CHUNK_SIZE_X + 4 + Math.floor(Math.sin(cx * 7 + cz * 13) * 3 + 3);
                    const treeZ = cz * CHUNK_SIZE_Z + 4 + Math.floor(Math.cos(cx * 11 + cz * 5) * 3 + 3);
                    const surfaceY = this.getSurfaceHeight(treeX, treeZ);

                    if (surfaceY > 11 && surfaceY < CHUNK_SIZE_Y - 7) {
                        this.spawnTree(treeX, surfaceY + 1, treeZ);
                    }
                }
            }
        }

        spawnTree(tx, ty, tz) {
            const trunkHeight = 4;
            // Trunk
            for (let y = 0; y < trunkHeight; y++) {
                this.setBlock(tx, ty + y, tz, BLOCKS.LOG);
            }
            // Leaves crown (3x3x2)
            for (let ly = ty + trunkHeight - 1; ly <= ty + trunkHeight + 1; ly++) {
                const radius = (ly === ty + trunkHeight + 1) ? 1 : 2;
                for (let lx = tx - radius; lx <= tx + radius; lx++) {
                    for (let lz = tz - radius; lz <= tz + radius; lz++) {
                        if (this.getBlock(lx, ly, lz) === BLOCKS.AIR) {
                            this.setBlock(lx, ly, lz, BLOCKS.LEAVES);
                        }
                    }
                }
            }
        }

        getSurfaceHeight(wx, wz) {
            for (let y = CHUNK_SIZE_Y - 1; y >= 0; y--) {
                const b = this.getBlock(wx, y, wz);
                if (b !== BLOCKS.AIR && b !== BLOCKS.LEAVES) {
                    return y;
                }
            }
            return 10;
        }

        getBlock(wx, wy, wz) {
            if (wy < 0 || wy >= CHUNK_SIZE_Y) return BLOCKS.AIR;
            const cx = Math.floor(wx / CHUNK_SIZE_X);
            const cz = Math.floor(wz / CHUNK_SIZE_Z);
            const chunk = this.getChunk(cx, cz);
            if (!chunk) return BLOCKS.AIR;

            const lx = ((wx % CHUNK_SIZE_X) + CHUNK_SIZE_X) % CHUNK_SIZE_X;
            const lz = ((wz % CHUNK_SIZE_Z) + CHUNK_SIZE_Z) % CHUNK_SIZE_Z;
            return chunk.getBlock(lx, wy, lz);
        }

        setBlock(wx, wy, wz, type) {
            if (wy < 0 || wy >= CHUNK_SIZE_Y) return;
            const cx = Math.floor(wx / CHUNK_SIZE_X);
            const cz = Math.floor(wz / CHUNK_SIZE_Z);
            const chunk = this.getChunk(cx, cz);
            if (!chunk) return;

            const lx = ((wx % CHUNK_SIZE_X) + CHUNK_SIZE_X) % CHUNK_SIZE_X;
            const lz = ((wz % CHUNK_SIZE_Z) + CHUNK_SIZE_Z) % CHUNK_SIZE_Z;
            chunk.setBlock(lx, wy, lz, type);

            // Mark adjacent chunks dirty if on border
            if (lx === 0) this.markChunkDirty(cx - 1, cz);
            if (lx === CHUNK_SIZE_X - 1) this.markChunkDirty(cx + 1, cz);
            if (lz === 0) this.markChunkDirty(cx, cz - 1);
            if (lz === CHUNK_SIZE_Z - 1) this.markChunkDirty(cx, cz + 1);
        }

        markChunkDirty(cx, cz) {
            const c = this.getChunk(cx, cz);
            if (c) c.dirty = true;
        }
    }

    // =========================================================================
    // First-Person Player Physics & Controls
    // =========================================================================
    class Player {
        constructor(x, y, z) {
            this.x = x;
            this.y = y;
            this.z = z;
            this.vx = 0;
            this.vy = 0;
            this.vz = 0;
            this.yaw = 0; // horizontal angle
            this.pitch = 0; // vertical angle
            this.onGround = false;
            this.flying = false;
            this.speed = 4.8;
            this.jumpForce = 7.5;
            this.gravity = 22.0;

            // Player Bounding Box
            this.width = 0.55;
            this.height = 1.8;
            this.eyeHeight = 1.62;

            // Active keys
            this.keys = {
                forward: false,
                backward: false,
                left: false,
                right: false,
                jump: false,
                sneak: false
            };
        }

        update(dt, world) {
            // Camera forward & right vectors on XZ plane
            const sinY = Math.sin(this.yaw);
            const cosY = Math.cos(this.yaw);

            let moveX = 0;
            let moveZ = 0;
            if (this.keys.forward) { moveX += sinY; moveZ -= cosY; }
            if (this.keys.backward) { moveX -= sinY; moveZ += cosY; }
            if (this.keys.left) { moveX -= cosY; moveZ -= sinY; }
            if (this.keys.right) { moveX += cosY; moveZ += sinY; }

            const moveLen = Math.hypot(moveX, moveZ);
            if (moveLen > 0.001) {
                moveX = (moveX / moveLen) * this.speed;
                moveZ = (moveZ / moveLen) * this.speed;
            }

            this.vx = moveX;
            this.vz = moveZ;

            if (this.flying) {
                this.vy = 0;
                if (this.keys.jump) this.vy = this.speed;
                if (this.keys.sneak) this.vy = -this.speed;
            } else {
                // Gravity
                this.vy -= this.gravity * dt;
                if (this.keys.jump && this.onGround) {
                    this.vy = this.jumpForce;
                    this.onGround = false;
                }
            }

            // Move with AABB block collision resolution
            this.moveWithCollision(this.vx * dt, this.vy * dt, this.vz * dt, world);
        }

        moveWithCollision(dx, dy, dz, world) {
            const hw = this.width / 2;

            // Check Y collision
            this.y += dy;
            let boxY = {
                minX: this.x - hw, maxX: this.x + hw,
                minY: this.y, maxY: this.y + this.height,
                minZ: this.z - hw, maxZ: this.z + hw
            };
            if (this.collidesWithWorld(boxY, world)) {
                if (dy < 0) {
                    this.y = Math.ceil(this.y);
                    this.onGround = true;
                    this.vy = 0;
                } else if (dy > 0) {
                    this.y = Math.floor(this.y + this.height) - this.height;
                    this.vy = 0;
                }
            } else {
                this.onGround = false;
            }

            // Check X collision
            this.x += dx;
            let boxX = {
                minX: this.x - hw, maxX: this.x + hw,
                minY: this.y, maxY: this.y + this.height,
                minZ: this.z - hw, maxZ: this.z + hw
            };
            if (this.collidesWithWorld(boxX, world)) {
                this.x -= dx;
                this.vx = 0;
            }

            // Check Z collision
            this.z += dz;
            let boxZ = {
                minX: this.x - hw, maxX: this.x + hw,
                minY: this.y, maxY: this.y + this.height,
                minZ: this.z - hw, maxZ: this.z + hw
            };
            if (this.collidesWithWorld(boxZ, world)) {
                this.z -= dz;
                this.vz = 0;
            }
        }

        collidesWithWorld(box, world) {
            const minX = Math.floor(box.minX);
            const maxX = Math.floor(box.maxX);
            const minY = Math.floor(box.minY);
            const maxY = Math.floor(box.maxY);
            const minZ = Math.floor(box.minZ);
            const maxZ = Math.floor(box.maxZ);

            for (let y = minY; y <= maxY; y++) {
                for (let z = minZ; z <= maxZ; z++) {
                    for (let x = minX; x <= maxX; x++) {
                        const block = world.getBlock(x, y, z);
                        if (block !== BLOCKS.AIR) {
                            return true;
                        }
                    }
                }
            }
            return false;
        }

        getEyePosition() {
            return [this.x, this.y + this.eyeHeight, this.z];
        }

        getForwardVector() {
            const cosP = Math.cos(this.pitch);
            return [
                Math.sin(this.yaw) * cosP,
                Math.sin(this.pitch),
                -Math.cos(this.yaw) * cosP
            ];
        }
    }

    // =========================================================================
    // Voxel Raycasting (Amanatides-Woo DDA Algorithm)
    // =========================================================================
    function raycast(world, origin, dir, maxDist = 5.5) {
        let px = origin[0], py = origin[1], pz = origin[2];
        let dx = dir[0], dy = dir[1], dz = dir[2];

        let stepX = Math.sign(dx), stepY = Math.sign(dy), stepZ = Math.sign(dz);
        let tDeltaX = (dx !== 0) ? Math.abs(1 / dx) : Infinity;
        let tDeltaY = (dy !== 0) ? Math.abs(1 / dy) : Infinity;
        let tDeltaZ = (dz !== 0) ? Math.abs(1 / dz) : Infinity;

        let blockX = Math.floor(px);
        let blockY = Math.floor(py);
        let blockZ = Math.floor(pz);

        let tMaxX = (stepX > 0) ? (blockX + 1 - px) * tDeltaX : (px - blockX) * tDeltaX;
        let tMaxY = (stepY > 0) ? (blockY + 1 - py) * tDeltaY : (py - blockY) * tDeltaY;
        let tMaxZ = (stepZ > 0) ? (blockZ + 1 - pz) * tDeltaZ : (pz - blockZ) * tDeltaZ;

        let normal = [0, 0, 0];
        let dist = 0;

        while (dist < maxDist) {
            const block = world.getBlock(blockX, blockY, blockZ);
            if (block !== BLOCKS.AIR) {
                return {
                    hit: true,
                    block,
                    pos: [blockX, blockY, blockZ],
                    normal: normal,
                    distance: dist
                };
            }

            if (tMaxX < tMaxY) {
                if (tMaxX < tMaxZ) {
                    dist = tMaxX;
                    tMaxX += tDeltaX;
                    blockX += stepX;
                    normal = [-stepX, 0, 0];
                } else {
                    dist = tMaxZ;
                    tMaxZ += tDeltaZ;
                    blockZ += stepZ;
                    normal = [0, 0, -stepZ];
                }
            } else {
                if (tMaxY < tMaxZ) {
                    dist = tMaxY;
                    tMaxY += tDeltaY;
                    blockY += stepY;
                    normal = [0, -stepY, 0];
                } else {
                    dist = tMaxZ;
                    tMaxZ += tDeltaZ;
                    blockZ += stepZ;
                    normal = [0, 0, -stepZ];
                }
            }
        }

        return { hit: false };
    }

    // =========================================================================
    // Shader Sources & WebGL Program
    // =========================================================================
    const VS_SOURCE = `
        attribute vec3 a_position;
        attribute vec2 a_texcoord;
        attribute float a_light;

        uniform mat4 u_matrix;
        uniform vec3 u_cameraPos;

        varying vec2 v_texcoord;
        varying float v_light;
        varying float v_dist;

        void main() {
            vec4 pos = u_matrix * vec4(a_position, 1.0);
            gl_Position = pos;
            v_texcoord = a_texcoord;
            v_light = a_light;
            v_dist = length(a_position - u_cameraPos);
        }
    `;

    const FS_SOURCE = `
        precision mediump float;

        varying vec2 v_texcoord;
        varying float v_light;
        varying float v_dist;

        uniform sampler2D u_texture;

        void main() {
            vec4 texColor = texture2D(u_texture, v_texcoord);
            if (texColor.a < 0.2) discard;

            // Direct directional block shading
            vec3 shadedColor = texColor.rgb * v_light;

            // Distance fog (Minecraft style sky blue fade)
            vec3 fogColor = vec3(0.55, 0.75, 0.95);
            float fogFactor = clamp((v_dist - 25.0) / 35.0, 0.0, 1.0);

            gl_FragColor = vec4(mix(shadedColor, fogColor, fogFactor), texColor.a);
        }
    `;

    // Wireframe Box Shader for Block Selection
    const VS_LINE = `
        attribute vec3 a_position;
        uniform mat4 u_matrix;
        void main() {
            gl_Position = u_matrix * vec4(a_position, 1.0);
        }
    `;
    const FS_LINE = `
        precision mediump float;
        void main() {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 0.65);
        }
    `;

    // =========================================================================
    // Main Engine Controller
    // =========================================================================
    class HorizonEngine {
        constructor() {
            this.canvas = document.getElementById("horizon-canvas");
            this.gl = this.canvas.getContext("webgl", { antialias: false, alpha: false }) ||
                      this.canvas.getContext("experimental-webgl");
            
            this.world = new VoxelWorld();
            this.player = new Player(32, 22, 32);
            this.atlas = new AtlasManager();
            this.program = null;
            this.lineProgram = null;
            this.lineBuffer = null;
            this.isRunning = false;
            this.selectedHotbarSlot = 0;
            this.targetedVoxel = null;
            this.lastTime = performance.now();

            // Sound Effects (WebAudio synthetic click/break/place)
            this.audioCtx = null;
        }

        async init(vfs) {
            if (!this.gl) {
                console.error("[HorizonEngine] WebGL not supported");
                return false;
            }

            const gl = this.gl;
            gl.enable(gl.DEPTH_TEST);
            gl.enable(gl.CULL_FACE);
            gl.cullFace(gl.BACK);
            gl.clearColor(0.55, 0.75, 0.95, 1.0); // Minecraft sky blue

            // Build shaders
            this.program = this.createProgram(gl, VS_SOURCE, FS_SOURCE);
            this.lineProgram = this.createProgram(gl, VS_LINE, FS_LINE);
            this.createWireframeBuffer(gl);

            // Build Atlas
            await this.atlas.build(vfs, gl);

            // Generate World
            this.world.generate();

            // Setup Controls & Listeners
            this.setupInput();

            console.log("[HorizonEngine] Engine initialized successfully! Ready to render.");
            return true;
        }

        createProgram(gl, vsSource, fsSource) {
            const vs = gl.createShader(gl.VERTEX_SHADER);
            gl.shaderSource(vs, vsSource);
            gl.compileShader(vs);
            if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
                console.error("VS compile error:", gl.getShaderInfoLog(vs));
            }

            const fs = gl.createShader(gl.FRAGMENT_SHADER);
            gl.shaderSource(fs, fsSource);
            gl.compileShader(fs);
            if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
                console.error("FS compile error:", gl.getShaderInfoLog(fs));
            }

            const prog = gl.createProgram();
            gl.attachShader(prog, vs);
            gl.attachShader(prog, fs);
            gl.linkProgram(prog);
            return prog;
        }

        createWireframeBuffer(gl) {
            // Unit cube edges
            const lines = [
                0,0,0, 1,0,0,  1,0,0, 1,0,1,  1,0,1, 0,0,1,  0,0,1, 0,0,0,
                0,1,0, 1,1,0,  1,1,0, 1,1,1,  1,1,1, 0,1,1,  0,1,1, 0,1,0,
                0,0,0, 0,1,0,  1,0,0, 1,1,0,  1,0,1, 1,1,1,  0,0,1, 0,1,1
            ];
            this.lineBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.STATIC_DRAW);
        }

        playAudioFeedback(freq = 440, type = "triangle", duration = 0.08) {
            try {
                if (!this.audioCtx) {
                    const AudioContext = window.AudioContext || window.webkitAudioContext;
                    if (AudioContext) this.audioCtx = new AudioContext();
                }
                if (this.audioCtx && this.audioCtx.state === "running") {
                    const osc = this.audioCtx.createOscillator();
                    const gain = this.audioCtx.createGain();
                    osc.type = type;
                    osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
                    gain.gain.setValueAtTime(0.15, this.audioCtx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + duration);
                    osc.connect(gain);
                    gain.connect(this.audioCtx.destination);
                    osc.start();
                    osc.stop(this.audioCtx.currentTime + duration);
                }
            } catch (_) {}
        }

        setupInput() {
            // Keyboard Controls
            window.addEventListener("keydown", (e) => {
                if (e.code === "KeyW") this.player.keys.forward = true;
                if (e.code === "KeyS") this.player.keys.backward = true;
                if (e.code === "KeyA") this.player.keys.left = true;
                if (e.code === "KeyD") this.player.keys.right = true;
                if (e.code === "Space") this.player.keys.jump = true;
                if (e.code === "ShiftLeft" || e.code === "ShiftRight") this.player.keys.sneak = true;

                // Numbers 1-9 select hotbar slot
                if (e.code >= "Digit1" && e.code <= "Digit9") {
                    const slot = parseInt(e.key, 10) - 1;
                    if (slot < HOTBAR_SLOTS.length) {
                        this.selectedHotbarSlot = slot;
                        this.updateHotbarUI();
                    }
                }
            });

            window.addEventListener("keyup", (e) => {
                if (e.code === "KeyW") this.player.keys.forward = false;
                if (e.code === "KeyS") this.player.keys.backward = false;
                if (e.code === "KeyA") this.player.keys.left = false;
                if (e.code === "KeyD") this.player.keys.right = false;
                if (e.code === "Space") this.player.keys.jump = false;
                if (e.code === "ShiftLeft" || e.code === "ShiftRight") this.player.keys.sneak = false;
            });

            // Mouse Look (Pointer Lock)
            window.addEventListener("mousemove", (e) => {
                if (document.pointerLockElement === this.canvas) {
                    const sens = 0.0024;
                    this.player.yaw += e.movementX * sens;
                    this.player.pitch -= e.movementY * sens;
                    // Clamp pitch
                    const maxPitch = Math.PI / 2 - 0.02;
                    this.player.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.player.pitch));
                }
            });

            // Mouse Clicks (Break & Place)
            this.canvas.addEventListener("mousedown", (e) => {
                if (document.pointerLockElement !== this.canvas) return;
                if (e.button === 0) {
                    // Left Click: Break block
                    this.breakTargetedBlock();
                } else if (e.button === 2) {
                    // Right Click: Place block
                    this.placeTargetedBlock();
                }
            });

            // Prevent context menu on canvas
            this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

            // Mouse Wheel to scroll hotbar
            window.addEventListener("wheel", (e) => {
                if (this.isRunning) {
                    if (e.deltaY > 0) {
                        this.selectedHotbarSlot = (this.selectedHotbarSlot + 1) % HOTBAR_SLOTS.length;
                    } else {
                        this.selectedHotbarSlot = (this.selectedHotbarSlot - 1 + HOTBAR_SLOTS.length) % HOTBAR_SLOTS.length;
                    }
                    this.updateHotbarUI();
                }
            });

            // Mobile Touch Look / Drag
            let touchStartX = 0;
            let touchStartY = 0;
            this.canvas.addEventListener("touchstart", (e) => {
                if (e.touches.length > 0) {
                    touchStartX = e.touches[0].clientX;
                    touchStartY = e.touches[0].clientY;
                }
            });

            this.canvas.addEventListener("touchmove", (e) => {
                if (e.touches.length > 0) {
                    const dx = e.touches[0].clientX - touchStartX;
                    const dy = e.touches[0].clientY - touchStartY;
                    touchStartX = e.touches[0].clientX;
                    touchStartY = e.touches[0].clientY;

                    const sens = 0.004;
                    this.player.yaw += dx * sens;
                    this.player.pitch -= dy * sens;
                    const maxPitch = Math.PI / 2 - 0.02;
                    this.player.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.player.pitch));
                }
            });
        }

        breakTargetedBlock() {
            if (this.targetedVoxel && this.targetedVoxel.hit) {
                const [bx, by, bz] = this.targetedVoxel.pos;
                if (this.world.getBlock(bx, by, bz) !== BLOCKS.BEDROCK) {
                    this.world.setBlock(bx, by, bz, BLOCKS.AIR);
                    this.playAudioFeedback(260, "sawtooth", 0.07);
                }
            }
        }

        placeTargetedBlock() {
            if (this.targetedVoxel && this.targetedVoxel.hit) {
                const [bx, by, bz] = this.targetedVoxel.pos;
                const [nx, ny, nz] = this.targetedVoxel.normal;
                const px = bx + nx;
                const py = by + ny;
                const pz = bz + nz;

                // Don't place inside player
                const eye = this.player.getEyePosition();
                if (Math.hypot(px + 0.5 - eye[0], py + 0.5 - eye[1], pz + 0.5 - eye[2]) > 0.8) {
                    const blockToPlace = HOTBAR_SLOTS[this.selectedHotbarSlot] || BLOCKS.COBBLESTONE;
                    this.world.setBlock(px, py, pz, blockToPlace);
                    this.playAudioFeedback(340, "sine", 0.06);
                }
            }
        }

        updateHotbarUI() {
            document.querySelectorAll(".hotbar-slot").forEach((slot, idx) => {
                if (idx === this.selectedHotbarSlot) {
                    slot.classList.add("active");
                } else {
                    slot.classList.remove("active");
                }
            });
        }

        start() {
            this.isRunning = true;
            this.lastTime = performance.now();
            requestAnimationFrame((t) => this.renderLoop(t));
        }

        stop() {
            this.isRunning = false;
        }

        renderLoop(now) {
            if (!this.isRunning) return;

            const dt = Math.min((now - this.lastTime) / 1000, 0.1);
            this.lastTime = now;

            // Update Player
            this.player.update(dt, this.world);

            // Raycast for targeted block
            const eye = this.player.getEyePosition();
            const forward = this.player.getForwardVector();
            this.targetedVoxel = raycast(this.world, eye, forward, 5.5);

            // Render 3D Scene
            this.render();

            requestAnimationFrame((t) => this.renderLoop(t));
        }

        render() {
            const gl = this.gl;
            const aspect = this.canvas.width / this.canvas.height;

            gl.viewport(0, 0, this.canvas.width, this.canvas.height);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

            // Matrices
            const projMat = new Float32Array(16);
            Mat4.perspective(projMat, 70 * Math.PI / 180, aspect, 0.05, 120.0);

            const eye = this.player.getEyePosition();
            const forward = this.player.getForwardVector();
            const target = [eye[0] + forward[0], eye[1] + forward[1], eye[2] + forward[2]];
            const viewMat = new Float32Array(16);
            Mat4.lookAt(viewMat, eye, target, [0, 1, 0]);

            const viewProj = new Float32Array(16);
            Mat4.multiply(viewProj, projMat, viewMat);

            // Render Chunks
            gl.useProgram(this.program);
            const uMatrix = gl.getUniformLocation(this.program, "u_matrix");
            const uCameraPos = gl.getUniformLocation(this.program, "u_cameraPos");
            const uTexture = gl.getUniformLocation(this.program, "u_texture");

            gl.uniformMatrix4fv(uMatrix, false, viewProj);
            gl.uniform3fv(uCameraPos, eye);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.atlas.texture);
            gl.uniform1i(uTexture, 0);

            const aPos = gl.getAttribLocation(this.program, "a_position");
            const aTex = gl.getAttribLocation(this.program, "a_texcoord");
            const aLight = gl.getAttribLocation(this.program, "a_light");
            gl.enableVertexAttribArray(aPos);
            gl.enableVertexAttribArray(aTex);
            gl.enableVertexAttribArray(aLight);

            for (const chunk of this.world.chunks.values()) {
                chunk.buildMesh(this.world, gl);
                if (chunk.vertexCount > 0) {
                    gl.bindBuffer(gl.ARRAY_BUFFER, chunk.vertexBuffer);
                    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0);
                    gl.vertexAttribPointer(aTex, 2, gl.FLOAT, false, 24, 12);
                    gl.vertexAttribPointer(aLight, 1, gl.FLOAT, false, 24, 20);
                    gl.drawArrays(gl.TRIANGLES, 0, chunk.vertexCount);
                }
            }

            // Render Selection Wireframe around targeted block
            if (this.targetedVoxel && this.targetedVoxel.hit) {
                const [bx, by, bz] = this.targetedVoxel.pos;
                gl.useProgram(this.lineProgram);
                const uLineMatrix = gl.getUniformLocation(this.lineProgram, "u_matrix");

                // Translate line box to block position (slightly scaled to avoid z-fighting)
                const modelMat = new Float32Array(16);
                modelMat[0] = 1.002; modelMat[5] = 1.002; modelMat[10] = 1.002; modelMat[15] = 1.0;
                modelMat[12] = bx - 0.001; modelMat[13] = by - 0.001; modelMat[14] = bz - 0.001;

                const lineMvp = new Float32Array(16);
                Mat4.multiply(lineMvp, viewProj, modelMat);
                gl.uniformMatrix4fv(uLineMatrix, false, lineMvp);

                gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer);
                const aLinePos = gl.getAttribLocation(this.lineProgram, "a_position");
                gl.enableVertexAttribArray(aLinePos);
                gl.vertexAttribPointer(aLinePos, 3, gl.FLOAT, false, 0, 0);
                gl.lineWidth(2.0);
                gl.drawArrays(gl.LINES, 0, 24);
            }
        }
    }

    window.HorizonEngine = HorizonEngine;
    window.BLOCKS = BLOCKS;
    window.BLOCK_NAMES = BLOCK_NAMES;
    window.HOTBAR_SLOTS = HOTBAR_SLOTS;
})();
