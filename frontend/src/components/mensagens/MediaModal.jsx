import React from 'react';
import { Download, X } from 'lucide-react';

// --- Componente: Modal de Mídia ---
const MediaModal = ({ isOpen, onClose, mediaUrl, mediaType, filename }) => {
    if (!isOpen || !mediaUrl) return null;

    // Função para forçar download
    const handleDownload = async () => {
        try {
            const link = document.createElement('a');
            link.href = mediaUrl;
            link.download = filename || (mediaType === 'audio' ? 'audio.ogg' : mediaType === 'video' ? 'video.mp4' : 'imagem.jpg');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error("[MediaModal] Erro ao tentar baixar arquivo:", error);
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-4 animate-fade-in"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-2xl overflow-hidden max-w-4xl max-h-[90vh] w-full flex flex-col relative animate-scale-in"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Cabeçalho */}
                <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-white z-10">
                    <h3 className="font-bold text-gray-800 truncate pr-8">{filename || 'Visualização de Mídia'}</h3>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Conteúdo da Mídia */}
                <div className="flex-1 overflow-auto bg-gray-50 flex items-center justify-center p-4">
                    {mediaType === 'image' && (
                        <img
                            src={mediaUrl}
                            alt={filename}
                            className="max-w-full max-h-[70vh] object-contain shadow-lg rounded-lg"
                        />
                    )}
                    {mediaType === 'audio' && (
                        <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                            <audio src={mediaUrl} controls className="w-full" autoPlay />
                        </div>
                    )}
                    {mediaType === 'video' && (
                        <video
                            src={mediaUrl}
                            controls
                            autoPlay
                            className="max-w-full max-h-[70vh] rounded-lg shadow-lg"
                        />
                    )}
                </div>

                {/* Rodapé com Ações */}
                <div className="p-4 border-t border-gray-100 bg-white flex justify-end">
                    <button
                        onClick={handleDownload}
                        className="flex items-center gap-2 px-6 py-2.5 bg-brand-green text-white rounded-xl hover:bg-brand-green-dark transition-all font-bold shadow-md hover:shadow-lg"
                    >
                        <Download size={18} /> Baixar Arquivo
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MediaModal;