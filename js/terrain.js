// LUNA-01: Lunar South Pole Rover Exploration - Terrain & Regolith Environment
// Models Shackleton Crater Rim, Permanently Shadowed Regions (PSRs), 
// high-resolution procedural regolith normal mapping, and scattering boulder fields.

import * as THREE from 'three';

export class LunarTerrain {
  constructor(scene) {
    this.scene = scene;
    this.terrainMesh = null;
    this.boulders = [];
    this.iceDepositLocations = [];

    // Terrain size and resolution
    this.size = 1800; // 1.8 km x 1.8 km playable exploration sector
    this.segments = 256; // 256x256 high-density vertex grid

    // Shackleton crater center and parameters
    // Center is set so the rover starts on the sunlit rim ridge and can explore down into the PSR
    this.craterCenter = new THREE.Vector2(200, -350);
    this.craterRadius = 650;
    this.craterDepth = 140;

    // Regolith textures
    this.regolithNormalMap = null;
    this.regolithRoughnessMap = null;

    this.init();
  }

  init() {
    this.generateRegolithTextures();
    this.createTerrainGeometry();
    this.populateBoulders();
    this.createIceDepositMarkers();
  }

  // Procedural generation of fine lunar regolith normal and roughness maps
  generateRegolithTextures() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    // Base noise and fine dust grains
    const imgData = ctx.createImageData(1024, 1024);
    const data = imgData.data;

    // Generate height noise for normal mapping
    const heightMap = new Float32Array(1024 * 1024);

    for (let y = 0; y < 1024; y++) {
      for (let x = 0; x < 1024; x++) {
        const idx = y * 1024 + x;
        // Multi-frequency noise (fine agglutinates + micro craters)
        let n = Math.sin(x * 0.08) * Math.cos(y * 0.08) * 0.15;
        n += Math.sin(x * 0.25 + 1.2) * Math.cos(y * 0.23 + 2.3) * 0.08;
        n += (Math.random() - 0.5) * 0.35; // high-frequency dust grit
        heightMap[idx] = n;
      }
    }

