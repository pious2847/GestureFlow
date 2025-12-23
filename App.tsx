
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Experience from './components/Experience';
import { HandTracker } from './services/handTracker';
import { AppMode, HandData, DrawingStyle } from './types';
import { MODES, THEME } from './constants';
import gsap from 'gsap';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.PLAYGROUND);
  const [uiHands, setUiHands] = useState<HandData[]>([]); // Throttled for UI
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [drawStyle, setDrawStyle] = useState<DrawingStyle>(DrawingStyle.NEON);

  const videoRef = useRef<HTMLVideoElement>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const uiRef = useRef<HTMLDivElement>(null);

  // Performance Optimization: Use Ref for real-time 3D loop to bypass React render cycle
  const handsRef = useRef<HandData[]>([]);
  const lastHandsPosRef = useRef<number[]>([]);
  const lastSwitchTimeRef = useRef<number>(0);
  const lastUiUpdateRef = useRef<number>(0);

  const handleModeChange = useCallback((newMode: AppMode) => {
    if (newMode === mode) return;
    
    gsap.to(uiRef.current, { 
      opacity: 0, 
      y: 20, 
      duration: 0.2, 
      onComplete: () => {
        setMode(newMode);
        gsap.to(uiRef.current, { opacity: 1, y: 0, duration: 0.4, delay: 0.1 });
      }
    });
  }, [mode]);

  const detectSwipe = useCallback((currentHands: HandData[]) => {
    if (currentHands.length < 2) {
      lastHandsPosRef.current = [];
      return;
    }

    const now = Date.now();
    if (now - lastSwitchTimeRef.current < 1000) return;

    const avgX = (currentHands[0].palm.x + currentHands[1].palm.x) / 2;
    lastHandsPosRef.current.push(avgX);
    if (lastHandsPosRef.current.length > 10) lastHandsPosRef.current.shift();

    if (lastHandsPosRef.current.length === 10) {
      const delta = lastHandsPosRef.current[9] - lastHandsPosRef.current[0];
      if (Math.abs(delta) > 0.4) {
        const currentIndex = MODES.findIndex(m => m.id === mode);
        let nextIndex = currentIndex + (delta > 0 ? -1 : 1);
        if (nextIndex < 0) nextIndex = MODES.length - 1;
        if (nextIndex >= MODES.length) nextIndex = 0;
        
        handleModeChange(MODES[nextIndex].id as AppMode);
        lastSwitchTimeRef.current = now;
        lastHandsPosRef.current = [];
      }
    }
  }, [mode, handleModeChange]);

  useEffect(() => {
    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 640, height: 480 },
            audio: true 
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = async () => {
            trackerRef.current = new HandTracker();
            await trackerRef.current.init(videoRef.current!);
            setIsCameraReady(true);
            requestAnimationFrame(detectLoop);
          };
        }

        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyzer = audioCtx.createAnalyser();
        analyzer.fftSize = 256;
        source.connect(analyzer);
        audioContextRef.current = audioCtx;
        analyzerRef.current = analyzer;
      } catch (err) {
        console.error("Camera/Mic access denied:", err);
      }
    };
    init();
  }, []);

  const detectLoop = useCallback(() => {
    const now = performance.now();
    if (trackerRef.current) {
      const results = trackerRef.current.detect();
      if (results) {
        handsRef.current = results;
        detectSwipe(results);

        // Throttle UI state updates to ~20fps to save CPU for WebGL/Hand-Tracking
        if (now - lastUiUpdateRef.current > 50) {
            setUiHands(results);
            lastUiUpdateRef.current = now;
        }
      } else {
        handsRef.current = [];
      }
    }

    if (analyzerRef.current) {
      const dataArray = new Uint8Array(analyzerRef.current.frequencyBinCount);
      analyzerRef.current.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
      setAudioLevel(avg / 255);
    }

    requestAnimationFrame(detectLoop);
  }, [detectSwipe]);

  return (
    <div className="relative w-screen h-screen bg-[#020204] overflow-hidden select-none text-white">
      <Experience 
        handsRef={handsRef} 
        mode={mode} 
        audioData={audioLevel} 
        showSkeleton={showSkeleton} 
        drawStyle={drawStyle} 
      />

      <div className="absolute top-6 left-6 group z-50">
        <div className="w-48 h-32 rounded-2xl border border-white/10 overflow-hidden bg-black/40 backdrop-blur-md relative">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className={`w-full h-full object-cover transform scale-x-[-1] transition-opacity duration-1000 ${isCameraReady ? 'opacity-40' : 'opacity-0'}`}
          />
          {!isCameraReady && (
            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white/30 animate-pulse tracking-widest px-4 text-center">
              INITIATING NEURAL LINK...
            </div>
          )}
          <div className="absolute bottom-2 left-2 flex gap-1">
             <div className={`w-1.5 h-1.5 rounded-full ${isCameraReady ? 'bg-cyan-500 shadow-[0_0_8px_#22c55e]' : 'bg-red-500'}`} />
             <div className="text-[8px] font-bold text-white/50 uppercase tracking-tighter">CAM_READY</div>
          </div>
        </div>
      </div>

      <div className="absolute top-6 right-6 flex flex-col gap-3 z-50 items-end">
        {uiHands.map((hand, i) => (
          <div key={i} className="px-5 py-3 bg-white/5 border border-white/10 rounded-xl backdrop-blur-2xl flex items-center gap-4 transition-all duration-300 hover:border-white/30">
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400">Hand_{hand.isRight ? 'R' : 'L'}</span>
              <span className="text-[8px] text-white/40 uppercase font-bold">
                {hand.isOpen ? 'Attract' : (hand.isPinching ? 'Draw' : 'Burst')}
              </span>
            </div>
            <div className={`w-1 h-6 rounded-full bg-gradient-to-t from-transparent ${hand.isOpen ? 'to-cyan-400' : 'to-purple-500'} opacity-50`} />
          </div>
        ))}
        
        <div className="flex gap-2 mt-2">
            <button 
                onClick={() => setShowSkeleton(!showSkeleton)}
                className={`px-4 py-2 rounded-full border text-[8px] font-bold uppercase tracking-widest transition-all ${showSkeleton ? 'bg-cyan-500/20 border-cyan-400 text-cyan-400' : 'bg-white/5 border-white/10 text-white/40'}`}
            >
                Skeleton
            </button>
            {mode === AppMode.AIR_DRAWING && (
                <div className="flex bg-white/5 border border-white/10 rounded-full overflow-hidden p-0.5">
                    {Object.values(DrawingStyle).map(style => (
                        <button 
                            key={style}
                            onClick={() => setDrawStyle(style)}
                            className={`px-3 py-1.5 text-[8px] font-bold uppercase tracking-tighter rounded-full transition-all ${drawStyle === style ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}
                        >
                            {style}
                        </button>
                    ))}
                </div>
            )}
        </div>
      </div>

      <div ref={uiRef} className="absolute bottom-12 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-6 w-full max-w-2xl px-6">
        <div className="flex gap-3 p-1.5 bg-black/60 border border-white/10 rounded-[2rem] backdrop-blur-3xl shadow-2xl">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => handleModeChange(m.id as AppMode)}
              className={`px-8 py-4 rounded-[1.5rem] flex items-center gap-3 transition-all duration-500 group relative overflow-hidden ${
                mode === m.id 
                ? 'bg-white text-black shadow-[0_20px_40px_rgba(255,255,255,0.15)] scale-105' 
                : 'text-white/40 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="text-xl group-hover:scale-125 transition-transform duration-300">{m.icon}</span>
              <span className="font-bold text-[10px] uppercase tracking-[0.2em]">{m.label}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap justify-center gap-x-10 gap-y-2 px-10 py-3 bg-white/[0.02] rounded-full border border-white/5 backdrop-blur-sm">
          <div className="text-[9px] text-white/30 uppercase tracking-[0.1em] font-medium flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" /> OPEN: ATTRACT
          </div>
          <div className="text-[9px] text-white/30 uppercase tracking-[0.1em] font-medium flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" /> FIST: BURST
          </div>
          <div className="text-[9px] text-white/30 uppercase tracking-[0.1em] font-medium flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-pink-500" /> PINCH: DRAW
          </div>
          <div className="text-[9px] text-white/50 uppercase tracking-[0.2em] font-bold animate-pulse">
            ↔ SWIPE TWO HANDS TO CYCLE MODES
          </div>
        </div>
      </div>

      <style>{`
        .vertical-text {
          writing-mode: vertical-lr;
          text-orientation: mixed;
        }
      `}</style>
    </div>
  );
};

export default App;
