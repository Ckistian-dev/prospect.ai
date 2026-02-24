import React from 'react';
import { MessageSquareText } from 'lucide-react';

// --- Componente: Placeholder (Sem chat selecionado) ---
const ChatPlaceholder = () => (
    <div className="flex-1 flex flex-col items-center justify-center text-center bg-gray-50 border-l border-gray-200">
        <div className="p-8 bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-100">
            <div className="w-20 h-20 bg-brand-green/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageSquareText size={48} className="text-brand-green" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800">Prospecção Manual</h2>
            <p className="mt-2 text-gray-500 max-w-xs mx-auto">
                Selecione um contato na lista à esquerda para visualizar o histórico ou interagir manualmente.
            </p>
        </div>
    </div>
);

export default ChatPlaceholder;