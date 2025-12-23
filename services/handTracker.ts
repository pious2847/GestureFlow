
import { FilesetResolver, HandLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
import { HandGesture } from '../types';

export class HandTracker {
  private handLandmarker: any = null;
  private video: HTMLVideoElement | null = null;
  private lastVideoTime = -1;

  async init(video: HTMLVideoElement) {
    this.video = video;
    try {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
    } catch (error) {
      console.error("Failed to initialize HandLandmarker:", error);
      throw error;
    }
  }

  detect(): any {
    if (!this.handLandmarker || !this.video) return null;

    const startTimeMs = performance.now();
    if (this.lastVideoTime !== this.video.currentTime) {
      this.lastVideoTime = this.video.currentTime;
      const results = this.handLandmarker.detectForVideo(this.video, startTimeMs);
      return this.processResults(results);
    }
    return null;
  }

  private processResults(results: any) {
    if (!results || !results.landmarks || results.landmarks.length === 0) return [];

    return results.landmarks.map((landmarks: any, index: number) => {
      const palm = landmarks[0]; 
      const thumbTip = landmarks[4];
      const indexTip = landmarks[8];
      const middleTip = landmarks[12];
      const ringTip = landmarks[16];
      const pinkyTip = landmarks[20];

      // Calculate 3D distances
      const dist = (p1: any, p2: any) => Math.sqrt((p1.x-p2.x)**2 + (p1.y-p2.y)**2 + (p1.z-p2.z)**2);
      
      const isOpen = dist(indexTip, palm) > 0.3 && dist(pinkyTip, palm) > 0.3;
      const isPinching = dist(thumbTip, indexTip) < 0.05;

      // Finger Extension detection
      const isIndexUp = indexTip.y < landmarks[6].y;
      const isMiddleUp = middleTip.y < landmarks[10].y;
      const isRingUp = ringTip.y < landmarks[14].y;
      const isPinkyUp = pinkyTip.y < landmarks[18].y;
      const isThumbUp = thumbTip.y < landmarks[2].y && thumbTip.y < indexTip.y;

      // Logic for advanced gestures
      let gesture = HandGesture.NONE;

      if (isIndexUp && isMiddleUp && !isRingUp && !isPinkyUp) {
        gesture = HandGesture.PEACE;
      } else if (isIndexUp && isPinkyUp && !isMiddleUp && !isRingUp) {
        gesture = HandGesture.ROCK;
      } else if (isThumbUp && !isIndexUp && !isMiddleUp && !isRingUp && !isPinkyUp) {
        gesture = HandGesture.THUMBS_UP;
      } else if (isIndexUp && !isMiddleUp && !isRingUp && !isPinkyUp) {
        gesture = HandGesture.POINTER;
      } else if (dist(thumbTip, indexTip) < 0.04 && isMiddleUp && isRingUp && isPinkyUp) {
        gesture = HandGesture.OK;
      }

      return {
        landmarks,
        palm: { x: (1 - palm.x) * 2 - 1, y: -(palm.y * 2 - 1), z: palm.z * -5 },
        isRight: results.handedness?.[index]?.[0]?.categoryName === "Right",
        isOpen,
        isPinching,
        gesture,
        distanceFromCamera: Math.abs(palm.z)
      };
    });
  }
}
