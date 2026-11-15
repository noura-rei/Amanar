// LUNA-01: Lunar South Pole Rover Exploration - Floating 3D Heads-Up Display (HUD)
// Anchored at position.set(0, 0.2, -1) in front of the VR camera rig.
// Renders real-time telemetry: Speed (0-12 km/h), Battery Power (Solar vs RCS),
// Thermal Reserve (°C margin), Target Distance, Compass Bearing, Ice Spectrometer,
// and NASA Mission Control Telecommands.

import * as THREE from 'three';

export class LunaHUD {
  constructor(camera, rover, terrain) {
    this.camera = camera;
    this.rover = rover;
    this.terrain = terrain;

    // 3D VR HUD objects
    this.hudMesh = null;
    this.canvas = null;
    this.ctx = null;
    this.texture = null;

    // Active waypoint
    this.currentWaypointIndex = 0;
    this.waypoints = this.terrain.iceDepositLocations;

    // Mission start time for MET clock
    this.startTime = Date.now();

    // Last update timestamp for throttling canvas redraws
    this.lastDrawTime = 0;
    this.drawInterval = 1 / 30; // 30 FPS HUD canvas update

    // DOM HUD elements for 2D mirror
    this.domElements = {};

    this.init();
  }

  init() {
    this.create3DHUD();
    this.cacheDOMElements();
  }

  // Anchor a glassmorphic 3D HUD canvas in front of the VR camera (position.set(0, 0.2, -1))
  create3DHUD() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1536;
    this.canvas.height = 768;
    this.ctx = this.canvas.getContext('2d');

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;

    const hudGeo = new THREE.PlaneGeometry(1.35, 0.675);
    const hudMat = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      opacity: 0.94,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    this.hudMesh = new THREE.Mesh(hudGeo, hudMat);
    // Explicit requirement: position.set(0, 0.2, -1)
    this.hudMesh.position.set(0, 0.2, -1.0);
    this.hudMesh.renderOrder = 999;

