import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import axios from '@/lib/axios';
import { Sparkles, FileText, Video, Edit3, History, ChevronLeft, ChevronRight, RotateCw, Copy, Save, ExternalLink, Film, Loader2, Calendar, Wand2, X, Image as ImageIcon, AlertCircle, Eye, Mic2, Lightbulb, BarChart3, Target, Zap, ThumbsUp } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { CardGeneratorHandle } from '../components/CardGenerator';

const CardGenerator = lazy(() => import('../components/CardGenerator'));
const ImageEditor = lazy(() => import('../components/ImageEditor'));
import NoteEditor from '../components/NoteEditor';
import ArticleEditor from '../components/ArticleEditor';
import toast from 'react-hot-toast';

// New Components
import TrendSidebar from '../components/content-generation/TrendSidebar';
import NoteGeneratorForm from '../components/content-generation/NoteGeneratorForm';
import VideoScriptGeneratorForm from '../components/content-generation/VideoScriptGeneratorForm';
import ScriptReferenceSidebar from '../components/content-generation/ScriptReferenceSidebar';
import VideoGeneratorForm from '../components/content-generation/VideoGeneratorForm';
import ComplianceReport from '../components/content-generation/ComplianceReport';

// Hooks
import { useContentGeneration, GeneratedContent, GeneratedImage } from '../hooks/useContentGeneration';
import { useVideoGeneration } from '../hooks/useVideoGeneration';
import FriendlyError from '../components/FriendlyError';
import { wrapError } from '../utils/ErrorMessages';

