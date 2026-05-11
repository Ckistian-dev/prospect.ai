import React from 'react';
import { MessageSquareText } from 'lucide-react';

const ChatPlaceholder = () => (
    <div className="flex-1 flex flex-col items-center justify-center p-12 bg-slate-50/20 backdrop-blur-sm border-l border-white/40">
        <div className="max-w-xl w-full p-16 bg-white/40 backdrop-blur-xl rounded-[4rem] shadow-2xl shadow-emerald-900/5 border border-white flex flex-col items-center group transition-all duration-500 hover:scale-[1.01]">
            <div className="w-32 h-32 rounded-[3rem] bg-emerald-50/50 flex items-center justify-center mb-10 shadow-inner border border-emerald-100/50 group-hover:scale-110 transition-all duration-500">
                <MessageSquareText size={56} className="text-brand-green drop-shadow-sm" />
            </div>

            <h2 className="text-[32px] font-black tracking-tight text-slate-800 leading-tight mb-6 text-center">
                Redesenhando o<br />Atendimento Manual
            </h2>

            <div className="w-16 h-1.5 bg-gradient-to-r from-brand-green to-emerald-600 rounded-full mb-8 opacity-40 group-hover:w-24 transition-all duration-500"></div>

            <p className="text-[16px] font-medium text-slate-400 leading-relaxed text-center px-8">
                Inicie uma conversa ou selecione um atendimento na barra lateral para acessar o painel de produtividade inteligente do ProspectAI.
            </p>
        </div>
    </div>
);

export default ChatPlaceholder;