
import { GitBranch, Eye, FileText, ArrowRight } from 'lucide-react';

interface ScriptReferenceSidebarProps {
    remixStructure: any;
    setRemixStructure: (val: any) => void;
    remixSourceTitle: string;
    setRemixSourceTitle: (val: string) => void;
    setTopic: (val: string) => void;
    setShowStructureModal: (val: boolean) => void;
}

export default function ScriptReferenceSidebar({
    remixStructure,
    setRemixStructure,
    remixSourceTitle,
    setRemixSourceTitle,
    setTopic,
    setShowStructureModal
}: ScriptReferenceSidebarProps) {
    
    if (!remixStructure) {
        return (
            <div className="bg-surface p-6 rounded-lg shadow-sm border border-border h-full flex flex-col items-center justify-center text-center text-text-tertiary">
                <GitBranch size={48} className="mb-4 text-text-tertiary" />
                <h3 className="font-medium text-text mb-2">暂无参考结构</h3>
                <p className="text-sm mb-6">
                    您可以从“竞品分析”页面选择一篇爆款笔记，点击“使用此策略”，将其结构引入到这里。
                </p>
                <div className="text-xs bg-surface-muted p-3 rounded text-text-tertiary w-full">
                    💡 提示：引入结构后，AI 将模仿其叙事逻辑为您生成新脚本。
                </div>
            </div>
        );
    }

    return (
        <div className="bg-surface rounded-lg shadow-sm border border-primary-subtle overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-primary to-primary px-6 py-4">
                <div className="flex items-center text-primary-text mb-1">
                    <GitBranch size={18} className="mr-2" />
                    <span className="font-bold text-sm uppercase tracking-wider">当前参考策略</span>
                </div>
                <h3 className="text-primary-text font-bold text-lg truncate leading-tight" title={remixSourceTitle}>
                    {remixSourceTitle || '未命名策略'}
                </h3>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
                
                {/* Visual Analysis Preview */}
                {remixStructure.visual_analysis && (
                    <div>
                        <div className="text-xs font-bold text-text-tertiary uppercase mb-2 flex items-center">
                            <Eye size={12} className="mr-1" /> 视觉风格
                        </div>
                        <div className="text-xs text-text-secondary bg-surface-muted p-3 rounded border border-border line-clamp-3 leading-relaxed">
                            {remixStructure.visual_analysis}
                        </div>
                    </div>
                )}

                {/* Structure Breakdown Preview */}
                <div>
                    <div className="text-xs font-bold text-text-tertiary uppercase mb-2 flex items-center">
                        <FileText size={12} className="mr-1" /> 结构脉络
                    </div>
                    <div className="space-y-2">
                        {remixStructure.structure_breakdown?.slice(0, 3).map((step: string, i: number) => (
                            <div key={i} className="flex items-start text-sm">
                                <span className="text-primary font-bold mr-2 text-xs mt-0.5">{i + 1}.</span>
                                <span className="text-text-secondary line-clamp-1">{step}</span>
                            </div>
                        ))}
                        {(remixStructure.structure_breakdown?.length || 0) > 3 && (
                            <div className="text-xs text-text-tertiary pl-4 italic">
                                + 还有 {remixStructure.structure_breakdown.length - 3} 个步骤...
                            </div>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="pt-2">
                    <button 
                        onClick={() => setShowStructureModal(true)}
                        className="w-full py-2 bg-primary-subtle hover:bg-primary-subtle text-primary rounded-md text-sm font-medium transition-colors flex items-center justify-center"
                    >
                        查看完整结构详情
                        <ArrowRight size={14} className="ml-1" />
                    </button>
                    
                    <button 
                        onClick={() => {
                            if(window.confirm('确定要清除当前的参考策略吗？清除后将切换回普通生成模式。')) {
                                setRemixStructure(null);
                                setRemixSourceTitle('');
                                setTopic('');
                            }
                        }}
                        className="w-full mt-2 py-2 text-text-tertiary hover:text-danger text-xs transition-colors"
                    >
                        清除策略
                    </button>
                </div>
            </div>
        </div>
    );
}