    // Add scattered micro-craters to the height map
    for (let c = 0; c < 120; c++) {
      const cx = Math.floor(Math.random() * 1024);
      const cy = Math.floor(Math.random() * 1024);
      const r = Math.floor(6 + Math.random() * 24);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const distSq = dx * dx + dy * dy;
          if (distSq < r * r) {
            const dist = Math.sqrt(distSq);
            const px = (cx + dx + 1024) % 1024;
            const py = (cy + dy + 1024) % 1024;
            const pidx = py * 1024 + px;
            // Crater profile: raised rim + depression bowl
            const normDist = dist / r;
            let depth = -Math.cos(normDist * Math.PI * 0.5) * 0.8;
            if (normDist > 0.75) {
              depth += Math.sin((normDist - 0.75) * 4 * Math.PI) * 0.3; // raised rim
            }
            heightMap[pidx] += depth * 0.4;
          }
        }
      }
    }

    // Compute Sobel normal map from heightMap
    for (let y = 0; y < 1024; y++) {
      for (let x = 0; x < 1024; x++) {
        const left = heightMap[y * 1024 + ((x - 1 + 1024) % 1024)];
        const right = heightMap[y * 1024 + ((x + 1) % 1024)];
        const up = heightMap[((y - 1 + 1024) % 1024) * 1024 + x];
        const down = heightMap[((y + 1) % 1024) * 1024 + x];

        const dx = (right - left) * 2.5;
        const dy = (down - up) * 2.5;
        const dz = 1.0;

        // Normalize
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const nx = (dx / len) * 0.5 + 0.5;
        const ny = (dy / len) * 0.5 + 0.5;
        const nz = (dz / len) * 0.5 + 0.5;

        const p = (y * 1024 + x) * 4;
        data[p] = Math.floor(nx * 255);
        data[p + 1] = Math.floor(ny * 255);
        data[p + 2] = Math.floor(nz * 255);
        data[p + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);

    this.regolithNormalMap = new THREE.CanvasTexture(canvas);
    this.regolithNormalMap.wrapS = THREE.RepeatWrapping;
    this.regolithNormalMap.wrapT = THREE.RepeatWrapping;
    this.regolithNormalMap.repeat.set(48, 48);

    // Roughness map
    const roughCanvas = document.createElement('canvas');
    roughCanvas.width = 512;
    roughCanvas.height = 512;
    const rctx = roughCanvas.getContext('2d');
    rctx.fillStyle = '#b0b0b0'; // high roughness regolith
    rctx.fillRect(0, 0, 512, 512);

    // Subtle dark agglutinate speckles
    for (let i = 0; i < 5000; i++) {
      rctx.fillStyle = Math.random() > 0.5 ? '#d0d0d0' : '#888888';
      rctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }

    this.regolithRoughnessMap = new THREE.CanvasTexture(roughCanvas);
    this.regolithRoughnessMap.wrapS = THREE.RepeatWrapping;
    this.regolithRoughnessMap.wrapT = THREE.RepeatWrapping;
    this.regolithRoughnessMap.repeat.set(48, 48);
  }

  // Mathematical height function for LOLA South Pole topography
  getHeight(x, z) {
    // 1. Shackleton Crater Depression
    const dx = x - this.craterCenter.x;
    const dz = z - this.craterCenter.y;
    const distFromCrater = Math.sqrt(dx * dx + dz * dz);

    let h = 0;

    if (distFromCrater < this.craterRadius) {
      // Inside crater or slope
      const normD = distFromCrater / this.craterRadius;
      if (normD < 0.6) {
        // Flat floor of Shackleton PSR
        h = -this.craterDepth + Math.sin(x * 0.015) * Math.cos(z * 0.015) * 4;
      } else {
        // Steep crater inner wall
        const wallT = (normD - 0.6) / 0.4;
        const smoothWall = (1 - Math.cos(wallT * Math.PI)) * 0.5;
        h = -this.craterDepth + smoothWall * (this.craterDepth + 25);
      }
    } else if (distFromCrater < this.craterRadius * 1.35) {
      // Raised crater rim (Peak of Eternal Light ridge)
      const rimT = (distFromCrater - this.craterRadius) / (this.craterRadius * 0.35);
      const rimProfile = Math.sin(rimT * Math.PI);
      h = 25 * rimProfile;
    } else {
      // Outer terrain rolling highlands
      h = Math.sin(x * 0.005) * 12 + Math.cos(z * 0.006) * 14;
    }

    // 2. Secondary impact craters
    // Connecting Ridge sub-crater
    const c2dx = x + 350;
    const c2dz = z + 250;
    const c2d = Math.sqrt(c2dx * c2dx + c2dz * c2dz);
    if (c2d < 160) {
      const c2t = c2d / 160;
      h -= (1 - c2t * c2t) * 32;
    }

    // Small crater near rover spawn
    const c3dx = x - 40;
    const c3dz = z - 60;
    const c3d = Math.sqrt(c3dx * c3dx + c3dz * c3dz);
    if (c3d < 50) {
      const c3t = c3d / 50;
      h -= (1 - c3t * c3t) * 12;
    }

    // 3. Rolling highland undulations & regolith macro-bumps
    h += Math.sin(x * 0.02) * Math.cos(z * 0.02) * 2.5;
    h += Math.sin(x * 0.05 + 1.0) * Math.cos(z * 0.04 + 2.0) * 0.8;

    return h;
  }

  // Analytical normal calculation for smooth rover suspension orientation
  getNormal(x, z) {
    const eps = 0.5;
    const hL = this.getHeight(x - eps, z);
    const hR = this.getHeight(x + eps, z);
    const hD = this.getHeight(x, z - eps);
    const hU = this.getHeight(x, z + eps);

    const normal = new THREE.Vector3(
      hL - hR,
      2 * eps,
      hD - hU
    ).normalize();

    return normal;
  }

  // Check if position is inside the Permanently Shadowed Region (PSR) cold trap
  isPositionInPSR(x, z) {
    const dx = x - this.craterCenter.x;
    const dz = z - this.craterCenter.y;
    const dist = Math.sqrt(dx * dx + dz * dz);
    // Deep crater interior where low-angle sun (4°) cannot penetrate rim wall
    return dist < (this.craterRadius * 0.65);
  }

  // Calculate volatile water-ice concentration (0.0 to 1.0) for neutron spectrometer
  getIceConcentration(x, z) {
    let maxConc = 0;
    for (const ice of this.iceDepositLocations) {
      const dist = Math.hypot(x - ice.x, z - ice.z);
      if (dist < ice.radius) {
        const conc = Math.cos((dist / ice.radius) * Math.PI * 0.5);
        if (conc > maxConc) maxConc = conc;
      }
    }
    return Math.min(Math.max(maxConc, 0), 1);
  }

  createTerrainGeometry() {
    const geo = new THREE.PlaneGeometry(this.size, this.size, this.segments, this.segments);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    // Color gradient for lunar surface
    // Sunlit highlands: titanium-rich anorthosite gray (#888a90)
    // Deep PSR floor: cold dark basalt (#3a3d44) with subtle frosty sheen
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = this.getHeight(x, z);
      pos.setY(i, y);

      const inPSR = this.isPositionInPSR(x, z);
      let r, g, b;

      if (inPSR) {
        // Cold floor with subtle icy frost glint
        r = 0.28 + Math.random() * 0.04;
        g = 0.30 + Math.random() * 0.04;
        b = 0.35 + Math.random() * 0.06; // faint bluish ice tint in PSR
      } else {
        // Sunlit rim regolith
        const shade = 0.48 + Math.random() * 0.05;
        r = shade;
        g = shade * 0.98;
        b = shade * 0.96;
      }

      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    // Lunar Regolith Material with normal map & roughness map
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.08,
      normalMap: this.regolithNormalMap,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughnessMap: this.regolithRoughnessMap
    });

    this.terrainMesh = new THREE.Mesh(geo, mat);
    this.terrainMesh.receiveShadow = true;
    this.terrainMesh.castShadow = true;
    this.scene.add(this.terrainMesh);
  }

  // Scattered lunar boulders (ejecta from impact craters)
  populateBoulders() {
    const boulderGeo = new THREE.DodecahedronGeometry(1.0, 1);
    // Deform vertices for realistic angular, shock-fractured lunar rocks
    const pos = boulderGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const factor = 0.75 + Math.random() * 0.5;
      pos.setXYZ(i, vx * factor, vy * factor, vz * factor);
    }
    boulderGeo.computeVertexNormals();

    const boulderMat = new THREE.MeshStandardMaterial({
      color: 0x5a5e66,
      roughness: 0.88,
      metalness: 0.12,
      normalMap: this.regolithNormalMap,
      normalScale: new THREE.Vector2(1.2, 1.2)
    });

    // InstancedMesh for high performance
    const count = 350;
    const instancedBoulders = new THREE.InstancedMesh(boulderGeo, boulderMat, count);
    instancedBoulders.castShadow = true;
    instancedBoulders.receiveShadow = true;

    const dummy = new THREE.Object3D();
    let placed = 0;

    for (let i = 0; i < count; i++) {
      // Distribute boulders across the rim and near craters
      const angle = Math.random() * Math.PI * 2;
      const radius = 50 + Math.random() * 700;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      // Avoid blocking immediate rover spawn (0, 0)
      if (Math.hypot(x, z) < 18) continue;

      const y = this.getHeight(x, z);
      const scale = 0.6 + Math.pow(Math.random(), 2) * 3.5; // majority small, few huge boulders

      dummy.position.set(x, y + scale * 0.4, z);
      dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      dummy.scale.set(scale, scale * (0.8 + Math.random() * 0.4), scale);
      dummy.updateMatrix();

      instancedBoulders.setMatrixAt(placed, dummy.matrix);
      this.boulders.push({ x, z, radius: scale * 0.9 });
      placed++;
    }

    instancedBoulders.instanceMatrix.needsUpdate = true;
    this.scene.add(instancedBoulders);
  }

  // Waypoints & Water-Ice Deposit Locations in the PSR
  createIceDepositMarkers() {
    this.iceDepositLocations = [
      {
        id: 'PSR-ALPHA',
        name: 'Shackleton Floor Cold Trap (Ice Alpha)',
        x: this.craterCenter.x + 40,
        z: this.craterCenter.y + 60,
        radius: 120,
        h2oPercent: 5.6 // 5.6 wt% Water-Equivalent Hydrogen
      },
      {
        id: 'PSR-BETA',
        name: 'Inner Wall Deep Shadow (Ice Beta)',
        x: this.craterCenter.x - 120,
        z: this.craterCenter.y - 80,
        radius: 90,
        h2oPercent: 3.8
      },
      {
        id: 'ARTEMIS-CAMP',
        name: 'Connecting Ridge Artemis Base Site',
        x: -280,
        z: -180,
        radius: 150,
        h2oPercent: 0.4 // sunlit high ground
      }
    ];

    // Create subtle crystalline ice patches in the PSR
    for (const ice of this.iceDepositLocations) {
      if (ice.h2oPercent > 2.0) {
        const icePatchGeo = new THREE.CircleGeometry(ice.radius * 0.7, 32);
        icePatchGeo.rotateX(-Math.PI / 2);
        const patchPos = icePatchGeo.attributes.position;
        for (let i = 0; i < patchPos.count; i++) {
          const px = ice.x + patchPos.getX(i);
          const pz = ice.z + patchPos.getZ(i);
          patchPos.setY(i, this.getHeight(px, pz) - this.getHeight(ice.x, ice.z) + 0.15);
        }
        icePatchGeo.computeVertexNormals();

        const icePatchMat = new THREE.MeshStandardMaterial({
          color: 0xc8e4ff,
          roughness: 0.35,
          metalness: 0.4,
          transparent: true,
          opacity: 0.65,
          emissive: 0x103050,
          emissiveIntensity: 0.25
        });

        const patchMesh = new THREE.Mesh(icePatchGeo, icePatchMat);
        patchMesh.position.set(ice.x, this.getHeight(ice.x, ice.z), ice.z);
        patchMesh.receiveShadow = true;
        this.scene.add(patchMesh);
      }
    }
  }
}
