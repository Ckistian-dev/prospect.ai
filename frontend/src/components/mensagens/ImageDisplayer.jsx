import React, { useState, useEffect, useRef } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import api from '../../api/axiosConfig';

const ImageDisplayer = ({ instanceId, messageId, caption }) => {
    const [imageSrc, setImageSrc] = useState(null);
    const [loadState, setLoadState] = useState('idle'); // 'idle', 'loading', 'loaded', 'error'
    const [isModalOpen, setIsModalOpen] = useState(false);
    const imageBlobUrlRef = useRef(null);
    const displayerRef = useRef(null);

    useEffect(() => {
        return () => {
            if (imageBlobUrlRef.current) {
                URL.revokeObjectURL(imageBlobUrlRef.current);
            }
        };
    }, []);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (entry.isIntersecting && loadState === 'idle') {
                    loadImage();
                    if (displayerRef.current) observer.unobserve(displayerRef.current);
                }
            },
            { rootMargin: '200px' }
        );

        if (displayerRef.current) observer.observe(displayerRef.current);

        return () => {
            if (displayerRef.current) observer.unobserve(displayerRef.current);
        };
    }, [loadState]);

    const loadImage = async () => {
        if (loadState !== 'idle') return;
        setLoadState('loading');
        try {
            const response = await api.get(`/whatsapp/${instanceId}/media/${messageId}`, {
                responseType: 'blob',
            });
            const blobUrl = URL.createObjectURL(response.data);
            imageBlobUrlRef.current = blobUrl;
            setImageSrc(blobUrl);
            setLoadState('loaded');
        } catch (error) {
            console.error("Erro ao carregar imagem:", error);
            setLoadState('error');
        }
    };

    return (
        <div ref={displayerRef} className="space-y-2 w-64">
            <div className="relative w-64 h-48 bg-gray-200 rounded-lg overflow-hidden">
                {(loadState === 'loading' || loadState === 'idle') && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-50 animate-pulse">
                        <Loader2 className="animate-spin text-gray-500" />
                    </div>
                )}
                {loadState === 'error' && <div className="absolute inset-0 flex items-center justify-center"><AlertCircle className="text-red-500" /></div>}
                {loadState === 'loaded' && imageSrc && (
                    <img
                        src={imageSrc}
                        alt="Miniatura"
                        className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => setIsModalOpen(true)}
                    />
                )}
            </div>

            {caption && (
                <p className="whitespace-pre-wrap text-sm border-t border-gray-200 pt-2">{caption}</p>
            )}

            {isModalOpen && imageSrc && (
                <div className="fixed inset-[-10px] bg-black bg-opacity-60 flex items-center justify-center z-50" onClick={() => setIsModalOpen(false)}>
                    <img src={imageSrc} alt="Visualização" className="max-w-[80vw] max-h-[80vh] object-contain" onClick={(e) => e.stopPropagation()} />
                </div>
            )}
        </div>
    );
};

export default ImageDisplayer;