    this.camera.add(this.hudMesh);
  }

  cacheDOMElements() {
    this.domElements = {
      speedVal: document.getElementById('telemetry-speed'),
      speedBar: document.getElementById('speed-bar-fill'),
      solarVal: document.getElementById('telemetry-solar'),
      rcsVal: document.getElementById('telemetry-rcs'),
      batteryVal: document.getElementById('telemetry-battery'),
      batteryBar: document.getElementById('battery-bar-fill'),
      thermalVal: document.getElementById('telemetry-thermal'),
      thermalBar: document.getElementById('thermal-bar-fill'),
      thermalStatus: document.getElementById('thermal-status-tag'),
      targetName: document.getElementById('telemetry-target-name'),
      targetDist: document.getElementById('telemetry-target-dist'),
      targetBearing: document.getElementById('telemetry-target-bearing'),
      attitudePitch: document.getElementById('telemetry-pitch'),
      attitudeRoll: document.getElementById('telemetry-roll'),
      icePercent: document.getElementById('telemetry-ice'),
      iceBar: document.getElementById('ice-bar-fill'),
      scienceStatus: document.getElementById('science-status-text'),
      metClock: document.getElementById('mc-met-clock'),
      btnAutoNav: document.getElementById('btn-autonav'),
      btnDrillScan: document.getElementById('btn-drill-scan'),
      sysStatusBadge: document.getElementById('sys-status-badge')
    };
  }

  cycleWaypoint() {
    this.currentWaypointIndex = (this.currentWaypointIndex + 1) % this.waypoints.length;
    return this.waypoints[this.currentWaypointIndex];
  }

  getCurrentWaypoint() {
    return this.waypoints[this.currentWaypointIndex];
  }

  update(time, delta) {
    if (time - this.lastDrawTime >= this.drawInterval) {
      this.lastDrawTime = time;
      this.draw3DHUD(time);
      this.update2DOverlay();
    }
  }

  // Draw 3D HUD onto CanvasTexture
  draw3DHUD(time) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Rover Telemetry Data
    const speedKmh = this.rover.getSpeedKmh();
    const batteryPct = this.rover.batteryJoules;
    const solarW = Math.round(this.rover.solarPowerWatts);
    const rcsW = Math.round(this.rover.rcsPowerWatts);
    const thermalC = this.rover.thermalMarginC;
    const attitude = this.rover.getAttitude();
    const wp = this.getCurrentWaypoint();
    const distM = Math.round(Math.hypot(this.rover.position.x - wp.x, this.rover.position.z - wp.z));

    // Calculate relative bearing to waypoint
    const dx = wp.x - this.rover.position.x;
    const dz = wp.z - this.rover.position.z;
    const targetAngle = Math.atan2(dx, dz);
    const roverAngle = Math.atan2(-Math.sin(this.rover.heading), -Math.cos(this.rover.heading));
    let relBearingRad = targetAngle - roverAngle;
    while (relBearingRad > Math.PI) relBearingRad -= Math.PI * 2;
    while (relBearingRad < -Math.PI) relBearingRad += Math.PI * 2;
    const relBearingDeg = Math.round(THREE.MathUtils.radToDeg(relBearingRad));

    const iceConc = this.terrain.getIceConcentration(this.rover.position.x, this.rover.position.z);
    const icePercent = (iceConc * (wp.h2oPercent || 5.6)).toFixed(1);
    const inPSR = this.terrain.isPositionInPSR(this.rover.position.x, this.rover.position.z);

    // 1. Glassmorphic HUD Framing
    ctx.save();

    ctx.fillStyle = 'rgba(6, 14, 28, 0.45)';
    this.roundRect(ctx, 30, 20, w - 60, h - 40, 16);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
    ctx.lineWidth = 2;
    this.roundRect(ctx, 30, 20, w - 60, h - 40, 16);
    ctx.stroke();

    this.drawCornerBrackets(ctx, 30, 20, w - 60, h - 40, 24);

    // 2. Top Header Status Bar
    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('LUNA-01 // NASA SOUTH POLE EXPLORATION ROVER', 60, 62);

    ctx.font = '15px monospace';
    ctx.fillStyle = '#8ab4f8';
    ctx.fillText('REF: SHACKLETON CRATER RIM • WATER-ICE CAMPAIGN', 60, 88);

    if (inPSR) {
      ctx.fillStyle = thermalC < 0 ? '#ff2a4b' : '#ffb700';
      ctx.fillText(`● PSR SHADOW ZONE | COLD TRAP`, w - 420, 62);
    } else {
      ctx.fillStyle = '#00ff88';
      ctx.fillText('● POLAR RIM // SOLAR POWER NOMINAL', w - 420, 62);
    }
    ctx.fillStyle = '#8ab4f8';
    ctx.fillText('DSN UPLINK: 1.28s LATENCY (ACTIVE)', w - 420, 88);

    ctx.strokeStyle = 'rgba(0, 240, 255, 0.2)';
    ctx.beginPath();
    ctx.moveTo(60, 102);
    ctx.lineTo(w - 60, 102);
    ctx.stroke();

    // 3. LEFT POD: SPEEDOMETER & ATTITUDE
    const speedX = 220;
    const speedY = 300;
    const speedRadius = 105;

    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.beginPath();
    ctx.arc(speedX, speedY, speedRadius, Math.PI * 0.75, Math.PI * 2.25);
    ctx.stroke();

    const speedRatio = Math.min(Math.abs(speedKmh) / 12.0, 1.0);
    const speedEndAngle = Math.PI * 0.75 + speedRatio * (Math.PI * 1.5);
    ctx.strokeStyle = speedKmh >= 0 ? '#00f0ff' : '#ffb700';
    ctx.beginPath();
    ctx.arc(speedX, speedY, speedRadius, Math.PI * 0.75, speedEndAngle);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(Math.abs(speedKmh).toFixed(1), speedX, speedY + 14);

    ctx.font = '16px monospace';
    ctx.fillStyle = '#00f0ff';
    ctx.fillText('KM / H', speedX, speedY + 44);

    ctx.font = '14px monospace';
    ctx.fillStyle = this.rover.isBraking ? '#ff2a4b' : (this.rover.isAutoNav ? '#00f0ff' : (speedKmh < -0.1 ? '#ffb700' : '#00ff88'));
    ctx.fillText(this.rover.isBraking ? '[BRAKE ENGAGED]' : (this.rover.isAutoNav ? '[AUTO-NAV ACTIVE]' : (speedKmh < -0.1 ? '[REV]' : '[FORWARD]')), speedX, speedY + 68);

    // Inclinometer / Attitude Box
    const incY = 495;
    ctx.fillStyle = 'rgba(12, 24, 44, 0.75)';
    this.roundRect(ctx, 70, incY, 300, 145, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
    this.roundRect(ctx, 70, incY, 300, 145, 8);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#8ab4f8';
    ctx.font = '13px monospace';
    ctx.fillText('CHASSIS ATTITUDE', 90, incY + 28);

    ctx.font = 'bold 17px monospace';
    ctx.fillStyle = Math.abs(attitude.pitch) > 20 ? '#ffb700' : '#ffffff';
    ctx.fillText(`PITCH: ${attitude.pitch >= 0 ? '+' : ''}${attitude.pitch.toFixed(1)}°`, 90, incY + 65);

    ctx.fillStyle = Math.abs(attitude.roll) > 18 ? '#ff2a4b' : '#ffffff';
    ctx.fillText(`ROLL:  ${attitude.roll >= 0 ? '+' : ''}${attitude.roll.toFixed(1)}°`, 90, incY + 98);

    ctx.font = '12px monospace';
    ctx.fillStyle = '#a0c4e0';
    ctx.fillText(`MAX SAFE SLOPE: 25.0°`, 90, incY + 128);

    // 4. CENTER POD: WAYPOINT NAV & BEARING ARROW
    const navCenterX = w / 2;
    const navCenterY = 300;

    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.3)';
    ctx.beginPath();
    ctx.arc(navCenterX, navCenterY, 105, 0, Math.PI * 2);
    ctx.stroke();

    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(navCenterX + cosA * 98, navCenterY + sinA * 98);
      ctx.lineTo(navCenterX + cosA * 105, navCenterY + sinA * 105);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(navCenterX, navCenterY);
    ctx.rotate(relBearingRad);

    ctx.fillStyle = '#fc3d21';
    ctx.beginPath();
    ctx.moveTo(0, -85);
    ctx.lineTo(15, -52);
    ctx.lineTo(5, -56);
    ctx.lineTo(5, 36);
    ctx.lineTo(-5, 36);
    ctx.lineTo(-5, -56);
    ctx.lineTo(-15, -52);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${distM} M`, navCenterX, navCenterY + 148);

    ctx.font = '15px monospace';
    ctx.fillStyle = '#fc3d21';
    ctx.fillText(wp.name.toUpperCase(), navCenterX, navCenterY + 178);

    ctx.font = '13px monospace';
    ctx.fillStyle = '#8ab4f8';
    ctx.fillText(`BEARING: ${relBearingDeg >= 0 ? '+' : ''}${relBearingDeg}° RELATIVE`, navCenterX, navCenterY + 204);

    // 5. RIGHT POD: POWER, THERMAL & VOLATILES SPECTROMETER
    const rightX = w - 460;
    const rightY = 120;

    // Power Panel
    ctx.fillStyle = 'rgba(12, 24, 44, 0.75)';
    this.roundRect(ctx, rightX, rightY, 390, 150, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
    this.roundRect(ctx, rightX, rightY, 390, 150, 8);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#8ab4f8';
    ctx.font = '13px monospace';
    ctx.fillText('ELECTRICAL POWER SUBSYSTEM', rightX + 20, rightY + 28);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(`BATTERY: ${batteryPct.toFixed(1)}%`, rightX + 20, rightY + 60);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(rightX + 20, rightY + 70, 350, 10);
    ctx.fillStyle = batteryPct < 25 ? '#ff2a4b' : '#00f0ff';
    ctx.fillRect(rightX + 20, rightY + 70, 350 * (batteryPct / 100), 10);

    ctx.font = '13px monospace';
    ctx.fillStyle = inPSR ? '#8ab4f8' : '#00ff88';
    ctx.fillText(`SOLAR GEN: +${solarW} W`, rightX + 20, rightY + 106);

    ctx.fillStyle = '#ffb700';
    ctx.fillText(`RCS / DRIVE: -${rcsW} W`, rightX + 20, rightY + 130);

    // Thermal Panel
    const thermY = rightY + 165;
    ctx.fillStyle = 'rgba(12, 24, 44, 0.75)';
    this.roundRect(ctx, rightX, thermY, 390, 150, 8);
    ctx.fill();
    ctx.strokeStyle = thermalC < 0 ? 'rgba(255, 42, 75, 0.6)' : 'rgba(0, 240, 255, 0.25)';
    this.roundRect(ctx, rightX, thermY, 390, 150, 8);
    ctx.stroke();

    ctx.fillStyle = '#8ab4f8';
    ctx.font = '13px monospace';
    ctx.fillText('THERMAL MARGIN (COLD FAULT LIMIT)', rightX + 20, thermY + 28);

    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = thermalC < 0 ? '#ff2a4b' : (thermalC < 10 ? '#ffb700' : '#00ff88');
    ctx.fillText(`${thermalC >= 0 ? '+' : ''}${thermalC.toFixed(1)} °C`, rightX + 20, thermY + 65);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(rightX + 20, thermY + 78, 350, 10);
    const thermRatio = Math.max(0, Math.min((thermalC + 40) / 75, 1));
    ctx.fillStyle = thermalC < 0 ? '#ff2a4b' : (thermalC < 10 ? '#ffb700' : '#00b4d8');
    ctx.fillRect(rightX + 20, thermY + 78, 350 * thermRatio, 10);

    ctx.font = '12px monospace';
    ctx.fillStyle = thermalC < 0 ? '#ff2a4b' : '#8ab4f8';
    ctx.fillText(thermalC < 0 ? 'CRITICAL: PSR COLD TRAP REACHED' : 'STATUS: THERMAL HEATING STABLE', rightX + 20, thermY + 118);

    // Volatiles / Spectrometer Panel
    const iceY = thermY + 165;
    ctx.fillStyle = 'rgba(12, 24, 44, 0.75)';
    this.roundRect(ctx, rightX, iceY, 390, 150, 8);
    ctx.fill();
    ctx.strokeStyle = iceConc > 0.3 ? 'rgba(0, 255, 136, 0.6)' : 'rgba(0, 240, 255, 0.25)';
    this.roundRect(ctx, rightX, iceY, 390, 150, 8);
    ctx.stroke();

    ctx.fillStyle = '#8ab4f8';
    ctx.font = '13px monospace';
    ctx.fillText('NEUTRON SPECTROMETER (H2O ICE)', rightX + 20, iceY + 28);

    ctx.font = 'bold 19px monospace';
    ctx.fillStyle = iceConc > 0.2 ? '#00ff88' : '#ffffff';
    ctx.fillText(`DETECTED: ${icePercent} wt% WEH`, rightX + 20, iceY + 60);

    const barX = rightX + 20;
    const barY = iceY + 78;
    for (let b = 0; b < 18; b++) {
      const active = (b / 18) <= iceConc;
      ctx.fillStyle = active ? '#00ff88' : 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(barX + b * 19, barY, 15, 20);
    }

    ctx.font = '12px monospace';
    ctx.fillStyle = iceConc > 0.4 ? '#00ff88' : '#8ab4f8';
    ctx.fillText(iceConc > 0.4 ? '>> WATER-ICE VOLATILES DETECTED <<' : 'SEARCHING PSR FLOOR...', rightX + 20, iceY + 128);

    // 6. BOTTOM BAR: MISSION CONTROL TELECOMMAND ROW IN VR
    const mcBarY = h - 90;
    ctx.fillStyle = 'rgba(10, 20, 36, 0.85)';
    this.roundRect(ctx, 60, mcBarY, w - 120, 50, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
    this.roundRect(ctx, 60, mcBarY, w - 120, 50, 6);
    ctx.stroke();

    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#00f0ff';
    ctx.textAlign = 'left';
    ctx.fillText('NASA MISSION CONTROL TELEMETRY:', 80, mcBarY + 31);

    ctx.font = '13px monospace';
    ctx.fillStyle = this.rover.isAutoNav ? '#00ff88' : '#a0c4e0';
    ctx.fillText(`AUTO-NAV: [${this.rover.isAutoNav ? 'ACTIVE -> ' + wp.name : 'STANDBY'}]`, 390, mcBarY + 31);

    ctx.fillStyle = this.rover.isDrilling ? '#ffb700' : '#a0c4e0';
    ctx.fillText(`DRILL: [${this.rover.isDrilling ? 'SAMPLING REGOLITH...' : 'READY'}]`, 820, mcBarY + 31);

    ctx.fillStyle = '#a0c4e0';
    ctx.fillText(`SPEED PRESET: [${this.rover.maxSpeedKmh} KM/H]`, 1120, mcBarY + 31);

    ctx.restore();
    this.texture.needsUpdate = true;
  }

  // Update 2D DOM Telemetry Mirror
  update2DOverlay() {
    const d = this.domElements;
    if (!d.speedVal) return;

    const speedKmh = this.rover.getSpeedKmh();
    const wp = this.getCurrentWaypoint();
    const distM = Math.round(Math.hypot(this.rover.position.x - wp.x, this.rover.position.z - wp.z));
    const dx = wp.x - this.rover.position.x;
    const dz = wp.z - this.rover.position.z;
    const targetAngle = Math.atan2(dx, dz);
    const roverAngle = Math.atan2(-Math.sin(this.rover.heading), -Math.cos(this.rover.heading));
    let relBearingRad = targetAngle - roverAngle;
    while (relBearingRad > Math.PI) relBearingRad -= Math.PI * 2;
    while (relBearingRad < -Math.PI) relBearingRad += Math.PI * 2;
    const relBearingDeg = Math.round(THREE.MathUtils.radToDeg(relBearingRad));

    const iceConc = this.terrain.getIceConcentration(this.rover.position.x, this.rover.position.z);
    const icePercent = (iceConc * (wp.h2oPercent || 5.6)).toFixed(1);
    const inPSR = this.terrain.isPositionInPSR(this.rover.position.x, this.rover.position.z);
    const attitude = this.rover.getAttitude();

    if (d.speedVal) d.speedVal.textContent = Math.abs(speedKmh).toFixed(1);
    if (d.speedBar) d.speedBar.style.width = `${Math.min(Math.abs(speedKmh) / 12 * 100, 100)}%`;

    if (d.solarVal) d.solarVal.textContent = `+${Math.round(this.rover.solarPowerWatts)}`;
    if (d.rcsVal) d.rcsVal.textContent = `-${Math.round(this.rover.rcsPowerWatts)}`;
    if (d.batteryVal) d.batteryVal.textContent = `${this.rover.batteryJoules.toFixed(1)}%`;
    if (d.batteryBar) d.batteryBar.style.width = `${this.rover.batteryJoules}%`;

    if (d.thermalVal) d.thermalVal.textContent = `${this.rover.thermalMarginC >= 0 ? '+' : ''}${this.rover.thermalMarginC.toFixed(1)}`;
    if (d.thermalBar) {
      const thermRatio = Math.max(0, Math.min((this.rover.thermalMarginC + 40) / 75, 1));
      d.thermalBar.style.width = `${thermRatio * 100}%`;
    }

    if (d.thermalStatus) {
      if (this.rover.thermalMarginC < 0) {
        d.thermalStatus.textContent = 'FAULT RISK';
        d.thermalStatus.className = 'status-badge hazard';
      } else if (this.rover.thermalMarginC < 10) {
        d.thermalStatus.textContent = 'COLD ADVISORY';
        d.thermalStatus.className = 'status-badge warning';
      } else {
        d.thermalStatus.textContent = 'NOMINAL';
        d.thermalStatus.className = 'status-badge';
      }
    }

    if (d.targetName) d.targetName.textContent = wp.name;
    if (d.targetDist) d.targetDist.textContent = `${distM} m`;
    if (d.targetBearing) d.targetBearing.textContent = `${relBearingDeg >= 0 ? '+' : ''}${relBearingDeg}°`;

    if (d.attitudePitch) d.attitudePitch.textContent = `${attitude.pitch >= 0 ? '+' : ''}${attitude.pitch.toFixed(1)}°`;
    if (d.attitudeRoll) d.attitudeRoll.textContent = `${attitude.roll >= 0 ? '+' : ''}${attitude.roll.toFixed(1)}°`;

    if (d.icePercent) d.icePercent.textContent = `${icePercent} %`;
    if (d.iceBar) d.iceBar.style.width = `${iceConc * 100}%`;

    if (d.scienceStatus) {
      if (this.rover.isDrilling) {
        d.scienceStatus.textContent = 'Drilling lunar core sample...';
        d.scienceStatus.style.color = '#ffb700';
      } else if (this.rover.lastScienceResult) {
        d.scienceStatus.textContent = `Core Sample: ${this.rover.lastScienceResult.wehPercent} wt% WEH!`;
        d.scienceStatus.style.color = '#00ff88';
      } else if (iceConc > 0.4) {
        d.scienceStatus.textContent = 'Volatiles detected! Click DRILL & SCAN.';
        d.scienceStatus.style.color = '#00ff88';
      } else {
        d.scienceStatus.textContent = 'Searching PSR floor for subsurface hydrogen...';
        d.scienceStatus.style.color = '#8bb0d0';
      }
    }

    if (d.btnAutoNav) {
      d.btnAutoNav.classList.toggle('active', this.rover.isAutoNav);
      d.btnAutoNav.textContent = this.rover.isAutoNav ? '■ STOP AUTO-NAV' : '🤖 AUTO-NAV';
    }

    if (d.btnDrillScan) {
      d.btnDrillScan.classList.toggle('active', this.rover.isDrilling);
      d.btnDrillScan.textContent = this.rover.isDrilling ? 'DRILLING...' : '🔬 DRILL & SCAN';
    }

    // Update MET Clock (Mission Elapsed Time)
    if (d.metClock) {
      const elapsedSec = Math.floor((Date.now() - this.startTime) / 1000);
      const hours = String(Math.floor(elapsedSec / 3600)).padStart(2, '0');
      const mins = String(Math.floor((elapsedSec % 3600) / 60)).padStart(2, '0');
      const secs = String(elapsedSec % 60).padStart(2, '0');
      d.metClock.textContent = `MET +014:${hours}:${mins}:${secs}`;
    }

    if (d.sysStatusBadge) {
      if (inPSR) {
        d.sysStatusBadge.textContent = 'PSR SHADOW';
        d.sysStatusBadge.className = 'status-badge warning';
      } else {
        d.sysStatusBadge.textContent = 'SYS NOMINAL';
        d.sysStatusBadge.className = 'status-badge';
      }
    }
  }

  // Canvas utility: rounded rectangle
  roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  // Canvas utility: HUD corner brackets
  drawCornerBrackets(ctx, x, y, width, height, len) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#00f0ff';
    ctx.beginPath();
    ctx.moveTo(x, y + len);
    ctx.lineTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + width - len, y);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width, y + len);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, y + height - len);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x + len, y + height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + width - len, y + height);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x + width, y + height - len);
    ctx.stroke();
  }
}
