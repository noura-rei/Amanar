// LUNA-01: Lunar South Pole Rover Exploration - Core WebGL/WebXR Engine
// Incorporates Three.js, WebXR local-floor VRButton, polar low-sun lighting (4° elevation),
// hard vacuum shadows, mast cockpit camera rig (y: 1.8m, z: -0.5m), and NASA Mission Control Bar.

import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { audioManager } from './audio.js';
import { LunarTerrain } from './terrain.js';
import { LunaRover } from './rover.js';
import { LunaHUD } from './hud.js';
import { NasaAssetManager } from './nasaLoader.js';
import { CesiumMoonViewer } from './cesiumMoon.js';

class LunaSimulation {
  constructor() {
    this.container = document.getElementById('simulation-container');
    this.clock = new THREE.Clock();

    // Three.js Core
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.cameraDolly = null;
    this.orbitControls = null;

    // Subsystems
    this.terrain = null;
    this.rover = null;
    this.hud = null;
    this.nasaManager = null;
    this.cesiumViewer = null;

    // Sun & Celestial objects
    this.sunLight = null;
    this.earthMesh = null;

    // Camera view modes: 0=Cockpit Mast Cam (y: 1.8, z: -0.5), 1=Chase Cam, 2=Wheel Cam, 3=Orbit Cam
    this.cameraMode = 0;
    this.cameraOffsetChase = new THREE.Vector3(0, 2.8, 5.2);
    this.cameraOffsetWheel = new THREE.Vector3(-1.8, 0.8, -0.6);

    // Desktop Cockpit Mouse Look
    this.mouseLook = {
      yaw: 0,
      pitch: 0,
      isDragging: false,
      lastMouseX: 0,
      lastMouseY: 0
    };

    // Input state
    this.input = {
      throttle: 0,
      steer: 0,
      brake: false
    };

    // UI D-Pad hold states
    this.uiDriveState = {
      fwd: false,
      rev: false,
      left: false,
      right: false,
      brake: false
    };

    this.keys = {};
    this.controllers = [];

    this.init();
  }

