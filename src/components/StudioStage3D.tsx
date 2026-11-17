import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { ChevronDown, ChevronUp, X, Disc3, Sliders, Sparkles } from 'lucide-react';
import { getStudioAnalyser } from '../audio/studioAudio';
import {
  buildStudioSceneAssets,
  detectSoftwareWebGL,
  type CameraPresetId,
  type StudioFinishId,
  type StudioLightingId,
} from '../three/studioSceneBuilder';

interface StudioStage3DProps {
  isOpen: boolean;
  onClose: () => void;
  activeTrackTitle: string;
  bpm: number;
}

const CAMERA_PRESETS: Record<
  CameraPresetId,
  { label: string; pos: [number, number, number]; target: [number, number, number] }
> = {
  wide: { label: 'Stage Wide', pos: [0, 2.75, 5.1], target: [0, 0.45, -0.3] },
  deck: { label: 'Deck View', pos: [-0.4, 2.2, 2.4], target: [-0.15, 0.45, 0.28] },
  tonearm: { label: 'Tonearm', pos: [1.55, 1.35, 1.85], target: [0.55, 0.48, 0.08] },
  preamp: { label: 'Tube Preamp', pos: [0.35, 1.25, 1.35], target: [0, 0.42, -1.05] },
};

const FINISH_SWATCHES: {
  id: StudioFinishId;
  label: string;
  chassisHex: number;
  topPlateHex: number;
  accentHex: number;
  emissiveHex: number;
  swatchCss: string;
}[] = [
  {
    id: 'obsidian-gold',
    label: 'Obsidian Gold',
    chassisHex: 0x181c24,
    topPlateHex: 0x2a313e,
    accentHex: 0xd99b26,
    emissiveHex: 0xf59e0b,
    swatchCss: '#D99B26',
  },
  {
    id: 'titanium-cyan',
    label: 'Titanium Cyan',
    chassisHex: 0x1a2029,
    topPlateHex: 0x64748b,
    accentHex: 0x38bdf8,
    emissiveHex: 0x0ea5e9,
    swatchCss: '#38BDF8',
  },
  {
    id: 'brass-emerald',
    label: 'Studio Brass',
    chassisHex: 0x141918,
    topPlateHex: 0x3f3a2f,
    accentHex: 0x10b981,
    emissiveHex: 0x34d399,
    swatchCss: '#10B981',
  },
];

const LIGHTING_PRESETS: {
  id: StudioLightingId;
  label: string;
  bgHex: number;
  keyHex: number;
  keyIntensity: number;
  hemiSkyHex: number;
  hemiGroundHex: number;
  rimHex: number;
}[] = [
  {
    id: 'studio',
    label: 'Warm Studio',
    bgHex: 0x0b0d10,
    keyHex: 0xffe4c4,
    keyIntensity: 2.35,
    hemiSkyHex: 0x8fb8ff,
    hemiGroundHex: 0x1e1712,
    rimHex: 0x60a5fa,
  },
  {
    id: 'club',
    label: 'Club Amber',
    bgHex: 0x100b0a,
    keyHex: 0xffb36b,
    keyIntensity: 2.5,
    hemiSkyHex: 0x7c3aed,
    hemiGroundHex: 0x24120c,
    rimHex: 0xf59e0b,
  },
  {
    id: 'mastering',
    label: 'Cool Lab',
    bgHex: 0x090e14,
    keyHex: 0xf1f5f9,
    keyIntensity: 2.25,
    hemiSkyHex: 0xbae6fd,
    hemiGroundHex: 0x0f172a,
    rimHex: 0x38bdf8,
  },
];

// Pre-allocated scratch helpers for zero-GC render loop
const _dummy = new THREE.Object3D();
const _colorScratch = new THREE.Color();
const _targetCamPos = new THREE.Vector3();
const _targetLookAt = new THREE.Vector3();
const _freqBins = new Uint8Array(64);

