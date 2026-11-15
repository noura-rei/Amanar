# LUNA-01: Lunar South Pole Rover Exploration
### High-Fidelity WebGL / WebXR Virtual Reality Simulation

A first-person virtual reality lunar rover simulation built with **Three.js**, **WebXR**, and **CesiumJS**, reproducing NASA Artemis and VIPER robotic exploration across the **Lunar South Pole** (Shackleton Crater Rim & Permanently Shadowed Regions).

---

## Technical Architecture & CDN Scripts
The simulation integrates modern modular libraries via standard CDN endpoints and browser `importmap`:
1. **Three.js Core Library (r160+):** `https://unpkg.com/three@0.160.0/build/three.module.js`
2. **Three.js VRButton:** `three/addons/webxr/VRButton.js` (WebXR session management and local-floor reference space)
3. **GLTFLoader:** `three/addons/loaders/GLTFLoader.js` (Streaming external glTF/GLB models)
4. **MeshoptDecoder:** `three/addons/libs/meshopt_decoder.module.js` & `https://cdn.jsdelivr.net/npm/meshoptimizer@0.20.0/meshopt_decoder.js` (Decompression of high-density NASA meshes)
5. **CesiumJS:** `https://cesium.com/downloads/cesiumjs/releases/1.115/Build/Cesium/Cesium.js` (Geospatial 3D Moon Globe option)
6. **OrbitControls:** `three/addons/controls/OrbitControls.js` (Tactical free-camera inspection)

---

## Embedded NASA 3D Assets & Terrain Data Endpoints
The embedded NASA 3D Asset & Topography Hub (`js/nasaLoader.js`) connects directly to official NASA endpoints:

1. **Lunar Surface Topography & Moon Models:**
   - **NASA SVS Official Moon Topography Model (glTF):**  
     `https://svs.gsfc.nasa.gov/vis/a010000/a014900/a014959/Moon_NASA_LRO_8k_Topo_Small.glb`  
     *(NASA SVS ID: 14959 derived from LRO LOLA laser altimetry)*
   - **NASA Moon Trek 3D Mesh Exporter:**  
     `https://trek.nasa.gov/moon/`  
     *(Export custom 3D OBJ/STL meshes of Shackleton Crater or Malapert Mountain)*
   - **Cesium Moon Terrain 3D Tiles:**  
     `https://cesium.com/platform/cesiumjs/`  
     *(Real-time stream of high-resolution 3D tiles of the Lunar South Pole)*

2. **Rover & Spacecraft 3D Models:**
   - **CodePawl WebGL-Optimized NASA 3D Dataset (Hugging Face):**  
     `https://huggingface.co/datasets/codepawl/nasa-3d-glb`
     - Apollo Lunar Module glTF
     - Generic Space Hardware / Rovers
   - **NASA Official 3D Resources Hub:**  
     `https://science.nasa.gov/3d-resources/` & GitHub: `https://github.com/nasa/NASA-3D-Resources`
   - **Custom Model Drag & Drop:**  
     Users can export any crater mesh directly from NASA Moon Trek and drop it directly onto the simulation to render in real-time.

---

## Simulation Features & Specifications

### 1. First-Person Cockpit & Camera Rig
- **Masthead Mounting:** PerspectiveCamera attached directly to the front mast of the LUNA-01 rover chassis at `(x: 0, y: 1.8m, z: -0.5m)`.
- **Foreground Elements:** From the cockpit view, the front articulated solar array wings (photovoltaic silicon cells with gold foil backing) and rocker-bogie wheel suspension frame are rendered in the foreground.
- **WebXR Integration:**
  ```javascript
  import { VRButton } from 'three/addons/webxr/VRButton.js';
  document.body.appendChild(VRButton.createButton(renderer));
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  ```
- **VR Controller Support:** Full 6-DoF controller support with thumbstick driving, laser rays, and haptic feedback.
- **Camera Views (Key 'C'):**
  1. Mast Cockpit View (`y: 1.8m, z: -0.5m`) with mouse-look
  2. Tactical Chase Cam
  3. Rocker-Bogie Wheel Cam
  4. Free Orbit Cam

