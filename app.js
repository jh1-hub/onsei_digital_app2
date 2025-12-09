const { useState, useEffect, useRef, useMemo, useCallback } = React;

// --- Icons (SVG Strings) ---
const Icons = {
    Mic: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>,
    Play: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
    Square: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>,
    Music: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
    ZoomIn: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>,
    Binary: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="14" y="14" width="4" height="6" rx="2"/><rect x="6" y="4" width="4" height="6" rx="2"/><path d="M6 20h4"/><path d="M14 10h4"/><path d="M6 14h2v6"/><path d="M14 4h2v6"/></svg>,
};

// --- Constants ---
const MAX_RECORD_TIME_MS = 10000; // 10 seconds
const BASE_SAMPLE_RATE = 44100;
const ZOOM_WINDOW_MS = 20;

// --- Helper: Audio Processing Logic ---
const processAudioData = (rawBuffer, targetRate, bitDepth) => {
    if (!rawBuffer) return null;
    
    const rawData = rawBuffer.getChannelData(0);
    const length = rawData.length;
    const processedData = new Float32Array(length);
    
    const step = Math.max(1, BASE_SAMPLE_RATE / targetRate);
    const levels = Math.pow(2, bitDepth);
    const maxLevel = levels - 1;
    
    let currentVal = 0;

    for (let i = 0; i < length; i++) {
        if (i % Math.floor(step) === 0) {
            currentVal = rawData[i];
        }

        // Normalize, Quantize, Denormalize
        let normalized = (currentVal + 1) / 2;
        normalized = Math.max(0, Math.min(1, normalized));
        const quantizedInt = Math.round(normalized * maxLevel);
        const quantizedFloat = (quantizedInt / maxLevel) * 2 - 1;

        processedData[i] = quantizedFloat;
    }

    return processedData;
};

// --- Component: Waveform Canvas ---
const WaveformVisualizer = ({ originalData, processedData, targetRate, bitDepth }) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || !originalData) return;

        const ctx = canvas.getContext('2d');
        const width = container.clientWidth;
        const height = container.clientHeight;
        
        // Handle HiDPI
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);

        // Background (Light Theme: White)
        ctx.fillStyle = '#ffffff'; 
        ctx.fillRect(0, 0, width, height);

        // Grid lines (Light Theme: Light Grey)
        ctx.strokeStyle = '#e2e8f0'; // slate-200
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        const samplesPerMs = BASE_SAMPLE_RATE / 1000;
        const windowSizeSamples = Math.floor(ZOOM_WINDOW_MS * samplesPerMs); 
        const startSample = Math.floor(originalData.length / 2) - Math.floor(windowSizeSamples / 2);
        const endSample = startSample + windowSizeSamples;

        const getX = (index) => ((index - startSample) / windowSizeSamples) * width;
        const getY = (val) => (1 - (val + 1) / 2) * height;

        // 1. Draw Original (Ghost - Light Theme: Grey)
        ctx.beginPath();
        ctx.strokeStyle = '#cbd5e1'; // slate-300
        ctx.lineWidth = 2;
        for (let i = startSample; i < endSample; i++) {
            const x = getX(i);
            const y = getY(originalData[i]);
            if (i === startSample) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // 2. Draw Processed (Active - Light Theme: Cyan)
        if (processedData) {
            ctx.beginPath();
            ctx.strokeStyle = '#0891b2'; // cyan-600 (darker for white bg)
            ctx.lineWidth = 3;
            
            for (let i = startSample; i < endSample; i++) {
                const x = getX(i);
                const val = processedData[i];
                const y = getY(val);
                
                if (i === startSample) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        // 3. Draw Sampling Points
        if (targetRate < 12000) {
            const step = BASE_SAMPLE_RATE / targetRate;
            ctx.fillStyle = '#f59e0b'; // amber-500
            for (let i = startSample; i < endSample; i++) {
                if (Math.floor(i % step) === 0) {
                   const x = getX(i);
                   const y = getY(processedData[i]);
                   ctx.beginPath();
                   ctx.arc(x, y, 3, 0, Math.PI * 2);
                   ctx.fill();
                }
            }
        }

    }, [originalData, processedData, targetRate, bitDepth]);

    return (
        <div ref={containerRef} className="w-full h-64 bg-white rounded-lg border border-slate-200 relative overflow-hidden shadow-sm">
            <canvas ref={canvasRef} className="w-full h-full block" />
            <div className="absolute top-2 right-2 bg-white/90 px-2 py-1 rounded text-xs text-slate-500 border border-slate-200 pointer-events-none shadow-sm font-mono">
                表示範囲: {ZOOM_WINDOW_MS}ms
            </div>
            {originalData && !processedData && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                    Loading...
                </div>
            )}
            {!originalData && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                    No Audio Data
                </div>
            )}
        </div>
    );
};

