
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Experience from './components/Experience';
import { HandTracker } from './services/handTracker';
import { AppMode, HandData, DrawingStyle, SceneConfig } from './types';
import { MODES, THEME, PHYSICS } from './constants';
import gsap from 'gsap';
import { GoogleGenAI, Type } from "@google/genai";

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.PLAYGROUND);
  const [uiHands, setUiHands] = useState<HandData[]>([]);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [drawStyle, setDrawStyle] = useState<DrawingStyle>(DrawingStyle.NEON);
  
  // AI State
  const [aiConfig, setAiConfig] = useState<SceneConfig | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [showAiInput, setShowAiInput] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const uiRef = useRef<HTMLDivElement>(null);

  const handsRef = useRef<HandData[]>([]);
  const lastHandsPosRef = useRef<number[]>([]);
  const lastSwitchTimeRef = useRef<number>(0);
  const lastUiUpdateRef = useRef<number>(0);

  const handleModeChange = useCallback((newMode: AppMode) => {
    if (newMode === mode) return;
    if (newMode === AppMode.AI_ORACLE) {
      setShowAiInput(true);
    }
    
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
        contents: `Architect a 3D particle world based on this vibe: "${aiPrompt}". Return a JSON configuration for the engine.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              primary: { type: Type.STRING, description: "A hex color code representing the main energy." },
              secondary: { type: Type.STRING, description: "A hex color code for the ambient nebula." },
              accent: { type: Type.STRING, description: "A hex color code for high-velocity highlights." },
              friction: { type: Type.NUMBER, description: "Value between 0.8 (sticky/water) and 0.98 (zero-g frictionless)." },
              attractForce: { type: Type.NUMBER, description: "Strength of hand attraction (0.01 to 0.2)." },
              repelForce: { type: Type.NUMBER, description: "Strength of fist repulsion (0.1 to 1.0)." },
              maxSpeed: { type: Type.NUMBER, description: "Limit of particle velocity (0.2 to 2.0)." },
              particleSize: { type: Type.NUMBER, description: "Radius of particles (0.005 to 0.08)." },
              label: { type: Type.STRING, description: "A poetic 1-3 word name for this world." }
            },
            required: ["primary", "secondary", "accent", "friction", "attractForce", "repelForce", "maxSpeed", "particleSize", "label"]
          }
        }
      });

      const config = JSON.parse(response.text.trim()) as SceneConfig;
      setAiConfig(config);
      setShowAiInput(false);
    } catch (error) {
      console.error("Oracle failed to speak:", error);
    } finally {
      setIsAiLoading(false);
    }
  };

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
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyzer = audioCtx.createAnalyser();
        analyzer.fftSize = 256;
        source.connect(analyzer);
        audioContextRef.current = audioCtx;
        analyzerRef.current = analyzer;
      } catch (err) {
        console.error("Initialization failed:", err);
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

      {/* AI Oracle Overlay */}
      {showAiInput && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl transition-all">
          <div className="w-full max-w-xl p-10 bg-white/5 border border-white/10 rounded-[3rem] shadow-2xl flex flex-col items-center gap-8 animate-in fade-in zoom-in duration-500">
            <div className="text-4xl">🔮</div>
            <h2 className="text-2xl font-black uppercase tracking-[0.3em] text-center">Consult the Oracle</h2>
            <p className="text-xs text-white/40 uppercase tracking-widest text-center">Describe the world you wish to manifest</p>
            <input 
              autoFocus
              className="w-full bg-white/5 border-b-2 border-white/20 p-4 text-xl text-center outline-none focus:border-cyan-400 transition-colors"
              placeholder="e.g. A digital rainstorm in Kyoto"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && generateOracleWorld()}
            />
            <button 
              disabled={isAiLoading}
              onClick={generateOracleWorld}
              className={`px-12 py-4 rounded-full font-black uppercase tracking-widest transition-all ${isAiLoading ? 'bg-white/10 text-white/20' : 'bg-cyan-500 hover:bg-cyan-400 text-black hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(6,182,212,0.5)]'}`}
            >
              {isAiLoading ? 'WEAVING REALITY...' : 'WARP'}
            </button>
            <button onClick={() => setShowAiInput(false)} className="text-[10px] uppercase font-bold text-white/30 hover:text-white">Cancel</button>
          </div>
        </div>
      )}

      {/* Mode Header */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 text-center pointer-events-none">
        <h1 className="text-4xl font-black uppercase tracking-[0.4em] text-white/80">{aiConfig?.label || mode}</h1>
        {aiConfig && mode === AppMode.AI_ORACLE && (
          <div className="mt-2 px-4 py-1 bg-cyan-500/10 border border-cyan-400/20 rounded-full inline-block">
            <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">Neural Seed Active</span>
          </div>
        )}
      </div>

      <div className="absolute top-6 left-6 group z-50">
        <div className="w-48 h-32 rounded-2xl border border-white/10 overflow-hidden bg-black/40 backdrop-blur-md relative">
          <video ref={videoRef} autoPlay muted playsInline className={`w-full h-full object-cover transform scale-x-[-1] transition-opacity duration-1000 ${isCameraReady ? 'opacity-40' : 'opacity-0'}`} />
          {!isCameraReady && <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white/30 animate-pulse text-center uppercase tracking-widest">Neural Link Init...</div>}
        </div>
      </div>

      <div className="absolute top-6 right-6 flex flex-col gap-3 z-50 items-end">
        {uiHands.map((hand, i) => (
          <div key={i} className="px-5 py-3 bg-white/5 border border-white/10 rounded-xl backdrop-blur-2xl flex items-center gap-4">
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400">Hand_{hand.isRight ? 'R' : 'L'}</span>
              <span className="text-[8px] text-white/40 uppercase font-bold">{hand.isOpen ? 'Attract' : (hand.isPinching ? 'Draw' : 'Burst')}</span>
            </div>
            <div className={`w-1 h-6 rounded-full bg-gradient-to-t from-transparent ${hand.isOpen ? 'to-cyan-400' : 'to-purple-500'} opacity-50`} />
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
              className={`px-8 py-4 rounded-[2rem] flex items-center gap-3 transition-all duration-500 group relative overflow-hidden ${
                mode === m.id 
                ? 'bg-white text-black shadow-[0_20px_40px_rgba(255,255,255,0.15)] scale-105' 
                : 'text-white/40 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="text-xl group-hover:scale-125 transition-transform duration-300">{m.icon}</span>
              <span className="font-black text-[10px] uppercase tracking-[0.2em]">{m.label}</span>
              {m.id === AppMode.AI_ORACLE && <div className="absolute top-0 right-2 w-1 h-1 bg-cyan-400 rounded-full animate-ping" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default App;