### 2. Lighting & Lunar Environment Shader
- **Polar Low-Sun Angle (4° Elevation):** Single `DirectionalLight` positioned at elevation = 4.0° above the horizon (`intensity = 3.5`, `color = #fffbf0`, `castShadow = true`).
- **Hard Vacuum Shadows:** `renderer.shadowMap.type = THREE.BasicShadowMap` (sharp shadow map without soft penumbra) mirroring the intense contrast between sunlit crater rims and permanently shadowed regions (PSRs).
- **Deep Space Astronomy:**
  - Pitch black space vacuum (no atmospheric light scatter).
  - High-density starfield with spectral temperature coloring.
  - The "Blue Marble" Earth hanging low (2–6°) above the polar horizon.
  - Directional sun disc matching the 4° sun vector.
- **Regolith Texture & Dust Shader:**
  - Procedural normal mapping for fine dust grains, micro-craters, and shock-melt features.
  - Low-gravity dust particles emitted from wheel contact points using `THREE.Points` when moving (`velocity.y -= 0.001` per frame, reproducing 1/6th Earth gravity and parabolic ballistic rooster tails in a vacuum).
- **Dual LED Headlights (Key 'H'):** High-power forward spotlights casting sharp shadow cones into the pitch black of Shackleton PSR.

### 3. Floating 3D Heads-Up Display (HUD)
- **Glassmorphic 3D VR HUD:** Anchored at `position.set(0, 0.2, -1.0)` in front of the VR camera rig.
- **Real-Time Telemetry:**
  - **Speed:** `0–12 km/h` circular arc gauge and digital readout.
  - **Battery Power:** Solar generation (`+W` in sunlight, `0W` in shadow) vs. RCS and drive motor consumption (`-W`).
  - **Thermal Reserve:** Margin above cold fault limit (`-40°C`). Flashes critical hazard alerts when venturing deep into PSR cold traps down to `-233°C` (40 K).
  - **Waypoint Navigation:** Dynamic 3D compass arrow pointing toward Shackleton Crater PSR water-ice deposits.
  - **Chassis Inclinometer:** Pitch and roll angles to avoid rollover on steep 25°+ crater walls.
  - **Neutron Spectrometer:** Volatiles detector tracking Water-Equivalent Hydrogen (wt% WEH) with audible audio clicks.

### 4. CesiumJS Geospatial 3D Moon Globe (Key 'M')
- Seamless toggle into CesiumJS orbital view of the Moon.
- Configured with the Lunar Ellipsoid (radius: 1737.4 km) and South Pole coordinates (`-89.9° Lat`).
- Annotates Shackleton Crater, Malapert Mountain, and Artemis III landing candidate sites with live rover GPS position synchronization.

### 5. Procedural Web Audio Synthesizer
- Built-in sound synthesis using native Web Audio API (zero audio file dependencies):
  - Rover electric drive motors pitch-shifting from 45 Hz to 320 Hz with speed.
  - Low-frequency chassis vacuum vibration rumble.
  - Apollo/Artemis Quindar radio communication tones.
  - Neutron Spectrometer Geiger clicks accelerating near PSR water-ice deposits.

---

## Mission Controls

| Key / Action | Function |
| :--- | :--- |
| `W` / `↑` | Forward Throttle (0–12 km/h) |
| `S` / `↓` | Reverse Throttle |
| `A` / `D` (or `←` / `→`) | Steer Left / Right |
| `Space` | Chassis Handbrake |
| `H` | Toggle Headlights (Off / Low / High) |
| `C` | Cycle Camera (Cockpit / Chase / Wheels / Orbit) |
| `M` | Toggle Cesium Geospatial Moon Globe |
| `Tab` | Cycle Waypoint Target (Ice Alpha, Beta, Artemis Camp) |
| `R` | Reset Rover Position to Sunlit Rim |
| **VR Headset** | Head tracking in 6-DoF, Left Thumbstick drives, Right Thumbstick turns |
| **Mouse Drag** | Look around inside the cockpit |

---

## How to Run

1. Start the zero-dependency local server:
   ```bash
   node server.js
   ```
2. Open your browser or VR headset (Meta Quest Browser, Apple Vision Pro Safari, Chrome with WebXR) at:
   ```
   http://localhost:8080/
   ```
3. Click **ENTER VR** on the bottom right or drive directly using keyboard, mouse, or touch controls.