// --- Component: Binary View ---
const BinaryView = ({ processedData, bitDepth }) => {
    const sampleIndex = processedData ? Math.floor(processedData.length / 2) : 0;
    const sampleValue = processedData ? processedData[sampleIndex] : 0;
    
    const levels = Math.pow(2, bitDepth);
    const maxLevel = levels - 1;
    let normalized = (sampleValue + 1) / 2;
    normalized = Math.max(0, Math.min(1, normalized));
    const intValue = Math.round(normalized * maxLevel);
    
    const binaryString = intValue.toString(2).padStart(bitDepth, '0');
    const bits = binaryString.split('');

    return (
        <div className="mt-4 p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4 text-slate-600 text-sm uppercase tracking-wider font-bold">
                <Icons.Binary />
                <span>符号化モニター (Coding)</span>
            </div>
            <div className="flex flex-col lg:flex-row gap-8 items-center justify-center py-4">
                <div className="text-center min-w-[120px]">
                    <div className="text-xs text-slate-500 mb-1">アナログ電圧</div>
                    <div className="text-2xl font-mono text-cyan-600 font-bold">{sampleValue.toFixed(4)}</div>
                </div>
                
                <div className="hidden lg:block text-slate-300">→</div>
                
                <div className="text-center min-w-[120px]">
                    <div className="text-xs text-slate-500 mb-1">量子化レベル</div>
                    <div className="text-2xl font-mono text-amber-500 font-bold">{intValue} <span className="text-sm text-slate-400 font-normal">/ {maxLevel}</span></div>
                </div>

                <div className="hidden lg:block text-slate-300">→</div>

                <div className="text-center w-full lg:w-auto overflow-x-auto">
                    <div className="text-xs text-slate-500 mb-1">デジタルデータ (2進数)</div>
                    <div className="flex gap-1 justify-center min-w-max px-2">
                        {bits.map((b, i) => (
                            <span key={i} className={`
                                inline-block w-6 h-8 leading-8 text-center rounded font-mono font-bold text-sm
                                ${b === '1' ? 'bg-cyan-600 text-white shadow-sm' : 'bg-slate-100 text-slate-400 border border-slate-200'}
                            `}>
                                {b}
                            </span>
                        ))}
                    </div>
                    <div className="text-xs text-right mt-1 text-slate-400 font-mono">{bitDepth} bit</div>
                </div>
            </div>
            <p className="text-xs text-center text-slate-400 mt-2 bg-slate-50 py-1 rounded">
                波形中央の1点のサンプリング値をリアルタイム変換中
            </p>
        </div>
    );
};

