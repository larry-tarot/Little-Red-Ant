import React from 'react';
import { Clock, Film, AlertCircle, Loader2 } from 'lucide-react';
import { VideoScene } from './types';

interface TimelineProps {
    scenes: VideoScene[];
    activeSceneId: string | null;
    onSceneClick: (id: string) => void;
}

const Timeline: React.FC<TimelineProps> = ({ scenes, activeSceneId, onSceneClick }) => {
    // Calculate total duration
    const totalDuration = scenes.reduce((acc, scene) => acc + (scene.duration || 5), 0);

    return (
        <div className="bg-surface border-t border-border h-48 flex flex-col">
            {/* Toolbar / Time Ruler */}
            <div className="h-8 bg-surface-muted border-b border-border flex items-center px-4 text-xs text-text-tertiary">
                <Clock size={12} className="mr-2" />
                <span>总时长: ~{totalDuration.toFixed(1)}s</span>
            </div>

            {/* Tracks Container */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
                <div className="flex gap-2 min-w-max h-full items-center">
                    {scenes.map((scene) => (
                        <div
                            key={scene.id}
                            onClick={() => onSceneClick(scene.id)}
                            className={`
                                relative h-28 rounded-lg border-2 cursor-pointer transition-all flex-shrink-0 group overflow-hidden
                                ${activeSceneId === scene.id 
                                    ? 'border-primary ring-2 ring-primary-subtle shadow-md transform -translate-y-1' 
                                    : 'border-border hover:border-primary-subtle hover:shadow-sm'}
                            `}
                            style={{ 
                                width: `${Math.max((scene.duration || 5) * 20, 100)}px` // Scale: 20px per second, min 100px
                            }}
                            title={`分镜 ${scene.scene_index + 1}: ${scene.script_visual}`}
                        >
                            {/* Status Overlay */}
                            <div className="absolute inset-0 bg-surface-muted flex flex-col items-center justify-center p-2">
                                {scene.status === 'COMPLETED' && scene.video_url ? (
                                    <video 
                                        src={scene.video_url} 
                                        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                        muted
                                        loop
                                        onMouseOver={e => e.currentTarget.play()}
                                        onMouseOut={e => e.currentTarget.pause()}
                                    />
                                ) : scene.status === 'GENERATING' ? (
                                    <div className="flex flex-col items-center text-primary">
                                        <Loader2 size={20} className="animate-spin mb-1" />
                                        <span className="text-[10px]">生成中</span>
                                    </div>
                                ) : scene.status === 'FAILED' ? (
                                    <div className="flex flex-col items-center text-danger">
                                        <AlertCircle size={20} className="mb-1" />
                                        <span className="text-[10px]">失败</span>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center text-text-tertiary">
                                        <Film size={20} className="mb-1" />
                                        <span className="text-[10px]">待生成</span>
                                    </div>
                                )}
                            </div>

                            {/* Badge */}
                            <div className="absolute top-1 left-1 bg-black/50 text-primary-text text-[10px] px-1.5 rounded backdrop-blur-sm">
                                #{scene.scene_index + 1}
                            </div>

                            {/* Duration Badge */}
                            <div className="absolute bottom-1 right-1 bg-black/50 text-primary-text text-[10px] px-1.5 rounded backdrop-blur-sm font-mono">
                                {scene.duration || 5}s
                            </div>
                        </div>
                    ))}
                    
                    {/* Add Button (Mock) */}
                    <div className="h-28 w-12 border-2 border-dashed border-strong rounded-lg flex items-center justify-center text-text-tertiary hover:text-primary hover:border-primary-subtle hover:bg-primary-subtle transition-colors cursor-pointer" title="添加分镜">
                        <span className="text-2xl">+</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Timeline;
