
export enum AppMode {
  PLAYGROUND = 'PLAYGROUND',
  AIR_DRAWING = 'AIR_DRAWING',
  SILHOUETTE = 'SILHOUETTE',
  AUDIO_REACTIVE = 'AUDIO_REACTIVE'
}

export enum DrawingStyle {
  NEON = 'NEON',
  SMOKE = 'SMOKE',
  TRAIL = 'TRAIL',
  PLASMA = 'PLASMA'
}

export interface HandData {
  landmarks: Array<{ x: number, y: number, z: number }>;
  palm: { x: number, y: number, z: number };
  isRight: boolean;
  isOpen: boolean;
  isPinching: boolean;
  distanceFromCamera: number;
}

export interface GestureState {
  hands: HandData[];
  isClapping: boolean;
}