// --- Main App Component ---
const App = () => {
    const [audioContext, setAudioContext] = useState(null);
    const [originalBuffer, setOriginalBuffer] = useState(null);
    const [originalData, setOriginalData] = useState(null);
    
    const [sampleRate, setSampleRate] = useState(44100);
    const [bitDepth, setBitDepth] = useState(16);
    
    const [processedData, setProcessedData] = useState(null);
    
    const [isRecording, setIsRecording] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    
    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const sourceNodeRef = useRef(null);

    const initAudio = () => {
        if (!audioContext) {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            setAudioContext(ctx);
            return ctx;
        }
        return audioContext;
    };

    const startRecording = async () => {
        const ctx = initAudio();
        if (ctx.state === 'suspended') await ctx.resume();

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            chunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (e) => {
                chunksRef.current.push(e.data);
            };

            mediaRecorderRef.current.onstop = async () => {
                const blob = new Blob(chunksRef.current, { type: 'audio/ogg; codecs=opus' });
                const arrayBuffer = await blob.arrayBuffer();
                const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
                
                setOriginalBuffer(audioBuffer);
                setOriginalData(audioBuffer.getChannelData(0));
                
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
            console.error("Mic Error:", err);
            alert("マイクの使用が許可されていません。");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const generateSampleTone = () => {
        const ctx = initAudio();
        if (ctx.state === 'suspended') ctx.resume();
        
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
        
        setOriginalBuffer(buffer);
        setOriginalData(data);
    };

    const playProcessedAudio = async () => {
        if (!processedData || !audioContext) return;
        
        if (sourceNodeRef.current) {
            sourceNodeRef.current.stop();
        }

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

    useEffect(() => {
        if (originalBuffer) {
            const processed = processAudioData(originalBuffer, sampleRate, bitDepth);
            setProcessedData(processed);
        }
    }, [originalBuffer, sampleRate, bitDepth]);

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-8">
            
            <header className="mb-8 text-center">
                <h1 className="text-3xl md:text-4xl font-bold text-slate-800 mb-2">
                    音のデジタル化実験室 <span className="text-cyan-600 text-base align-middle ml-2 border border-cyan-200 bg-cyan-50 px-2 py-1 rounded-full">SoundBit</span>
                </h1>
                <p className="text-slate-500">
                    AD変換（標本化・量子化・符号化）の仕組みを体験しよう
                </p>
            </header>

            {/* Source Selection */}
            <section className="bg-white rounded-xl p-6 mb-6 shadow-sm border border-slate-200">
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
                        <span className="bg-slate-800 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm">1</span>
                        音声入力
                    </h2>
                    <div className="flex gap-3">
                        {!isRecording ? (
                            <button 
                                onClick={startRecording}
                                className="flex items-center gap-2 px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-lg transition-colors font-bold shadow-sm shadow-rose-200"
                            >
                                <Icons.Mic /> 録音 (10秒)
                            </button>
                        ) : (
                            <button 
                                onClick={stopRecording}
                                className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-rose-500 border border-rose-200 rounded-lg recording-active font-bold"
                            >
                                <Icons.Square /> 停止
                            </button>
                        )}
                        <button 
                            onClick={generateSampleTone}
                            className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-slate-50 text-cyan-600 border border-cyan-200 rounded-lg transition-colors font-bold"
                        >
                            <Icons.Music /> サンプル音
                        </button>
                    </div>
                </div>
                {isRecording && <div className="text-center text-rose-500 animate-pulse text-sm font-bold">録音中... マイクに向かって話してください</div>}
            </section>

            {/* Main Content Area */}
            <div className={`transition-all duration-500 ${originalData ? 'opacity-100' : 'opacity-40 grayscale pointer-events-none'}`}>
                
                {/* Visualization */}
                <section className="mb-6">
                    <div className="flex justify-between items-end mb-2">
                        <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
                             <span className="bg-slate-800 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm">2</span>
                             波形確認
                        </h2>
                        <div className="flex gap-4 text-xs font-medium">
                            <div className="flex items-center gap-2 bg-white px-2 py-1 rounded border border-slate-200">
                                <span className="w-3 h-3 rounded-full bg-slate-300"></span>
                                <span className="text-slate-500">元のアナログ波形</span>
                            </div>
                            <div className="flex items-center gap-2 bg-white px-2 py-1 rounded border border-slate-200">
                                <span className="w-3 h-3 rounded-full bg-cyan-600"></span>
                                <span className="text-cyan-700">デジタル化波形</span>
                            </div>
                        </div>
                    </div>
                    <WaveformVisualizer 
                        originalData={originalData} 
                        processedData={processedData}
                        targetRate={sampleRate}
                        bitDepth={bitDepth}
                    />
                </section>

                {/* Controls */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    
                    {/* Sampling Rate */}
                    <section className="bg-white rounded-xl p-6 border-t-4 border-amber-400 shadow-sm border-x border-b border-slate-200">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-amber-600">標本化 (Sampling)</h3>
                            <span className="text-2xl font-mono text-slate-800 font-bold">{sampleRate} <span className="text-sm text-slate-400 font-normal">Hz</span></span>
                        </div>
                        <input 
                            type="range" 
                            min="1000" 
                            max="44100" 
                            step="100" 
                            value={sampleRate}
                            onChange={(e) => setSampleRate(Number(e.target.value))}
                            className="w-full mb-2 accent-amber-500"
                        />
                        <div className="flex justify-between text-xs text-slate-400 font-mono">
                            <span>1kHz (粗い)</span>
                            <span>44.1kHz (CD)</span>
                        </div>
                        <p className="mt-4 text-sm text-slate-500 leading-relaxed bg-amber-50 p-3 rounded text-amber-900 border border-amber-100">
                            <strong>時間の分割:</strong> 数値が低いと、波形がカクカクになり、高い音が消えてこもった音になります。
                        </p>
                    </section>

                    {/* Bit Depth */}
                    <section className="bg-white rounded-xl p-6 border-t-4 border-emerald-500 shadow-sm border-x border-b border-slate-200">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-emerald-600">量子化 (Quantization)</h3>
                            <span className="text-2xl font-mono text-slate-800 font-bold">{bitDepth} <span className="text-sm text-slate-400 font-normal">bit</span></span>
                        </div>
                        <input 
                            type="range" 
                            min="2" 
                            max="16" 
                            step="1" 
                            value={bitDepth}
                            onChange={(e) => setBitDepth(Number(e.target.value))}
                            className="w-full mb-2 accent-emerald-500"
                        />
                        <div className="flex justify-between text-xs text-slate-400 font-mono">
                            <span>2bit (粗い)</span>
                            <span>16bit (細かい)</span>
                        </div>
                        <p className="mt-4 text-sm text-slate-500 leading-relaxed bg-emerald-50 p-3 rounded text-emerald-900 border border-emerald-100">
                            <strong>振幅の段階:</strong> 数値が低いと、波形の形が崩れ、「サー」というノイズが混じります。
                        </p>
                    </section>
                </div>

                {/* Playback */}
                <section className="flex flex-col items-center justify-center py-6 mb-8 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                    {!isPlaying ? (
                        <button 
                            onClick={playProcessedAudio}
                            className="group relative inline-flex items-center gap-3 px-8 py-4 bg-cyan-600 hover:bg-cyan-500 text-white text-xl font-bold rounded-full shadow-lg shadow-cyan-200 transition-all hover:scale-105 active:scale-95"
                        >
                            <Icons.Play />
                            変換後の音を再生
                        </button>
                    ) : (
                        <button 
                            onClick={stopAudio}
                            className="inline-flex items-center gap-3 px-8 py-4 bg-slate-200 text-slate-700 text-xl font-bold rounded-full hover:bg-slate-300 transition-all"
                        >
                            <Icons.Square />
                            停止
                        </button>
                    )}
                    <p className="mt-3 text-slate-500 text-sm font-medium">
                        設定を変更したら再生して、音質の劣化を確認しよう！
                    </p>
                </section>

                <BinaryView processedData={processedData} bitDepth={bitDepth} />
                
            </div>

            <footer className="mt-12 text-center text-slate-400 text-xs">
                <p>High School Information I Study App</p>
            </footer>
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);