export default function ContentGeneration() {
  const location = useLocation();
  const navigate = useNavigate();
  const cardGeneratorRef = useRef<CardGeneratorHandle>(null);

  // Tab State
  const [activeTab, setActiveTab] = useState<'note' | 'video_script' | 'video'>('note');

  // --- Custom Hooks ---
  const {
    contentType, setContentType,
    topic, setTopic,
    keywords, setKeywords,
    style, setStyle,
    characterDesc,
    customInstructions, setCustomInstructions,
    loading,
    errorMsg,
    history, setHistory,
    currentIndex, setCurrentIndex,
    remixStructure, setRemixStructure,
    remixSourceTitle, setRemixSourceTitle,
    handleGenerate: hookHandleGenerate,
    cancelGenerate,
    handleGenerateImage
  } = useContentGeneration();

  const {
    videoMode, setVideoMode,
    videoPrompt, setVideoPrompt,
    videoImageUrl, setVideoImageUrl,
    videoLoading,
    videoHistory,
    currentVideoIndex, setCurrentVideoIndex,
    videoError,
    sceneVideos,
    setIsStitching,
    setStitchedVideoUrl,
    creatingProject, setCreatingProject,
    handleGenerateVideo: hookHandleGenerateVideo,
    handleGenerateSceneVideo: hookHandleGenerateSceneVideo
  } = useVideoGeneration();

  // --- Local State (UI only) ---
  const [draftId, setDraftId] = useState<number | null>(null);
  const [promptTemplates, setPromptTemplates] = useState<{id: number, name: string, template: string}[]>([]);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0);
  
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [autoPublish, setAutoPublish] = useState(false); 
  const [scheduledTime, setScheduledTime] = useState(''); 

  // 跨账号批量发布状态
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [allAccounts, setAllAccounts] = useState<any[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<number>>(new Set());
  const [isBatchPublishing, setIsBatchPublishing] = useState(false);
  const [batchResult, setBatchResult] = useState<{ success: boolean; tasks?: any[]; skipped?: any[]; message?: string } | null>(null);

  // Image Editor State
  const [showImageEditor, setShowImageEditor] = useState(false);
  const [editingImageUrl, setEditingImageUrl] = useState('');
  
  // Structure Modal
  const [showStructureModal, setShowStructureModal] = useState(false);
  
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [editedContent, setEditedContent] = useState('');

  // 标题分析状态
  const [isAnalyzingTitle, setIsAnalyzingTitle] = useState(false);
  const [titleAnalysis, setTitleAnalysis] = useState<{
    score: number;
    breakdown: { hook_strength: number; keyword_relevance: number; emotional_appeal: number; clarity: number; length_optimal: boolean };
    suggestions: string[];
    variants: string[];
  } | null>(null);
  const [showTitleAnalysis, setShowTitleAnalysis] = useState(false);
  
  // Account State
  const [activeAccount, setActiveAccount] = useState<any>(null);

  // Selected Background Image for Card
  const [selectedBgImage, setSelectedBgImage] = useState<string | undefined>(undefined);

  // Computed Values
  const currentSession = currentIndex >= 0 ? history[currentIndex] : null;
  const result = currentSession?.content || null;
  const generatedImages = currentSession?.images || [];
  const currentVideoSession = currentVideoIndex >= 0 ? videoHistory[currentVideoIndex] : null;

  const handleSelectBgForCard = (url: string) => {
      setSelectedBgImage(url);
      toast.success('已选择为封面背景，请查看下方卡片预览');
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  // Fetch Active Account
  useEffect(() => {
      axios.get('/api/accounts').then(res => {
          const active = res.data.find((a: any) => a.is_active);
          setActiveAccount(active || null);
      }).catch(() => toast.error('账号信息加载失败'));
  }, []);

  // Fetch Prompts
  useEffect(() => {
    axios.get('/api/prompts')
      .then(res => setPromptTemplates(res.data))
      .catch(() => toast.error('提示词模板加载失败'));
  }, []);

  // Handle Location State (Navigation)
  useEffect(() => {
    if (location.state) {
        const state = location.state;
        
        if (state.remixNote) {
             const { title, structure, type } = state.remixNote;
             setTopic(title || '');
             setRemixSourceTitle(title || '');
             setRemixStructure(structure);
             
             if (type === 'video') {
                 setActiveTab('video_script');
                 setContentType('video_script');
                 toast.success(`已引用视频结构，为您切换至脚本模式`);
             } else {
                 setActiveTab('note');
                 setContentType('note');
                 toast.success(`已引用热门笔记结构：${title}`);
             }
        } else if (state.generatedResult) {
            const res = state.generatedResult as GeneratedContent;
            setTopic(res.title || '');
            setHistory([{
                content: res,
                images: [],
                timestamp: Date.now()
            }]);
            setCurrentIndex(0);
            toast.success('已加载生成结果');
        } else if (state.draft) {
            const draft = state.draft;
            setDraftId(draft.id);
            setTopic(draft.title || '');
            
            // Refined Logic for Content Type Detection
            let targetType: 'note' | 'article' | 'video_script' = 'note';
            
            if (draft.content_type === 'video_script') {
                targetType = 'video_script';
            } else if (draft.content_type === 'article') {
                targetType = 'article';
            } else {
                const content = draft.content || '';
                const trimmedContent = content.trim();
                const hasMarkdownTitle = trimmedContent.startsWith('#');
                const isLongContent = content.length > 800;
                const validImages = (draft.images || []).filter((img: string) => img && img.length > 0);
                const hasImages = validImages.length > 0;
                
                if (hasMarkdownTitle) {
                    targetType = 'article';
                } else if (isLongContent && !hasImages) {
                    targetType = 'article';
                }
            }

            if (targetType === 'video_script') {
                setActiveTab('video_script');
                setContentType('video_script');
            } else if (targetType === 'article') {
                setActiveTab('note'); 
                setContentType('article');
                setTimeout(() => {
                    setContentType('article');
                    toast.success('已自动切换至深度长文模式');
                }, 50);
            } else {
                setActiveTab('note');
                setContentType('note');
            }

            // Restore Metadata (Context)
            if (draft.meta_data) {
                if (draft.meta_data.topic) setTopic(draft.meta_data.topic);
                if (draft.meta_data.keywords) setKeywords(draft.meta_data.keywords);
                if (draft.meta_data.style) setStyle(draft.meta_data.style);
                if (draft.meta_data.remixStructure) setRemixStructure(draft.meta_data.remixStructure);
                if (draft.meta_data.customInstructions) setCustomInstructions(draft.meta_data.customInstructions);
                
                // If it was a remix, show the source title if available (we might not have saved it, but structure is key)
                if (draft.meta_data.remixStructure) {
                    setRemixSourceTitle(draft.meta_data.remixStructure.hook_type || '已恢复的爆款结构');
                }
            }

            toast.success('已加载草稿内容及创作上下文');
            
            const draftContent: GeneratedContent = {
                title: draft.title,
                options: [{
                    type: 'experience',
                    label: '草稿内容',
                    content: draft.content
                }],
                tags: draft.tags,
                image_prompts: []
            };

            const restoredImages: GeneratedImage[] = (draft.images || []).map((img: any) => ({
                prompt: typeof img === 'string' ? '（图片已从草稿恢复，提示词不可用）' : (img.prompt || '（图片已从草稿恢复，提示词不可用）'),
                url: typeof img === 'string' ? img : img.url,
                loading: false
            }));

            setHistory([{
                content: draftContent,
                images: restoredImages,
                timestamp: Date.now()
            }]);
            setCurrentIndex(0);
        } else if (state.fromAnalysis) {
            if (state.topic) setTopic(state.topic);
            if (state.style) setStyle(state.style);
            toast.success(`已加载推荐选题：${state.topic}`);
        }
        
        if (state.activeTab) {
             setActiveTab(state.activeTab);
             if (state.activeTab === 'video_script') setContentType('video_script');
        }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  // Auto-Save Draft Effect
  useEffect(() => {
    // Check if we have a valid result and it's a newly generated content (not just loaded history)
    // We can use currentSession timestamp or ID to track
    if (result && currentSession?.status === 'COMPLETED' && !draftId && !isSaving) {
         // Debounce or check if already auto-saved for this session?
         // Simplest way: Check if this session ID has been saved. 
         // But we don't have a session ID easily accessible that persists across saves.
         // Let's just auto-save if draftId is null (new generation) and result exists.
         // But wait, if user generates again, draftId might still be null if we didn't update it?
         // Actually, handleSaveDraft sets draftId.
         
         // Better logic: 
         // When generation completes (status becomes COMPLETED), trigger save.
         // We need to avoid infinite loops or saving old history.
         
         // Let's use a ref to track the last auto-saved task ID
         if (currentSession.taskId && lastAutoSavedTaskIdRef.current !== currentSession.taskId) {
             handleSaveDraft();
             lastAutoSavedTaskIdRef.current = currentSession.taskId;
         }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSession, result, draftId, isSaving]);

  const lastAutoSavedTaskIdRef = useRef<string | null>(null);

  // Wrappers for Hook Functions
  const handleGenerate = (e?: React.FormEvent) => {
      e?.preventDefault();
      setSelectedOptionIndex(0);
      setPublishStatus(null);
      hookHandleGenerate(activeAccount?.id);
  };

  const handleGenerateVideo = (e: React.FormEvent) => {
      hookHandleGenerateVideo(e, activeAccount?.id);
  };

  const handleUpdateImagePrompt = (imageIndex: number, newPrompt: string) => {
      setHistory(prev => {
          const newHistory = [...prev];
          const session = { ...newHistory[currentIndex] };
          const images = [...session.images];
          if (images[imageIndex]) {
              images[imageIndex] = { ...images[imageIndex], prompt: newPrompt };
              session.images = images;
              newHistory[currentIndex] = session;
          }
          return newHistory;
      });
  };

    const handleSaveDraft = async () => {
    if (!result) return;
    setIsSaving(true);
    try {
      let imagePayload: any[] = [];
      
      // Save full image objects {url, prompt} instead of just strings
      // Filter out empty URLs but keep the prompt for context if needed (though drafts usually need url)
      // Actually, we should only save valid images that have been generated
      const validAiImages = generatedImages.filter(img => img.url).map(img => ({
          url: img.url,
          prompt: img.prompt
      }));
      
      if (validAiImages.length > 0) {
          imagePayload = validAiImages;
      } else if (cardGeneratorRef.current) {
          const cardImage = await cardGeneratorRef.current.generateImage();
          if (cardImage) imagePayload = [{ url: cardImage, prompt: '封面卡片' }];
      }

      const payload = {
        title: result.title,
        content: result.options?.[selectedOptionIndex]?.content || '',
        tags: result.tags,
        images: imagePayload,
        contentType: contentType
      };

      if (draftId) {
        const res = await axios.put(`/api/drafts/${draftId}`, payload);
        if (res.data.images) {
            setHistory(prev => {
                const newHistory = [...prev];
                const session = { ...newHistory[currentIndex] };
                const images = [...session.images];
                
                // Merge back localized images
                res.data.images.forEach((newImg: any, i: number) => {
                    const newUrl = typeof newImg === 'string' ? newImg : newImg.url;
                    if (images[i]) images[i] = { ...images[i], url: newUrl };
                });
                
                session.images = images;
                newHistory[currentIndex] = session;
                return newHistory;
            });
        }
        toast.success('草稿已更新！(图片已本地化)');
      } else {
        const res = await axios.post('/api/drafts', payload);
        setDraftId(res.data.id);
        if (res.data.images) {
            setHistory(prev => {
                const newHistory = [...prev];
                const session = { ...newHistory[currentIndex] };
                const images = [...session.images];
                
                res.data.images.forEach((newImg: any, i: number) => {
                    const newUrl = typeof newImg === 'string' ? newImg : newImg.url;
                    if (images[i]) images[i] = { ...images[i], url: newUrl };
                });
                
                session.images = images;
                newHistory[currentIndex] = session;
                return newHistory;
            });
        }
        toast.success('已保存到草稿箱！(图片已本地化)');
      }
    } catch (_error) {
      toast.error('保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!result) return;
    setIsPublishing(true);
    setPublishStatus('正在检查账号状态...');

    try {
      const statusRes = await axios.get('/api/accounts/status');
      const { activeAccount, isLoggedIn } = statusRes.data;
      
      if (!activeAccount && !isLoggedIn) {
         setPublishStatus('未检测到活跃账号，请前往"账号矩阵"添加或切换账号...');
         setTimeout(() => {
             setPublishStatus('请先在"账号矩阵"中登录一个账号');
             setIsPublishing(false);
         }, 2000);
         return;
      }

      setPublishStatus(`正在使用账号 [${activeAccount?.nickname || '当前账号'}] 提交任务...`);
      
      let imagePayload: string[] = [];
      const validAiImages = generatedImages.filter(img => img.url).map(img => img.url);
      
      if (validAiImages.length > 0) {
          imagePayload = validAiImages;
      } else if (cardGeneratorRef.current) {
          const cardImage = await cardGeneratorRef.current.generateImage();
          if (cardImage) imagePayload = [cardImage];
      }

      const payload = {
        title: result.title,
        content: result.options?.[selectedOptionIndex]?.content || '',
        tags: result.tags,
        imageData: imagePayload,
        autoPublish,
        confirmedByUser: true,
        scheduledAt: scheduledTime ? new Date(scheduledTime).toISOString() : undefined,
        contentType: contentType,
        accountId: activeAccount?.id // Explicitly pass accountId
      };

      const _res = await axios.post('/api/publish/publish', payload);
      
      if (scheduledTime) {
          setPublishStatus(`任务已加入队列，将于 ${new Date(scheduledTime).toLocaleString()} 执行`);
          toast.success(`定时任务设置成功！\n任务将于 ${new Date(scheduledTime).toLocaleString()} 自动执行。`);
          navigate('/tasks');
          return;
      }

      setPublishStatus('任务已提交至队列，请在全局任务监控中查看进度');
      toast.success('发布任务已提交');
      
    } catch (error: any) {
      const errorData = error.response?.data;
      const errorMsg = errorData?.error || error.message;

      if (errorData?.code === 'SESSION_EXPIRED') {
          setPublishStatus('发布中断：账号登录状态已失效');
          toast((t) => (
              <div className="flex flex-col">
                  <span className="font-medium mb-2">账号登录已失效</span>
                  <span className="text-sm text-text-tertiary mb-3">请前往账号矩阵重新登录小红书账号。</span>
                  <div className="flex gap-2">
                      <button 
                          onClick={() => {
                              toast.dismiss(t.id);
                              navigate('/accounts');
                          }}
                          className="px-3 py-1 bg-primary text-primary-text text-xs rounded hover:bg-primary-hover"
                      >
                          去登录账号
                      </button>
                      <button 
                          onClick={() => toast.dismiss(t.id)}
                          className="px-3 py-1 bg-surface-hover text-text-secondary text-xs rounded hover:bg-surface-hover"
                      >
                          关闭
                      </button>
                  </div>
              </div>
          ), { duration: 8000 });
          return;
      }

      setPublishStatus(`发布流程中断: ${errorMsg}`);
      toast.error(`发布流程中断: ${errorMsg}`);
    } finally {
      setIsPublishing(false);
    }
  };

  /**
   * 打开跨账号分发弹窗，预加载所有账号列表
   */
  const handleOpenBatchModal = async () => {
      setBatchResult(null);
      setSelectedAccountIds(new Set());
      try {
          const res = await axios.get('/api/accounts');
          const accounts = res.data || [];
          setAllAccounts(accounts);
          setShowBatchModal(true);
      } catch (_error) {
          toast.error('账号列表加载失败');
      }
  };

  /**
   * 执行跨账号批量发布
   */
  const handleBatchPublish = async () => {
      if (!result || selectedAccountIds.size === 0) {
          toast.error('请至少选择一个目标账号');
          return;
      }
      setIsBatchPublishing(true);
      setBatchResult(null);
      try {
          let imagePayload: string[] = [];
          const validAiImages = generatedImages.filter(img => img.url).map(img => img.url);
          if (validAiImages.length > 0) {
              imagePayload = validAiImages;
          } else if (cardGeneratorRef.current) {
              const cardImage = await cardGeneratorRef.current.generateImage();
              if (cardImage) imagePayload = [cardImage];
          }

          const res = await axios.post('/api/publish/batch', {
              title: result.title,
              content: result.options?.[selectedOptionIndex]?.content || '',
              tags: result.tags,
              imageData: imagePayload,
              confirmedByUser: true,
              accountIds: Array.from(selectedAccountIds),
              draftId: draftId || undefined
          });
          setBatchResult(res.data);
          if (res.data.success) {
              toast.success(`已向 ${res.data.tasks?.length || 0} 个账号提交发布任务`);
          }
      } catch (error: any) {
          const errMsg = error.response?.data?.error || error.message;
          toast.error(`批量发布失败: ${errMsg}`);
          setBatchResult({ success: false, message: errMsg });
      } finally {
          setIsBatchPublishing(false);
      }
  };

  /**
   * 将当前标题替换为选中的变体标题
   */
  const handleSelectTitleVariant = (variant: string) => {
      if (!result) return;
      setHistory(prev => {
          if (currentIndex < 0 || currentIndex >= prev.length) return prev;
          const newHistory = [...prev];
          const session = { ...newHistory[currentIndex] };
          const content = { ...session.content, title: variant };
          session.content = content;
          newHistory[currentIndex] = session;
          return newHistory;
      });
      toast.success('标题已替换为选中变体');
  };

  const [isFixingCompliance, setIsFixingCompliance] = useState(false);

  const handleAutoFixCompliance = async () => {
      if (!result || !result.risk_warnings) return;
      
      setIsFixingCompliance(true);
      try {
          const currentContent = result.options?.[selectedOptionIndex]?.content || '';
          
          const res = await axios.post('/api/compliance/fix', {
              content: currentContent,
              blockedWords: result.risk_warnings.blocked,
              suggestions: result.risk_warnings.suggestions
          });
          
          const fixedContent = res.data.fixedContent;
          
          if (fixedContent) {
              setEditedContent(fixedContent);
              // Directly save and check again
              await handleSaveContentEdit(fixedContent);
              toast.success('已自动修复违规内容');
          }
      } catch (_error) {
          toast.error('修复失败，请重试');
      } finally {
          setIsFixingCompliance(false);
      }
  };

  /**
   * 标题分析：调用 AI 对当前生成的标题进行吸引力评分和优化建议
   */
  const handleTitleAnalyze = async () => {
      if (!result?.title) return;
      setIsAnalyzingTitle(true);
      setTitleAnalysis(null);
      try {
          const res = await axios.post('/api/generate/title-score', {
              title: result.title,
              niche: style || undefined,
              noteType: contentType === 'article' ? 'article' : 'note'
          });
          if (res.data) {
              setTitleAnalysis(res.data);
              setShowTitleAnalysis(true);
          }
      } catch (_error) {
          toast.error('标题分析失败，请稍后重试');
      } finally {
          setIsAnalyzingTitle(false);
      }
  };

  const handleSaveContentEdit = async (contentToSave?: string) => {
    const contentVal = contentToSave !== undefined ? contentToSave : editedContent;

    // 1. Optimistic Update
    setHistory(prev => {
        if (currentIndex < 0 || currentIndex >= prev.length) return prev;
        const newHistory = [...prev];
        const session = { ...newHistory[currentIndex] };
        const content = { ...session.content };
        
        if (content.options && content.options[selectedOptionIndex]) {
            content.options = [...content.options]; 
            content.options[selectedOptionIndex] = {
                ...content.options[selectedOptionIndex],
                content: contentVal
            };
        }
        
        session.content = content;
        newHistory[currentIndex] = session;
        return newHistory;
    });
    
    if (contentToSave === undefined) {
         setIsEditingContent(false);
         toast.success('内容已更新');
    }

    // 2. Background Compliance Check
    try {
        const currentTitle = result?.title || '';
        const fullContent = currentTitle + '\n' + contentVal;
        
        const res = await axios.post('/api/compliance/check', { content: fullContent });
        const checkResult = res.data;

        setHistory(prev => {
            if (currentIndex < 0 || currentIndex >= prev.length) return prev;
            const newHistory = [...prev];
            const session = { ...newHistory[currentIndex] };
            const content = { ...session.content };
            
            content.risk_warnings = {
                blocked: checkResult.blockedWords,
                warnings: checkResult.warningWords,
                suggestions: checkResult.suggestions,
                score: checkResult.score
            };
            
            session.content = content;
            newHistory[currentIndex] = session;
            return newHistory;
        });
    } catch (_e) {
        toast.error('合规检测失败');
    }
  };

  const parseScript = (content: string) => {
      try {
          const lines = content.split('\n').filter(l => l.trim().startsWith('|'));
          if (lines.length < 3) return []; 
          
          const dataLines = lines.slice(2);
          return dataLines.map(line => {
              const cols = line.split('|').map(c => c.trim());
              if (cols.length < 4) return null;
              
              return {
                  shot: cols[1] || '',
                  visual: cols[2] || '',
                  audio: cols[3] || '',
                  note: cols[4] || ''
              };
          }).filter(item => item !== null);
      } catch (_e) {
          return [];
      }
  };

  const handleGenerateSceneVideo = async (sceneIndex: number, prompt: string) => {
      const key = `${currentIndex}-${selectedOptionIndex}-${sceneIndex}`;
      hookHandleGenerateSceneVideo(key, prompt);
  };

  const _handleBatchGenerateVideos = async () => {
      const scenes = parseScript(result?.options?.[selectedOptionIndex]?.content || '');
      if (scenes.length === 0) return;

      const confirm = window.confirm(`即将开始批量生成 ${scenes.length} 个镜头视频，这将消耗较多资源。是否继续？`);
      if (!confirm) return;

      // Start sequential generation to avoid rate limits
      for (let i = 0; i < scenes.length; i++) {
          const key = `${currentIndex}-${selectedOptionIndex}-${i}`;
          if (sceneVideos[key]?.status === 'completed' || sceneVideos[key]?.status === 'generating') continue;
          
          await handleGenerateSceneVideo(i, scenes[i].visual);
      }
  };

  const _handleStitchVideos = async () => {
      const scenes = parseScript(result?.options?.[selectedOptionIndex]?.content || '');
      const videoUrls = scenes.map((_, i) => {
          const key = `${currentIndex}-${selectedOptionIndex}-${i}`;
          return sceneVideos[key]?.videoUrl;
      }).filter(Boolean) as string[];

      if (videoUrls.length < 2) {
          toast.error('至少需要 2 个已生成的视频片段才能合成');
          return;
      }

      setIsStitching(true);
      try {
          // Mock Stitching for now
          await new Promise(r => setTimeout(r, 3000)); 
          
          toast.success('视频合成指令已发送 (模拟)');
          setStitchedVideoUrl(videoUrls[0]); 
          
      } catch (_error) {
          toast.error('合成失败');
      } finally {
          setIsStitching(false);
      }
  };

  const handleCreateVideoProject = async () => {
      const scenes = parseScript(result?.options?.[selectedOptionIndex]?.content || '');
      if (scenes.length === 0) return;

      setCreatingProject(true);
      try {
          const res = await axios.post('/api/video-projects', {
              title: topic,
              script: scenes,
              character_desc: characterDesc || result?.character_desc,
              tags: result?.tags || [],
              description: `${topic}\n\n${scenes.map((s: any) => s.audio).join('')}\n\n${result?.tags?.map(t => `#${t}`).join(' ') || ''}`
          });
          
          if (res.data.success) {
              const projectId = res.data.data.id;
              toast.success('Project created! Entering Studio...');
              setTimeout(() => {
                  navigate(`/video-studio/${projectId}`);
              }, 1000);
          }
      } catch (_error) {
          toast.error('Failed to create project');
          setCreatingProject(false);
      }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('已复制到剪贴板');
  };

  const handleEditImage = (imageUrl: string) => {
    setEditingImageUrl(imageUrl);
    setShowImageEditor(true);
  };

  const handleSaveEditedImage = (editedImageUrl: string) => {
    setHistory(prev => {
      if (currentIndex < 0 || currentIndex >= prev.length) return prev;
      const newHistory = [...prev];
      const session = { ...newHistory[currentIndex] };
      const images = [...session.images];
      
      const imageIndex = images.findIndex(img => img.url === editingImageUrl);
      if (imageIndex >= 0) {
        images[imageIndex] = { ...images[imageIndex], url: editedImageUrl };
      }
      
      session.images = images;
      newHistory[currentIndex] = session;
      return newHistory;
    });
    
    setShowImageEditor(false);
    setEditingImageUrl('');
    toast.success('图片编辑完成！');
  };

  return (
    <div className="min-h-screen bg-surface-muted p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-text mb-2 flex items-center">
          <Sparkles className="mr-2 text-primary" />
          AI 智能创作
        </h1>
        <p className="text-text-secondary mb-8">
          一站式 AI 创作平台，支持图文笔记、深度长文及视频创作。
        </p>

        {/* Top Tab Switcher */}
        <div className="flex space-x-1 bg-surface-hover p-1 rounded-lg mb-8 w-fit">
             <button
                 onClick={() => setActiveTab('note')}
                 className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'note' ? 'bg-surface text-primary shadow-sm' : 'text-text-secondary hover:bg-surface-muted'}`}
             >
                 <FileText size={16} className="mr-2" />
                 笔记创作
             </button>
             <button
                 onClick={() => {
                     setActiveTab('video_script');
                     setContentType('video_script');
                 }}
                 className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'video_script' ? 'bg-surface text-primary shadow-sm' : 'text-text-secondary hover:bg-surface-muted'}`}
             >
                 <Edit3 size={16} className="mr-2" />
                 视频脚本
             </button>
             <button
                 onClick={() => setActiveTab('video')}
                 className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'video' ? 'bg-surface text-primary shadow-sm' : 'text-text-secondary hover:bg-surface-muted'}`}
             >
                 <Video size={16} className="mr-2" />
                 视频生成
             </button>
        </div>

        {activeTab === 'note' || activeTab === 'video_script' ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Hot Trends - Narrower */}
            <div className="lg:col-span-3 space-y-4">
                {/* 1. Note Mode: Trends */}
                {activeTab === 'note' && (
                    <TrendSidebar onSelectTopic={setTopic} />
                )}

                {/* 2. Script Mode: Remix Source */}
                {activeTab === 'video_script' && (
                    <ScriptReferenceSidebar 
                        remixStructure={remixStructure}
                        setRemixStructure={setRemixStructure}
                        remixSourceTitle={remixSourceTitle}
                        setRemixSourceTitle={setRemixSourceTitle}
                        setTopic={setTopic}
                        setShowStructureModal={setShowStructureModal}
                    />
                )}
            </div>

            {/* Right Column: Main Content Area - Wider */}
            <div className="lg:col-span-9 space-y-4">
                {/* Configuration Form - Always visible */}
                <div className="bg-surface rounded-lg shadow-sm border border-border overflow-hidden">
                    <div className="px-6 py-4 border-b border-border bg-gradient-to-r from-primary-subtle/50 to-surface-muted/50">
                        <h3 className="font-semibold text-text flex items-center">
                            <Edit3 size={18} className="mr-2 text-primary" />
                            创作配置
                        </h3>
                    </div>
                    <div className="p-6">
                        {activeTab === 'note' ? (
                            <NoteGeneratorForm 
                                topic={topic}
                                setTopic={setTopic}
                                keywords={keywords}
                                setKeywords={setKeywords}
                                style={style}
                                setStyle={setStyle}
                                contentType={contentType}
                                setContentType={setContentType}
                                promptTemplates={promptTemplates}
                                activeAccount={activeAccount}
                                loading={loading}
                                onGenerate={handleGenerate}
                                errorMsg={errorMsg}
                                remixStructure={remixStructure}
                                remixSourceTitle={remixSourceTitle}
                                customInstructions={customInstructions}
                                setCustomInstructions={setCustomInstructions}
                            />
                        ) : (
                            <VideoScriptGeneratorForm
                                topic={topic}
                                setTopic={setTopic}
                                keywords={keywords}
                                setKeywords={setKeywords}
                                style={style}
                                setStyle={setStyle}
                                promptTemplates={promptTemplates}
                                activeAccount={activeAccount}
                                loading={loading}
                                onGenerate={handleGenerate}
                                errorMsg={errorMsg}
                                remixStructure={remixStructure}
                                customInstructions={customInstructions}
                                setCustomInstructions={setCustomInstructions}
                            />
                        )}
                    </div>
                </div>

                {/* Result Section */}
                {result ? (
                <div className="bg-surface rounded-lg shadow-sm border border-border overflow-hidden">
                    {currentSession?.status === 'PENDING' ? (
                        <div className="p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
                            <Loader2 className="animate-spin h-12 w-12 text-primary mb-4" />
                            <h3 className="text-lg font-medium text-text">AI 正在创作中...</h3>
                            <p className="text-text-tertiary mt-2">任务已提交至后台，请留意全局任务监控。</p>
                            <p className="text-xs text-text-tertiary mt-4">您可以切换到其他页面，稍后回来查看结果。</p>
                            <button
                                onClick={cancelGenerate}
                                className="mt-6 px-4 py-2 text-sm text-text-secondary bg-surface border border-strong rounded-md hover:bg-surface-muted transition-colors"
                            >
                                取消生成
                            </button>
                        </div>
                    ) : currentSession?.status === 'FAILED' ? (
                        <div className="p-8">
                            <FriendlyError
                                error={wrapError(currentSession.error || '内容生成失败').friendly}
                                onRetry={() => handleGenerate()}
                                action={(() => {
                                    const code = wrapError(currentSession.error || '').friendly.code;
                                    if (code === 'COOKIE_EXPIRED' || code === 'NO_ACTIVE_ACCOUNT') {
                                        return { label: '前往账号矩阵', onClick: () => navigate('/accounts') };
                                    }
                                    return undefined;
                                })()}
                            />
                        </div>
                    ) : (
                    <div className="p-6 space-y-6">
                    
                    {/* Version Control Header */}
                    <div className="flex justify-between items-center border-b border-border pb-4">
                        <div className="flex items-center text-sm text-text-tertiary">
                            <History size={16} className="mr-2" />
                            <span>生成记录</span>
                        </div>
                        <div className="flex items-center space-x-3">
                            <button 
                                onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                                disabled={currentIndex <= 0}
                                className="p-1 rounded-full hover:bg-surface-muted disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <span className="text-sm font-medium text-text-secondary">
                                版本 {currentIndex + 1} / {history.length}
                            </span>
                            <button 
                                onClick={() => setCurrentIndex(prev => Math.min(history.length - 1, prev + 1))}
                                disabled={currentIndex >= history.length - 1}
                                className="p-1 rounded-full hover:bg-surface-muted disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <ChevronRight size={20} />
                            </button>
                            
                            <div className="h-4 w-px bg-surface-hover mx-2"></div>

                            <button
                                onClick={() => {
                                    setVideoMode('t2v');
                                    // Try to use title or content summary as prompt
                                    setVideoPrompt(`Create a cinematic video about: ${result.title}. High quality, aesthetic, xiaohongshu style.`);
                                    setActiveTab('video');
                                    toast.success('已切换至视频生成，请完善提示词');
                                }}
                                className="text-xs flex items-center text-primary hover:text-primary-hover font-medium mr-2"
                                title="一键转为视频"
                            >
                                <Video size={14} className="mr-1" />
                                转视频
                            </button>
                            
                            <button 
                                onClick={handleGenerate} 
                                className="text-xs flex items-center text-primary hover:text-primary-hover font-medium"
                            >
                                <RotateCw size={14} className="mr-1" />
                                重新生成
                            </button>
                        </div>
                    </div>

                    {/* AI Image Generation & Card Generator */}
                    {contentType === 'note' && (
                        <NoteEditor 
                            result={result}
                            selectedOptionIndex={selectedOptionIndex}
                            generatedImages={generatedImages}
                            handleGenerateImage={handleGenerateImage}
                            handleEditImage={handleEditImage}
                            setActiveTab={setActiveTab}
                            setVideoMode={setVideoMode}
                            setVideoImageUrl={setVideoImageUrl}
                            setVideoPrompt={setVideoPrompt}
                            cardGeneratorRef={cardGeneratorRef}
                            handleSelectBgForCard={handleSelectBgForCard}
                            onUpdateImagePrompt={handleUpdateImagePrompt}
                            activeAccount={activeAccount}
                            remixStructure={remixStructure}
                        />
                    )}

                    {/* Title */}
                    <div>
                        <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center space-x-2">
                            <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">标题</span>
                            {/* 标题分析按钮 */}
                            <button
                                onClick={handleTitleAnalyze}
                                disabled={isAnalyzingTitle}
                                className={`text-xs flex items-center px-2 py-0.5 rounded transition-colors ${
                                    titleAnalysis 
                                        ? 'bg-success-subtle text-success' 
                                        : 'bg-primary-subtle text-primary hover:bg-primary/10'
                                }`}
                                title="AI 分析标题吸引力"
                            >
                                {isAnalyzingTitle ? (
                                    <Loader2 size={12} className="mr-1 animate-spin" />
                                ) : (
                                    <BarChart3 size={12} className="mr-1" />
                                )}
                                {titleAnalysis ? `评分 ${titleAnalysis.score}` : '标题分析'}
                            </button>
                        </div>
                        <button onClick={() => copyToClipboard(result.title)} className="text-primary hover:text-primary-hover text-xs flex items-center">
                            <Copy size={12} className="mr-1" /> 复制
                        </button>
                        </div>
                        <div className="bg-surface-muted p-4 rounded-md">
                        <h3 className="text-lg font-bold text-text leading-tight">
                            {result.title}
                        </h3>
                        </div>

                        {/* 标题分析结果面板 */}
                        {titleAnalysis && showTitleAnalysis && (
                            <div className="mt-3 bg-surface rounded-lg border border-border p-4 space-y-3">
                                {/* 分析Header */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-2">
                                        <Target size={16} className="text-primary" />
                                        <span className="text-sm font-semibold text-text">标题吸引力分析</span>
                                        <span className={`text-sm font-bold px-2 py-0.5 rounded ${
                                            titleAnalysis.score >= 70 ? 'bg-success-subtle text-success' : 
                                            titleAnalysis.score >= 50 ? 'bg-warning-subtle text-warning' : 
                                            'bg-danger-subtle text-danger'
                                        }`}>
                                            {titleAnalysis.score} 分
                                        </span>
                                    </div>
                                    <button onClick={() => setShowTitleAnalysis(false)} className="text-text-tertiary hover:text-text-secondary">
                                        <X size={16} />
                                    </button>
                                </div>

                                {/* 五维度评分 */}
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { label: '钩子吸引力', key: 'hook_strength', icon: Zap },
                                        { label: '关键词匹配', key: 'keyword_relevance', icon: Target },
                                        { label: '情绪感染力', key: 'emotional_appeal', icon: ThumbsUp },
                                        { label: '表述清晰度', key: 'clarity', icon: Eye },
                                    ].map(item => {
                                        const value = (titleAnalysis.breakdown as any)[item.key] as number;
                                        const Icon = item.icon;
                                        return (
                                            <div key={item.key} className="flex items-center justify-between bg-surface-muted rounded-lg px-3 py-2">
                                                <div className="flex items-center space-x-1.5">
                                                    <Icon size={14} className="text-text-tertiary" />
                                                    <span className="text-xs text-text-secondary">{item.label}</span>
                                                </div>
                                                <div className="flex items-center space-x-1.5">
                                                    <div className="w-16 h-1.5 bg-surface-hover rounded-full overflow-hidden">
                                                        <div 
                                                            className={`h-full rounded-full transition-all ${
                                                                value >= 7 ? 'bg-success' : value >= 5 ? 'bg-warning' : 'bg-danger'
                                                            }`}
                                                            style={{ width: `${value * 10}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-xs font-medium text-text w-5 text-right">{value}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* 长度判断 */}
                                <div className="flex items-center space-x-2 text-xs">
                                    <span className="text-text-tertiary">标题长度：</span>
                                    <span className={titleAnalysis.breakdown.length_optimal ? 'text-success' : 'text-warning'}>
                                        {titleAnalysis.breakdown.length_optimal ? '长度适中' : '长度可优化'}
                                    </span>
                                    <span className="text-text-tertiary">（{result.title.length} 字）</span>
                                </div>

                                {/* 优化建议 */}
                                {titleAnalysis.suggestions.length > 0 && (
                                    <div className="bg-warning-subtle rounded-lg p-3">
                                        <p className="text-xs font-semibold text-warning mb-1.5">优化建议</p>
                                        <ul className="space-y-1">
                                            {titleAnalysis.suggestions.map((s, i) => (
                                                <li key={i} className="text-xs text-text-secondary flex items-start">
                                                    <span className="text-warning mr-1.5 mt-0.5">•</span>
                                                    {s}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* 优化变体 */}
                                {titleAnalysis.variants.length > 0 && (
                                    <div>
                                        <p className="text-xs font-semibold text-text-tertiary mb-2">
                                            推荐标题变体（点击替换当前标题）
                                        </p>
                                        <div className="space-y-1.5">
                                            {titleAnalysis.variants.map((v, i) => (
                                                <div
                                                    key={i}
                                                    onClick={() => handleSelectTitleVariant(v)}
                                                    className={`flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                                                        result?.title === v
                                                            ? 'bg-primary-subtle border border-primary text-primary'
                                                            : 'bg-surface-muted hover:bg-primary-subtle hover:border hover:border-primary/30 border border-transparent'
                                                    }`}
                                                    title="点击替换当前标题"
                                                >
                                                    <div className="flex items-center space-x-2">
                                                        <span className="text-xs text-text-tertiary font-mono">
                                                            #{i + 1}
                                                        </span>
                                                        <span className={`text-sm ${
                                                            result?.title === v ? 'text-primary font-medium' : 'text-text'
                                                        }`}>
                                                            {v}
                                                        </span>
                                                        {result?.title === v && (
                                                            <span className="text-xs text-success font-medium">
                                                                已选用
                                                            </span>
                                                        )}
                                                    </div>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigator.clipboard.writeText(v);
                                                            toast.success('已复制标题变体');
                                                        }}
                                                        className="text-text-tertiary hover:text-primary transition-opacity p-1"
                                                        title="复制到剪贴板"
                                                    >
                                                        <Copy size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Compliance Report */}
                    {result.risk_warnings && (
                        <ComplianceReport 
                            warnings={result.risk_warnings} 
                            className="mb-6" 
                            onAutoFix={handleAutoFixCompliance}
                            isFixing={isFixingCompliance}
                        />
                    )}

                    {/* Content Options */}
                    <div>
                        <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">正文</span>
                        <div className="flex space-x-2">
                            {!isEditingContent ? (
                                <button 
                                    onClick={() => {
                                        setIsEditingContent(true);
                                        setEditedContent(result.options?.[selectedOptionIndex]?.content || '');
                                    }}
                                    className="text-text-secondary hover:text-primary text-xs flex items-center"
                                >
                                    <Edit3 size={12} className="mr-1" /> 编辑
                                </button>
                            ) : (
                                <div className="flex space-x-2">
                                    <button 
                                        onClick={() => handleSaveContentEdit(undefined)}
                                        className="text-success hover:text-success text-xs flex items-center font-bold"
                                    >
                                        <Save size={12} className="mr-1" /> 保存
                                    </button>
                                    <button 
                                        onClick={() => setIsEditingContent(false)}
                                        className="text-text-tertiary hover:text-text-secondary text-xs flex items-center"
                                    >
                                        取消
                                    </button>
                                </div>
                            )}
                            <button 
                                onClick={() => copyToClipboard(result.options?.[selectedOptionIndex]?.content || '')} 
                                className="text-primary hover:text-primary-hover text-xs flex items-center"
                            >
                                <Copy size={12} className="mr-1" /> 复制
                            </button>
                        </div>
                        </div>

                        <div className="flex space-x-2 mb-3">
                        {result.options?.map((opt, idx) => (
                            <button
                            key={idx}
                            onClick={() => {
                                setSelectedOptionIndex(idx);
                                setIsEditingContent(false); 
                            }}
                            className={`
                                px-3 py-1.5 text-xs font-medium rounded-md transition-colors
                                ${selectedOptionIndex === idx 
                                ? 'bg-primary-subtle text-primary ring-1 ring-primary' 
                                : 'bg-surface-muted text-text-secondary hover:bg-surface-hover'}
                            `}
                            >
                            {opt.label}
                            </button>
                        ))}
                        </div>

                        <div className="bg-surface-muted p-4 rounded-md min-h-[200px]">
                        {(!result.options || result.options.length === 0) ? (
                            <div className="text-danger p-4 text-center">
                                数据加载异常 (Version Data Corrupted) - 请尝试重新生成
                            </div>
                        ) : (
                            contentType === 'article' ? (
                                <ArticleEditor 
                                    content={isEditingContent ? editedContent : (result.options?.[selectedOptionIndex]?.content || '')}
                                    isEditing={isEditingContent}
                                    onChange={setEditedContent}
                                />
                            ) : (
                            isEditingContent ? (
                                <textarea 
                                    value={editedContent}
                                    onChange={(e) => setEditedContent(e.target.value)}
                                    className="w-full h-[300px] p-2 bg-surface border border-strong rounded-md focus:ring-primary focus:border-primary text-sm font-mono"
                                />
                            ) : (
                                contentType === 'video_script' ? (
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center mb-4 bg-primary-subtle p-4 rounded-lg border border-primary-subtle">
                                            <div>
                                                <div className="text-sm font-bold text-primary flex items-center">
                                                    <Film size={16} className="inline mr-2" />
                                                    分镜脚本已生成
                                                </div>
                                                <p className="text-xs text-primary mt-1 max-w-md">
                                                    脚本仅为文字大纲。如需生成画面、配音并合成完整视频，请点击右侧按钮进入<strong>「视频制作台」</strong>。
                                                </p>
                                            </div>
                                            <button 
                                                onClick={handleCreateVideoProject}
                                                disabled={creatingProject}
                                                className={`bg-primary hover:bg-primary-hover text-primary-text text-sm px-4 py-2 rounded-md flex items-center transition-colors shadow-sm
                                                    ${creatingProject ? 'opacity-70 cursor-wait' : ''}
                                                `}
                                            >
                                                {creatingProject ? (
                                                    <>
                                                        <Loader2 size={16} className="mr-2 animate-spin" />
                                                        正在初始化...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Wand2 size={16} className="mr-2" />
                                                        开始制作视频
                                                    </>
                                                )}
                                            </button>
                                        </div>

                                        {parseScript(result.options?.[selectedOptionIndex]?.content || '').map((scene: any, idx: number) => {
                                            const _key = `${currentIndex}-${selectedOptionIndex}-${idx}`;
                                            return (
                                            <div key={idx} className="bg-surface border border-border rounded-lg p-4 shadow-sm flex flex-col md:flex-row gap-4 opacity-75">
                                                <div className="flex-1 space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <span className="bg-surface-muted text-text-secondary px-2 py-1 rounded text-xs font-bold uppercase">
                                                            Scene {idx + 1}
                                                        </span>
                                                        <span className="text-xs text-text-tertiary font-mono">
                                                            {scene.shot}
                                                        </span>
                                                    </div>
                                                    <div className="text-sm text-text font-medium">
                                                        <Eye size={14} className="inline text-primary mr-1.5" />
                                                        画面: {scene.visual}
                                                    </div>
                                                </div>
                                                <div className="flex-1 space-y-2 border-t md:border-t-0 md:border-l border-border md:pl-4 pt-2 md:pt-0">
                                                    <div className="text-sm text-text">
                                                        <Mic2 size={14} className="inline text-success mr-1.5" />
                                                        口播: {scene.audio}
                                                    </div>
                                                    {scene.note && (
                                                        <div className="text-xs text-text-tertiary mt-1 italic flex items-start">
                                                            <Lightbulb size={12} className="inline text-warning mr-1.5 mt-0.5 flex-shrink-0" />
                                                            {scene.note}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )})}
                                        
                                        {parseScript(result.options?.[selectedOptionIndex]?.content || '').length === 0 && (
                                             <div className="p-4 text-center text-text-tertiary text-sm">
                                                 脚本格式解析失败，显示原始文本：
                                                 <pre className="mt-2 whitespace-pre-wrap text-left bg-surface-muted p-2 rounded text-xs">{result.options?.[selectedOptionIndex]?.content}</pre>
                                             </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="prose prose-sm max-w-none text-text-secondary whitespace-pre-wrap">
                                        {result.options?.[selectedOptionIndex]?.content || '生成的内容为空 (No content generated)'}
                                    </div>
                                )
                            )
                            )
                        )}
                        </div>
                    </div>

                    {/* Tags */}
                    <div>
                        <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">标签</span>
                        <button onClick={() => copyToClipboard((result.tags || []).map(t => `#${t}`).join(' '))} className="text-primary hover:text-primary-hover text-xs flex items-center">
                            <Copy size={12} className="mr-1" /> 复制
                        </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                        {(result.tags || []).map((tag, idx) => (
                            <span key={idx} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-subtle text-primary">
                            #{tag}
                            </span>
                        ))}
                        </div>
                    </div>

                    {/* Card Generator (Moved to Bottom) - Only show if no AI images are generated */}
                    {contentType === 'note' && !generatedImages.some(img => img.url) && (
                        <div className="pt-6 border-t border-border">
                            <Suspense fallback={<div className="flex justify-center items-center py-8"><Loader2 className="animate-spin text-primary" size={24} /></div>}>
                                <CardGenerator
                                    ref={cardGeneratorRef}
                                    title={result.title}
                                    content={result.options?.[selectedOptionIndex]?.content || ''}
                                    tags={result.tags || []}
                                    backgroundImage={selectedBgImage}
                                />
                            </Suspense>
                        </div>
                    )}

                    {/* Publish Action */}
                    {contentType !== 'video_script' && (
                        <div className="pt-4 border-t border-border">
                            {publishStatus && (
                            <div className={`mb-4 p-3 rounded-md text-sm ${publishStatus.includes('中断') || publishStatus.includes('失败') ? 'bg-danger-subtle text-danger' : 'bg-primary-subtle text-primary'}`}>
                                {publishStatus}
                            </div>
                            )}
                            
                            <div className="flex gap-2 flex-wrap">
                            <button
                                onClick={handleSaveDraft}
                                disabled={isSaving || isPublishing}
                                className={`flex-1 flex justify-center items-center py-3 px-4 border border-strong rounded-md shadow-sm text-sm font-medium text-text-secondary bg-surface hover:bg-surface-muted transition-colors
                                ${isSaving ? 'opacity-75 cursor-not-allowed' : ''}
                                `}
                            >
                                {isSaving ? (
                                <Loader2 className="animate-spin mr-2" size={18} />
                                ) : (
                                <Save className="mr-2" size={18} />
                                )}
                                存为草稿
                            </button>

                            {/* 跨账号分发按钮 */}
                            <button
                                onClick={handleOpenBatchModal}
                                disabled={isPublishing}
                                className="flex justify-center items-center py-3 px-4 border border-primary rounded-md shadow-sm text-sm font-medium text-primary bg-surface hover:bg-primary-subtle transition-colors relative"
                                title="将当前内容发布到多个账号"
                            >
                                <ExternalLink className="mr-2" size={18} />
                                多账号分发
                                {selectedAccountIds.size > 0 && !showBatchModal && (
                                    <span className="absolute -top-1.5 -right-1.5 bg-primary text-primary-text text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                                        {selectedAccountIds.size}
                                    </span>
                                )}
                            </button>
                            
                            <div className="flex items-center justify-end space-x-4">
                                <label className="flex items-center space-x-2 text-sm text-text-secondary cursor-pointer select-none">
                                    <input 
                                        type="checkbox" 
                                        checked={autoPublish} 
                                        onChange={(e) => setAutoPublish(e.target.checked)}
                                        className="form-checkbox h-4 w-4 text-primary rounded border-strong focus:ring-primary transition duration-150 ease-in-out"
                                    />
                                    <span>自动点击发布</span>
                                </label>
                                
                                <div className="flex items-center space-x-2">
                                    <Calendar size={16} className="text-text-tertiary" />
                                    <input 
                                        type="datetime-local"
                                        value={scheduledTime}
                                        onChange={(e) => setScheduledTime(e.target.value)}
                                        className="text-xs border border-strong rounded p-1 text-text-secondary focus:ring-primary focus:border-primary"
                                        placeholder="定时发布"
                                    />
                                </div>
                            </div>

                            <button
                                onClick={handlePublish}
                                disabled={isPublishing}
                                className={`flex-[2] flex justify-center items-center py-3 px-4 rounded-md shadow-sm text-sm font-medium text-primary-text transition-colors
                                ${isPublishing ? 'bg-danger cursor-not-allowed' : 'bg-danger hover:bg-danger'}
                                `}
                            >
                                {isPublishing ? (
                                <>
                                    <Loader2 className="animate-spin mr-2" size={18} />
                                    处理中...
                                </>
                                ) : (
                                <>
                                    <ExternalLink className="mr-2" size={18} />
                                    {scheduledTime ? '设置定时发布' : '一键发布到小红书'}
                                </>
                                )}
                            </button>
                            </div>
                            <p className="mt-2 text-xs text-center text-text-tertiary">
                            * {autoPublish ? '系统将自动上传并发布，请勿操作鼠标' : '将自动打开浏览器并填入文案，请手动点击发布'}
                            {scheduledTime && <span className="text-primary font-medium ml-2"> (将于 {new Date(scheduledTime).toLocaleString()} 执行)</span>}
                            </p>
                        </div>
                    )}
                    </div>
                    )}
                </div>
                ) : (
                <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-text-tertiary p-8 border-2 border-dashed border-border rounded-lg bg-surface-muted/50">
                    <Sparkles size={48} className="mb-4 text-text-tertiary" />
                    <p className="text-center text-text-tertiary">
                    {loading 
                        ? 'AI 正在分析人设并生成文案...\n这通常需要 10-20 秒' 
                        : activeTab === 'note' 
                            ? '选择左侧热点或输入选题\n生成的爆款笔记将显示在这里'
                            : '参考左侧黄金法则\n输入主题生成视频脚本'}
                    </p>
                </div>
                )}
            </div>
            </div>
        ) : (
            // Video Mode Layout - Unified with note/script tabs
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
               {/* Left: Tips Sidebar */}
               <div className="lg:col-span-3 space-y-4">
                  <div className="bg-gradient-to-br from-primary-subtle to-primary-subtle p-4 rounded-lg border border-primary-subtle">
                    <h3 className="text-sm font-bold text-primary-hover flex items-center mb-3">
                      <Film size={16} className="mr-2" />
                      视频生成技巧
                    </h3>
                    <div className="space-y-2 text-xs text-primary-hover">
                      <p><strong>文生视频：</strong>详细描述场景、动作、光影效果</p>
                      <p><strong>图生视频：</strong>上传参考图，描述如何让图片动起来</p>
                      <p><strong>提示词优化：</strong>使用 AI 优化按钮转换为英文，效果更好</p>
                    </div>
                  </div>
               </div>
            
               {/* Right: Main Content */}
               <div className="lg:col-span-9 space-y-4">
                  {/* Configuration Form */}
                  <div className="bg-surface rounded-lg shadow-sm border border-border overflow-hidden">
                    <div className="px-6 py-4 border-b border-border bg-gradient-to-r from-primary-subtle/50 to-surface-muted/50">
                      <h3 className="font-semibold text-text flex items-center">
                        <Film size={18} className="mr-2 text-primary" />
                        视频创作配置
                      </h3>
                    </div>
                    <div className="p-6">
                      <VideoGeneratorForm 
                          videoMode={videoMode}
                          setVideoMode={setVideoMode}
                          videoPrompt={videoPrompt}
                          setVideoPrompt={setVideoPrompt}
                          videoImageUrl={videoImageUrl}
                          setVideoImageUrl={setVideoImageUrl}
                          videoLoading={videoLoading}
                          videoError={videoError}
                          onGenerateVideo={handleGenerateVideo}
                          activeAccount={activeAccount}
                      />
                    </div>
                  </div>
                  
                  {/* Result Section - Full width card */}
                  {currentVideoSession ? (
                       <div className="bg-surface rounded-lg shadow-sm border border-border overflow-hidden">
                          <div className="p-6 space-y-6">
                              {/* History Header */}
                              <div className="flex justify-between items-center border-b border-border pb-4">
                                   <div className="flex items-center text-sm text-text-tertiary">
                                       <History size={16} className="mr-2" />
                                       <span>视频记录</span>
                                   </div>
                                   <div className="flex items-center space-x-3">
                                       <button 
                                           onClick={() => setCurrentVideoIndex(prev => Math.max(0, prev - 1))}
                                           disabled={currentVideoIndex <= 0}
                                           className="p-1 rounded-full hover:bg-surface-muted disabled:opacity-30 disabled:cursor-not-allowed"
                                       >
                                           <ChevronLeft size={20} />
                                       </button>
                                       <span className="text-sm font-medium text-text-secondary">
                                           {currentVideoIndex + 1} / {videoHistory.length}
                                       </span>
                                       <button 
                                           onClick={() => setCurrentVideoIndex(prev => Math.min(videoHistory.length - 1, prev + 1))}
                                           disabled={currentVideoIndex >= videoHistory.length - 1}
                                           className="p-1 rounded-full hover:bg-surface-muted disabled:opacity-30 disabled:cursor-not-allowed"
                                       >
                                           <ChevronRight size={20} />
                                       </button>
                                   </div>
                               </div>

                              {/* Video Display */}
                              <div className="aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center relative">
                                  {currentVideoSession.videoUrl ? (
                                      <video controls className="w-full h-full" src={currentVideoSession.videoUrl} />
                                  ) : (
                                      <div className="text-primary-text text-center">
                                          {currentVideoSession.status === 'FAILED' ? (
                                              <div className="text-danger flex flex-col items-center">
                                                  <AlertCircle size={32} className="mb-2" />
                                                  生成失败: {currentVideoSession.error}
                                              </div>
                                          ) : (
                                              <>
                                                  <Loader2 className="animate-spin mx-auto mb-4 text-primary" size={32} />
                                                  <p className="font-medium text-lg">AI 正在绘制视频...</p>
                                                  <p className="text-sm text-text-tertiary mt-2">预计耗时 2-5 分钟</p>
                                                  <p className="text-xs text-text-tertiary mt-1">Wan2.6 模型正在计算光影与动态</p>
                                              </>
                                          )}
                                      </div>
                                  )}
                              </div>
                              {/* Prompt Display */}
                              <div className="bg-surface-muted p-4 rounded-md">
                                  <h3 className="text-sm font-semibold text-text-secondary mb-1">提示词:</h3>
                                  <p className="text-text-secondary text-sm">{currentVideoSession.prompt}</p>
                                  {currentVideoSession.imageUrl && (
                                      <div className="mt-3">
                                          <h3 className="text-sm font-semibold text-text-secondary mb-1">参考原图:</h3>
                                          <img src={currentVideoSession.imageUrl} className="h-20 rounded border border-border" alt="Ref" />
                                      </div>
                                  )}
                              </div>
                          </div>
                       </div>
                   ) : (
                       <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-text-tertiary p-8 border-2 border-dashed border-border rounded-lg bg-surface-muted/50">
                          <Film size={48} className="mb-4 text-text-tertiary" />
                          <h3 className="text-lg font-medium text-text-secondary mb-2">AI 视频创作</h3>
                          <p className="text-center text-text-tertiary max-w-md">
                             选择"文生视频"或"图生视频"，让 AI 为您生成 5 秒的高清动态视频。<br/>
                             支持中文提示词，适合制作笔记首图或动态背景。
                          </p>
                       </div>
                   )}
               </div>
            </div>
        )}
      </div>

      {/* Structure Modal */}
      {showStructureModal && remixStructure && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="bg-surface rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto">
                  <div className="p-6">
                      <div className="flex justify-between items-start mb-4">
                          <h3 className="text-lg font-bold text-text flex items-center">
                              <Sparkles className="mr-2 text-primary" size={20} />
                              爆款结构详情
                          </h3>
                          <button onClick={() => setShowStructureModal(false)} className="text-text-tertiary hover:text-text-secondary">
                              <X size={20} />
                          </button>
                      </div>
                      
                      <div className="space-y-4">
                          <div className="bg-primary-subtle p-3 rounded-md border border-primary-subtle">
                              <p className="text-xs text-primary mb-1 font-bold">AI 指令状态：</p>
                              <p className="text-sm text-primary">
                                  已注入系统提示词。AI 将严格遵循以下结构生成内容，而不仅仅是参考标题。
                              </p>
                          </div>

                          {remixStructure.visual_analysis && (
                              <div className="bg-primary-subtle p-3 rounded-md border border-primary-subtle">
                                  <h4 className="text-sm font-bold text-primary mb-1 flex items-center">
                                      <Video size={14} className="mr-1"/> 视觉/分镜分析
                                  </h4>
                                  <div className="text-xs text-primary max-h-32 overflow-y-auto whitespace-pre-wrap">
                                      {remixStructure.visual_analysis}
                                  </div>
                              </div>
                          )}

                          {/* Image Analysis Display (For Note Mode) */}
                          {remixStructure.note_type !== 'video' && remixStructure.visual_analysis && (
                               <div className="bg-primary-subtle p-3 rounded-md border border-primary-subtle mt-2">
                                  <h4 className="text-sm font-bold text-primary mb-1 flex items-center">
                                      <ImageIcon size={14} className="mr-1"/> 配图视觉分析
                                  </h4>
                                  <div className="text-xs text-primary max-h-32 overflow-y-auto whitespace-pre-wrap">
                                      {remixStructure.visual_analysis}
                                  </div>
                              </div>
                          )}

                          <div className="grid grid-cols-2 gap-3">
                              <div className="bg-surface-muted p-3 rounded border border-border">
                                  <span className="block text-xs text-text-tertiary font-bold mb-1">开头钩子</span>
                                  <span className="text-sm text-text">{remixStructure.hook_type || '通用'}</span>
                              </div>
                              <div className="bg-surface-muted p-3 rounded border border-border">
                                  <span className="block text-xs text-text-tertiary font-bold mb-1">情感基调</span>
                                  <span className="text-sm text-text">{remixStructure.tone || '默认'}</span>
                              </div>
                          </div>

                          <div className="bg-surface-muted p-3 rounded border border-border">
                              <span className="block text-xs text-text-tertiary font-bold mb-2">结构脉络</span>
                              <ul className="list-disc list-inside text-sm text-text-secondary space-y-1">
                                  {remixStructure.structure_breakdown?.map((s: string, i: number) => (
                                      <li key={i}>{s}</li>
                                  ))}
                              </ul>
                          </div>
                      </div>

                      <div className="mt-6 flex justify-end">
                          <button 
                              onClick={() => setShowStructureModal(false)}
                              className="px-4 py-2 bg-surface-muted text-text-secondary rounded-md hover:bg-surface-hover text-sm font-medium"
                          >
                              关闭
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* 跨账号批量发布弹窗 */}
      {showBatchModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="bg-surface rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto">
                  <div className="p-6">
                      {/* Header */}
                      <div className="flex justify-between items-start mb-4">
                          <h3 className="text-lg font-bold text-text flex items-center">
                              <ExternalLink className="mr-2 text-primary" size={20} />
                              多账号分发
                          </h3>
                          <button
                              onClick={() => setShowBatchModal(false)}
                              className="text-text-tertiary hover:text-text-secondary"
                          >
                              <X size={20} />
                          </button>
                      </div>

                      {/* 批量发布结果展示 */}
                      {batchResult && (
                          <div className={`mb-4 p-4 rounded-lg text-sm ${
                              batchResult.success ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'
                          }`}>
                              <p className="font-semibold mb-2">{batchResult.message || (batchResult.success ? '提交成功' : '提交失败')}</p>
                              {batchResult.tasks && batchResult.tasks.length > 0 && (
                                  <p className="text-xs mt-1">已创建 {batchResult.tasks.length} 个任务</p>
                              )}
                              {batchResult.skipped && batchResult.skipped.length > 0 && (
                                  <div className="mt-2">
                                      <p className="text-xs font-medium text-warning">以下账号被跳过：</p>
                                      {batchResult.skipped.map((s: any, i: number) => (
                                          <p key={i} className="text-xs opacity-80">账号 #{s.accountId}: {s.reason}</p>
                                      ))}
                                  </div>
                              )}
                          </div>
                      )}

                      {/* 内容预览提示 */}
                      <div className="bg-surface-muted p-3 rounded-lg mb-4 text-xs text-text-secondary">
                          <span className="font-semibold">即将分发：</span>
                          {result?.title?.slice(0, 40)}{result?.title && result.title.length > 40 ? '...' : ''}
                      </div>

                      {/* 账号选择列表 */}
                      <div className="space-y-2 mb-6 max-h-[300px] overflow-y-auto">
                          {allAccounts.length === 0 ? (
                              <p className="text-sm text-text-tertiary text-center py-4">暂无可用账号</p>
                          ) : (
                              allAccounts.map((account: any) => (
                                  <label
                                      key={account.id}
                                      className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${
                                          selectedAccountIds.has(account.id)
                                              ? 'border-primary bg-primary-subtle'
                                              : 'border-border hover:bg-surface-muted'
                                      }`}
                                  >
                                      <input
                                          type="checkbox"
                                          checked={selectedAccountIds.has(account.id)}
                                          onChange={(e) => {
                                              const newSet = new Set(selectedAccountIds);
                                              if (e.target.checked) {
                                                  newSet.add(account.id);
                                              } else {
                                                  newSet.delete(account.id);
                                              }
                                              setSelectedAccountIds(newSet);
                                          }}
                                          className="form-checkbox h-4 w-4 text-primary rounded border-strong focus:ring-primary mr-3"
                                      />
                                      <div className="flex-1">
                                          <div className="flex items-center space-x-2">
                                              <span className="text-sm font-medium text-text">
                                                  {account.nickname || account.alias || `账号 #${account.id}`}
                                              </span>
                                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                                                  account.is_active
                                                      ? 'bg-success-subtle text-success'
                                                      : 'bg-surface-hover text-text-tertiary'
                                              }`}>
                                                  {account.is_active ? '活跃' : '未激活'}
                                              </span>
                                          </div>
                                          <p className="text-xs text-text-tertiary mt-0.5">
                                              状态: {account.status || '未知'}
                                          </p>
                                      </div>
                                  </label>
                              ))
                          )}
                      </div>

                      {/* 选中计数 */}
                      <div className="text-sm text-text-secondary mb-4">
                          已选择 <span className="font-bold text-primary">{selectedAccountIds.size}</span> 个账号
                      </div>

                      {/* 操作按钮 */}
                      <div className="flex justify-end gap-3">
                          <button
                              onClick={() => setShowBatchModal(false)}
                              className="px-4 py-2 bg-surface-muted text-text-secondary rounded-md hover:bg-surface-hover text-sm font-medium"
                          >
                              取消
                          </button>
                          <button
                              onClick={handleBatchPublish}
                              disabled={isBatchPublishing || selectedAccountIds.size === 0}
                              className={`px-4 py-2 bg-primary text-primary-text rounded-md text-sm font-medium flex items-center transition-colors ${
                                  isBatchPublishing || selectedAccountIds.size === 0
                                      ? 'opacity-50 cursor-not-allowed'
                                      : 'hover:bg-primary-hover'
                              }`}
                          >
                              {isBatchPublishing ? (
                                  <>
                                      <Loader2 size={16} className="mr-2 animate-spin" />
                                      提交中...
                                  </>
                              ) : (
                                  `确认分发 (${selectedAccountIds.size})`
                              )}
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Image Editor Modal */}
      {showImageEditor && (
        <Suspense fallback={<div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"><Loader2 className="animate-spin text-primary" size={32} /></div>}>
          <ImageEditor
            imageUrl={editingImageUrl}
            onClose={() => {
              setShowImageEditor(false);
              setEditingImageUrl('');
            }}
            onSave={handleSaveEditedImage}
          />
        </Suspense>
      )}
    </div>
  );
}
