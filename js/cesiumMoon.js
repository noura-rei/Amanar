// LUNA-01: Lunar South Pole Rover Exploration - CesiumJS Geospatial Moon Globe
// Visualizes the Moon as a 3D ellipsoidal globe with LOLA Lunar South Pole coordinates,
// Shackleton Crater, Malapert Mountain, Artemis III landing zones, and live LUNA-01 rover tracking.

export class CesiumMoonViewer {
  constructor(rover) {
    this.rover = rover;
    this.viewer = null;
    this.isInitialized = false;
    this.isActive = false;
    this.roverEntity = null;

    // South Pole center coordinates
    this.southPoleLat = -89.9; // degrees
    this.southPoleLon = 0.0;
  }

  init() {
    if (this.isInitialized) return;

    if (typeof window.Cesium === 'undefined') {
      console.warn('CesiumJS not yet loaded. Globe will initialize when Cesium is ready.');
      return;
    }

    try {
      const Cesium = window.Cesium;
      if (typeof Cesium.Ion !== 'undefined') {
        Cesium.Ion.defaultAccessToken = '';
      }

      // Define Moon Ellipsoid (Mean radius: 1737.4 km)
      const moonEllipsoid = new Cesium.Ellipsoid(1737400.0, 1737400.0, 1737400.0);
      Cesium.Ellipsoid.WGS84 = moonEllipsoid;

      // Create Viewer without Earth-specific bing/osm imagery
      this.viewer = new Cesium.Viewer('cesium-container', {
        globe: new Cesium.Globe(moonEllipsoid),
        baseLayerPicker: false,
        geocoder: false,
        homeButton: true,
        infoBox: true,
        sceneModePicker: true,
        selectionIndicator: true,
        timeline: false,
        animation: false,
        navigationHelpButton: false,
        skyBox: false,
        skyAtmosphere: false // Moon has vacuum (no atmosphere)
      });

      const scene = this.viewer.scene;
      scene.globe.enableLighting = true;
      scene.backgroundColor = Cesium.Color.BLACK;

      // Add Lunar South Pole Features & Landmarks
      this.addLunarLandmarks();

      // Add LUNA-01 Rover live tracking entity
      this.addRoverTracker();

      // Fly camera to Lunar South Pole Shackleton Ridge
      this.flyToSouthPole();

      this.isInitialized = true;
    } catch (e) {
      console.error('Error initializing CesiumJS Moon Globe:', e);
    }
  }

  addLunarLandmarks() {
    const Cesium = window.Cesium;
    if (!this.viewer) return;

    const landmarks = [
      {
        name: 'Shackleton Crater (PSR Ice Target)',
        lat: -89.9,
        lon: 0.0,
        height: -4200,
        color: Cesium.Color.CYAN,
        description: 'Diameter: 21 km | Depth: 4.2 km. The crater interior is permanently shadowed (PSR) containing volatile water-ice deposits.'
      },
      {
        name: 'Malapert Mountain (Peak of Eternal Light)',
        lat: -85.99,
        lon: 2.93,
        height: 5000,
        color: Cesium.Color.GOLD,
        description: 'Massif receiving continuous polar sunlight for solar arrays and Earth optical communications.'
      },
      {
        name: 'Connecting Ridge (Artemis III Candidate)',
        lat: -89.44,
        lon: 222.5,
        height: 1200,
        color: Cesium.Color.ORANGE,
        description: 'NASA Artemis III human landing candidate site linking Shackleton and de Gerlache rims.'
      },
      {
        name: 'de Gerlache Crater Rim',
        lat: -88.5,
        lon: 271.7,
        height: -2000,
        color: Cesium.Color.LIGHTBLUE,
        description: 'High-elevation rim overlooking extensive PSR cold traps.'
      }
    ];

    landmarks.forEach(lm => {
      this.viewer.entities.add({
        name: lm.name,
        position: Cesium.Cartesian3.fromDegrees(lm.lon, lm.lat, lm.height),
        point: {
          pixelSize: 12,
          color: lm.color,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2
        },
        label: {
          text: lm.name,
          font: '13px monospace',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -12)
        },
        description: lm.description
      });
    });
  }

  addRoverTracker() {
    const Cesium = window.Cesium;
    if (!this.viewer) return;

    this.roverEntity = this.viewer.entities.add({
      name: 'LUNA-01 Rover Telemetry',
      position: Cesium.Cartesian3.fromDegrees(this.southPoleLon, this.southPoleLat, 100),
      point: {
        pixelSize: 14,
        color: Cesium.Color.RED,
        outlineColor: Cesium.Color.YELLOW,
        outlineWidth: 3
      },
      label: {
        text: 'LUNA-01 (ACTIVE)',
        font: 'bold 14px monospace',
        fillColor: Cesium.Color.YELLOW,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -14)
      }
    });
  }

  flyToSouthPole() {
    const Cesium = window.Cesium;
    if (!this.viewer) return;

    this.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(0.0, -89.9, 45000.0),
      orientation: {
        heading: Cesium.Math.toRadians(0.0),
        pitch: Cesium.Math.toRadians(-60.0),
        roll: 0.0
      },
      duration: 2.5
    });
  }

  toggle() {
    this.isActive = !this.isActive;
    const container = document.getElementById('cesium-container');

    if (this.isActive) {
      if (!this.isInitialized) {
        this.init();
      }
      if (container) container.classList.add('active');
      this.updateRoverPosition();
    } else {
      if (container) container.classList.remove('active');
    }

    return this.isActive;
  }

  updateRoverPosition() {
    if (!this.viewer || !this.roverEntity || !this.rover) return;
    const Cesium = window.Cesium;

    // Convert local Three.js X/Z coordinates to delta degrees near South Pole
    // 1 degree of latitude on Moon ~ 30.3 km (30,300 meters)
    const deltaLat = (-this.rover.position.z / 30300);
    const deltaLon = (this.rover.position.x / 600); // Longitudinal convergence near pole

    const currentLat = Math.max(-90, Math.min(-80, this.southPoleLat + deltaLat));
    const currentLon = this.southPoleLon + deltaLon;

    this.roverEntity.position = Cesium.Cartesian3.fromDegrees(currentLon, currentLat, 50);
  }
}
