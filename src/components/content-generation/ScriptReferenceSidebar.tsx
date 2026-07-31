import React from 'react';
import { Sparkles, Video, Eye, X, Film } from 'lucide-react';
import toast from 'react-hot-toast';

interface ScriptReferenceSidebarProps {
    remixStructure: any;
    setRemixStructure: (val: any) => void;
    remixSourceTitle: string;
    setRemixSourceTitle: (val: string) => void;
    setTopic: (val: string) => void;
    setShowStructureModal: (val: boolean) => void;
}

export default function ScriptReferenceSidebar({
    remixStructure, setRemixStructure, remixSourceTitle, setRemixSourceTitle,
    setTopic, setShowStructureModal
}: ScriptReferenceSidebarProps) {
    if (remixStructure) {
        return (
            <div className="bg-surface p-5 rounded-lg shadow-sm border-2 border-primary-subtle relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-primary-subtle text-primary text-[10px] font-bold px-2 py-1 rounded-bl-lg">
                    REMIX MODE
                </div>
                <h3 className="text-sm font-bold text-primary flex items-center mb-4">
                    <Sparkles size={16} className="mr-2 text-primary" />
                    仿写源
                </h3>
                
                <div className="space-y-4">
                    <div className="bg-primary-subtle/50 p-3 rounded-md border border-primary-subtle">
                        <span className="text-xs font-semibold text-primary block mb-1">原视频主题</span>
                        <p className="text-sm font-medium text-primary line-clamp-2">
                            {remixSourceTitle}
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div className="bg-surface-muted p-2 rounded border border-border">
                            <span className="text-[10px] text-text-tertiary block">开头钩子</span>
                            <span className="text-xs font-medium text-text-secondary">{remixStructure.hook_type || '通用'}</span>
                        </div>
                        <div className="bg-surface-muted p-2 rounded border border-border">
                            <span className="text-[10px] text-text-tertiary block">情感基调</span>
                            <span className="text-xs font-medium text-text-secondary">{remixStructure.tone || '默认'}</span>
                        </div>
                    </div>

                    {remixStructure.visual_analysis && (
                        <div className="bg-primary-subtle p-3 rounded-md border border-primary-subtle">
                            <div className="flex items-center text-primary mb-1">
                                <Video size={12} className="mr-1" />
                                <span className="text-xs font-bold">视觉风格提取</span>
                            </div>
                            <p className="text-xs text-primary line-clamp-3 leading-relaxed">
                                {remixStructure.visual_analysis}
                            </p>
                        </div>
                    )}

                    <button 
                        onClick={() => setShowStructureModal(true)}
                        className="w-full py-2 text-xs text-primary bg-surface border border-primary-subtle rounded hover:bg-primary-subtle transition-colors flex items-center justify-center"
                    >
                        <Eye size={12} className="mr-1" /> 查看完整结构数据
                    </button>
                    
                    <button 
                        onClick={() => {
                            setRemixStructure(null);
                            setRemixSourceTitle('');
                            setTopic(''); // Clear topic on cancel
                            toast('已退出仿写模式');
                        }}
                        className="w-full py-2 text-xs text-text-tertiary hover:text-text-secondary flex items-center justify-center"
                    >
                        <X size={12} className="mr-1" /> 取消仿写，新建脚本
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gradient-to-br from-primary-subtle to-primary-subtle p-4 rounded-lg border border-primary-subtle">
            <h3 className="text-sm font-bold text-primary flex items-center mb-3">
                <Film size={16} className="mr-2" />
                短视频黄金法则
            </h3>
            <div className="space-y-2.5">
                <div className="flex items-start">
                    <span className="bg-primary-subtle text-primary text-xs font-bold px-1.5 py-0.5 rounded mr-2 mt-0.5 shrink-0">3s</span>
                    <p className="text-xs text-primary leading-relaxed">
                        <strong>黄金前3秒：</strong>开头必须有视觉冲击或悬念钩子
                    </p>
                </div>
                <div className="flex items-start">
                    <span className="bg-primary-subtle text-primary text-xs font-bold px-1.5 py-0.5 rounded mr-2 mt-0.5 shrink-0">视听</span>
                    <p className="text-xs text-primary leading-relaxed">
                        <strong>视听结合：</strong>画面配合口播节奏，避免"念稿式"
                    </p>
                </div>
                <div className="flex items-start">
                    <span className="bg-primary-subtle text-primary text-xs font-bold px-1.5 py-0.5 rounded mr-2 mt-0.5 shrink-0">结构</span>
                    <p className="text-xs text-primary leading-relaxed">
                        <strong>情绪曲线：</strong>引入→痛点→解决方案→升华→互动
                    </p>
                </div>
            </div>
        </div>
    );
}
