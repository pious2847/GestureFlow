
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Experience from './components/Experience';
import { HandTracker } from './services/handTracker';
import { AppMode, HandData, DrawingStyle, SceneConfig, HandGesture, Vec3 } from './types';
import { MODES, THEME } from './constants';
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
  const [drawStyle] = useState<DrawingStyle>(DrawingStyle.NEON);
  
  const [aiConfig, setAiConfig] = useState<SceneConfig | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [showAiInput, setShowAiInput] = useState(false);
  
  // Persistence
  const [presets, setPresets] = useState<SceneConfig[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const uiRef = useRef<HTMLDivElement>(null);

  const handsRef = useRef<HandData[]>([]);
  const lastUiUpdateRef = useRef<number>(0);

  useEffect(() => {
    const saved = localStorage.getItem('gestureflow_presets');
    if (saved) setPresets(JSON.parse(saved));
  }, []);

  const saveToPresets = useCallback(() => {
    if (!aiConfig) return;
    const newPresets = [...presets, { ...aiConfig, id: Date.now().toString() }];
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

  const generateOracleWorld = async () => {
    if (!aiPrompt) return;
    setIsAiLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Architect a 3D particle world and its central object based on: "${aiPrompt}". 
        If the prompt describes an object (like a car or tree), return 64-128 3D vertices that define its volume and silhouette. 
        Vertices must be within range -5 to 5.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              primary: { type: Type.STRING, description: "Main energy color hex" },
              secondary: { type: Type.STRING, description: "Ambient nebula color hex" },
              accent: { type: Type.STRING, description: "Highlight color hex" },
              friction: { type: Type.NUMBER, description: "0.8 (dense) to 0.99 (void)" },
              attractForce: { type: Type.NUMBER, description: "0.01 to 0.2" },
              repelForce: { type: Type.NUMBER },
              maxSpeed: { type: Type.NUMBER },
              particleSize: { type: Type.NUMBER },
              label: { type: Type.STRING, description: "Poetic name" },
              shapeVertices: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    x: { type: Type.NUMBER },
                    y: { type: Type.NUMBER },
                    z: { type: Type.NUMBER }
                  },
                  required: ["x", "y", "z"]
                },
                description: "3D points defining the object's core skeleton"
              }
            },
            required: ["primary", "secondary", "accent", "friction", "attractForce", "repelForce", "maxSpeed", "particleSize", "label", "shapeVertices"]
          }
        }
      });
      const config = JSON.parse(response.text.trim()) as SceneConfig;
      setAiConfig(config);
      setShowAiInput(false);
    } catch (error) {
      console.error("Oracle error:", error);
    } finally {
      setIsAiLoading(false);
    }
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
        if (now - lastUiUpdateRef.current > 50) {
            setUiHands(results);
            lastUiUpdateRef.current = now;
        }
      } else { handsRef.current = []; }
    }
    if (analyzerRef.current) {
      const dataArray = new Uint8Array(analyzerRef.current.frequencyBinCount);
      analyzerRef.current.getByteFrequencyData(dataArray);
      setAudioLevel(dataArray.reduce((a, b) => a + b) / dataArray.length / 255);
    }
    requestAnimationFrame(detectLoop);
  }, []);

  return (
    <div className="relative w-screen h-screen bg-[#020204] overflow-hidden select-none text-white font-['Space_Grotesk']">
      <Experience handsRef={handsRef} mode={mode} audioData={audioLevel} showSkeleton={showSkeleton} drawStyle={drawStyle} aiConfig={aiConfig} />

      {showAiInput && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-8 p-10 bg-white/5 border border-white/10 rounded-[3rem] shadow-2xl overflow-hidden">
            
            <div className="md:col-span-2 flex flex-col items-center gap-8 justify-center border-b md:border-b-0 md:border-r border-white/10 pb-8 md:pb-0 md:pr-8">
              <div className="text-4xl">🔮</div>
              <h2 className="text-2xl font-black uppercase tracking-[0.3em] text-center">Consult the Oracle</h2>
              <p className="text-xs text-white/40 uppercase text-center">Describe a world or an object (e.g. "A cyberpunk car in neon rain")</p>
              <input 
                autoFocus
                className="w-full bg-white/5 border-b-2 border-white/20 p-4 text-xl text-center outline-none focus:border-cyan-400 transition-colors"
                placeholder="A geometric glass tree..."
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && generateOracleWorld()}
              />
              <div className="flex gap-4">
                <button disabled={isAiLoading} onClick={generateOracleWorld} className="px-12 py-4 rounded-full font-black bg-cyan-500 text-black hover:scale-105 transition-transform active:scale-95">
                  {isAiLoading ? 'WEAVING...' : 'MANIFEST'}
                </button>
                {aiConfig && !isAiLoading && (
                  <button onClick={saveToPresets} className="px-6 py-4 rounded-full font-black border border-white/20 hover:bg-white/10 transition-all">
                    💾 Save
                  </button>
                )}
              </div>
              <button onClick={() => setShowAiInput(false)} className="text-[10px] text-white/30 uppercase font-bold hover:text-white">Close Oracle</button>
            </div>

            <div className="flex flex-col gap-4 overflow-y-auto max-h-[50vh] md:max-h-[60vh] pr-2 custom-scrollbar">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">Memory Bank</h3>
              {presets.length === 0 && <p className="text-[10px] text-white/20 italic">No saved engrams yet...</p>}
              {presets.map((p) => (
                <div key={p.id} className="group relative flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 hover:border-cyan-500/50 transition-all cursor-pointer" onClick={() => { setAiConfig(p); setShowAiInput(false); }}>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-8 rounded-full" style={{ background: p.primary }} />
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase truncate max-w-[120px]">{p.label}</span>
                      <span className="text-[8px] text-white/40 uppercase">Manifested Reality</span>
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); deletePreset(p.id!); }} className="opacity-0 group-hover:opacity-100 p-2 text-red-400 hover:text-red-300 transition-opacity">×</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 text-center pointer-events-none">
        <h1 className="text-4xl font-black uppercase tracking-[0.4em] text-white/80 animate-pulse">{aiConfig?.label || mode}</h1>
        {aiConfig?.shapeVertices && aiConfig.shapeVertices.length > 0 && (
            <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-cyan-400 mt-2">Volumetric Shape Active</p>
        )}
      </div>

      <div className="absolute top-6 left-6 z-50">
        <div className="w-48 h-32 rounded-2xl border border-white/10 overflow-hidden bg-black/40 backdrop-blur-md relative group">
          <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover transform scale-x-[-1] opacity-40 group-hover:opacity-100 transition-opacity" />
          {!isCameraReady && <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold animate-pulse uppercase tracking-widest">Neural Link Init...</div>}
        </div>
      </div>

      <div className="absolute top-6 right-6 flex flex-col gap-3 z-50 items-end">
        {uiHands.map((hand, i) => (
          <div key={i} className="px-5 py-3 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-2xl flex items-center gap-4 animate-in slide-in-from-right duration-300">
            <div className="text-2xl">{GESTURE_EMOJIS[hand.gesture]}</div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black uppercase text-cyan-400">Hand_{hand.isRight ? 'R' : 'L'}</span>
              <span className="text-[9px] text-white font-bold">{GESTURE_LABELS[hand.gesture]}</span>
            </div>
            <div className={`w-1 h-8 rounded-full bg-gradient-to-t from-transparent ${hand.gesture !== HandGesture.NONE ? 'to-cyan-400' : 'to-white/20'}`} />
          </div>
        ))}
        <button onClick={() => setShowSkeleton(!showSkeleton)} className={`px-4 py-2 rounded-full border text-[8px] font-bold uppercase tracking-widest transition-all ${showSkeleton ? 'bg-cyan-500/20 border-cyan-400 text-cyan-400' : 'bg-white/5 border-white/10 text-white/40'}`}>Skeleton</button>
      </div>

      <div ref={uiRef} className="absolute bottom-12 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-6 w-full max-w-4xl px-6">
        <div className="flex gap-3 p-1.5 bg-black/60 border border-white/10 rounded-[2.5rem] backdrop-blur-3xl shadow-2xl">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => handleModeChange(m.id as AppMode)}
              className={`px-8 py-4 rounded-[2rem] flex items-center gap-3 transition-all duration-500 ${
                mode === m.id 
                ? 'bg-white text-black shadow-lg scale-105' 
                : 'text-white/40 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="text-xl">{m.icon}</span>
              <span className="font-black text-[10px] uppercase tracking-[0.2em]">{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}</style>
    </div>
  );
};

export default App;