export function StudioStage3D({ isOpen, onClose, activeTrackTitle, bpm }: StudioStage3DProps) {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);

  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [explodeValue, setExplodeValue] = useState(0);
  const [finishId, setFinishId] = useState<StudioFinishId>('obsidian-gold');
  const [lightingId, setLightingId] = useState<StudioLightingId>('studio');
  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>('wide');
  const [spinActive, setSpinActive] = useState(true);
  const [visualizerActive, setVisualizerActive] = useState(true);

  const stateRef = useRef({
    explodeTarget: 0,
    finishId: 'obsidian-gold' as StudioFinishId,
    lightingId: 'studio' as StudioLightingId,
    spinActive: true,
    visualizerActive: true,
    bpm: 112,
    cameraTransitionActive: false,
    presetId: 'wide' as CameraPresetId,
  });

  stateRef.current.explodeTarget = explodeValue;
  stateRef.current.finishId = finishId;
  stateRef.current.lightingId = lightingId;
  stateRef.current.spinActive = spinActive;
  stateRef.current.visualizerActive = visualizerActive;
  stateRef.current.bpm = bpm;

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((c) => !c);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const handleSelectCameraPreset = (preset: CameraPresetId) => {
    setCameraPreset(preset);
    stateRef.current.presetId = preset;
    stateRef.current.cameraTransitionActive = true;
  };

  useEffect(() => {
    if (!isOpen || !canvasMountRef.current) return;
    const container = canvasMountRef.current;
    const isSoftwareGl = detectSoftwareWebGL();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0d10);
    scene.fog = new THREE.FogExp2(0x0b0d10, 0.042);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 80);
    camera.position.set(...CAMERA_PRESETS.wide.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 2.0;
    controls.maxDistance = 12.0;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.target.set(...CAMERA_PRESETS.wide.target);
    controls.update();

    controls.addEventListener('start', () => {
      stateRef.current.cameraTransitionActive = false;
    });

    // Studio Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0x8fb8ff, 0x1e1712, 0.72);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffe4c4, 2.35);
    keyLight.position.set(4.5, 6.8, 4.2);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 22;
    keyLight.shadow.camera.left = -6.5;
    keyLight.shadow.camera.right = 6.5;
    keyLight.shadow.camera.top = 6.5;
    keyLight.shadow.camera.bottom = -6.5;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x60a5fa, 1.15);
    rimLight.position.set(-5.0, 3.8, -5.2);
    scene.add(rimLight);

    let softboxLight: THREE.RectAreaLight | null = null;
    if (!isSoftwareGl) {
      RectAreaLightUniformsLib.init();
      softboxLight = new THREE.RectAreaLight(0xfff1dc, 3.4, 4.5, 2.0);
      softboxLight.position.set(0, 4.2, 0.4);
      softboxLight.lookAt(0, 0.4, -0.3);
      scene.add(softboxLight);
    }

    // Build Procedural Studio Assets
    const assets = buildStudioSceneAssets(renderer, isSoftwareGl, activeTrackTitle);

    const floorGeo = new THREE.CircleGeometry(18, 64);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMesh = new THREE.Mesh(floorGeo, assets.stageFloorMat);
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    const stageRingGeo = new THREE.RingGeometry(3.38, 3.46, 72);
    stageRingGeo.rotateX(-Math.PI / 2);
    const stageRingMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.4,
      roughness: 0.4,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const stageRing = new THREE.Mesh(stageRingGeo, stageRingMat);
    stageRing.position.y = 0.004;
    scene.add(stageRing);

    scene.add(assets.turntable.group);
    scene.add(assets.preamp.group);
    scene.add(assets.leftMonitor.group);
    scene.add(assets.rightMonitor.group);
    scene.add(assets.spectrum.instancedMesh);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let currentExplode = 0;
    let appliedFinish: StudioFinishId = 'obsidian-gold';
    let appliedLighting: StudioLightingId = 'studio';
    let frameId = 0;
    let disposed = false;
    let lastTime = performance.now();

    const applyFinishAndLighting = () => {
      if (appliedFinish !== stateRef.current.finishId) {
        appliedFinish = stateRef.current.finishId;
        const swatch = FINISH_SWATCHES.find((s) => s.id === appliedFinish) || FINISH_SWATCHES[0];
        assets.swatchMaterials.chassisMat.color.setHex(swatch.chassisHex);
        assets.swatchMaterials.topPlateMat.color.setHex(swatch.topPlateHex);
        assets.swatchMaterials.accentMetalMat.color.setHex(swatch.accentHex);
        assets.swatchMaterials.emissiveAccentMat.color.setHex(swatch.emissiveHex);
        assets.swatchMaterials.emissiveAccentMat.emissive.setHex(swatch.emissiveHex);
        stageRingMat.color.setHex(swatch.emissiveHex);
        stageRingMat.emissive.setHex(swatch.emissiveHex);
      }

      if (appliedLighting !== stateRef.current.lightingId) {
        appliedLighting = stateRef.current.lightingId;
        const preset =
          LIGHTING_PRESETS.find((l) => l.id === appliedLighting) || LIGHTING_PRESETS[0];
        (scene.background as THREE.Color).setHex(preset.bgHex);
        if (scene.fog instanceof THREE.FogExp2) {
          scene.fog.color.setHex(preset.bgHex);
        }
        keyLight.color.setHex(preset.keyHex);
        keyLight.intensity = preset.keyIntensity;
        hemiLight.color.setHex(preset.hemiSkyHex);
        hemiLight.groundColor.setHex(preset.hemiGroundHex);
        rimLight.color.setHex(preset.rimHex);
      }
    };

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const delta = Math.min(0.1, (now - lastTime) / 1000);
      const elapsed = now * 0.001;
      lastTime = now;

      applyFinishAndLighting();

      // Smooth Exploded-View Separation
      currentExplode = THREE.MathUtils.damp(
        currentExplode,
        stateRef.current.explodeTarget,
        7.5,
        delta
      );
      const applyExplodeList = (entries: { object: THREE.Object3D; restY: number; offsetY: number }[]) => {
        for (let i = 0; i < entries.length; i++) {
          entries[i].object.position.y = entries[i].restY + entries[i].offsetY * currentExplode;
        }
      };
      applyExplodeList(assets.turntable.explodeEntries);
      applyExplodeList(assets.preamp.explodeEntries);
      applyExplodeList(assets.leftMonitor.explodeEntries);
      applyExplodeList(assets.rightMonitor.explodeEntries);

      // Smooth Camera Preset Transition
      if (stateRef.current.cameraTransitionActive) {
        const preset = CAMERA_PRESETS[stateRef.current.presetId];
        _targetCamPos.set(...preset.pos);
        _targetLookAt.set(...preset.target);

        const dampFactor = 1 - Math.exp(-6.5 * delta);
        camera.position.lerp(_targetCamPos, dampFactor);
        controls.target.lerp(_targetLookAt, dampFactor);

        if (
          camera.position.distanceToSquared(_targetCamPos) < 0.0004 &&
          controls.target.distanceToSquared(_targetLookAt) < 0.0004
        ) {
          camera.position.copy(_targetCamPos);
          controls.target.copy(_targetLookAt);
          stateRef.current.cameraTransitionActive = false;
        }
      }

      controls.update();

      // Turntable Platter Rotation & Cue Glow
      if (stateRef.current.spinActive) {
        assets.turntable.platterGroup.rotation.y -= delta * 1.45;
        assets.turntable.cueLedMaterial.emissiveIntensity = 1.6 + Math.sin(elapsed * 4.0) * 0.35;
      } else {
        assets.turntable.cueLedMaterial.emissiveIntensity = 0.45;
      }

      // Live Web Audio Spectrum Sampling or BPM Harmonic Pulse
      let avgEnergy = 0;
      const analyser = getStudioAnalyser();
      let hasLiveAudio = false;
      if (analyser && stateRef.current.visualizerActive) {
        analyser.getByteFrequencyData(_freqBins);
        let sum = 0;
        for (let i = 0; i < _freqBins.length; i++) sum += _freqBins[i];
        if (sum > 24) hasLiveAudio = true;
      }

      const beatFreq = (stateRef.current.bpm / 60) * Math.PI;
      const barCount = assets.spectrum.count;
      const swatch =
        FINISH_SWATCHES.find((s) => s.id === stateRef.current.finishId) || FINISH_SWATCHES[0];

      for (let i = 0; i < barCount; i++) {
        const bp = assets.spectrum.basePositions[i];
        let level = 0.14;
        if (stateRef.current.visualizerActive) {
          if (hasLiveAudio) {
            const binIdx = Math.min(_freqBins.length - 1, Math.floor((i / barCount) * 44));
            level = 0.12 + (_freqBins[binIdx] / 255) * 1.85;
          } else {
            const wave =
              0.5 +
              0.5 * Math.sin(elapsed * beatFreq * 0.5 + i * 0.28) *
                Math.cos(elapsed * 1.3 - i * 0.12);
            level = 0.18 + Math.pow(wave, 1.4) * 1.15;
          }
        }
        avgEnergy += level;

        _dummy.position.set(bp.x, 0, bp.z);
        _dummy.rotation.set(0, -bp.angle + Math.PI / 2, 0);
        _dummy.scale.set(1, level, 1);
        _dummy.updateMatrix();
        assets.spectrum.instancedMesh.setMatrixAt(i, _dummy.matrix);

        _colorScratch.setHex(swatch.emissiveHex).offsetHSL((i / barCount) * 0.08 - 0.04, 0, level * 0.08);
        assets.spectrum.instancedMesh.setColorAt(i, _colorScratch);
      }
      assets.spectrum.instancedMesh.instanceMatrix.needsUpdate = true;
      if (assets.spectrum.instancedMesh.instanceColor) {
        assets.spectrum.instancedMesh.instanceColor.needsUpdate = true;
      }

      avgEnergy /= barCount;

      // Subtle Speaker Woofer Excursion & VU Needle / Tube Glow
      const coneDisplacement = (avgEnergy - 0.2) * 0.018;
      assets.leftMonitor.wooferCone.position.z = 0.37 + coneDisplacement;
      assets.rightMonitor.wooferCone.position.z = 0.37 + coneDisplacement;
      assets.preamp.vuNeedleGroup.rotation.z = THREE.MathUtils.clamp(
        0.48 - avgEnergy * 0.72,
        -0.55,
        0.55
      );
      assets.preamp.filamentMaterials.forEach((fm) => {
        fm.emissiveIntensity = 1.65 + avgEnergy * 0.85;
      });

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    const handleResize = () => {
      if (!container || disposed) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      window.clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      floorGeo.dispose();
      stageRingGeo.dispose();
      stageRingMat.dispose();
      envTarget.dispose();
      assets.disposables.geometries.forEach((g) => g.dispose());
      assets.disposables.materials.forEach((m) => m.dispose());
      assets.disposables.textures.forEach((t) => t.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [isOpen, activeTrackTitle]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 w-screen h-screen z-40 overflow-hidden select-none"
      style={{ backgroundColor: '#07090D' }}
    >
      {/* Dedicated WebGL Mount Container */}
      <div ref={canvasMountRef} className="w-full h-full" />

      {/* Minimal Top-Left Title & Exit Bar (Zero Mid-Screen Occlusion) */}
      <div
        className="fixed top-4 left-4 z-50 flex items-center gap-3 px-4 py-2.5 rounded-xl border border-[#232833]"
        style={{ backgroundColor: 'rgba(19, 22, 27, 0.92)' }}
      >
        <Disc3 className="w-4 h-4 text-amber-400 shrink-0" />
        <div className="leading-tight">
          <div className="font-display text-xs font-bold text-slate-100">
            SoundDeck 3D Mastering Stage
          </div>
          <div className="text-[11px] font-mono text-slate-400">
            {activeTrackTitle || 'Midnight Studio'} · {bpm} BPM
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-2 px-2.5 py-1.5 rounded-lg bg-[#0B0D10] hover:bg-[#1B2028] text-slate-200 text-xs font-medium border border-[#2A313E] flex items-center gap-1 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          <span>Exit 3D</span>
        </button>
      </div>

      {/* Collapsible Bottom-Center Floating Control Dock (<= 15% Viewport Footprint, No backdrop-filter) */}
      <div
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[94vw] max-w-[920px] flex flex-col items-center transition-transform duration-300"
        style={{
          transform: dockCollapsed ? 'translateY(calc(100% - 34px))' : 'translateY(0)',
        }}
      >
        <button
          type="button"
          onClick={() => setDockCollapsed((c) => !c)}
          className="px-3.5 py-1 rounded-t-lg border border-b-0 border-[#2A313E] text-[11px] font-medium text-slate-200 flex items-center gap-1.5 transition-colors"
          style={{ backgroundColor: 'rgba(19, 22, 27, 0.96)' }}
        >
          {dockCollapsed ? <ChevronUp className="w-3.5 h-3.5 text-amber-400" /> : <ChevronDown className="w-3.5 h-3.5 text-amber-400" />}
          <span>{dockCollapsed ? 'Show Controls (H)' : 'Hide Controls (H)'}</span>
        </button>

        <div
          className="w-full rounded-xl border border-[#232833] px-4 py-3 flex flex-wrap items-center justify-between gap-4 shadow-2xl"
          style={{ backgroundColor: 'rgba(19, 22, 27, 0.95)' }}
        >
          {/* Exploded-View Slider */}
          <div className="flex items-center gap-2.5 text-xs">
            <Sliders className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-slate-300 whitespace-nowrap">Explode</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={explodeValue}
              onChange={(e) => setExplodeValue(Number(e.target.value))}
              className="studio-slider w-24"
              aria-label="Exploded view separation"
            />
          </div>

          {/* Finish Swatches */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Finish</span>
            <div className="flex items-center gap-1.5">
              {FINISH_SWATCHES.map((sw) => (
                <button
                  key={sw.id}
                  type="button"
                  onClick={() => setFinishId(sw.id)}
                  title={sw.label}
                  aria-label={sw.label}
                  className={`w-5 h-5 rounded-full border-2 transition-transform ${
                    finishId === sw.id ? 'border-white scale-110' : 'border-[#2A313E] opacity-75 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: sw.swatchCss }}
                />
              ))}
            </div>
          </div>

          {/* Lighting Presets */}
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#0B0D10] border border-[#232833]">
            {LIGHTING_PRESETS.map((lt) => (
              <button
                key={lt.id}
                type="button"
                onClick={() => setLightingId(lt.id)}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                  lightingId === lt.id
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {lt.label}
              </button>
            ))}
          </div>

          {/* Camera View Buttons */}
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#0B0D10] border border-[#232833]">
            {(Object.keys(CAMERA_PRESETS) as CameraPresetId[]).map((pid) => (
              <button
                key={pid}
                type="button"
                onClick={() => handleSelectCameraPreset(pid)}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                  cameraPreset === pid
                    ? 'bg-[#252B36] text-amber-300 border border-amber-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {CAMERA_PRESETS[pid].label}
              </button>
            ))}
          </div>

          {/* Platter & Spectrum Toggles */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSpinActive((s) => !s)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors whitespace-nowrap ${
                spinActive
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  : 'bg-[#0B0D10] border-[#232833] text-slate-400'
              }`}
            >
              {spinActive ? 'Platter Spin: On' : 'Platter Spin: Off'}
            </button>
            <button
              type="button"
              onClick={() => setVisualizerActive((v) => !v)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium border flex items-center gap-1 transition-colors whitespace-nowrap ${
                visualizerActive
                  ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                  : 'bg-[#0B0D10] border-[#232833] text-slate-400'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              <span>3D EQ</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