  init() {
    this.initRenderer();
    this.initScene();
    this.initCamera();
    this.initLighting();
    this.initDeepSpace();

    // World Entities
    this.terrain = new LunarTerrain(this.scene);
    this.rover = new LunaRover(this.scene, this.terrain);
    this.hud = new LunaHUD(this.camera, this.rover, this.terrain);

    // Set auto-nav default waypoint
    this.rover.autoNavTarget = this.hud.getCurrentWaypoint();

    // NASA 3D Asset & Cesium Geospatial Manager
    this.nasaManager = new NasaAssetManager(this.scene, (msg) => this.showToast(msg));
    this.cesiumViewer = new CesiumMoonViewer(this.rover);

    // Setup WebXR & Controllers
    this.setupWebXR();

    // Setup User Inputs & UI listeners
    this.setupEventListeners();

    // Start Animation Loop with WebXR compatibility
    this.renderer.setAnimationLoop((time, frame) => this.render(time, frame));

    this.showToast('LUNA-01 Systems Ready. Foreground Solar Wings & Mast Cam Active.');
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    // Hard vacuum shadows specification
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;

    this.container.appendChild(this.renderer.domElement);
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000206);
    this.scene.fog = null;
  }

  initCamera() {
    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      8000
    );

    // Camera Dolly group in world space (moves with rover)
    this.cameraDolly = new THREE.Group();
    this.scene.add(this.cameraDolly);
    this.cameraDolly.add(this.camera);

    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.05;
    this.orbitControls.enabled = false;
  }

  initLighting() {
    const sunElevationDeg = 4.0;
    const sunAzimuthDeg = 135.0;
    const radElev = THREE.MathUtils.degToRad(sunElevationDeg);
    const radAzim = THREE.MathUtils.degToRad(sunAzimuthDeg);
    const sunDist = 800;

    const sunX = sunDist * Math.cos(radElev) * Math.sin(radAzim);
    const sunY = sunDist * Math.sin(radElev);
    const sunZ = sunDist * Math.cos(radElev) * Math.cos(radAzim);

    this.sunLight = new THREE.DirectionalLight(0xfffbf0, 3.5);
    this.sunLight.position.set(sunX, sunY, sunZ);
    this.sunLight.castShadow = true;

    this.sunLight.shadow.mapSize.width = 4096;
    this.sunLight.shadow.mapSize.height = 4096;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 1600;

    const shadowBoxSize = 350;
    this.sunLight.shadow.camera.left = -shadowBoxSize;
    this.sunLight.shadow.camera.right = shadowBoxSize;
    this.sunLight.shadow.camera.top = shadowBoxSize;
    this.sunLight.shadow.camera.bottom = -shadowBoxSize;
    this.sunLight.shadow.bias = -0.0004;

    this.scene.add(this.sunLight);

    const earthshine = new THREE.DirectionalLight(0x406085, 0.12);
    earthshine.position.set(-200, 150, 400);
    this.scene.add(earthshine);

    const starlight = new THREE.AmbientLight(0x0a1018, 0.06);
    this.scene.add(starlight);
  }

  initDeepSpace() {
    const starCount = 3500;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 4000;

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = Math.abs(r * Math.cos(phi)) + 50;
      const z = r * Math.sin(phi) * Math.sin(theta);

      starPos[i * 3] = x;
      starPos[i * 3 + 1] = y;
      starPos[i * 3 + 2] = z;

      const colType = Math.random();
      if (colType > 0.8) {
        starColors[i * 3] = 0.8; starColors[i * 3 + 1] = 0.9; starColors[i * 3 + 2] = 1.0;
      } else if (colType > 0.6) {
        starColors[i * 3] = 1.0; starColors[i * 3 + 1] = 0.85; starColors[i * 3 + 2] = 0.7;
      } else {
        starColors[i * 3] = 0.95; starColors[i * 3 + 1] = 0.95; starColors[i * 3 + 2] = 0.95;
      }
    }

    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

    const starMat = new THREE.PointsMaterial({
      size: 3.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      sizeAttenuation: false
    });

    const stars = new THREE.Points(starGeo, starMat);
    this.scene.add(stars);

    // Earth hanging low on horizon
    const earthGeo = new THREE.SphereGeometry(45, 32, 32);
    const eCanvas = document.createElement('canvas');
    eCanvas.width = 512;
    eCanvas.height = 256;
    const ectx = eCanvas.getContext('2d');
    ectx.fillStyle = '#081a3a';
    ectx.fillRect(0, 0, 512, 256);
    ectx.fillStyle = '#2d5a3f';
    for (let c = 0; c < 24; c++) {
      ectx.beginPath();
      ectx.arc(Math.random() * 512, Math.random() * 256, 25 + Math.random() * 35, 0, Math.PI * 2);
      ectx.fill();
    }
    ectx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    for (let cl = 0; cl < 35; cl++) {
      ectx.beginPath();
      ectx.ellipse(Math.random() * 512, Math.random() * 256, 60 + Math.random() * 80, 12, Math.random() * Math.PI, 0, Math.PI * 2);
      ectx.fill();
    }
    const earthTex = new THREE.CanvasTexture(eCanvas);

    const earthMat = new THREE.MeshStandardMaterial({
      map: earthTex,
      roughness: 0.6,
      metalness: 0.1,
      emissive: 0x051228,
      emissiveIntensity: 0.3
    });

    this.earthMesh = new THREE.Mesh(earthGeo, earthMat);
    this.earthMesh.position.set(-600, 180, 2200);
    this.scene.add(this.earthMesh);

    // Sun Disc
    const sunDiscGeo = new THREE.CircleGeometry(28, 32);
    const sunDiscMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const sunDisc = new THREE.Mesh(sunDiscGeo, sunDiscMat);
    sunDisc.position.copy(this.sunLight.position);
    sunDisc.lookAt(0, 0, 0);
    this.scene.add(sunDisc);
  }

  setupWebXR() {
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType('local-floor');

    const vrButton = VRButton.createButton(this.renderer);
    const vrSlot = document.getElementById('vr-button-slot');
    if (vrSlot) {
      vrSlot.appendChild(vrButton);
    } else {
      document.body.appendChild(vrButton);
    }

    for (let i = 0; i < 2; i++) {
      const controller = this.renderer.xr.getController(i);
      controller.addEventListener('selectstart', () => this.onVRSelectStart(i));
      controller.addEventListener('selectend', () => this.onVRSelectEnd(i));
      this.cameraDolly.add(controller);

      const rayGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1.5)
      ]);
      const rayMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.5 });
      const ray = new THREE.Line(rayGeo, rayMat);
      controller.add(ray);

      this.controllers.push(controller);
    }

    this.renderer.xr.addEventListener('sessionstart', () => {
      this.setCameraMode(0);
      audioManager.init();
      audioManager.resume();
      this.showToast('WebXR VR Session Started. Cockpit Rig Active.');
    });
  }

  onVRSelectStart(controllerIdx) {
    if (controllerIdx === 0) {
      this.input.throttle = 1.0;
    } else {
      this.rover.toggleHeadlights();
    }
  }

  onVRSelectEnd(controllerIdx) {
    if (controllerIdx === 0) {
      this.input.throttle = 0.0;
    }
  }

  setCameraMode(mode) {
    this.cameraMode = mode;
    const modeNames = ['Mast Cockpit View (y: 1.8m, z: -0.5m)', 'Tactical Chase Cam (3rd Person)', 'Rocker-Bogie Wheel Cam', 'Free Orbit Cam'];
    
    document.querySelectorAll('.cam-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.getAttribute('data-mode')) === mode);
    });

    if (mode === 3) {
      this.orbitControls.enabled = true;
      this.orbitControls.target.copy(this.rover.position);
    } else {
      this.orbitControls.enabled = false;
      this.camera.position.set(0, 0, 0);
      this.camera.rotation.set(0, 0, 0);
    }

    this.mouseLook.yaw = 0;
    this.mouseLook.pitch = 0;

    this.showToast(`Camera: ${modeNames[mode]}`);
  }

  cycleCameraMode() {
    const nextMode = (this.cameraMode + 1) % 4;
    this.setCameraMode(nextMode);
  }

  setupEventListeners() {
    // Window Resize
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Ensure keyboard focus on page click
    window.addEventListener('click', () => {
      window.focus();
    });

    // Keyboard controls
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      audioManager.init();
      audioManager.resume();

      if (e.code === 'KeyH') {
        const lvl = this.rover.toggleHeadlights();
        const names = ['OFF', 'LOW BEAM', 'HIGH BEAM'];
        this.showToast(`Headlights: ${names[lvl]}`);
      } else if (e.code === 'KeyC') {
        this.cycleCameraMode();
      } else if (e.code === 'KeyM') {
        this.toggleCesiumMode();
      } else if (e.code === 'Tab') {
        e.preventDefault();
        const wp = this.hud.cycleWaypoint();
        this.rover.autoNavTarget = wp;
        this.showToast(`Nav Target Selected: ${wp.name}`);
        audioManager.playQuindar(2200, 0.08);
      } else if (e.code === 'KeyR') {
        this.resetRoverPosition();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    window.addEventListener('pointerdown', () => {
      audioManager.init();
      audioManager.resume();
      window.focus();
    }, { once: true });

    // Desktop Cockpit Mouse Look Dragging
    const dom = this.renderer.domElement;
    dom.addEventListener('mousedown', (e) => {
      if (this.cameraMode === 0) {
        this.mouseLook.isDragging = true;
        this.mouseLook.lastMouseX = e.clientX;
        this.mouseLook.lastMouseY = e.clientY;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.cameraMode === 0 && this.mouseLook.isDragging) {
        const deltaX = e.clientX - this.mouseLook.lastMouseX;
        const deltaY = e.clientY - this.mouseLook.lastMouseY;
        this.mouseLook.lastMouseX = e.clientX;
        this.mouseLook.lastMouseY = e.clientY;

        this.mouseLook.yaw -= deltaX * 0.003;
        this.mouseLook.pitch -= deltaY * 0.003;
        this.mouseLook.pitch = THREE.MathUtils.clamp(this.mouseLook.pitch, -Math.PI / 3, Math.PI / 4);
      }
    });

    window.addEventListener('mouseup', () => {
      this.mouseLook.isDragging = false;
    });

    dom.addEventListener('dblclick', () => {
      if (this.cameraMode === 0) {
        this.mouseLook.yaw = 0;
        this.mouseLook.pitch = 0;
      }
    });

    // Top action buttons
    const btnAudio = document.getElementById('btn-audio');
    if (btnAudio) {
      btnAudio.addEventListener('click', () => {
        audioManager.init();
        audioManager.resume();
        const muted = audioManager.toggleMute();
        btnAudio.textContent = muted ? 'AUDIO: OFF' : 'AUDIO: ON';
        btnAudio.classList.toggle('active', !muted);
      });
    }

    const btnHeadlightsTop = document.getElementById('btn-headlights-top');
    if (btnHeadlightsTop) {
      btnHeadlightsTop.addEventListener('click', () => {
        const lvl = this.rover.toggleHeadlights();
        const labels = ['LIGHTS: OFF', 'LIGHTS: LOW', 'LIGHTS: HIGH'];
        btnHeadlightsTop.textContent = labels[lvl];
        btnHeadlightsTop.classList.toggle('active', lvl > 0);
      });
    }

    const btnCesium = document.getElementById('btn-cesium-toggle');
    if (btnCesium) {
      btnCesium.addEventListener('click', () => this.toggleCesiumMode());
    }

    const btnCesiumBack = document.getElementById('btn-cesium-back');
    if (btnCesiumBack) {
      btnCesiumBack.addEventListener('click', () => this.toggleCesiumMode());
    }

    const btnAssetHub = document.getElementById('btn-asset-hub');
    const assetModal = document.getElementById('asset-modal');
    const assetClose = document.getElementById('asset-modal-close');
    if (btnAssetHub && assetModal) {
      btnAssetHub.addEventListener('click', () => assetModal.classList.add('active'));
    }
    if (assetClose && assetModal) {
      assetClose.addEventListener('click', () => assetModal.classList.remove('active'));
    }

    const btnHelp = document.getElementById('btn-help');
    const helpModal = document.getElementById('help-modal');
    const helpClose = document.getElementById('help-modal-close');
    if (btnHelp && helpModal) {
      btnHelp.addEventListener('click', () => helpModal.classList.add('active'));
    }
    if (helpClose && helpModal) {
      helpClose.addEventListener('click', () => helpModal.classList.remove('active'));
    }

    document.querySelectorAll('.cam-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mode = parseInt(e.currentTarget.getAttribute('data-mode'));
        this.setCameraMode(mode);
      });
    });

    // MISSION CONTROL BAR INTERACTIVE BUTTONS
    this.setupMissionControlBar();
  }

  // Setup Mission Control Bar Interactive Teleoperation & Telecommands
  setupMissionControlBar() {
    const bindHold = (id, prop) => {
      const el = document.getElementById(id);
      if (!el) return;
      const start = (e) => {
        e.preventDefault();
        this.uiDriveState[prop] = true;
        el.classList.add('active');
        audioManager.init();
        audioManager.resume();
      };
      const end = (e) => {
        e.preventDefault();
        this.uiDriveState[prop] = false;
        el.classList.remove('active');
      };
      el.addEventListener('mousedown', start);
      el.addEventListener('mouseup', end);
      el.addEventListener('mouseleave', end);
      el.addEventListener('touchstart', start, { passive: false });
      el.addEventListener('touchend', end, { passive: false });
    };

    bindHold('btn-drive-fwd', 'fwd');
    bindHold('btn-drive-rev', 'rev');
    bindHold('btn-drive-left', 'left');
    bindHold('btn-drive-right', 'right');
    bindHold('btn-drive-brake', 'brake');

    // Speed Presets
    document.querySelectorAll('.btn-speed-preset').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const preset = parseInt(e.currentTarget.getAttribute('data-preset'));
        this.rover.setSpeedPreset(preset);
        document.querySelectorAll('.btn-speed-preset').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.showToast(`Speed Preset: ${this.rover.maxSpeedKmh} km/h max`);
      });
    });

    // Autonomous Waypoint Navigation
    const btnAutoNav = document.getElementById('btn-autonav');
    if (btnAutoNav) {
      btnAutoNav.addEventListener('click', () => {
        this.rover.isAutoNav = !this.rover.isAutoNav;
        this.rover.autoNavTarget = this.hud.getCurrentWaypoint();
        if (this.rover.isAutoNav) {
          audioManager.playQuindar(2200, 0.1);
          this.showToast(`Auto-Nav engaged: Navigating to ${this.rover.autoNavTarget.name}`);
        } else {
          this.showToast('Auto-Nav disengaged. Manual control restored.');
        }
      });
    }

    // Regolith Core Drill & Science Spectrometer Scan
    const btnDrill = document.getElementById('btn-drill-scan');
    if (btnDrill) {
      btnDrill.addEventListener('click', () => {
        this.rover.triggerDrillScan();
        this.showToast('Lowering Regolith Drill: Acquiring core sample and neutron assay...');
      });
    }

    // Align Solar Wings with Sun
    const btnAlignSun = document.getElementById('btn-align-sun');
    if (btnAlignSun) {
      btnAlignSun.addEventListener('click', () => {
        this.rover.reacquireSun();
        this.showToast('Solar Re-Acquisition: Rover heading aligned with 4° Polar Sun.');
      });
    }

    // Reset to Rim
    const btnResetRim = document.getElementById('btn-reset-rim');
    if (btnResetRim) {
      btnResetRim.addEventListener('click', () => {
        this.resetRoverPosition();
      });
    }
  }

  toggleCesiumMode() {
    const active = this.cesiumViewer.toggle();
    const btn = document.getElementById('btn-cesium-toggle');
    if (btn) btn.classList.toggle('active', active);
    this.showToast(active ? 'Switched to Cesium 3D Moon Globe' : 'Switched to Rover VR Cockpit View');
  }

  resetRoverPosition() {
    const startX = 0;
    const startZ = 0;
    const startY = this.terrain.getHeight(startX, startZ);
    this.rover.position.set(startX, startY + 0.65, startZ);
    this.rover.speed = 0;
    this.rover.heading = 0;
    this.rover.isAutoNav = false;
    this.showToast('LUNA-01 repositioned on Shackleton Rim.');
  }

  updateInput() {
    let throttle = 0;
    let steer = 0;
    let brake = false;

    // Keyboard Input
    if (this.keys['KeyW'] || this.keys['ArrowUp']) throttle += 1.0;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) throttle -= 1.0;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) steer -= 1.0;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) steer += 1.0;
    if (this.keys['Space']) brake = true;

    // On-screen Mission Control D-Pad Input
    if (this.uiDriveState.fwd) throttle += 1.0;
    if (this.uiDriveState.rev) throttle -= 1.0;
    if (this.uiDriveState.left) steer -= 1.0;
    if (this.uiDriveState.right) steer += 1.0;
    if (this.uiDriveState.brake) brake = true;

    // WebXR Gamepad Thumbstick support
    const session = this.renderer.xr.getSession();
    if (session && session.inputSources) {
      for (const source of session.inputSources) {
        if (source.gamepad && source.gamepad.axes) {
          const axes = source.gamepad.axes;
          if (axes.length >= 4) {
            const stickY = axes[3];
            const stickX = axes[2];
            if (Math.abs(stickY) > 0.1) throttle -= stickY;
            if (Math.abs(stickX) > 0.1) steer += stickX;
          }
        }
      }
    }

    // Cancel auto-nav on manual input
    if (this.rover.isAutoNav && (Math.abs(throttle) > 0.1 || Math.abs(steer) > 0.1 || brake)) {
      this.rover.isAutoNav = false;
    }

    this.input.throttle = throttle;
    this.input.steer = steer;
    this.input.brake = brake;
  }

  updateCamera() {
    if (this.renderer.xr.isPresenting) {
      const cockpitAnchor = this.rover.cockpitAnchor;
      if (cockpitAnchor) {
        const worldPos = new THREE.Vector3();
        cockpitAnchor.getWorldPosition(worldPos);
        this.cameraDolly.position.copy(worldPos);
        this.cameraDolly.quaternion.copy(this.rover.root.quaternion);
      }
      return;
    }

    // Non-VR Camera Modes
    if (this.cameraMode === 0) {
      // 1. First-Person Cockpit Rig:
      // PerspectiveCamera mounted to front mast of LUNA-01 chassis (y: 1.8m, z: -0.5m)
      const cockpitAnchor = this.rover.cockpitAnchor;
      const worldPos = new THREE.Vector3();
      cockpitAnchor.getWorldPosition(worldPos);
      this.cameraDolly.position.copy(worldPos);

      // Base orientation aligned with rover chassis
      this.cameraDolly.quaternion.copy(this.rover.root.quaternion);

      // Natural driving downward pitch angle (-0.22 rad / ~ -12.5°)
      // Ensures solar array wings and front wheels are prominently rendered in lower foreground!
      const baseCockpitPitch = -0.22;
      const localQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(baseCockpitPitch + this.mouseLook.pitch, this.mouseLook.yaw, 0, 'YXZ')
      );
      this.cameraDolly.quaternion.multiply(localQuat);
      this.camera.position.set(0, 0, 0);

    } else if (this.cameraMode === 1) {
      // 2. Tactical Chase Cam (Full view of rover chassis, wheels, solar wings, and terrain)
      const offset = this.cameraOffsetChase.clone().applyQuaternion(this.rover.root.quaternion);
      const targetPos = this.rover.position.clone().add(offset);
      this.cameraDolly.position.lerp(targetPos, 0.15);

      const lookTarget = this.rover.position.clone().add(new THREE.Vector3(0, 0.9, 0));
      this.cameraDolly.lookAt(lookTarget);
      this.camera.position.set(0, 0, 0);

    } else if (this.cameraMode === 2) {
      // 3. Rocker-Bogie Wheel Cam
      const offset = this.cameraOffsetWheel.clone().applyQuaternion(this.rover.root.quaternion);
      const targetPos = this.rover.position.clone().add(offset);
      this.cameraDolly.position.copy(targetPos);

      const frontWheelWorld = new THREE.Vector3(-1.15, 0.32, -1.25).applyQuaternion(this.rover.root.quaternion).add(this.rover.position);
      this.cameraDolly.lookAt(frontWheelWorld);
      this.camera.position.set(0, 0, 0);

    } else if (this.cameraMode === 3) {
      // 4. Free Orbit Cam
      this.orbitControls.target.copy(this.rover.position);
      this.orbitControls.update();
    }
  }

  showToast(message) {
    const toast = document.getElementById('toast-notification');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 3500);
  }

  render(time, frame) {
    const delta = Math.min(this.clock.getDelta(), 0.1);
    const elapsedTime = this.clock.getElapsedTime();

    // 1. Process Inputs
    this.updateInput();

    // 2. Update Rover Kinematics & Physics
    this.rover.update(delta, this.input);

    // 3. Update Camera Rig
    this.updateCamera();

    // 4. Update 3D Floating HUD and 2D Telemetry
    this.hud.update(elapsedTime, delta);

    // 5. Update Sun directional light shadow target to follow rover
    if (this.sunLight) {
      this.sunLight.target.position.copy(this.rover.position);
      this.sunLight.target.updateMatrixWorld();
    }

    // 6. Slowly rotate Earth in the sky
    if (this.earthMesh) {
      this.earthMesh.rotation.y = elapsedTime * 0.015;
    }

    // 7. Render Three.js Scene
    this.renderer.render(this.scene, this.camera);
  }
}

// Instantiate simulation on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.simulation = new LunaSimulation();
});
