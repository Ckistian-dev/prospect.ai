import React from 'react';
import { Loader2, Sparkles } from 'lucide-react';

const PageLoader = ({ 
    message = "Carregando...", 
    subMessage = "Sincronizando dados em tempo real...",
    fullScreen = true
}) => {
    const content = (
        <div className="flex flex-col items-center gap-12">
            <div className="relative">
                <div className="w-24 h-24 rounded-[40px] bg-gradient-to-br from-[#356854] to-[#1b3d2f] flex items-center justify-center shadow-2xl shadow-emerald-900/40 relative z-10 border border-white/20">
                    <Loader2 size={40} className="text-white animate-spin" />
                </div>
                {/* Background Glow Effect */}
                <div className="absolute inset-0 rounded-[40px] bg-[#356854] blur-3xl opacity-20 scale-150 animate-pulse" />
                <div className="absolute -top-4 -right-4 w-10 h-10 bg-white rounded-2xl shadow-xl flex items-center justify-center text-[#356854] animate-bounce">
                    <Sparkles size={20} />
                </div>
            </div>
            
            <div className="text-center">
                <h2 className="text-slate-800 font-black text-2xl tracking-tight mb-3" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    {message}
                </h2>
                {subMessage && (
                    <div className="flex flex-col items-center gap-2">
                        <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] animate-pulse">
                            {subMessage}
                        </p>
                        <div className="w-48 h-1 bg-slate-100 rounded-full mt-4 overflow-hidden">
                            <div className="h-full bg-[#356854] rounded-full animate-[progress_2s_ease-in-out_infinite]" style={{ width: '40%' }}></div>
                        </div>
                    </div>
                )}
            </div>
            <style>{`
                @keyframes progress {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(250%); }
                }
            `}</style>
        </div>
    );

    if (!fullScreen) {
        return (
            <div className="flex w-full h-full items-center justify-center p-12 bg-white/40 backdrop-blur-md rounded-[3rem] border border-white/20">
                {content}
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-[#f8fafc]">
            {content}
        </div>
    );
};

export default PageLoader;
