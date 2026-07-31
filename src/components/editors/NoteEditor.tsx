
import { CardGeneratorHandle } from '../CardGenerator';
import CardGenerator from '../CardGenerator';
import { Loader2, Video, Edit3, ImageIcon } from 'lucide-react';

interface NoteEditorProps {
    result: any;
    selectedOptionIndex: number;
    generatedImages: any[];
    handleGenerateImage: (index: number) => void;
    handleEditImage: (url: string) => void;
    setActiveTab: (tab: any) => void;
    setVideoMode: (mode: any) => void;
    setVideoImageUrl: (url: string) => void;
    setVideoPrompt: (prompt: string) => void;
    cardGeneratorRef: React.RefObject<CardGeneratorHandle>;
}

export default function NoteEditor({
    result,
    selectedOptionIndex,
    generatedImages,
    handleGenerateImage,
    handleEditImage,
    setActiveTab,
    setVideoMode,
    setVideoImageUrl,
    setVideoPrompt,
    cardGeneratorRef
}: NoteEditorProps) {
    
    return (
        <div className="space-y-6">
            {/* AI Image Generation Section */}
            {generatedImages.length > 0 && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-text-secondary flex items-center">
                        <ImageIcon size={16} className="mr-2 text-primary" />
                        AI 配图生成 (AI Image Generation)
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                        {generatedImages.map((img, idx) => (
                            <div key={idx} className="border rounded-md p-3 bg-surface-muted flex flex-col space-y-2">
                                <div className="text-xs text-text-tertiary line-clamp-2 h-8" title={img.prompt}>
                                    {idx + 1}. {img.prompt}
                                </div>
                                <div className="relative aspect-[3/4] bg-surface-hover rounded-md overflow-hidden flex items-center justify-center group">
                                    {img.url ? (
                                        <>
                                            <img src={img.url} alt={`Generated ${idx}`} className="w-full h-full object-cover" />
                                            <button 
                                                onClick={() => {
                                                    setActiveTab('video');
                                                    setVideoMode('i2v');
                                                    setVideoImageUrl(img.url);
                                                    setVideoPrompt(`Let this image move: ${img.prompt}`);
                                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                                }}
                                                className="absolute bottom-2 right-2 bg-black/50 hover:bg-black/70 text-primary-text p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                                title="生成视频 (Create Video)"
                                            >
                                                <Video size={14} />
                                            </button>
                                            <button 
                                                onClick={() => handleEditImage(img.url)}
                                                className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-primary-text p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                                title="编辑图片 (Edit Image)"
                                            >
                                                <Edit3 size={14} />
                                            </button>
                                        </>
                                    ) : (
                                        <div className="text-center p-2">
                                            {img.loading ? (
                                                <Loader2 className="animate-spin text-primary mx-auto" />
                                            ) : (
                                                <span className="text-xs text-text-tertiary">等待生成</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <button 
                                    onClick={() => handleGenerateImage(idx)}
                                    disabled={img.loading || !!img.url}
                                    className={`w-full py-1.5 text-xs rounded border 
                                        ${img.url 
                                            ? 'bg-success-subtle text-success border-success-subtle' 
                                            : 'bg-surface text-primary border-primary-subtle hover:bg-primary-subtle'
                                        }`}
                                >
                                    {img.url ? '已生成' : (img.loading ? '生成中...' : '生成图片')}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Card Generator Section (Legacy/Fallback) */}
            {generatedImages.length === 0 && (
                <div className="bg-surface-muted/50 p-4 rounded-lg border border-border">
                    <CardGenerator 
                        ref={cardGeneratorRef}
                        title={result.title}
                        content={result.options[selectedOptionIndex].content}
                        tags={result.tags}
                    />
                </div>
            )}
        </div>
    );
}
