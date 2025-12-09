const { useState, useEffect, useRef, useMemo, useCallback } = React;

// --- Icons (SVG Strings) ---
const Icons = {
    Mic: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>,
    Play: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
    Square: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>,
    Music: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
    List: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
    Cursor: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/></svg>,
    ChevronDown: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>,
    ChevronUp: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6"/></svg>
};

// --- Constants ---
const MAX_RECORD_TIME_MS = 10000; // 10 seconds
const BASE_SAMPLE_RATE = 44100;
const ZOOM_WINDOW_MS = 25; // 拡大表示する範囲 (ミリ秒)

// --- Helper: Audio Generators ---
const AudioGenerators = {
    simple: (ctx) => {
        const rate = ctx.sampleRate;
        const duration = 2; 
        const length = rate * duration;
        const buffer = ctx.createBuffer(1, length, rate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / rate;
            data[i] = 0.6 * Math.sin(2 * Math.PI * 440 * t) + 0.3 * Math.sin(2 * Math.PI * 880 * t);
            data[i] *= (1 - t/duration);
        }
        return buffer;
    },
    melody: (ctx) => {
        const rate = ctx.sampleRate;
        // C4, D4, E4, F4, G4, A4, B4, C5
        const notes = [
            { f: 261.63, d: 0.4 }, { f: 293.66, d: 0.4 }, { f: 329.63, d: 0.4 }, 
            { f: 349.23, d: 0.4 }, { f: 392.00, d: 0.4 }, { f: 440.00, d: 0.4 }, 
            { f: 493.88, d: 0.4 }, { f: 523.25, d: 0.8 }
        ];
        const totalDuration = notes.reduce((acc, n) => acc + n.d, 0);
        const length = Math.ceil(rate * totalDuration);
        const buffer = ctx.createBuffer(1, length, rate);
        const data = buffer.getChannelData(0);
        
        let offset = 0;
        notes.forEach(note => {
            const noteLen = Math.ceil(note.d * rate);
            for (let i = 0; i < noteLen; i++) {
                const t = i / rate;
                // Square-ish wave for retro feel
                let val = 0.3 * Math.sin(2 * Math.PI * note.f * t) + 0.1 * Math.sin(2 * Math.PI * note.f * 3 * t);
                // Envelope
                if (i < 500) val *= (i / 500);
                if (i > noteLen - 1000) val *= ((noteLen - i) / 1000);
                
                if (offset + i < length) data[offset + i] = val;
            }
            offset += noteLen;
        });
        return buffer;
    },
    chord: (ctx) => {
        const rate = ctx.sampleRate;
        const duration = 2.5;
        const length = rate * duration;
        const buffer = ctx.createBuffer(1, length, rate);
        const data = buffer.getChannelData(0);
        const freqs = [261.63, 329.63, 392.00, 523.25]; // C Major
        for (let i = 0; i < length; i++) {
            const t = i / rate;
            let val = 0;
            freqs.forEach(f => val += 0.2 * Math.sin(2 * Math.PI * f * t));
            val *= (1 - t/duration);
            data[i] = val;
        }
        return buffer;
    }
};

// --- Helper: Audio Processing Logic ---
const processAudioData = (rawBuffer, targetRate, bitDepth) => {
    if (!rawBuffer) return null;
    
    const rawData = rawBuffer.getChannelData(0);
    const length = rawData.length;
    const processedData = new Float32Array(length);
    
    // Sampling step size
    const step = Math.max(1, BASE_SAMPLE_RATE / targetRate);
    
    // Quantization levels
    const levels = Math.pow(2, bitDepth);
    const maxLevel = levels - 1;
    
    let currentVal = 0;

    for (let i = 0; i < length; i++) {
        // Sampling (Sample & Hold)
        if (i % Math.floor(step) === 0) {
            currentVal = rawData[i];
        }

        // Quantization
        let normalized = (currentVal + 1) / 2; // -1..1 -> 0..1
        normalized = Math.max(0, Math.min(1, normalized)); // clamp
        const quantizedInt = Math.round(normalized * maxLevel); // 0..maxLevel
        const quantizedFloat = (quantizedInt / maxLevel) * 2 - 1; // back to -1..1

        processedData[i] = quantizedFloat;
    }

    return processedData;
};

