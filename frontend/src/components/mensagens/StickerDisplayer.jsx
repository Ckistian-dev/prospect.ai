import React, { useState, useEffect, useRef } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import api from '../../api/axiosConfig';

const StickerDisplayer = ({ atendimentoId, mediaId }) => {
    const [stickerSrc, setStickerSrc] = useState(null);
    const [loadState, setLoadState] = useState('idle'); // 'idle', 'loading', 'loaded', 'error'
    const stickerBlobUrlRef = useRef(null);
    const displayerRef = useRef(null);

    useEffect(() => {
        return () => {
            if (stickerBlobUrlRef.current) {
                URL.revokeObjectURL(stickerBlobUrlRef.current);
            }
        };
    }, []);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (entry.isIntersecting && loadState === 'idle') {
                    loadSticker();
                    if (displayerRef.current) {
                        observer.unobserve(displayerRef.current);
                    }
                }
            },
            { rootMargin: '400px' }
        );

        if (displayerRef.current) {
            observer.observe(displayerRef.current);
        }

        return () => {
            if (displayerRef.current) {
                observer.unobserve(displayerRef.current);
            }
        };
    }, [loadState]);

    const loadSticker = async () => {
        if (loadState !== 'idle') return;
        setLoadState('loading');
        try {
            const isWhatsApp = String(atendimentoId).includes('-');
            const endpoint = isWhatsApp 
                ? `/whatsapp/${atendimentoId}/media/${mediaId}`
                : `/atendimentos/${atendimentoId}/media/${mediaId}`;

            const response = await api.get(endpoint, {
                responseType: 'blob',
            });
            const blob = new Blob([response.data], { type: response.headers['content-type'] });
            const blobUrl = URL.createObjectURL(blob);
            stickerBlobUrlRef.current = blobUrl;
            setStickerSrc(blobUrl);
            setLoadState('loaded');
        } catch (error) {
            setLoadState('error');
        }
    };

    return (
        <div ref={displayerRef} className="w-32 h-32 md:w-40 md:h-40 relative group">
            {(loadState === 'loading' || loadState === 'idle') && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-100/50 rounded-2xl animate-pulse">
                    <Loader2 className="animate-spin text-brand-green/40" size={20} />
                </div>
            )}
            
            {loadState === 'error' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-50/50 rounded-2xl text-red-300">
                    <AlertCircle size={20} />
                </div>
            )}
            
            {loadState === 'loaded' && stickerSrc && (
                <img
                    src={stickerSrc}
                    alt="Sticker"
                    className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-110"
                />
            )}
        </div>
    );
};

export default StickerDisplayer;
