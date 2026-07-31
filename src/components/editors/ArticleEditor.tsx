
import { BookOpen } from 'lucide-react';

interface ArticleEditorProps {
    content: string;
    isEditing: boolean;
    onChange: (val: string) => void;
}

export default function ArticleEditor({ content, isEditing, onChange }: ArticleEditorProps) {
    return (
        <div className="space-y-4">
            <div className="flex items-center text-primary bg-primary-subtle p-3 rounded-lg border border-primary-subtle">
                <BookOpen size={18} className="mr-2" />
                <span className="text-sm font-bold">深度长文创作模式 (Article Mode)</span>
            </div>
            
            {isEditing ? (
                <textarea 
                    value={content}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-full h-[600px] p-4 bg-surface border border-strong rounded-lg focus:ring-primary focus:border-primary text-base leading-relaxed"
                    placeholder="在这里撰写深度长文..."
                />
            ) : (
                <div className="prose prose-lg max-w-none text-text whitespace-pre-wrap bg-surface p-6 rounded-lg border border-border min-h-[600px]">
                    {content || '生成的内容为空 (No content generated)'}
                </div>
            )}
            
            <p className="text-xs text-text-tertiary text-center">
                * 长文模式下，AI 不会自动生成配图，专注于文字内容的深度与逻辑。
            </p>
        </div>
    );
}
