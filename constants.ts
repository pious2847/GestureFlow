
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
  { id: 'AUDIO_REACTIVE', label: 'Audio', icon: '🔊' },
  { id: 'AI_ORACLE', label: 'Oracle', icon: '🔮' }
];

export const PHYSICS = {
  // Movement & Damping
  friction: 0.96,
  maxSpeed: 0.6,
  minSpeed: 0.001,
  
  // Hand Interaction Forces
  attractForce: 0.03,
  attractFalloff: 8.0, 
  repelForce: 0.3,
  repelFalloff: 9.0, 
  
  // Rasengan / Compression Forces
  compressionThreshold: 3.5, // Distance between hands to trigger Rasengan
  compressionForce: 0.15,
  vortexSpin: 0.2,
  
  // Specialized Forces
  vortexForce: 0.015,
  vortexRadius: 4.5,
  noiseStrength: 0.001, 
  audioForceMultiplier: 0.8, 
  
  // Shape & Home Logic
  returnHomeForce: 0.004,
  shapeConvergenceForce: 0.012,
  shapeConvergenceFalloff: 12.0,
  
  // Boundary & Smoothing
  boundaryDamping: 0.9,
  boundaryLimit: 40,
  silhouetteSmoothing: 0.15,
  
  // Transition Speeds
  modeTransitionDuration: 1.2,
  colorTransitionSpeed: 0.05
};

export const PARTICLE_VISUALS = {
  // Size Dynamics
  baseSize: 0.002,
  sizeVariation: 0.005,
  growthScale: 0.6,
  
  // Color & Gradient Granularity
  hueRange: { min: 0.55, max: 0.9 }, 
  saturation: 0.95,
  lightness: 0.5,
  opacity: 0.12,
  
  // Velocity-Visual Mapping
  speedHueInfluence: 5.0,
  speedSizeInfluence: 0.15,
  
  // Blending
  additiveBlending: true
};

export const DRAWING_CONFIG = {
  NEON: { size: 0.08, opacity: 0.4, color: '#ff00d4', glow: 1.2, decay: 0.99, jitter: 0.02 },
  SMOKE: { size: 0.15, opacity: 0.05, color: '#ffffff', glow: 0.1, decay: 0.94, jitter: 0.08 },
  TRAIL: { size: 0.02, opacity: 0.6, color: '#00f2ff', glow: 1.8, decay: 0.995, jitter: 0.01 },
  PLASMA: { size: 0.12, opacity: 0.3, color: '#7000ff', glow: 1.0, decay: 0.96, jitter: 0.05 }
};
