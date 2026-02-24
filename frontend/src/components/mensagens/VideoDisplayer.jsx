import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Play, AlertCircle } from 'lucide-react';
import api from '../../api/axiosConfig';

const VideoDisplayer = ({ instanceId, messageId, caption }) => {
    const [videoSrc, setVideoSrc] = useState(null);
    const [loadState, setLoadState] = useState('idle');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const videoBlobUrlRef = useRef(null);
    const displayerRef = useRef(null);

    useEffect(() => {
        return () => {
            if (videoBlobUrlRef.current) URL.revokeObjectURL(videoBlobUrlRef.current);
        };
    }, []);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (entry.isIntersecting && loadState === 'idle') {
                    loadVideo();
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

    const loadVideo = async () => {
        if (loadState !== 'idle') return;
        setLoadState('loading');
        try {
            const response = await api.get(`/whatsapp/${instanceId}/media/${messageId}`, {
                responseType: 'blob',
            });
            const blobUrl = URL.createObjectURL(response.data);
            videoBlobUrlRef.current = blobUrl;
            setVideoSrc(blobUrl);
            setLoadState('loaded');
        } catch (error) {
            console.error("Erro ao carregar vídeo:", error);
            setLoadState('error');
        }
    };

    return (
        <div ref={displayerRef} className="space-y-2 w-64">
            <div className="relative w-64 h-48 bg-gray-200 rounded-lg overflow-hidden cursor-pointer group" onClick={() => setIsModalOpen(true)}>
                {(loadState === 'loading' || loadState === 'idle') && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-50 animate-pulse">
                        <Loader2 className="animate-spin text-gray-500" />
                    </div>
                )}
                {loadState === 'error' && <div className="absolute inset-0 flex items-center justify-center"><AlertCircle className="text-red-500" /></div>}
                {loadState === 'loaded' && videoSrc && (
                    <>
                        <video src={videoSrc} muted playsInline className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center transition-opacity group-hover:bg-opacity-40">
                            <div className="bg-white/30 backdrop-blur-sm p-3 rounded-full">
                                <Play className="text-white fill-white" size={32} />
                            </div>
                        </div>
                    </>
                )}
            </div>

            {caption && <p className="whitespace-pre-wrap text-sm border-t border-gray-200 pt-2">{caption}</p>}

            {isModalOpen && videoSrc && (
                <div className="fixed inset-[-10px] bg-black bg-opacity-70 flex items-center justify-center z-50" onClick={() => setIsModalOpen(false)}>
                    <video src={videoSrc} controls autoPlay className="max-w-[80vw] max-h-[80vh] object-contain" onClick={(e) => e.stopPropagation()} />
                </div>
            )}
        </div>
    );
};

export default VideoDisplayer;
