
import { FilesetResolver, HandLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';

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
      // Basic palm position (Wrist is landmark 0)
      const palm = landmarks[0]; 
      
      const thumbTip = landmarks[4];
      const indexTip = landmarks[8];
      const middleTip = landmarks[ middleTipIndex(landmarks) ? 12 : 12 ]; // Using index 12 directly
      const pinkyTip = landmarks[20];

      const dist = (p1: any, p2: any) => Math.sqrt((p1.x-p2.x)**2 + (p1.y-p2.y)**2);
      
      // Open palm logic: fingertips are far from wrist
      const isOpen = dist(indexTip, palm) > 0.2 && dist(pinkyTip, palm) > 0.2;
      
      // Pinch logic: thumb and index tips are close
      const pinchDist = dist(thumbTip, indexTip);
      const isPinching = pinchDist < 0.04;

      return {
        landmarks,
        palm: { x: (1 - palm.x) * 2 - 1, y: -(palm.y * 2 - 1), z: palm.z * -5 },
        isRight: results.handedness?.[index]?.[0]?.categoryName === "Right",
        isOpen,
        isPinching,
        distanceFromCamera: Math.abs(palm.z)
      };
    });
  }
}

function middleTipIndex(landmarks: any) {
    return 12;
}
