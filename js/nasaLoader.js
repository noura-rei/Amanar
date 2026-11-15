// LUNA-01: Lunar South Pole Rover Exploration - NASA 3D Asset & Topography Hub
// Integrates official NASA SVS Moon Topography Model, CodePawl WebGL-Optimized glTF,
// NASA Moon Trek 3D Mesh Exporter, and GLTFLoader with MeshoptDecoder.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export class NasaAssetManager {
  constructor(scene, showToast) {
    this.scene = scene;
    this.showToast = showToast || console.log;
    this.gltfLoader = new GLTFLoader();

    // Configure MeshoptDecoder for compressed NASA glTF/GLB models
    if (MeshoptDecoder) {
      this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);
    }

    this.activeExternalModel = null;

    // Embedded NASA 3D Asset & Resource Endpoints
    this.catalog = [
      {
        id: 'nasa-svs-14959',
        name: 'NASA SVS Official Moon Topography Model (LRO LOLA 8k)',
        category: 'Topography',
        url: 'https://svs.gsfc.nasa.gov/vis/a010000/a014900/a014959/Moon_NASA_LRO_8k_Topo_Small.glb',
        description: 'Derived from Lunar Reconnaissance Orbiter (LRO) Lunar Orbiter Laser Altimeter (LOLA) global topography (SVS ID: 14959).',
        scale: 0.005,
        type: 'glb'
      },
      {
        id: 'codepawl-apollo-lm',
        name: 'Apollo Lunar Module (CodePawl Hugging Face WebGL glTF)',
        category: 'Spacecraft',
        url: 'https://huggingface.co/datasets/codepawl/nasa-3d-glb/resolve/main/Apollo_Lunar_Module.glb',
        description: 'WebGL-optimized Apollo LM descent and ascent stage from Hugging Face NASA 3D dataset.',
        scale: 0.6,
        type: 'glb'
      },
      {
        id: 'codepawl-lunar-rover',
        name: 'NASA Lunar Roving Vehicle / Space Hardware',
        category: 'Rover',
        url: 'https://huggingface.co/datasets/codepawl/nasa-3d-glb/resolve/main/Lunar_Roving_Vehicle.glb',
        description: 'NASA historic LRV and surface mobility system from CodePawl NASA 3D repository.',
        scale: 0.8,
        type: 'glb'
      },
      {
        id: 'moon-trek-portal',
        name: 'NASA Moon Trek 3D Mesh Exporter',
        category: 'Portal',
        url: 'https://trek.nasa.gov/moon/',
        description: 'Interactive NASA portal to export custom 3D OBJ/STL meshes of Shackleton Crater or Malapert Mountain.',
        type: 'link'
      },
      {
        id: 'nasa-3d-hub',
        name: 'NASA Official 3D Resources Hub & GitHub',
        category: 'Portal',
        url: 'https://science.nasa.gov/3d-resources/',
        secondaryUrl: 'https://github.com/nasa/NASA-3D-Resources',
        description: 'Official NASA open-source 3D models repository for space exploration and Artemis architecture.',
        type: 'link'
      },
      {
        id: 'cesium-moon-terrain',
        name: 'Cesium Moon Terrain 3D Tiles',
        category: 'Geospatial',
        url: 'https://cesium.com/platform/cesiumjs/',
        description: 'Real-time stream of high-resolution 3D tiles of the Lunar South Pole for CesiumJS.',
        type: 'cesium'
      }
    ];

    this.initUI();
    this.setupDragAndDrop();
  }

  initUI() {
    const listContainer = document.getElementById('asset-list-container');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    this.catalog.forEach(item => {
      const card = document.createElement('div');
      card.className = 'asset-card';

      const linksHtml = item.type === 'glb'
        ? `
          <button class="btn-hud load-btn" data-id="${item.id}">LOAD MODEL INTO SCENE</button>
          <a class="btn-hud" href="${item.url}" target="_blank" rel="noopener">DOWNLOAD GLB</a>
        `
        : `
          <a class="btn-hud" href="${item.url}" target="_blank" rel="noopener">OPEN NASA PORTAL</a>
          ${item.secondaryUrl ? `<a class="btn-hud" href="${item.secondaryUrl}" target="_blank" rel="noopener">GITHUB REPO</a>` : ''}
        `;

      card.innerHTML = `
        <div class="asset-card-title">
          <span>${item.name}</span>
          <span class="status-badge">${item.category}</span>
        </div>
        <div class="asset-card-desc">${item.description}</div>
        <div class="asset-card-links">${linksHtml}</div>
      `;

      listContainer.appendChild(card);
    });

    // Attach click listeners for load buttons
    listContainer.querySelectorAll('.load-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.getAttribute('data-id');
        const asset = this.catalog.find(a => a.id === id);
        if (asset) {
          this.loadModelFromURL(asset.url, asset.name, asset.scale);
        }
      });
    });
  }

  setupDragAndDrop() {
    const dropZone = document.getElementById('model-drop-zone');
    const fileInput = document.getElementById('model-file-input');

    if (dropZone && fileInput) {
      dropZone.addEventListener('click', () => fileInput.click());

      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
      });

      dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
      });

      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          this.loadFile(e.dataTransfer.files[0]);
        }
      });

      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.loadFile(e.target.files[0]);
        }
      });
    }
  }

  // Load GLB/glTF from remote URL
  loadModelFromURL(url, name, scale = 1.0) {
    this.showToast(`Contacting NASA server for ${name}...`);

    this.gltfLoader.load(
      url,
      (gltf) => {
        this.addLoadedModelToScene(gltf.scene, name, scale);
        this.showToast(`Loaded ${name} successfully!`);
      },
      (xhr) => {
        if (xhr.lengthComputable) {
          const pct = Math.round((xhr.loaded / xhr.total) * 100);
          this.showToast(`Loading ${name}: ${pct}%`);
        }
      },
      (error) => {
        console.warn('Direct remote fetch encountered browser CORS policy or offline state:', error);
        this.showToast(`Notice: Direct remote fetch blocked by NASA server CORS header. Download GLB directly or drop file in the box below!`);
      }
    );
  }

  // Load user provided file (from NASA Moon Trek exporter or local NASA 3D download)
  loadFile(file) {
    const reader = new FileReader();
    this.showToast(`Reading ${file.name}...`);

    reader.onload = (e) => {
      const contents = e.target.result;
      this.gltfLoader.parse(
        contents,
        '',
        (gltf) => {
          this.addLoadedModelToScene(gltf.scene, file.name, 1.0);
          this.showToast(`NASA Model ${file.name} successfully deployed!`);
          const modal = document.getElementById('asset-modal');
          if (modal) modal.classList.remove('active');
        },
        (error) => {
          console.error('Error parsing GLTF file:', error);
          this.showToast(`Error parsing ${file.name}. Ensure valid glTF/GLB format.`);
        }
      );
    };

    reader.readAsArrayBuffer(file);
  }

  addLoadedModelToScene(modelScene, label, scale = 1.0) {
    if (this.activeExternalModel) {
      this.scene.remove(this.activeExternalModel);
    }

    modelScene.scale.set(scale, scale, scale);
    // Position 15 meters in front of the rover start point as an exploration landmark
    modelScene.position.set(0, 5, -25);
    modelScene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    this.activeExternalModel = modelScene;
    this.scene.add(this.activeExternalModel);
  }
}