// --- Component: Waveform Canvas ---
const WaveformVisualizer = ({ originalData, processedData, targetRate, bitDepth, cursorIndex, onSetCursor, isInspectorOpen }) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);

    // Calculate window range
    const samplesPerMs = BASE_SAMPLE_RATE / 1000;
    const windowSizeSamples = Math.floor(ZOOM_WINDOW_MS * samplesPerMs); 
    // Center the view around the cursor, but keep within bounds
    let startSample = cursorIndex - Math.floor(windowSizeSamples / 2);
    if (startSample < 0) startSample = 0;
    if (originalData && startSample > originalData.length - windowSizeSamples) startSample = originalData.length - windowSizeSamples;
    const endSample = startSample + windowSizeSamples;

    // Helper to map coordinates
    const getX = (index, width) => ((index - startSample) / windowSizeSamples) * width;
    const getY = (val, height) => (1 - (val + 1) / 2) * height;
    const getIndexFromX = (x, width) => {
        const ratio = x / width;
        return Math.floor(ratio * windowSizeSamples) + startSample;
    };

    // Event Handlers for Cursor Interaction
    const handleMouseDown = (e) => {
        if (!isInspectorOpen) return;
        setIsDragging(true);
        updateCursor(e);
    };
    const handleMouseMove = (e) => {
        if (isDragging && isInspectorOpen) updateCursor(e);
    };
    const handleMouseUp = () => setIsDragging(false);
    const handleMouseLeave = () => setIsDragging(false);

    const updateCursor = (e) => {
        if (!originalData || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const newIndex = getIndexFromX(x, rect.width);
        
        if (newIndex >= 0 && newIndex < originalData.length) {
            onSetCursor(newIndex);
        }
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || !originalData) return;

        const ctx = canvas.getContext('2d');
        const width = container.clientWidth;
        const height = container.clientHeight;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);

        // Clear & Background
        ctx.fillStyle = '#ffffff'; 
        ctx.fillRect(0, 0, width, height);

        // Center Line (0V)
        ctx.strokeStyle = '#e2e8f0'; 
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        // 1. Original Waveform (Ghost)
        ctx.beginPath();
        ctx.strokeStyle = '#cbd5e1'; 
        ctx.lineWidth = 2;
        for (let i = startSample; i < endSample; i++) {
            const x = getX(i, width);
            const y = getY(originalData[i], height);
            if (i === startSample) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // 2. Processed Waveform
        if (processedData) {
            ctx.beginPath();
            ctx.strokeStyle = '#0891b2'; 
            ctx.lineWidth = 3;
            for (let i = startSample; i < endSample; i++) {
                const x = getX(i, width);
                const y = getY(processedData[i], height);
                if (i === startSample) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Sampling Points
            if (targetRate < 12000) {
                const step = BASE_SAMPLE_RATE / targetRate;
                ctx.fillStyle = '#f59e0b'; 
                for (let i = startSample; i < endSample; i++) {
                    // Just an approximation for visualization
                    if (Math.floor(i % step) === 0) {
                       const x = getX(i, width);
                       const y = getY(processedData[i], height);
                       ctx.beginPath();
                       ctx.arc(x, y, 3, 0, Math.PI * 2);
                       ctx.fill();
                    }
                }
            }
        }

        // 3. Cursor Line (Only when inspector is open)
        if (isInspectorOpen) {
            const cursorX = getX(cursorIndex, width);
            if (cursorX >= 0 && cursorX <= width) {
                ctx.beginPath();
                ctx.strokeStyle = '#ef4444'; // Red
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 3]);
                ctx.moveTo(cursorX, 0);
                ctx.lineTo(cursorX, height);
                ctx.stroke();
                ctx.setLineDash([]);
                
                // Cursor Knob
                ctx.fillStyle = '#ef4444';
                ctx.beginPath();
                ctx.arc(cursorX, height - 6, 4, 0, Math.PI*2);
                ctx.fill();
            }
        }

    }, [originalData, processedData, targetRate, bitDepth, cursorIndex, isInspectorOpen]);

    return (
        <div 
            ref={containerRef} 
            className={`w-full h-64 bg-white rounded-lg border border-slate-200 relative overflow-hidden shadow-sm select-none touch-none ${isInspectorOpen ? 'cursor-crosshair' : 'cursor-default'}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onTouchStart={(e) => { setIsDragging(true); updateCursor(e.touches[0]); }}
            onTouchMove={(e) => { if(isDragging) updateCursor(e.touches[0]); }}
            onTouchEnd={handleMouseUp}
        >
            <canvas ref={canvasRef} className="w-full h-full block" />
            <div className="absolute top-2 right-2 bg-white/90 px-2 py-1 rounded text-xs text-slate-500 border border-slate-200 pointer-events-none shadow-sm font-mono">
                表示範囲: {ZOOM_WINDOW_MS}ms {isInspectorOpen && `/ カーソル位置: ${cursorIndex}`}
            </div>
            {originalData && isInspectorOpen && (
                <div className="absolute bottom-2 left-2 text-rose-500 text-xs font-bold pointer-events-none bg-white/80 px-2 py-1 rounded">
                    ← グラフをクリック/ドラッグして検査位置を変更 →
                </div>
            )}
            {!originalData && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                    録音またはサンプルを選択してください
                </div>
            )}
        </div>
    );
};

// --- Component: Coding Data Inspector ---
const DataInspector = ({ processedData, bitDepth, cursorIndex, targetRate }) => {
    // Show 5 samples starting from cursor
    const count = 5;
    const samples = [];
    
    // Sampling step calculation to detect actual sampled points
    const step = Math.max(1, BASE_SAMPLE_RATE / targetRate);
    
    if (processedData) {
        for (let i = 0; i < count; i++) {
            const idx = cursorIndex + i;
            if (idx >= processedData.length) break;
            
            const val = processedData[idx];
            
            // Re-calculate quantization for display
            const levels = Math.pow(2, bitDepth);
            const maxLevel = levels - 1;
            let normalized = (val + 1) / 2;
            normalized = Math.max(0, Math.min(1, normalized));
            const intValue = Math.round(normalized * maxLevel);
            const binaryString = intValue.toString(2).padStart(bitDepth, '0');
            
            // Check if this point is a "Sampling Point" (update point)
            const isSamplePoint = Math.floor(idx % step) === 0;

            samples.push({
                index: idx,
                val: val,
                intValue: intValue,
                maxLevel: maxLevel,
                binary: binaryString,
                isSamplePoint: isSamplePoint
            });
        }
    }

    return (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden mt-4">
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="px-4 py-2 w-16 text-center">No.</th>
                            <th className="px-4 py-2">状態</th>
                            <th className="px-4 py-2 text-right">アナログ値 (-1~1)</th>
                            <th className="px-4 py-2 text-center">量子化レベル (10進)</th>
                            <th className="px-4 py-2">符号 (2進数)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {samples.length > 0 ? samples.map((s) => (
                            <tr key={s.index} className={s.index === cursorIndex ? "bg-rose-50" : "hover:bg-slate-50"}>
                                <td className="px-4 py-3 text-center font-mono text-slate-400">{s.index}</td>
                                <td className="px-4 py-3">
                                    {s.index === cursorIndex && <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-600 border border-rose-200">Cursor</span>}
                                    {/* Show update marker if sample rate is low */}
                                    {step > 1.5 && s.isSamplePoint && <span className="ml-2 inline-block w-2 h-2 rounded-full bg-amber-400" title="Sampling Point"></span>}
                                </td>
                                <td className="px-4 py-3 text-right font-mono text-cyan-700 font-bold">
                                    {s.val.toFixed(4)}
                                </td>
                                <td className="px-4 py-3 text-center font-mono">
                                    <span className="text-amber-600 font-bold text-lg">{s.intValue}</span>
                                    <span className="text-slate-400 text-xs ml-1">/ {s.maxLevel}</span>
                                </td>
                                <td className="px-4 py-3 font-mono">
                                    <div className="flex gap-0.5">
                                        {s.binary.split('').map((b, i) => (
                                            <span key={i} className={`
                                                w-5 h-6 flex items-center justify-center rounded text-xs
                                                ${b === '1' ? 'bg-cyan-600 text-white' : 'bg-slate-200 text-slate-400'}
                                            `}>
                                                {b}
                                            </span>
                                        ))}
                                    </div>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan="5" className="px-4 py-8 text-center text-slate-400">データがありません</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// --- Main App Component ---
const App = () => {
    const [audioContext, setAudioContext] = useState(null);
    const [originalBuffer, setOriginalBuffer] = useState(null);
    const [originalData, setOriginalData] = useState(null);
    
    // Params
    const [sampleRate, setSampleRate] = useState(44100);
    const [bitDepth, setBitDepth] = useState(16);
    const [cursorIndex, setCursorIndex] = useState(0); // Cursor position for inspection
    
    const [processedData, setProcessedData] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    
    // UI State
    const [showInspector, setShowInspector] = useState(false);
    
    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const sourceNodeRef = useRef(null);

    // Initializer
    const initAudio = () => {
        if (!audioContext) {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            setAudioContext(ctx);
            return ctx;
        }
        return audioContext;
    };

    // Actions
    const startRecording = async () => {
        const ctx = initAudio();
        if (ctx.state === 'suspended') await ctx.resume();

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            chunksRef.current = [];
            mediaRecorderRef.current.ondataavailable = (e) => chunksRef.current.push(e.data);
            mediaRecorderRef.current.onstop = async () => {
                const blob = new Blob(chunksRef.current, { type: 'audio/ogg; codecs=opus' });
                const arrayBuffer = await blob.arrayBuffer();
                const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
                loadBuffer(audioBuffer);
                stream.getTracks().forEach(track => track.stop());
            };
            mediaRecorderRef.current.start();
            setIsRecording(true);
            setTimeout(() => {
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                    stopRecording();
                }
            }, MAX_RECORD_TIME_MS);
        } catch (err) {
            console.error(err);
            alert("マイクの使用が許可されていません。");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const generateTone = (type) => {
        const ctx = initAudio();
        if (ctx.state === 'suspended') ctx.resume();
        const buffer = AudioGenerators[type](ctx);
        loadBuffer(buffer);
    };

    const loadBuffer = (buffer) => {
        setOriginalBuffer(buffer);
        const data = buffer.getChannelData(0);
        setOriginalData(data);
        // Reset cursor to middle
        setCursorIndex(Math.floor(data.length / 2));
    };

    const playProcessedAudio = async () => {
        if (!processedData || !audioContext) return;
        if (sourceNodeRef.current) sourceNodeRef.current.stop();

        const buffer = audioContext.createBuffer(1, processedData.length, BASE_SAMPLE_RATE);
        buffer.copyToChannel(processedData, 0);

        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.onended = () => setIsPlaying(false);
        source.start();
        sourceNodeRef.current = source;
        setIsPlaying(true);
    };

    const stopAudio = () => {
        if (sourceNodeRef.current) {
            sourceNodeRef.current.stop();
            setIsPlaying(false);
        }
    };

    // Processing Effect
    useEffect(() => {
        if (originalBuffer) {
            const processed = processAudioData(originalBuffer, sampleRate, bitDepth);
            setProcessedData(processed);
        }
    }, [originalBuffer, sampleRate, bitDepth]);

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-8 pb-16">
            <header className="mb-8 text-center">
                <h1 className="text-3xl md:text-4xl font-bold text-slate-800 mb-2">
                    音のデジタル化実験室 <span className="text-cyan-600 text-base align-middle ml-2 border border-cyan-200 bg-cyan-50 px-2 py-1 rounded-full">SoundBit</span>
                </h1>
                <p className="text-slate-500">AD変換（標本化・量子化・符号化）の仕組みを体験しよう</p>
            </header>

            {/* 1. SOURCE */}
            <section className="bg-white rounded-xl p-6 mb-6 shadow-sm border border-slate-200">
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
                        <span className="bg-slate-800 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm">1</span>
                        音声入力
                    </h2>
                    
                    <div className="flex flex-wrap gap-2 justify-center">
                        {/* Recording */}
                        {!isRecording ? (
                            <button onClick={startRecording} className="flex items-center gap-2 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-bold shadow-sm transition-transform active:scale-95">
                                <Icons.Mic /> 録音
                            </button>
                        ) : (
                            <button onClick={stopRecording} className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-rose-500 border border-rose-200 rounded-lg font-bold animate-pulse">
                                <Icons.Square /> 停止
                            </button>
                        )}

                        <div className="h-8 w-px bg-slate-200 mx-2 hidden md:block"></div>

                        {/* Presets */}
                        <button onClick={() => generateTone('simple')} className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-lg text-sm font-medium transition-colors">
                            シンプル (正弦波)
                        </button>
                        <button onClick={() => generateTone('melody')} className="px-4 py-2 bg-white hover:bg-slate-50 text-cyan-600 border border-cyan-200 rounded-lg text-sm font-bold transition-colors flex items-center gap-1">
                            <Icons.Music /> メロディ
                        </button>
                        <button onClick={() => generateTone('chord')} className="px-4 py-2 bg-white hover:bg-slate-50 text-indigo-600 border border-indigo-200 rounded-lg text-sm font-bold transition-colors">
                            和音 (コード)
                        </button>
                    </div>
                </div>
                {isRecording && <div className="text-center text-rose-500 text-sm font-bold mt-2">録音中...</div>}
            </section>

            {/* 2. VISUALIZATION & CONTROLS */}
            <div className={`transition-all duration-500 ${originalData ? 'opacity-100' : 'opacity-40 grayscale pointer-events-none'}`}>
                
                <section className="mb-6">
                    <div className="flex justify-between items-end mb-2">
                        <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
                             <span className="bg-slate-800 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm">2</span>
                             波形確認・調整
                        </h2>
                        <div className="flex gap-4 text-xs font-medium">
                            <div className="flex items-center gap-2 bg-white px-2 py-1 rounded border border-slate-200">
                                <span className="w-3 h-3 rounded-full bg-slate-300"></span><span className="text-slate-500">アナログ</span>
                            </div>
                            <div className="flex items-center gap-2 bg-white px-2 py-1 rounded border border-slate-200">
                                <span className="w-3 h-3 rounded-full bg-cyan-600"></span><span className="text-cyan-700">デジタル</span>
                            </div>
                        </div>
                    </div>
                    
                    {/* Waveform Canvas */}
                    <WaveformVisualizer 
                        originalData={originalData} 
                        processedData={processedData}
                        targetRate={sampleRate}
                        bitDepth={bitDepth}
                        cursorIndex={cursorIndex}
                        onSetCursor={setCursorIndex}
                        isInspectorOpen={showInspector}
                    />

                    {/* Controls Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                        {/* Sampling */}
                        <div className="bg-white rounded-lg p-5 border border-slate-200 shadow-sm">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-base font-bold text-amber-600">標本化 (Sampling)</label>
                                <span className="font-mono font-bold text-slate-700 text-lg">{sampleRate} Hz</span>
                            </div>
                            <input type="range" min="1000" max="44100" step="100" value={sampleRate} onChange={(e) => setSampleRate(Number(e.target.value))} className="w-full accent-amber-500 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer mb-2" />
                            <p className="text-xs text-slate-500 leading-relaxed">
                                横軸（時間）の分割数。数値が低いと、波形がカクカクになり、高い音が消えてこもった音になります。
                            </p>
                        </div>
                        {/* Quantization */}
                        <div className="bg-white rounded-lg p-5 border border-slate-200 shadow-sm">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-base font-bold text-emerald-600">量子化 (Quantization)</label>
                                <span className="font-mono font-bold text-slate-700 text-lg">{bitDepth} bit</span>
                            </div>
                            <input type="range" min="2" max="16" step="1" value={bitDepth} onChange={(e) => setBitDepth(Number(e.target.value))} className="w-full accent-emerald-500 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer mb-2" />
                            <p className="text-xs text-slate-500 leading-relaxed">
                                縦軸（振幅）の段階数。数値が低いと、波形の形が崩れ、「サー」というノイズが混じります。
                            </p>
                        </div>
                    </div>
                </section>

                {/* Playback - Moved here */}
                <section className="flex flex-col items-center justify-center py-6 mb-8 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                    {!isPlaying ? (
                        <button onClick={playProcessedAudio} className="group relative inline-flex items-center gap-3 px-8 py-3 bg-cyan-600 hover:bg-cyan-500 text-white text-lg font-bold rounded-full shadow-lg shadow-cyan-200 transition-all hover:scale-105 active:scale-95">
                            <Icons.Play /> 変換後の音を再生
                        </button>
                    ) : (
                        <button onClick={stopAudio} className="inline-flex items-center gap-3 px-8 py-3 bg-slate-200 text-slate-700 text-lg font-bold rounded-full hover:bg-slate-300 transition-all">
                            <Icons.Square /> 停止
                        </button>
                    )}
                    <p className="mt-2 text-slate-500 text-xs">設定を変更したら再生して、音質の変化を確認しよう</p>
                </section>

                {/* Collapsible Data Inspector */}
                <section className="mt-8 border-t border-slate-200 pt-6">
                    <button 
                        onClick={() => setShowInspector(!showInspector)}
                        className="flex items-center gap-2 text-slate-500 hover:text-slate-800 font-bold text-sm mx-auto transition-colors"
                    >
                        {showInspector ? <Icons.ChevronUp /> : <Icons.ChevronDown />}
                        {showInspector ? '符号化の詳細を隠す' : '符号化の仕組みを見る（おまけ）'}
                    </button>

                    {showInspector && (
                        <div className="animate-[fadeIn_0.3s_ease-out]">
                             <p className="text-center text-xs text-rose-500 mt-2 mb-2">
                                ※ グラフをクリックまたはドラッグして、検査する位置を指定してください
                            </p>
                            <DataInspector 
                                processedData={processedData} 
                                bitDepth={bitDepth} 
                                cursorIndex={cursorIndex}
                                targetRate={sampleRate}
                            />
                        </div>
                    )}
                </section>

            </div>
            
            <footer className="mt-12 text-center text-slate-400 text-xs">
                <p>Information I Study App</p>
            </footer>
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);