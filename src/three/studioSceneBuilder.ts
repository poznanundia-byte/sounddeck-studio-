import * as THREE from 'three';

export type StudioFinishId = 'obsidian-gold' | 'titanium-cyan' | 'brass-emerald';
export type StudioLightingId = 'studio' | 'club' | 'mastering';
export type CameraPresetId = 'wide' | 'deck' | 'tonearm' | 'preamp';

export interface ExplodeEntry {
  object: THREE.Object3D;
  restY: number;
  offsetY: number;
}

export interface TurntableRig {
  group: THREE.Group;
  platterGroup: THREE.Group;
  vinylDisc: THREE.Mesh;
  tonearmPivot: THREE.Group;
  cueLedMaterial: THREE.MeshStandardMaterial;
  explodeEntries: ExplodeEntry[];
}

export interface PreampRig {
  group: THREE.Group;
  filamentMaterials: THREE.MeshStandardMaterial[];
  vuNeedleGroup: THREE.Group;
  explodeEntries: ExplodeEntry[];
}

export interface MonitorRig {
  group: THREE.Group;
  wooferCone: THREE.Mesh;
  trimRingMaterial: THREE.MeshStandardMaterial;
  explodeEntries: ExplodeEntry[];
}

export interface SpectrumRig {
  instancedMesh: THREE.InstancedMesh;
  count: number;
  basePositions: { x: number; z: number; angle: number }[];
}

export interface SwatchTargetMaterials {
  chassisMat: THREE.MeshPhysicalMaterial;
  topPlateMat: THREE.MeshPhysicalMaterial;
  accentMetalMat: THREE.MeshStandardMaterial;
  emissiveAccentMat: THREE.MeshStandardMaterial;
}

export interface StudioSceneAssets {
  turntable: TurntableRig;
  preamp: PreampRig;
  leftMonitor: MonitorRig;
  rightMonitor: MonitorRig;
  spectrum: SpectrumRig;
  swatchMaterials: SwatchTargetMaterials;
  stageFloorMat: THREE.MeshStandardMaterial;
  disposables: {
    geometries: THREE.BufferGeometry[];
    materials: THREE.Material[];
    textures: THREE.Texture[];
  };
}

