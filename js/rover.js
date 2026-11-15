// LUNA-01: Lunar South Pole Rover Exploration - Rover Model, Cockpit Rig & Kinematics
// Models the LUNA-01 rover chassis, foreground solar array wings, rocker-bogie suspension,
// front camera mast rig (y: 1.8m, z: -0.5m), drill assembly, and low-gravity dust particle system.

import * as THREE from 'three';
import { audioManager } from './audio.js';

export class LunaRover {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;

    // Root rover group in world space
    this.root = new THREE.Group();
    this.scene.add(this.root);

    // Chassis group
    this.chassis = new THREE.Group();
    this.root.add(this.chassis);

    // Rover motion state
    this.position = new THREE.Vector3(0, 0, 0);
    this.heading = 0; // radians (yaw around Y)
    this.speed = 0; // m/s
    this.steeringAngle = 0; // radians
    this.maxSpeedKmh = 12.0; // 12 km/h max specification
    this.maxSpeedMs = this.maxSpeedKmh / 3.6; // ~3.33 m/s
    this.acceleration = 2.4; // m/s²
    this.brakeDecel = 4.5;
    this.naturalDecel = 0.9;
    this.turnSpeed = 1.3; // rad/s
    this.wheelRotation = 0;

    // Power & Thermal simulation
    this.batteryJoules = 100; // %
    this.solarPowerWatts = 780;
    this.rcsPowerWatts = 220;
    this.thermalMarginC = 28.5; // °C margin above cold fault limit (-40°C)
    this.headlightsActive = true;
    this.headlightLevel = 2; // 0=Off, 1=Low, 2=High
    this.isBraking = false;

    // Auto-Navigation & Science Scan state
    this.isAutoNav = false;
    this.autoNavTarget = null;
    this.isDrilling = false;
    this.drillProgress = 0; // 0 to 1
    this.drillMesh = null;
    this.lastScienceResult = null;

    // Speed preset mode: 1=SLOW (3 km/h), 2=CRUISE (7 km/h), 3=MAX (12 km/h)
    this.speedPreset = 3;

    // Components references
    this.wheels = [];
    this.steeredWheelGroups = [];
    this.solarPanels = [];
    this.mastHead = null;
    this.cockpitAnchor = null;
    this.cockpitDashboard = null;
    this.headlightSpots = [];

    // Dust particles
    this.dustSystem = null;
    this.dustParticles = [];
    this.maxDust = 400;

