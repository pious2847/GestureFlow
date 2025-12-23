
export const PARTICLE_COUNT = 30000;
export const MAX_DRAW_POINTS = 5000;
export const CANVAS_WIDTH = window.innerWidth;
export const CANVAS_HEIGHT = window.innerHeight;

export const THEME = {
  primary: '#00f2ff',
  secondary: '#7000ff',
  accent: '#ff00d4',
  bg: '#020204',
  energy: '#00ffff',
  star: '#ffffff'
};

export const MODES = [
  { id: 'PLAYGROUND', label: 'Playground', icon: '✨' },
  { id: 'AIR_DRAWING', label: 'Air Draw', icon: '🎨' },
  { id: 'SILHOUETTE', label: 'Mirror', icon: '👤' },
  { id: 'AUDIO_REACTIVE', label: 'Audio', icon: '🔊' }
];

export const PHYSICS = {
  friction: 0.94,
  attractForce: 0.05,
  attractFalloff: 4.0,
  repelForce: 0.45,
  repelFalloff: 5.0,
  compressForce: 0.06,
  compressFalloff: 6.0,
  vortexForce: 0.02,
  vortexRadius: 3.5,
  maxSpeed: 0.8,
  minSpeed: 0.01,
  falloff: 4.5, // Legacy/Default interaction radius
  silhouetteSmoothing: 0.08,
  returnHomeForce: 0.02,
  boundaryDamping: 0.9,
  boundaryLimit: 15
};

export const PARTICLE_VISUALS = {
  baseSize: 0.02,
  sizeVariation: 0.03,
  hueRange: { min: 0.5, max: 0.85 }, // Cyan to Purple
  saturation: 0.8,
  lightness: 0.5,
  opacity: 0.8
};

export const DRAWING_CONFIG = {
  NEON: { size: 0.12, opacity: 0.8, color: '#ff00d4', glow: 1.5 },
  SMOKE: { size: 0.25, opacity: 0.2, color: '#ffffff', glow: 0.5 },
  TRAIL: { size: 0.05, opacity: 1.0, color: '#00f2ff', glow: 2.0 },
  PLASMA: { size: 0.18, opacity: 0.6, color: '#7000ff', glow: 1.2 }
};