export function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createVinylRecordTexture(maxAnisotropy: number, trackTitle: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  const cx = 512;
  const cy = 512;

  ctx.fillStyle = '#090B0E';
  ctx.fillRect(0, 0, 1024, 1024);

  for (let r = 175; r < 495; r += 2) {
    const alpha = 0.08 + (Math.sin(r * 0.37) * 0.5 + 0.5) * 0.14;
    ctx.strokeStyle = `rgba(180, 195, 215, ${alpha.toFixed(3)})`;
    ctx.lineWidth = r % 28 === 0 ? 2 : 0.9;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  const grad = ctx.createRadialGradient(cx, cy, 18, cx, cy, 170);
  grad.addColorStop(0, '#F59E0B');
  grad.addColorStop(0.55, '#B45309');
  grad.addColorStop(1, '#1A1E26');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, 170, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#FDE68A';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 152, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#0B0D10';
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SOUNDDECK', cx, cy - 68);
  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = '#FEF3C7';
  const safeTitle = (trackTitle || 'MIDNIGHT SESSION').slice(0, 20).toUpperCase();
  ctx.fillText(safeTitle, cx, cy + 72);
  ctx.font = '14px monospace';
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText('33 1/3 RPM · STEREO', cx, cy + 102);

  ctx.fillStyle = '#050608';
  ctx.beginPath();
  ctx.arc(cx, cy, 20, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

function createStudioFloorTextures(maxAnisotropy: number): {
  albedo: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
} {
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const cCtx = colorCanvas.getContext('2d')!;

  cCtx.fillStyle = '#11151C';
  cCtx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 32) {
    const shade = 16 + ((y / 32) % 3) * 4;
    cCtx.fillStyle = `rgb(${shade}, ${shade + 4}, ${shade + 10})`;
    cCtx.fillRect(0, y, size, 30);
    cCtx.fillStyle = '#080A0D';
    cCtx.fillRect(0, y + 30, size, 2);
  }

  for (let i = 0; i < 420; i++) {
    const x = (i * 73) % size;
    const y = (i * 137) % size;
    cCtx.fillStyle = 'rgba(255,255,255,0.025)';
    cCtx.fillRect(x, y, 36, 1);
  }

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d')!;
  rCtx.fillStyle = '#B8B8B8';
  rCtx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 32) {
    rCtx.fillStyle = y % 64 === 0 ? '#A4A4A4' : '#C6C6C6';
    rCtx.fillRect(0, y, size, 30);
  }

  const albedo = new THREE.CanvasTexture(colorCanvas);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.wrapS = THREE.RepeatWrapping;
  albedo.wrapT = THREE.RepeatWrapping;
  albedo.repeat.set(6, 6);
  albedo.anisotropy = maxAnisotropy;

  const roughness = new THREE.CanvasTexture(roughCanvas);
  roughness.wrapS = THREE.RepeatWrapping;
  roughness.wrapT = THREE.RepeatWrapping;
  roughness.repeat.set(6, 6);
  roughness.anisotropy = maxAnisotropy;

  return { albedo, roughness };
}

function createKevlarConeTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1E222A';
  ctx.fillRect(0, 0, 256, 256);

  for (let y = 0; y < 256; y += 8) {
    for (let x = 0; x < 256; x += 8) {
      const even = ((x + y) / 8) % 2 === 0;
      ctx.fillStyle = even ? '#2B303B' : '#181B22';
      ctx.fillRect(x, y, 7, 7);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createVuMeterTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const bg = ctx.createLinearGradient(0, 0, 0, 256);
  bg.addColorStop(0, '#FFF4D6');
  bg.addColorStop(1, '#E6C27A');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 256);

  ctx.strokeStyle = '#292116';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(256, 236, 175, Math.PI * 1.18, Math.PI * 1.65);
  ctx.stroke();

  ctx.strokeStyle = '#B91C1C';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(256, 236, 175, Math.PI * 1.65, Math.PI * 1.82);
  ctx.stroke();

  ctx.fillStyle = '#1E1912';
  ctx.font = 'bold 20px monospace';
  ctx.textAlign = 'center';
  const labels = ['-20', '-10', '-7', '-5', '-3', '0', '+3'];
  labels.forEach((lbl, idx) => {
    const a = Math.PI * (1.2 + (idx / (labels.length - 1)) * 0.6);
    const tx = 256 + Math.cos(a) * 140;
    const ty = 236 + Math.sin(a) * 140;
    ctx.fillStyle = idx >= 5 ? '#B91C1C' : '#1E1912';
    ctx.fillText(lbl, tx, ty);
  });

  ctx.fillStyle = '#475569';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('VU · MASTER', 256, 195);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 14, 128, 128, 126);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
  grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.38)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function createRoundedRectShape(width: number, depth: number, radius: number): THREE.Shape {
  const w = width / 2;
  const h = depth / 2;
  const r = Math.min(radius, w * 0.45, h * 0.45);
  const shape = new THREE.Shape();
  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.quadraticCurveTo(w, -h, w, -h + r);
  shape.lineTo(w, h - r);
  shape.quadraticCurveTo(w, h, w - r, h);
  shape.lineTo(-w + r, h);
  shape.quadraticCurveTo(-w, h, -w, h - r);
  shape.lineTo(-w, -h + r);
  shape.quadraticCurveTo(-w, -h, -w + r, -h);
  return shape;
}

