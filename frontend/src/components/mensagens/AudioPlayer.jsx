import React, { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import api from '../../api/axiosConfig';

const AudioPlayer = ({ instanceId, messageId, transcription }) => {
    const [audioSrc, setAudioSrc] = useState(null);
    const [loadState, setLoadState] = useState('idle'); // 'idle', 'loading', 'loaded', 'error'

    const playerRef = useRef(null);
    const audioBlobUrlRef = useRef(null);

    useEffect(() => {
        return () => {
            if (audioBlobUrlRef.current) {
                URL.revokeObjectURL(audioBlobUrlRef.current);
            }
        };
    }, []);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (entry.isIntersecting && loadState === 'idle') {
                    loadAudio();
                    if (playerRef.current) {
                        observer.unobserve(playerRef.current);
                    }
                }
            },
            { rootMargin: '0px', threshold: 0.1 }
        );

        if (playerRef.current) {
            observer.observe(playerRef.current);
        }

        return () => {
            if (playerRef.current) {
                observer.unobserve(playerRef.current);
            }
        };
    }, [loadState]);

    const loadAudio = async () => {
        if (loadState !== 'idle') return;

        setLoadState('loading');
        try {
            const response = await api.get(`/whatsapp/${instanceId}/media/${messageId}`, {
                responseType: 'blob',
            });
            const blob = response.data;
            const blobUrl = URL.createObjectURL(blob);
            audioBlobUrlRef.current = blobUrl;
            setAudioSrc(blobUrl);
            setLoadState('loaded');
        } catch (error) {
            console.error("Erro ao carregar áudio inline:", error);
            setLoadState('error');
        }
    };

    return (
        <div ref={playerRef} className="space-y-2">
            <div className="w-96 h-10">
                {loadState === 'loading' || loadState === 'idle' ? (
                    <div className="flex items-center justify-center h-10 bg-gray-100 rounded-full text-gray-500">
                        <Loader2 size={18} className="animate-spin mr-2" />
                        <span className="text-sm">A carregar áudio...</span>
                    </div>
                ) : loadState === 'error' ? (
                    <div className="flex items-center justify-center h-10 bg-red-100 text-red-600 rounded-full text-sm">Erro ao carregar</div>
                ) : (
                    <audio src={audioSrc} controls className="w-full h-10" />
                )}
            </div>
        </div>
    );
};

export default AudioPlayer;
