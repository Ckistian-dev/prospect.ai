import React from 'react';
import { AlertTriangle, Download, Loader2, FileText, MapPin } from 'lucide-react';
import AudioPlayer from './AudioPlayer';
import ImageDisplayer from './ImageDisplayer';
import VideoDisplayer from './VideoDisplayer';

const MessageContent = ({ msg, pcId, onViewMedia, onDownloadDocument, isDownloading }) => {
    if (msg.status === 'failed' || msg.status === 'error' || msg.type === 'error') {
        let errorMessage = 'Falha no envio';
        if (msg.error_title) errorMessage = msg.error_title;
        else if (msg.content) errorMessage = msg.content;
        const errorCode = msg.error_code ? ` (Cód: ${msg.error_code})` : '';

        return (
            <div className="flex items-center gap-2 text-red-600">
                <AlertTriangle size={16} />
                <span className="text-sm">
                    {errorMessage}{errorCode}
                    {msg.type !== 'error' && msg.content && (
                        <p className="text-xs text-gray-500 italic mt-1">Mensagem original: "{msg.content}"</p>
                    )}
                </span>
            </div>
        );
    }

    const type = msg.type || 'text';
    const hasMedia = msg.id && ['image', 'audio', 'document', 'video', 'location'].includes(type);
    let displayText = msg.content || (hasMedia ? `[${type.toUpperCase()}]` : '');

    if (['image', 'video', 'location'].includes(type)) displayText = null;

    switch (type) {
        case 'audio':
            return (
                <AudioPlayer
                    instanceId={pcId}
                    messageId={msg.id}
                    transcription={displayText}
                />
            );
        case 'image':
            return (
                <ImageDisplayer
                    instanceId={pcId}
                    messageId={msg.id}
                    caption={displayText}
                />
            );
        case 'video':
            return (
                <VideoDisplayer
                    instanceId={pcId}
                    messageId={msg.id}
                    caption={displayText}
                />
            );
        case 'document':
            return (
                <div className="space-y-2">
                    <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg max-w-sm hover:bg-gray-100 transition-colors">
                        <div className="bg-blue-100 p-2 rounded-full text-blue-600 flex-shrink-0">
                            <FileText size={20} />
                        </div>
                        <div className="flex-1 min-w-0 overflow-hidden">
                            <p className="text-sm font-medium text-gray-900 truncate" title={msg.filename}>{msg.filename || 'Documento'}</p>
                            <p className="text-xs text-gray-500 uppercase">{msg.mime_type ? msg.mime_type.split('/')[1] : 'ARQUIVO'}</p>
                        </div>
                        {hasMedia && (
                            <button
                                type="button" onClick={() => onDownloadDocument(msg.id, msg.filename)}
                                disabled={isDownloading}
                                className={`p-2 rounded-full text-gray-500 hover:text-blue-600 ${isDownloading ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                {isDownloading ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />}
                            </button>
                        )}
                    </div>
                </div>
            );
        case 'location':
            return (
                <div className="flex flex-col gap-2 p-2 bg-gray-50 border border-gray-200 rounded-lg max-w-sm">
                    {msg.thumbnail && (
                        <img 
                            src={`data:image/jpeg;base64,${msg.thumbnail}`} 
                            alt="Localização" 
                            className="w-full h-32 object-cover rounded-md"
                        />
                    )}
                    <div className="flex items-center gap-2">
                        <div className="bg-green-100 p-2 rounded-full text-green-600 flex-shrink-0">
                            <MapPin size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">Localização</p>
                            <a href={`https://www.google.com/maps/search/?api=1&query=${msg.latitude},${msg.longitude}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline truncate block">
                                Ver no Google Maps
                            </a>
                        </div>
                    </div>
                </div>
            );
        case 'sending':
            return (
                <div className="flex items-center gap-2 italic text-gray-500">
                    <Loader2 size={16} className="animate-spin" />
                    {msg.localUrl && msg.filename?.match(/\.(jpeg|jpg|png|webp)$/i) && (
                        <img src={msg.localUrl} alt="preview" className="w-10 h-10 object-cover rounded mr-1" />
                    )}
                    {msg.localUrl && type === 'audio' && <audio src={msg.localUrl} controls className="h-8 w-40" />}
                    {msg.localUrl && type === 'video' && <video src={msg.localUrl} controls muted className="h-20 w-32 rounded" />}
                    <span>{msg.content || `Enviando ${msg.filename || 'mídia'}...`}</span>
                </div>
            );
        case 'text':
        default:
            const defaultText = msg.content || (msg.id && !msg.role ? `[Mídia tipo '${type}' não suportada]` : '');
            return (
                <p className="whitespace-pre-wrap text-sm">{defaultText || '[Tipo de mensagem não suportado]'}</p>
            );
    }
}

export default MessageContent;