export function buildStudioSceneAssets(
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean,
  trackTitle: string
): StudioSceneAssets {
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };
  const trackTex = <T extends THREE.Texture>(t: T): T => {
    textures.push(t);
    return t;
  };

  const chassisMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x181c24,
      roughness: 0.44,
      metalness: 0.38,
      clearcoat: 0.35,
      clearcoatRoughness: 0.28,
    })
  );

  const topPlateMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x2a313e,
      roughness: 0.22,
      metalness: 0.92,
      anisotropy: 0.75,
      anisotropyRotation: 0.2,
    })
  );

  const accentMetalMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd99b26,
      roughness: 0.18,
      metalness: 0.94,
    })
  );

  const matteRubberMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x101216,
      roughness: 0.88,
      metalness: 0.04,
    })
  );

  const emissiveAccentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.6,
      roughness: 0.25,
      metalness: 0.2,
    })
  );

  const shadowTex = trackTex(createContactShadowTexture());
  const shadowDecalMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.5,
    })
  );

  // Studio floor textures + mesh
  const floorTex = createStudioFloorTextures(maxAniso);
  trackTex(floorTex.albedo);
  trackTex(floorTex.roughness);

  const stageFloorMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: floorTex.albedo,
      roughnessMap: floorTex.roughness,
      roughness: 0.72,
      metalness: 0.18,
    })
  );

  // 1. COMPOSITE HERO MODEL: DIRECT-DRIVE TURNTABLE DECK (y = 0 bottom pivot)
  const turntableGroup = new THREE.Group();
  turntableGroup.position.set(0, 0, 0.28);
  const ttExplode: ExplodeEntry[] = [];

  const ttShadow = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(3.4, 2.75)), shadowDecalMat);
  ttShadow.rotation.x = -Math.PI / 2;
  ttShadow.position.y = 0.002;
  turntableGroup.add(ttShadow);

  // Isolation feet (4 parts resting flush on y=0)
  const footGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.13, 0.08, 24));
  const footRingGeo = trackGeo(new THREE.CylinderGeometry(0.115, 0.115, 0.02, 24));
  const footOffsets = [
    [-1.12, -0.84],
    [1.12, -0.84],
    [-1.12, 0.84],
    [1.12, 0.84],
  ];
  footOffsets.forEach(([fx, fz]) => {
    const foot = new THREE.Mesh(footGeo, matteRubberMat);
    foot.position.set(fx, 0.04, fz);
    foot.castShadow = true;
    foot.receiveShadow = true;
    turntableGroup.add(foot);

    const ring = new THREE.Mesh(footRingGeo, accentMetalMat);
    ring.position.set(fx, 0.07, fz);
    turntableGroup.add(ring);
  });

  // Main beveled plinth
  const plinthShape = createRoundedRectShape(2.65, 2.08, 0.14);
  const plinthGeo = trackGeo(
    new THREE.ExtrudeGeometry(plinthShape, {
      depth: 0.22,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.03,
      bevelSegments: 4,
    })
  );
  plinthGeo.rotateX(-Math.PI / 2);
  plinthGeo.computeTangents();
  const plinthMesh = new THREE.Mesh(plinthGeo, chassisMat);
  plinthMesh.position.y = 0.08;
  plinthMesh.castShadow = true;
  plinthMesh.receiveShadow = true;
  turntableGroup.add(plinthMesh);

  // Brushed metallic top deck plate
  const deckShape = createRoundedRectShape(2.52, 1.94, 0.11);
  const deckGeo = trackGeo(
    new THREE.ExtrudeGeometry(deckShape, {
      depth: 0.035,
      bevelEnabled: true,
      bevelThickness: 0.012,
      bevelSize: 0.012,
      bevelSegments: 3,
    })
  );
  deckGeo.rotateX(-Math.PI / 2);
  deckGeo.computeTangents();
  const deckPlate = new THREE.Mesh(deckGeo, topPlateMat);
  deckPlate.position.y = 0.32;
  deckPlate.castShadow = true;
  deckPlate.receiveShadow = true;
  turntableGroup.add(deckPlate);
  ttExplode.push({ object: deckPlate, restY: 0.32, offsetY: 0.28 });

  // Lathe-turned heavy strobe platter + slipmat + vinyl + spindle
  const platterGroup = new THREE.Group();
  platterGroup.position.set(-0.24, 0.37, 0.02);

  const platterProfile = [
    new THREE.Vector2(0.05, 0),
    new THREE.Vector2(0.84, 0),
    new THREE.Vector2(0.86, 0.025),
    new THREE.Vector2(0.83, 0.065),
    new THREE.Vector2(0.80, 0.08),
    new THREE.Vector2(0.04, 0.08),
  ];
  const platterGeo = trackGeo(new THREE.LatheGeometry(platterProfile, 64));
  platterGeo.computeTangents();
  const platterMesh = new THREE.Mesh(platterGeo, topPlateMat);
  platterMesh.castShadow = true;
  platterMesh.receiveShadow = true;
  platterGroup.add(platterMesh);
  ttExplode.push({ object: platterMesh, restY: 0, offsetY: 0.56 });

  const strobeRingGeo = trackGeo(new THREE.CylinderGeometry(0.838, 0.855, 0.022, 64, 1, true));
  const strobeRing = new THREE.Mesh(strobeRingGeo, accentMetalMat);
  strobeRing.position.y = 0.045;
  platterGroup.add(strobeRing);
  ttExplode.push({ object: strobeRing, restY: 0.045, offsetY: 0.56 });

  const slipmatGeo = trackGeo(new THREE.CylinderGeometry(0.77, 0.77, 0.014, 56));
  const slipmatMesh = new THREE.Mesh(slipmatGeo, matteRubberMat);
  slipmatMesh.position.y = 0.087;
  slipmatMesh.receiveShadow = true;
  platterGroup.add(slipmatMesh);
  ttExplode.push({ object: slipmatMesh, restY: 0.087, offsetY: 0.85 });

  const vinylTex = trackTex(createVinylRecordTexture(maxAniso, trackTitle));
  const vinylMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      map: vinylTex,
      roughness: 0.24,
      metalness: 0.12,
      clearcoat: 0.85,
      clearcoatRoughness: 0.14,
    })
  );
  const vinylGeo = trackGeo(new THREE.CylinderGeometry(0.76, 0.76, 0.012, 64));
  const vinylDisc = new THREE.Mesh(vinylGeo, vinylMat);
  vinylDisc.position.y = 0.101;
  vinylDisc.castShadow = true;
  vinylDisc.receiveShadow = true;
  platterGroup.add(vinylDisc);
  ttExplode.push({ object: vinylDisc, restY: 0.101, offsetY: 1.22 });

  const spindleProfile = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.055, 0),
    new THREE.Vector2(0.055, 0.02),
    new THREE.Vector2(0.022, 0.03),
    new THREE.Vector2(0.02, 0.115),
    new THREE.Vector2(0, 0.125),
  ];
  const spindleGeo = trackGeo(new THREE.LatheGeometry(spindleProfile, 32));
  const spindleMesh = new THREE.Mesh(spindleGeo, accentMetalMat);
  spindleMesh.position.y = 0.08;
  platterGroup.add(spindleMesh);

  turntableGroup.add(platterGroup);

  // Tonearm Assembly (S-curve TubeGeometry + Gimbal + Counterweight + Headshell)
  const tonearmPivot = new THREE.Group();
  tonearmPivot.position.set(0.92, 0.37, -0.56);

  const gimbalBase = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.17, 0.19, 0.06, 32)),
    chassisMat
  );
  gimbalBase.position.y = 0.03;
  tonearmPivot.add(gimbalBase);

  const gimbalRing = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(0.12, 0.022, 16, 32)),
    accentMetalMat
  );
  gimbalRing.position.y = 0.11;
  gimbalRing.rotation.y = Math.PI / 4;
  tonearmPivot.add(gimbalRing);

  const armCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.12, -0.18),
    new THREE.Vector3(0, 0.12, 0.02),
    new THREE.Vector3(-0.08, 0.12, 0.38),
    new THREE.Vector3(-0.26, 0.115, 0.72),
    new THREE.Vector3(-0.46, 0.095, 0.96),
  ]);
  const armGeo = trackGeo(new THREE.TubeGeometry(armCurve, 40, 0.018, 16, false));
  const armTube = new THREE.Mesh(armGeo, topPlateMat);
  armTube.castShadow = true;
  tonearmPivot.add(armTube);

  const counterweight = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.055, 0.055, 0.11, 24)),
    accentMetalMat
  );
  counterweight.rotation.x = Math.PI / 2;
  counterweight.position.set(0, 0.12, -0.14);
  tonearmPivot.add(counterweight);

  const headshell = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.07, 0.035, 0.16)),
    chassisMat
  );
  headshell.position.set(-0.5, 0.09, 1.02);
  headshell.rotation.y = -0.52;
  tonearmPivot.add(headshell);

  const cartridgeNeedle = new THREE.Mesh(
    trackGeo(new THREE.ConeGeometry(0.015, 0.04, 12)),
    emissiveAccentMat
  );
  cartridgeNeedle.position.set(-0.52, 0.06, 1.06);
  cartridgeNeedle.rotation.x = Math.PI;
  tonearmPivot.add(cartridgeNeedle);

  tonearmPivot.rotation.y = 0.18;
  turntableGroup.add(tonearmPivot);
  ttExplode.push({ object: tonearmPivot, restY: 0.37, offsetY: 0.72 });

  // Pitch fader + Cue button
  const pitchSlot = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.09, 0.02, 0.74)),
    matteRubberMat
  );
  pitchSlot.position.set(1.0, 0.365, 0.25);
  turntableGroup.add(pitchSlot);

  const pitchKnob = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.11, 0.045, 0.09)),
    accentMetalMat
  );
  pitchKnob.position.set(1.0, 0.39, 0.22);
  turntableGroup.add(pitchKnob);

  const cueLedMat = trackMat(emissiveAccentMat.clone());
  const cueBtn = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.075, 0.08, 0.03, 24)),
    cueLedMat
  );
  cueBtn.position.set(-1.02, 0.37, 0.72);
  turntableGroup.add(cueBtn);

  // 2. COMPOSITE HERO MODELS: LEFT & RIGHT 3-WAY STUDIO MONITORS
  const kevlarTex = trackTex(createKevlarConeTexture(maxAniso));
  const kevlarMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: kevlarTex,
      roughness: 0.84,
      metalness: 0.08,
    })
  );

  const createMonitorTower = (xPos: number, rotY: number): MonitorRig => {
    const group = new THREE.Group();
    group.position.set(xPos, 0, -0.75);
    group.rotation.y = rotY;
    const mExplode: ExplodeEntry[] = [];

    const mShadow = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(1.5, 1.5)), shadowDecalMat);
    mShadow.rotation.x = -Math.PI / 2;
    mShadow.position.y = 0.002;
    group.add(mShadow);

    const standBase = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.38, 0.44, 0.05, 32)),
      topPlateMat
    );
    standBase.position.y = 0.025;
    standBase.castShadow = true;
    standBase.receiveShadow = true;
    group.add(standBase);

    const standPole = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.065, 0.08, 0.56, 24)),
      chassisMat
    );
    standPole.position.y = 0.33;
    standPole.castShadow = true;
    group.add(standPole);

    const cabinetGroup = new THREE.Group();
    cabinetGroup.position.y = 0.62;

    const cabShape = createRoundedRectShape(0.84, 0.72, 0.08);
    const cabGeo = trackGeo(
      new THREE.ExtrudeGeometry(cabShape, {
        depth: 1.18,
        bevelEnabled: true,
        bevelThickness: 0.03,
        bevelSize: 0.03,
        bevelSegments: 4,
      })
    );
    cabGeo.rotateX(-Math.PI / 2);
    const cabinetMesh = new THREE.Mesh(cabGeo, chassisMat);
    cabinetMesh.castShadow = true;
    cabinetMesh.receiveShadow = true;
    cabinetGroup.add(cabinetMesh);

    const wooferProfile = [
      new THREE.Vector2(0.04, 0),
      new THREE.Vector2(0.09, 0.035),
      new THREE.Vector2(0.24, -0.05),
      new THREE.Vector2(0.28, 0.01),
    ];
    const wooferGeo = trackGeo(new THREE.LatheGeometry(wooferProfile, 40));
    wooferGeo.rotateX(Math.PI / 2);
    const wooferCone = new THREE.Mesh(wooferGeo, kevlarMat);
    wooferCone.position.set(0, 0.44, 0.37);
    cabinetGroup.add(wooferCone);

    const trimRingMat = accentMetalMat;
    const wooferTrim = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(0.285, 0.02, 16, 48)),
      trimRingMat
    );
    wooferTrim.position.set(0, 0.44, 0.385);
    cabinetGroup.add(wooferTrim);

    const tweeterHornProfile = [
      new THREE.Vector2(0.04, 0.02),
      new THREE.Vector2(0.08, -0.02),
      new THREE.Vector2(0.14, 0.01),
    ];
    const tweeterGeo = trackGeo(new THREE.LatheGeometry(tweeterHornProfile, 32));
    tweeterGeo.rotateX(Math.PI / 2);
    const tweeterMesh = new THREE.Mesh(tweeterGeo, topPlateMat);
    tweeterMesh.position.set(0, 0.92, 0.37);
    cabinetGroup.add(tweeterMesh);

    const tweeterDome = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.048, 24, 16)),
      accentMetalMat
    );
    tweeterDome.position.set(0, 0.92, 0.38);
    cabinetGroup.add(tweeterDome);

    const statusBadge = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.14, 0.022, 0.02)),
      emissiveAccentMat
    );
    statusBadge.position.set(0, 0.11, 0.385);
    cabinetGroup.add(statusBadge);

    group.add(cabinetGroup);
    mExplode.push({ object: cabinetGroup, restY: 0.62, offsetY: 0.42 });

    return { group, wooferCone, trimRingMaterial: trimRingMat, explodeEntries: mExplode };
  };

  const leftMonitor = createMonitorTower(-2.45, 0.38);
  const rightMonitor = createMonitorTower(2.45, -0.38);

  // 3. COMPOSITE HERO MODEL: CENTER ANALOG TUBE PREAMP + VU CONSOLE
  const preampGroup = new THREE.Group();
  preampGroup.position.set(0, 0, -1.25);
  const pExplode: ExplodeEntry[] = [];

  const pShadow = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(2.5, 1.4)), shadowDecalMat);
  pShadow.rotation.x = -Math.PI / 2;
  pShadow.position.y = 0.002;
  preampGroup.add(pShadow);

  const pFootGeo = trackGeo(new THREE.CylinderGeometry(0.07, 0.08, 0.05, 20));
  [
    [-0.9, -0.35],
    [0.9, -0.35],
    [-0.9, 0.35],
    [0.9, 0.35],
  ].forEach(([px, pz]) => {
    const f = new THREE.Mesh(pFootGeo, matteRubberMat);
    f.position.set(px, 0.025, pz);
    preampGroup.add(f);
  });

  const preampShape = createRoundedRectShape(2.1, 0.88, 0.07);
  const preampBoxGeo = trackGeo(
    new THREE.ExtrudeGeometry(preampShape, {
      depth: 0.42,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.025,
      bevelSegments: 3,
    })
  );
  preampBoxGeo.rotateX(-Math.PI / 2);
  const preampBody = new THREE.Mesh(preampBoxGeo, chassisMat);
  preampBody.position.y = 0.05;
  preampBody.castShadow = true;
  preampBody.receiveShadow = true;
  preampGroup.add(preampBody);

  const preampFace = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(1.98, 0.34, 0.03)),
    topPlateMat
  );
  preampFace.position.set(0, 0.27, 0.46);
  preampGroup.add(preampFace);

  // VU Meter Face + Needle
  const vuTex = trackTex(createVuMeterTexture(maxAniso));
  const vuFaceMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: vuTex,
      emissiveMap: vuTex,
      emissive: 0xffd28a,
      emissiveIntensity: 0.55,
      roughness: 0.3,
    })
  );
  const vuScreen = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.58, 0.24)), vuFaceMat);
  vuScreen.position.set(0, 0.29, 0.478);
  preampGroup.add(vuScreen);

  const vuNeedleGroup = new THREE.Group();
  vuNeedleGroup.position.set(0, 0.19, 0.483);
  const needleBar = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.01, 0.19, 0.008)),
    matteRubberMat
  );
  needleBar.position.y = 0.095;
  vuNeedleGroup.add(needleBar);
  preampGroup.add(vuNeedleGroup);

  // Rotary Knobs (4x LatheGeometry)
  const knobGeo = trackGeo(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(0.065, 0),
        new THREE.Vector2(0.062, 0.055),
        new THREE.Vector2(0.048, 0.072),
        new THREE.Vector2(0, 0.072),
      ],
      28
    )
  );
  knobGeo.rotateX(Math.PI / 2);
  [-0.74, -0.52, 0.52, 0.74].forEach((kx) => {
    const knob = new THREE.Mesh(knobGeo, accentMetalMat);
    knob.position.set(kx, 0.26, 0.475);
    knob.castShadow = true;
    preampGroup.add(knob);
  });

  // Vacuum Tubes (2x Borosilicate Lathe Glass + Glowing Filament Cores)
  const glassMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.08,
      metalness: 0.0,
      transmission: isSoftwareGl ? 0 : 0.9,
      thickness: 0.35,
      ior: 1.52,
      transparent: true,
      opacity: isSoftwareGl ? 0.36 : 1.0,
      depthWrite: false,
      clearcoat: 1.0,
    })
  );
  const tubeProfile = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.095, 0),
    new THREE.Vector2(0.095, 0.24),
    new THREE.Vector2(0.07, 0.32),
    new THREE.Vector2(0.025, 0.355),
    new THREE.Vector2(0, 0.36),
  ];
  const tubeGlassGeo = trackGeo(new THREE.LatheGeometry(tubeProfile, 28));
  const filamentMaterials: THREE.MeshStandardMaterial[] = [];

  [-0.55, 0.55].forEach((tx) => {
    const tubeGroup = new THREE.Group();
    tubeGroup.position.set(tx, 0.49, 0);

    const collar = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.105, 0.11, 0.05, 24)),
      accentMetalMat
    );
    collar.position.y = 0.025;
    tubeGroup.add(collar);

    const filamentMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffaa33,
        emissive: 0xff7b00,
        emissiveIntensity: 2.2,
        roughness: 0.2,
      })
    );
    filamentMaterials.push(filamentMat);

    const filament = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.028, 0.028, 0.19, 16)),
      filamentMat
    );
    filament.position.y = 0.15;
    tubeGroup.add(filament);

    const glassMesh = new THREE.Mesh(tubeGlassGeo, glassMat);
    glassMesh.position.y = 0.04;
    glassMesh.renderOrder = 4;
    tubeGroup.add(glassMesh);

    preampGroup.add(tubeGroup);
    pExplode.push({ object: tubeGroup, restY: 0.49, offsetY: 0.48 });
  });

  // 4. 48-BAR INSTANCED 3D SPECTRUM ARRAY
  const barCount = 48;
  const barGeo = trackGeo(new THREE.BoxGeometry(0.11, 1.0, 0.11));
  barGeo.translate(0, 0.5, 0); // bottom-center pivot
  const barMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.24,
      metalness: 0.78,
      emissive: 0x331800,
      emissiveIntensity: 0.55,
    })
  );
  const instancedMesh = new THREE.InstancedMesh(barGeo, barMat, barCount);
  instancedMesh.frustumCulled = false;
  instancedMesh.castShadow = false;
  instancedMesh.receiveShadow = false;

  const basePositions: { x: number; z: number; angle: number }[] = [];
  const dummy = new THREE.Object3D();
  const baseColor = new THREE.Color();

  for (let i = 0; i < barCount; i++) {
    const t = i / (barCount - 1);
    const angle = Math.PI * 0.14 + t * Math.PI * 0.72;
    const radius = 3.55;
    const x = -Math.cos(angle) * radius;
    const z = -Math.sin(angle) * radius * 0.78 - 0.15;
    basePositions.push({ x, z, angle });

    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, -angle + Math.PI / 2, 0);
    dummy.scale.set(1, 0.35, 1);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(i, dummy.matrix);

    baseColor.setHSL(0.08 + t * 0.06, 0.9, 0.55);
    instancedMesh.setColorAt(i, baseColor);
  }
  instancedMesh.instanceMatrix.needsUpdate = true;
  if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;
  instancedMesh.computeBoundingSphere();

  return {
    turntable: {
      group: turntableGroup,
      platterGroup,
      vinylDisc,
      tonearmPivot,
      cueLedMaterial: cueLedMat,
      explodeEntries: ttExplode,
    },
    preamp: {
      group: preampGroup,
      filamentMaterials,
      vuNeedleGroup,
      explodeEntries: pExplode,
    },
    leftMonitor,
    rightMonitor,
    spectrum: {
      instancedMesh,
      count: barCount,
      basePositions,
    },
    swatchMaterials: {
      chassisMat,
      topPlateMat,
      accentMetalMat,
      emissiveAccentMat,
    },
    stageFloorMat,
    disposables: {
      geometries,
      materials,
      textures,
    },
  };
}
