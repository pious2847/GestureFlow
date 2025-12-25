
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Experience from './components/Experience';
import { HandTracker } from './services/handTracker';
import { AppMode, HandData, DrawingStyle, SceneConfig, HandGesture } from './types';
import { MODES, THEME, DRAWING_CONFIG } from './constants';
import gsap from 'gsap';
import { GoogleGenAI, Type } from "@google/genai";

const GESTURE_EMOJIS: Record<HandGesture, string> = {
  [HandGesture.NONE]: '✋',
  [HandGesture.PEACE]: '✌️',
  [HandGesture.ROCK]: '🤘',
  [HandGesture.THUMBS_UP]: '👍',
  [HandGesture.POINTER]: '☝️',
  [HandGesture.OK]: '👌'
};

const GESTURE_LABELS: Record<HandGesture, string> = {
  [HandGesture.NONE]: 'Neutral',
  [HandGesture.PEACE]: 'Chronos (Slow Mo)',
  [HandGesture.ROCK]: 'Entropy (Chaos)',
  [HandGesture.THUMBS_UP]: 'Crystal (Order)',
  [HandGesture.POINTER]: 'Precision Pulse',
  [HandGesture.OK]: 'System Balanced'
};

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.PLAYGROUND);
  const [uiHands, setUiHands] = useState<HandData[]>([]);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [drawStyle, setDrawStyle] = useState<DrawingStyle>(DrawingStyle.NEON);
  
  const [aiConfig, setAiConfig] = useState<SceneConfig | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [showAiInput, setShowAiInput] = useState(false);
  
  const [presets, setPresets] = useState<SceneConfig[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const uiRef = useRef<HTMLDivElement>(null);

  const handsRef = useRef<HandData[]>([]);
  const lastUiUpdateRef = useRef<number>(0);

  const lastHandXRef = useRef<number[]>([0, 0]);
  const gestureCooldownRef = useRef<number>(0);
  const swipeThreshold = 0.15; 

  useEffect(() => {
    const saved = localStorage.getItem('gestureflow_presets');
    if (saved) setPresets(JSON.parse(saved));
  }, []);

  const saveToPresets = useCallback(() => {
    if (!aiConfig) return;
    const newPresets = [{ ...aiConfig, id: Date.now().toString() }, ...presets];
    setPresets(newPresets);
    localStorage.setItem('gestureflow_presets', JSON.stringify(newPresets));
  }, [aiConfig, presets]);

  const deletePreset = (id: string) => {
    const newPresets = presets.filter(p => p.id !== id);
    setPresets(newPresets);
    localStorage.setItem('gestureflow_presets', JSON.stringify(newPresets));
  };

  const handleModeChange = useCallback((newMode: AppMode) => {
    if (newMode === mode) return;
    if (newMode === AppMode.AI_ORACLE) setShowAiInput(true);
    
    gsap.to(uiRef.current, { 
      opacity: 0, y: 20, duration: 0.2, 
      onComplete: () => {
        setMode(newMode);
        gsap.to(uiRef.current, { opacity: 1, y: 0, duration: 0.4, delay: 0.1 });
      }
    });
  }, [mode]);

  const cycleMode = useCallback((direction: number) => {
    const modeList = MODES.map(m => m.id as AppMode);
    const currentIndex = modeList.indexOf(mode);
    let nextIndex = (currentIndex + direction) % modeList.length;
    if (nextIndex < 0) nextIndex = modeList.length - 1;
    handleModeChange(modeList[nextIndex]);
  }, [mode, handleModeChange]);

  const generateOracleWorld = async () => {
    if (!aiPrompt) return;
    setIsAiLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Manifest a volumetric 3D particle object and its corresponding energy field based on: "${aiPrompt}". 
        Provide exactly 128 vertices that form a 3D silhouette of the object described (e.g. a car, a tree, a heart, a planet).
        The vertices must be coordinates in 3D space ranging from -8 to 8.
        Also specify the physics properties (friction, force) that best match the "vibe" of the prompt.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              primary: { type: Type.STRING },
              secondary: { type: Type.STRING },
              accent: { type: Type.STRING },
              friction: { type: Type.NUMBER },
              attractForce: { type: Type.NUMBER },
              repelForce: { type: Type.NUMBER },
              maxSpeed: { type: Type.NUMBER },
              particleSize: { type: Type.NUMBER },
              label: { type: Type.STRING },
              shapeVertices: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER }, z: { type: Type.NUMBER } },
                  required: ["x", "y", "z"]
                }
              }
            },
            required: ["primary", "secondary", "accent", "friction", "attractForce", "repelForce", "maxSpeed", "particleSize", "label", "shapeVertices"]
          }
        }
      });
      const config = JSON.parse(response.text.trim()) as SceneConfig;
      setAiConfig(config);
      setShowAiInput(false);
    } catch (error) { console.error("Oracle error:", error); } 
    finally { setIsAiLoading(false); }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = async () => {
            trackerRef.current = new HandTracker();
            await trackerRef.current.init(videoRef.current!);
            setIsCameraReady(true);
            requestAnimationFrame(detectLoop);
          };
        }
        const audioCtx = new AudioContext();
        const analyzer = audioCtx.createAnalyser();
        audioCtx.createMediaStreamSource(stream).connect(analyzer);
        analyzerRef.current = analyzer;
      } catch (err) { console.error(err); }
    };
    init();
  }, []);

  const detectLoop = useCallback(() => {
    const now = performance.now();
    if (trackerRef.current) {
      const results = trackerRef.current.detect();
      if (results) {
        handsRef.current = results;
        if (results.length === 2 && now > gestureCooldownRef.current) {
          const h1 = results[0].palm;
          const h2 = results[1].palm;
          const dx1 = h1.x - lastHandXRef.current[0];
          const dx2 = h2.x - lastHandXRef.current[1];
          if (dx1 > swipeThreshold && dx2 > swipeThreshold) { cycleMode(-1); gestureCooldownRef.current = now + 1000; } 
          else if (dx1 < -swipeThreshold && dx2 < -swipeThreshold) { cycleMode(1); gestureCooldownRef.current = now + 1000; }
          lastHandXRef.current[0] = h1.x; lastHandXRef.current[1] = h2.x;
        } else if (results.length === 1) { lastHandXRef.current[0] = results[0].palm.x; }
        if (now - lastUiUpdateRef.current > 50) { setUiHands(results); lastUiUpdateRef.current = now; }
      } else { handsRef.current = []; }
    }
    if (analyzerRef.current) {
      const dataArray = new Uint8Array(analyzerRef.current.frequencyBinCount);
      analyzerRef.current.getByteFrequencyData(dataArray);
      setAudioLevel(dataArray.reduce((a, b) => a + b) / dataArray.length / 255);
    }
    requestAnimationFrame(detectLoop);
  }, [cycleMode]);

  return (
    <div className="relative w-screen h-screen bg-[#020204] overflow-hidden select-none text-white font-['Space_Grotesk']">
      <Experience handsRef={handsRef} mode={mode} audioData={audioLevel} showSkeleton={showSkeleton} drawStyle={drawStyle} aiConfig={aiConfig} />

      {showAiInput && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl p-6">
          <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-8 p-10 bg-white/5 border border-white/10 rounded-[3rem] shadow-[0_0_100px_rgba(0,0,0,0.8)] overflow-hidden">
            <div className="md:col-span-2 flex flex-col items-center gap-8 justify-center border-b md:border-b-0 md:border-r border-white/10 pb-8 md:pb-0 md:pr-10">
              <div className="text-5xl drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]">🧞</div>
              <h2 className="text-3xl font-black uppercase tracking-[0.4em] text-center">Oracle Synthesis</h2>
              <div className="w-full relative group">
                <input 
                  autoFocus
                  className="w-full bg-white/5 border-b-2 border-white/10 p-6 text-2xl text-center outline-none focus:border-cyan-400 transition-all placeholder:text-white/10"
                  placeholder="e.g. A crystalline Ferrari, a ghostly oak tree..."
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && generateOracleWorld()}
                />
              </div>
              <div className="flex gap-6 mt-4">
                <button disabled={isAiLoading || !aiPrompt} onClick={generateOracleWorld} className="px-14 py-5 rounded-full font-black uppercase tracking-widest text-[10px] transition-all bg-cyan-500 text-black hover:scale-110 active:scale-95 shadow-xl">
                  {isAiLoading ? 'Synthesizing...' : 'Manifest Reality'}
                </button>
              </div>
              <button onClick={() => setShowAiInput(false)} className="text-[10px] text-white/20 uppercase font-black hover:text-white">Return</button>
            </div>
            <div className="flex flex-col gap-5 overflow-y-auto max-h-[60vh] pr-4 custom-scrollbar">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400">Memory Presets</h3>
              {presets.map((p) => (
                <div key={p.id} className="p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-cyan-400/50 cursor-pointer" onClick={() => { setAiConfig(p); setShowAiInput(false); setMode(AppMode.AI_ORACLE); }}>
                  <span className="text-[11px] font-black uppercase">{p.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mode and Sub-Settings UI */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 text-center pointer-events-none">
        <h1 className="text-4xl font-black uppercase tracking-[0.4em] text-white/80 animate-pulse">{aiConfig?.label || mode}</h1>
      </div>

      <div className="absolute top-6 left-6 z-50">
        <div className="w-48 h-32 rounded-3xl border border-white/10 overflow-hidden bg-black/60 backdrop-blur-md">
          <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover transform scale-x-[-1] opacity-40 hover:opacity-100 transition-opacity" />
        </div>
      </div>

      {/* Floating Indicators */}
      <div className="absolute top-6 right-6 flex flex-col gap-3 z-50 items-end">
        {uiHands.map((hand, i) => (
          <div key={i} className="px-6 py-4 bg-black/40 border border-white/10 rounded-3xl backdrop-blur-2xl flex items-center gap-5 shadow-2xl">
            <div className="text-3xl">{GESTURE_EMOJIS[hand.gesture]}</div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black uppercase text-cyan-400">Hand_{hand.isRight ? 'R' : 'L'}</span>
              <span className="text-[10px] text-white font-black uppercase">{GESTURE_LABELS[hand.gesture]}</span>
            </div>
          </div>
        ))}
        <button 
          onClick={() => setShowSkeleton(!showSkeleton)} 
          className={`px-6 py-3 rounded-full border text-[9px] font-black uppercase tracking-widest transition-all ${
            showSkeleton ? 'bg-cyan-500/20 border-cyan-400 text-cyan-400' : 'bg-black/40 border-white/10 text-white/40'
          }`}
        >
          Skeleton
        </button>
      </div>

      {/* Mode Menu and Style Toggles */}
      <div ref={uiRef} className="absolute bottom-12 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-6 w-full max-w-4xl px-6">
        {mode === AppMode.AIR_DRAWING && (
          <div className="flex gap-3 mb-2 animate-in fade-in slide-in-from-bottom-4">
            {Object.keys(DRAWING_CONFIG).map((style) => (
              <button
                key={style}
                onClick={() => setDrawStyle(style as DrawingStyle)}
                className={`px-6 py-2 rounded-full border text-[8px] font-black uppercase tracking-widest transition-all ${
                  drawStyle === style ? 'bg-white text-black border-white' : 'bg-black/40 border-white/10 text-white/40 hover:text-white'
                }`}
              >
                {style}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-4 p-2 bg-black/80 border border-white/10 rounded-[3rem] backdrop-blur-3xl shadow-2xl">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => handleModeChange(m.id as AppMode)}
              className={`px-8 py-4 rounded-[2.5rem] flex items-center gap-4 transition-all duration-300 ${
                mode === m.id ? 'bg-white text-black scale-105' : 'text-white/30 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="text-xl">{m.icon}</span>
              <span className="font-black text-[9px] uppercase tracking-[0.2em]">{m.label}</span>
            </button>
          ))}
        </div>
      </div>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 20px; }
      `}</style>
    </div>
  );
};

export default App;