    this.init();
  }

  init() {
    this.buildRoverGeometry();
    this.setupCockpitRig();
    this.setupHeadlights();
    this.setupDustSystem();

    // Initial position on sunlit rim
    const startX = 0;
    const startZ = 0;
    const startY = this.terrain.getHeight(startX, startZ);
    this.position.set(startX, startY + 0.65, startZ);
    this.root.position.copy(this.position);
    this.updateOrientation(0.016);
  }

  // Construct detailed LUNA-01 Rover with rocker-bogie suspension & solar array wings
  buildRoverGeometry() {
    // 1. Central Avionics Bay (Gold Multi-Layer Insulation / MLI Foil)
    const bodyGeo = new THREE.BoxGeometry(1.4, 0.65, 2.2);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37, // Lunar gold MLI foil
      roughness: 0.35,
      metalness: 0.85
    });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.set(0, 0.65, 0);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    this.chassis.add(bodyMesh);

    // Radiator panels on top of body (silver thermal louvers)
    const radiatorGeo = new THREE.BoxGeometry(1.1, 0.05, 0.8);
    const radiatorMat = new THREE.MeshStandardMaterial({
      color: 0xd0d0d8,
      metalness: 0.95,
      roughness: 0.15
    });
    const radiator = new THREE.Mesh(radiatorGeo, radiatorMat);
    radiator.position.set(0, 0.65 + 0.33, 0.4);
    radiator.castShadow = true;
    this.chassis.add(radiator);

    // Front equipment bay & bumper
    const bumperGeo = new THREE.BoxGeometry(1.3, 0.2, 0.3);
    const bumperMat = new THREE.MeshStandardMaterial({ color: 0x242830, metalness: 0.8 });
    const bumper = new THREE.Mesh(bumperGeo, bumperMat);
    bumper.position.set(0, 0.55, -1.2);
    bumper.castShadow = true;
    this.chassis.add(bumper);

    // 2. Cockpit Dashboard Frame (visible in lower foreground of mast view)
    this.cockpitDashboard = new THREE.Group();
    this.cockpitDashboard.position.set(0, 1.45, -0.68);

    const dashBarGeo = new THREE.BoxGeometry(0.9, 0.06, 0.12);
    const dashMat = new THREE.MeshStandardMaterial({ color: 0x181e28, metalness: 0.85, roughness: 0.4 });
    const dashBar = new THREE.Mesh(dashBarGeo, dashMat);
    dashBar.castShadow = true;
    this.cockpitDashboard.add(dashBar);

    // Roll bars & telemetry status lights on the mast deck
    const barLeftGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.5);
    barLeftGeo.rotateZ(0.2);
    const barLeft = new THREE.Mesh(barLeftGeo, dashMat);
    barLeft.position.set(-0.4, -0.15, 0);
    this.cockpitDashboard.add(barLeft);

    const barRightGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.5);
    barRightGeo.rotateZ(-0.2);
    const barRight = new THREE.Mesh(barRightGeo, dashMat);
    barRight.position.set(0.4, -0.15, 0);
    this.cockpitDashboard.add(barRight);

    // Small status indicator LED on dash
    const ledGeo = new THREE.SphereGeometry(0.02, 8, 8);
    const ledMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    const ledMesh = new THREE.Mesh(ledGeo, ledMat);
    ledMesh.position.set(0.35, 0.04, -0.06);
    this.cockpitDashboard.add(ledMesh);

    this.chassis.add(this.cockpitDashboard);

    // 3. Front Solar Array Wings (foreground view from mast cockpit)
    const solarWingGeo = new THREE.BoxGeometry(0.9, 0.04, 1.15);
    
    // Photovoltaic cell grid canvas texture
    const solarCanvas = document.createElement('canvas');
    solarCanvas.width = 256;
    solarCanvas.height = 256;
    const sctx = solarCanvas.getContext('2d');
    sctx.fillStyle = '#0a162b'; // Deep navy blue silicon cells
    sctx.fillRect(0, 0, 256, 256);
    sctx.strokeStyle = '#3878b8';
    sctx.lineWidth = 2;
    for (let i = 0; i <= 256; i += 32) {
      sctx.beginPath();
      sctx.moveTo(i, 0);
      sctx.lineTo(i, 256);
      sctx.stroke();
      sctx.beginPath();
      sctx.moveTo(0, i);
      sctx.lineTo(256, i);
      sctx.stroke();
    }
    const solarTex = new THREE.CanvasTexture(solarCanvas);
    solarTex.wrapS = THREE.RepeatWrapping;
    solarTex.wrapT = THREE.RepeatWrapping;
    solarTex.repeat.set(4, 5);

    const solarWingMat = new THREE.MeshStandardMaterial({
      color: 0x183050,
      map: solarTex,
      metalness: 0.75,
      roughness: 0.25
    });

    // Left Solar Wing (positioned forward so it is visible in the lower foreground)
    const leftWing = new THREE.Mesh(solarWingGeo, solarWingMat);
    leftWing.position.set(-1.05, 0.92, -0.95);
    leftWing.rotation.set(0.24, 0.12, -0.15);
    leftWing.castShadow = true;
    leftWing.receiveShadow = true;
    this.chassis.add(leftWing);
    this.solarPanels.push(leftWing);

    // Right Solar Wing
    const rightWing = new THREE.Mesh(solarWingGeo, solarWingMat);
    rightWing.position.set(1.05, 0.92, -0.95);
    rightWing.rotation.set(0.24, -0.12, 0.15);
    rightWing.castShadow = true;
    rightWing.receiveShadow = true;
    this.chassis.add(rightWing);
    this.solarPanels.push(rightWing);

    // Wing Titanium Support Struts
    const strutMat = new THREE.MeshStandardMaterial({ color: 0x444850, metalness: 0.9, roughness: 0.4 });
    const strutGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.85);
    strutGeo.rotateZ(Math.PI / 4);

    const leftStrut = new THREE.Mesh(strutGeo, strutMat);
    leftStrut.position.set(-0.75, 0.72, -0.95);
    this.chassis.add(leftStrut);

    const rightStrut = new THREE.Mesh(strutGeo, strutMat);
    rightStrut.position.set(0.75, 0.72, -0.95);
    rightStrut.rotation.y = Math.PI;
    this.chassis.add(rightStrut);

    // 4. Rocker-Bogie Wheel Suspension Frame & Compliant Mesh Wheels
    const suspensionMat = new THREE.MeshStandardMaterial({
      color: 0x22262d,
      metalness: 0.85,
      roughness: 0.45
    });

    const wheelRadius = 0.32;
    const wheelWidth = 0.25;
    const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 24);
    wheelGeo.rotateZ(Math.PI / 2);

    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x7a808a, // Titanium wire mesh
      metalness: 0.92,
      roughness: 0.38
    });

    const wheelHubMat = new THREE.MeshStandardMaterial({ color: 0x1a2028, metalness: 0.9, roughness: 0.3 });
    const hubGeo = new THREE.CylinderGeometry(0.12, 0.12, wheelWidth + 0.02, 16);
    hubGeo.rotateZ(Math.PI / 2);

    // 6 Wheels: Front wheels positioned forward at z = -1.25 so they churn dust in front view!
    const wheelPositions = [
      { x: -1.15, y: 0.32, z: -1.25, isSteered: true, isFront: true }, // Front-Left (visible in cockpit)
      { x: 1.15, y: 0.32, z: -1.25, isSteered: true, isFront: true },  // Front-Right (visible in cockpit)
      { x: -1.20, y: 0.32, z: 0.0, isSteered: false, isFront: false }, // Mid-Left
      { x: 1.20, y: 0.32, z: 0.0, isSteered: false, isFront: false },  // Mid-Right
      { x: -1.10, y: 0.32, z: 1.15, isSteered: true, isFront: false },  // Rear-Left
      { x: 1.10, y: 0.32, z: 1.15, isSteered: true, isFront: false }   // Rear-Right
    ];

    wheelPositions.forEach((wp) => {
      const wheelGroup = new THREE.Group();
      const rim = new THREE.Mesh(wheelGeo, wheelMat);
      rim.castShadow = true;
      rim.receiveShadow = true;

      const hub = new THREE.Mesh(hubGeo, wheelHubMat);
      wheelGroup.add(rim);
      wheelGroup.add(hub);

      if (wp.isSteered) {
        const steeringPivot = new THREE.Group();
        steeringPivot.position.set(wp.x, wp.y, wp.z);
        wheelGroup.position.set(0, 0, 0);
        steeringPivot.add(wheelGroup);
        this.chassis.add(steeringPivot);
        this.steeredWheelGroups.push({ group: steeringPivot, isFront: wp.isFront });
      } else {
        wheelGroup.position.set(wp.x, wp.y, wp.z);
        this.chassis.add(wheelGroup);
      }

      this.wheels.push({ mesh: wheelGroup, xRel: wp.x, zRel: wp.z });

      // Suspension arm connecting wheel to chassis
      const armGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.7);
      armGeo.rotateZ((Math.PI / 3) * (wp.x < 0 ? 1 : -1));
      const armMesh = new THREE.Mesh(armGeo, suspensionMat);
      armMesh.position.set(wp.x * 0.65, 0.52, wp.z * 0.85);
      armMesh.castShadow = true;
      this.chassis.add(armMesh);
    });

    // Rocker differential bar across top of chassis
    const rockerBarGeo = new THREE.BoxGeometry(1.6, 0.08, 0.1);
    const rockerBar = new THREE.Mesh(rockerBarGeo, suspensionMat);
    rockerBar.position.set(0, 0.98, 0.0);
    this.chassis.add(rockerBar);

    // 5. Front Camera Mast Rig
    // Mast post positioned at (0, 0, -0.5) reaching y: 1.8m
    const mastPoleGeo = new THREE.CylinderGeometry(0.045, 0.055, 1.25, 16);
    const mastPoleMat = new THREE.MeshStandardMaterial({ color: 0x333842, metalness: 0.85, roughness: 0.3 });
    const mastPole = new THREE.Mesh(mastPoleGeo, mastPoleMat);
    mastPole.position.set(0, 1.25, -0.5);
    mastPole.castShadow = true;
    this.chassis.add(mastPole);

    const braceGeo = new THREE.BoxGeometry(0.3, 0.04, 0.06);
    const brace = new THREE.Mesh(braceGeo, mastPoleMat);
    brace.position.set(0, 1.5, -0.5);
    this.chassis.add(brace);

    // Masthead Sensor Bar at y: 1.8m, z: -0.5m
    this.mastHead = new THREE.Group();
    this.mastHead.position.set(0, 1.8, -0.5);

    // Stereo navigation cameras
    const navCamHousingGeo = new THREE.BoxGeometry(0.48, 0.14, 0.18);
    const navCamHousing = new THREE.Mesh(navCamHousingGeo, mastPoleMat);
    this.mastHead.add(navCamHousing);

    const lensGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.08, 16);
    lensGeo.rotateX(Math.PI / 2);
    const lensMat = new THREE.MeshStandardMaterial({ color: 0x050c18, metalness: 0.95, roughness: 0.05 });

    const leftLens = new THREE.Mesh(lensGeo, lensMat);
    leftLens.position.set(-0.16, 0, -0.1);
    this.mastHead.add(leftLens);

    const rightLens = new THREE.Mesh(lensGeo, lensMat);
    rightLens.position.set(0.16, 0, -0.1);
    this.mastHead.add(rightLens);

    // LIDAR Rangefinder unit on top of mast
    const lidarGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.12, 16);
    const lidarMat = new THREE.MeshStandardMaterial({ color: 0x222a36, metalness: 0.9, roughness: 0.2 });
    const lidarMesh = new THREE.Mesh(lidarGeo, lidarMat);
    lidarMesh.position.set(0, 0.12, 0);
    this.mastHead.add(lidarMesh);

    // High Gain Antenna Dish (pointing towards Earth)
    const dishGeo = new THREE.SphereGeometry(0.24, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.4);
    dishGeo.rotateX(-Math.PI / 4);
    const dishMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.8, roughness: 0.3 });
    const dishMesh = new THREE.Mesh(dishGeo, dishMat);
    dishMesh.position.set(0.3, 0.2, 0.1);
    this.mastHead.add(dishMesh);

    this.chassis.add(this.mastHead);

    // 6. Rear Regolith & Ice Drill / Neutron Spectrometer sensor unit
    const drillTowerGeo = new THREE.BoxGeometry(0.25, 1.1, 0.25);
    const drillMat = new THREE.MeshStandardMaterial({ color: 0x404855, metalness: 0.8, roughness: 0.4 });
    const drillTower = new THREE.Mesh(drillTowerGeo, drillMat);
    drillTower.position.set(0, 0.9, 0.95);
    drillTower.castShadow = true;
    this.chassis.add(drillTower);

    const drillBitGeo = new THREE.CylinderGeometry(0.04, 0.02, 0.8, 12);
    this.drillMesh = new THREE.Mesh(drillBitGeo, new THREE.MeshStandardMaterial({ color: 0x889098, metalness: 0.95 }));
    this.drillMesh.position.set(0, 0.45, 0.95);
    this.chassis.add(this.drillMesh);
  }

  // Setup camera anchor at front mast (y: 1.8m, z: -0.5m)
  setupCockpitRig() {
    this.cockpitAnchor = new THREE.Group();
    // Anchor positioned at exact mast specification
    this.cockpitAnchor.position.set(0, 1.8, -0.5);
    this.chassis.add(this.cockpitAnchor);
  }

  // Dual high-intensity LED headlights for driving into dark PSRs
  setupHeadlights() {
    const lightPositions = [
      { x: -0.32, y: 1.62, z: -0.58 },
      { x: 0.32, y: 1.62, z: -0.58 }
    ];

    lightPositions.forEach(lp => {
      const spot = new THREE.SpotLight(0xffffff, 8.5, 160, Math.PI / 5, 0.3, 1.2);
      spot.position.set(lp.x, lp.y, lp.z);
      spot.castShadow = true;
      spot.shadow.mapSize.width = 1024;
      spot.shadow.mapSize.height = 1024;
      spot.shadow.bias = -0.0005;

      const target = new THREE.Object3D();
      target.position.set(lp.x, 0, lp.z - 25);
      this.chassis.add(target);
      spot.target = target;

      this.chassis.add(spot);
      this.headlightSpots.push(spot);

      const housingGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.1, 16);
      housingGeo.rotateX(Math.PI / 2);
      const housingMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const housing = new THREE.Mesh(housingGeo, housingMat);
      housing.position.set(lp.x, lp.y, lp.z);
      this.chassis.add(housing);
    });
  }

  setupDustSystem() {
    const dustGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(this.maxDust * 3);

    for (let i = 0; i < this.maxDust; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = -1000;
      positions[i * 3 + 2] = 0;

      this.dustParticles.push({
        position: new THREE.Vector3(0, -1000, 0),
        velocity: new THREE.Vector3(0, 0, 0),
        life: 0,
        maxLife: 1.5,
        active: false
      });
    }

    dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const dustCanvas = document.createElement('canvas');
    dustCanvas.width = 64;
    dustCanvas.height = 64;
    const dctx = dustCanvas.getContext('2d');
    const grad = dctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(180, 190, 205, 0.8)');
    grad.addColorStop(0.5, 'rgba(140, 150, 165, 0.35)');
    grad.addColorStop(1, 'rgba(100, 110, 120, 0.0)');
    dctx.fillStyle = grad;
    dctx.fillRect(0, 0, 64, 64);

    const dustTex = new THREE.CanvasTexture(dustCanvas);

    const dustMat = new THREE.PointsMaterial({
      size: 0.38,
      map: dustTex,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.NormalBlending
    });

    this.dustSystem = new THREE.Points(dustGeo, dustMat);
    this.scene.add(this.dustSystem);
  }

  emitWheelDust() {
    if (Math.abs(this.speed) < 0.2) return;

    const wheelsToEmit = [this.wheels[0], this.wheels[1], this.wheels[4], this.wheels[5]];
    const speedRatio = Math.abs(this.speed) / this.maxSpeedMs;

    wheelsToEmit.forEach(w => {
      if (Math.random() > 0.45) return;

      const p = this.dustParticles.find(dp => !dp.active);
      if (!p) return;

      const wheelWorld = new THREE.Vector3(w.xRel, 0.05, w.zRel);
      wheelWorld.applyQuaternion(this.root.quaternion);
      wheelWorld.add(this.position);

      p.position.copy(wheelWorld);
      p.life = 0;
      p.maxLife = 1.0 + Math.random() * 0.8;
      p.active = true;

      const backwardDir = new THREE.Vector3(0, 0, this.speed > 0 ? 1 : -1)
        .applyQuaternion(this.root.quaternion);

      const spreadX = (Math.random() - 0.5) * 0.3;
      const spreadZ = (Math.random() - 0.5) * 0.3;

      p.velocity.set(
        backwardDir.x * (0.3 + speedRatio * 0.6) + spreadX,
        0.035 + speedRatio * 0.05 + Math.random() * 0.02,
        backwardDir.z * (0.3 + speedRatio * 0.6) + spreadZ
      );
    });
  }

  updateDustParticles(delta) {
    if (!this.dustSystem) return;

    const positions = this.dustSystem.geometry.attributes.position.array;

    for (let i = 0; i < this.maxDust; i++) {
      const p = this.dustParticles[i];
      if (p.active) {
        p.life += delta;
        if (p.life >= p.maxLife) {
          p.active = false;
          positions[i * 3 + 1] = -1000;
          continue;
        }

        // Low-gravity vacuum physics: velocity.y -= 0.001 per frame
        p.velocity.y -= 0.001 * (delta / 0.016);
        p.position.addScaledVector(p.velocity, delta * 30);

        positions[i * 3] = p.position.x;
        positions[i * 3 + 1] = p.position.y;
        positions[i * 3 + 2] = p.position.z;
      } else {
        positions[i * 3 + 1] = -1000;
      }
    }

    this.dustSystem.geometry.attributes.position.needsUpdate = true;
  }

  // Trigger Regolith Drill & Neutron Spectrometer Assay
  triggerDrillScan() {
    if (this.isDrilling) return;
    this.isDrilling = true;
    this.drillProgress = 0;
    this.speed = 0; // stop rover while drilling

    audioManager.playQuindar(1650, 0.15);

    // Drill descends and ascends over 3 seconds
    const startTime = performance.now();
    const duration = 3000;

    const updateDrill = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / duration, 1.0);
      this.drillProgress = t;

      // Parabolic motion down and up
      const depth = Math.sin(t * Math.PI) * 0.35;
      if (this.drillMesh) {
        this.drillMesh.position.y = 0.45 - depth;
      }

      if (t < 1.0) {
        requestAnimationFrame(updateDrill);
      } else {
        this.isDrilling = false;
        if (this.drillMesh) this.drillMesh.position.y = 0.45;

        // Compute sample results
        const iceConc = this.terrain.getIceConcentration(this.position.x, this.position.z);
        const weh = (iceConc * 5.6).toFixed(2);
        this.lastScienceResult = {
          iceConc,
          wehPercent: weh,
          timestamp: new Date().toLocaleTimeString()
        };
        audioManager.playQuindar(2400, 0.2);
      }
    };

    requestAnimationFrame(updateDrill);
  }

  // Set speed preset: 1 = Slow (3 km/h), 2 = Cruise (7 km/h), 3 = Max (12 km/h)
  setSpeedPreset(preset) {
    this.speedPreset = preset;
    const presets = [3.0, 7.0, 12.0];
    this.maxSpeedKmh = presets[preset - 1] || 12.0;
    this.maxSpeedMs = this.maxSpeedKmh / 3.6;
    audioManager.playQuindar(1900, 0.05);
  }

  // Auto-align solar wings toward polar 4° sun
  reacquireSun() {
    // 4° Sun vector roughly Azimuth 135° (South-East)
    const targetSunHeading = THREE.MathUtils.degToRad(135.0);
    this.heading = targetSunHeading;
    audioManager.playQuindar(2100, 0.08);
  }

  // Update rover kinematics, physics, suspension, power and thermal simulation
  update(delta, input) {
    // Check if auto-nav is engaged
    if (this.isAutoNav && this.autoNavTarget) {
      this.updateAutoNav(delta, input);
    }

    if (this.isDrilling) {
      this.speed = 0;
      return;
    }

    // 1. Process steering input
    const steerInput = input.steer;
    const targetSteerAngle = -steerInput * 0.45;
    this.steeringAngle = THREE.MathUtils.lerp(this.steeringAngle, targetSteerAngle, delta * 6.0);

    this.steeredWheelGroups.forEach(sw => {
      sw.group.rotation.y = sw.isFront ? this.steeringAngle : -this.steeringAngle * 0.5;
    });

    // 2. Throttle & Braking
    const throttle = input.throttle;
    this.isBraking = input.brake;

    if (this.isBraking) {
      if (this.speed > 0) {
        this.speed = Math.max(0, this.speed - this.brakeDecel * delta);
      } else if (this.speed < 0) {
        this.speed = Math.min(0, this.speed + this.brakeDecel * delta);
      }
    } else if (throttle !== 0) {
      this.speed += throttle * this.acceleration * delta;
      const maxForward = this.maxSpeedMs;
      const maxReverse = -this.maxSpeedMs * 0.45;
      this.speed = THREE.MathUtils.clamp(this.speed, maxReverse, maxForward);
    } else {
      if (this.speed > 0) {
        this.speed = Math.max(0, this.speed - this.naturalDecel * delta);
      } else if (this.speed < 0) {
        this.speed = Math.min(0, this.speed + this.naturalDecel * delta);
      }
    }

    // 3. Turn heading based on speed and steering angle
    if (Math.abs(this.speed) > 0.05) {
      const turnFactor = this.steeringAngle * (this.speed / this.maxSpeedMs);
      this.heading += turnFactor * this.turnSpeed * delta * 2.5;
    }

    // 4. Update Position (Rover forward direction is -Z in local space)
    const moveDist = this.speed * delta;
    this.position.x -= Math.sin(this.heading) * moveDist;
    this.position.z -= Math.cos(this.heading) * moveDist;

    const groundY = this.terrain.getHeight(this.position.x, this.position.z);
    this.position.y = groundY + 0.65;
    this.root.position.copy(this.position);

    // 5. Update Wheel Rotation
    if (Math.abs(moveDist) > 0.0001) {
      const rotDelta = moveDist / 0.32;
      this.wheelRotation -= rotDelta;
      this.wheels.forEach(w => {
        w.mesh.rotation.x = this.wheelRotation;
      });
      this.emitWheelDust();
    }

    // 6. Terrain Normal & Pitch/Roll Orientation
    this.updateOrientation(delta);

    // 7. Update Dust Particle System
    this.updateDustParticles(delta);

    // 8. Power & Thermal simulation
    this.updatePowerAndThermal(delta);

    // 9. Audio Motor & Spectrometer Sound
    const speedKmh = this.getSpeedKmh();
    audioManager.updateRoverSound(speedKmh, Math.abs(throttle) > 0.1);

    const iceConc = this.terrain.getIceConcentration(this.position.x, this.position.z);
    if (iceConc > 0.05) {
      audioManager.triggerSpectrometerTick(iceConc);
    }
  }

  // Autonomous Waypoint Navigation Controller
  updateAutoNav(delta, input) {
    const wp = this.autoNavTarget;
    if (!wp) return;

    const dist = Math.hypot(wp.x - this.position.x, wp.z - this.position.z);
    if (dist < 18.0) {
      // Waypoint reached!
      this.isAutoNav = false;
      input.throttle = 0;
      input.brake = true;
      this.triggerDrillScan();
      return;
    }

    // Compute desired heading towards waypoint
    const targetWorldAngle = Math.atan2(wp.x - this.position.x, wp.z - this.position.z);
    const roverAngle = Math.atan2(-Math.sin(this.heading), -Math.cos(this.heading));
    let angleDiff = targetWorldAngle - roverAngle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    // Apply auto steering & cruise throttle
    input.steer = THREE.MathUtils.clamp(-angleDiff * 1.8, -1.0, 1.0);
    input.throttle = Math.abs(angleDiff) > 0.8 ? 0.35 : 0.85;
    input.brake = false;
  }

  // Smoothly orient chassis to match terrain slope (pitch & roll)
  updateOrientation(delta) {
    const normal = this.terrain.getNormal(this.position.x, this.position.z);
    const up = normal;
    const forward = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
    
    forward.projectOnPlane(up).normalize();
    const right = new THREE.Vector3().crossVectors(forward, up).normalize();

    const rotMatrix = new THREE.Matrix4().makeBasis(right, up, forward.clone().negate());
    const targetQuat = new THREE.Quaternion().setFromRotationMatrix(rotMatrix);

    this.root.quaternion.slerp(targetQuat, Math.min(delta * 8.0, 1.0));
  }

  // Real-time telemetry calculations
  updatePowerAndThermal(delta) {
    const inPSR = this.terrain.isPositionInPSR(this.position.x, this.position.z);

    if (inPSR) {
      this.solarPowerWatts = 0;
    } else {
      const sunDir = new THREE.Vector3(0.707, 0.07, 0.707).normalize();
      const roverForward = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
      const solarAlignment = Math.max(0.2, (roverForward.dot(sunDir) + 1.0) * 0.5);
      this.solarPowerWatts = 550 + solarAlignment * 330;
    }

    let driveWatts = (Math.abs(this.speed) / this.maxSpeedMs) * 460;
    let lightWatts = 0;
    if (this.headlightsActive) {
      lightWatts = this.headlightLevel === 2 ? 240 : 120;
    }
    this.rcsPowerWatts = 140 + driveWatts + lightWatts;

    const netPowerWatts = this.solarPowerWatts - this.rcsPowerWatts;
    const capacityWattsSec = 2400 * 3600;
    const batteryPctDelta = (netPowerWatts * delta / capacityWattsSec) * 100 * 12;
    this.batteryJoules = THREE.MathUtils.clamp(this.batteryJoules + batteryPctDelta, 5.0, 100.0);

    if (inPSR) {
      this.thermalMarginC = Math.max(-65.0, this.thermalMarginC - 1.8 * delta);
    } else {
      this.thermalMarginC = Math.min(32.0, this.thermalMarginC + 1.2 * delta);
    }
  }

  toggleHeadlights() {
    this.headlightLevel = (this.headlightLevel + 1) % 3;
    this.headlightsActive = this.headlightLevel > 0;

    const intensities = [0, 4.0, 8.5];
    const targetIntensity = intensities[this.headlightLevel];

    this.headlightSpots.forEach(s => {
      s.visible = this.headlightsActive;
      s.intensity = targetIntensity;
    });

    audioManager.playQuindar(1850, 0.08);
    return this.headlightLevel;
  }

  getSpeedKmh() {
    return this.speed * 3.6;
  }

  getAttitude() {
    const euler = new THREE.Euler().setFromQuaternion(this.root.quaternion, 'YXZ');
    return {
      pitch: THREE.MathUtils.radToDeg(euler.x),
      roll: THREE.MathUtils.radToDeg(euler.z)
    };
  }
}
