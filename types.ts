
export enum AppMode {
  PLAYGROUND = 'PLAYGROUND',
  AIR_DRAWING = 'AIR_DRAWING',
  SILHOUETTE = 'SILHOUETTE',
  AUDIO_REACTIVE = 'AUDIO_REACTIVE',
  AI_ORACLE = 'AI_ORACLE'
}

export enum HandGesture {
  NONE = 'NONE',
  PEACE = 'PEACE',
  ROCK = 'ROCK',
  THUMBS_UP = 'THUMBS_UP',
  POINTER = 'POINTER',
  OK = 'OK'
}

export enum DrawingStyle {
  NEON = 'NEON',
  SMOKE = 'SMOKE',
  TRAIL = 'TRAIL',
  PLASMA = 'PLASMA'
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface SceneConfig {
  id?: string;
  primary: string;
  secondary: string;
  accent: string;
  friction: number;
  attractForce: number;
  repelForce: number;
  maxSpeed: number;
  particleSize: number;
  label: string;
  shapeVertices?: Vec3[]; // 3D points defining the object shape
}

export interface HandData {
  landmarks: Array<{ x: number, y: number, z: number }>;
  palm: { x: number, y: number, z: number };
  isRight: boolean;
  isOpen: boolean;
  isPinching: boolean;
  gesture: HandGesture;
  distanceFromCamera: number;
}

export interface GestureState {
  hands: HandData[];
  isClapping: boolean;
}
