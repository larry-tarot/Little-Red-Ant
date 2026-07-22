import { AIFactory } from './AIFactory.js';
import { ComplianceService } from '../core/ComplianceService.js';
import { PromptService, PromptContext } from './PromptService.js';
import { Logger } from '../LoggerService.js';
import { ImageService } from './ImageService.js';
import { VideoService } from './VideoService.js';
import { AnalysisService } from './AnalysisService.js';

export interface GenerateNoteParams extends PromptContext {
  contentType?: 'note' | 'article' | 'video_script';
}

export interface GeneratedNote {
  title: string;
  options: {
    type: 'dry_goods' | 'experience' | 'discussion' | 'article' | 'video_script';
    label: string;
    content: string;
  }[];
  tags: string[];
  image_prompts: string[];
  risk_warnings?: {
    blocked: string[];
    warnings: string[];
    suggestions: string[];
    score: number;
  };
}

/**
 * ContentService Facade
 * Orchestrates various AI services to generate and analyze content.
 */
export class ContentService {
    static async generateNote(params: GenerateNoteParams): Promise<GeneratedNote> {
        let systemPromptTemplate = '';
        
        // Handling Different Content Types
        if (params.contentType === 'article') {
            const promptResult = PromptService.buildArticleSystemPrompt(params);
            systemPromptTemplate = promptResult.systemPrompt;
        } 
        else if (params.contentType === 'video_script') {
            const promptResult = PromptService.buildVideoScriptSystemPrompt(params);
            systemPromptTemplate = promptResult.systemPrompt;
        } 
        else {
            // Standard Note Generation
            const promptResult = PromptService.buildNoteSystemPrompt(params);
            systemPromptTemplate = promptResult.systemPrompt;
        }

        const userPrompt = params.contentType === 'note' || !params.contentType 
            ? PromptService.buildUserPrompt(params)
            : `本次选题：${params.topic}\n${params.keywords ? `关键词要求：${params.keywords.join(', ')}` : ''}\n请开始创作。`;

        const provider = AIFactory.getTextProvider();
        
        try {
            Logger.info('ContentService', 'Generating note...', { topic: params.topic, type: params.contentType });
            const result = await provider.generateJSON<GeneratedNote>([
                { role: "system", content: systemPromptTemplate },
                { role: "user", content: userPrompt }
            ]);

            // Post-processing
            if (result.title.length > 20) {
                result.title = result.title.substring(0, 19) + '…'; 
            }

            // Compliance Check
            try {
                const contentToCheck = [
                    result.title,
                    ...(result.options || []).map(o => o.content)
                ].join('\n');
                
                const complianceResult = ComplianceService.check(contentToCheck);
                
                result.risk_warnings = {
                    blocked: complianceResult.blockedWords,
                    warnings: complianceResult.warningWords,
                    suggestions: complianceResult.suggestions,
                    score: complianceResult.score
                };
            } catch (e) {
                Logger.warn('ContentService', 'Compliance check failed', e);
            }

            return result;
        } catch (error: any) {
            Logger.error("ContentService", "AI Generation Error", error);
            throw new Error(`AI generation failed: ${error.message}`);
        }
    }

    static async generateImage(prompt: string, refImg?: string): Promise<string> {
        return ImageService.generateImage(prompt, refImg);
    }

    static async generateVideo(prompt: string, imageUrl?: string, model?: string): Promise<string> {
        return VideoService.generateVideo(prompt, imageUrl, model);
    }

    static async optimizeVideoPrompt(userIdea: string): Promise<string> {
        const provider = AIFactory.getTextProvider();
        const defaultTpl = `你是一个专业的 AI 视频提示词工程专家。
你的任务是将用户提供的模糊、简单的视频创意，优化为结构完整、细节丰富的 AI 视频生成提示词。

【优化原则】
1. **结构化**：包含主体(Subject)、环境(Environment)、动作(Action)、运镜(Camera Movement)、风格(Style)、光影(Lighting)。
2. **细节丰富**：补充画面细节，如颜色、材质、氛围。
3. **英文输出**：目前主流视频模型（如 Sora, Wanx, Runway）对英文提示词支持更好。请输出英文提示词。
4. **长度适中**：控制在 50-100 个单词左右。
5. **风格预设**：默认加入 "high quality, aesthetic, cinematic lighting, 4k, detailed" 等提升质感的词汇。

【输出格式】
直接返回优化后的英文提示词，不要包含任何解释或前缀后缀。`;

        const systemPrompt = PromptService.getTemplate('video_prompt_optimizer', defaultTpl, '视频提示词优化');

        const userPrompt = `用户创意：${userIdea}
请优化为专业的英文视频提示词。`;

        try {
            Logger.info('ContentService', 'Optimizing video prompt...');
            const result = await provider.generateText([
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ]);
            return result.replace(/```/g, '').trim();
        } catch (error: any) {
            Logger.error("ContentService", "Prompt Optimization Error", error);
            throw new Error("Failed to optimize prompt");
        }
    }

    static async analyzeCompetitor(profile: { nickname: string, desc: string, notes: any[] }): Promise<string> {
        return AnalysisService.analyzeCompetitor(profile);
    }

    static async fixContentCompliance(content: string, blockedWords: string[], suggestions: string[]): Promise<string> {
        const provider = AIFactory.getTextProvider();
        
        const defaultTpl = `你是一个专业的内容合规审核与优化专家。
你的任务是修改用户提供的内容，替换掉其中的违规敏感词，同时保持原文的语气、风格和核心意思不变。

【违规词列表】
{{blockedWords}}

【修改建议】
{{suggestions}}

【修改要求】
1. **精准替换**：仅修改包含违规词的句子，其他内容尽量保持原样。
2. **语气一致**：如果原文是口语化/小红书风，修改后也要保持。
3. **输出纯文本**：直接返回修改后的完整内容，不要包含任何前缀、解释或 Markdown 标记。`;

        let systemPrompt = PromptService.getTemplate('compliance_fixer', defaultTpl, '合规内容修复');
        
        systemPrompt = systemPrompt
            .replace('{{blockedWords}}', blockedWords.map(w => `- ${w}`).join('\n'))
            .replace('{{suggestions}}', suggestions.map(s => `- ${s}`).join('\n'));

        const userPrompt = `【待修改内容】
${content}

请修复违规内容。`;

        try {
            Logger.info('ContentService', 'Fixing content compliance...');
            const result = await provider.generateText([
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ]);
            return result.replace(/```/g, '').trim();
        } catch (error: any) {
            Logger.error("ContentService", "Content Fix Error", error);
            throw new Error("Failed to fix content");
        }
    }

    static async analyzeNoteStructure(content: string, title: string, type: string = 'image', videoFrames: string[] = [], audioPath?: string, noteImages: string[] = []): Promise<any> {
        return AnalysisService.analyzeNoteStructure(content, title, type, videoFrames, audioPath, noteImages);
    }

    /**
     * Classify notes into sub-topics using AI
     *
     * @param notes - Array of notes with title and content
     * @param categories - Optional predefined category list (e.g. ["口诀", "答题技巧", "重难点"])
     * @returns Map of note_id -> topic_tags array
     */
    static async classifyNoteTopics(
        notes: Array<{ note_id: string; title: string; content?: string }>,
        categories?: string[]
    ): Promise<Record<string, string[]>> {
        if (!notes || notes.length === 0) return {};

        const provider = AIFactory.getTextProvider();

        const defaultCategories = [
            "口诀速记",
            "答题技巧",
            "重难点梳理",
            "备考规划",
            "真题解析",
            "公式总结",
            "易错点提醒",
            "时间规划",
            "资料推荐",
            "心态调整",
            "经验分享",
            "知识点讲解"
        ];

        const categoryList = categories && categories.length > 0
            ? categories
            : defaultCategories;

        const systemPrompt = `你是一名专业的内容分类专家。你的任务是根据笔记的标题和内容，为每条笔记打上最相关的子主题标签。

【可选标签】
${categoryList.map(c => `- ${c}`).join('\n')}

【分类规则】
1. 每条笔记可以打 1-3 个标签，按相关度排序
2. 只从上述列表中选择，不要自创标签
3. 如果内容无法明确归类，返回 ["经验分享"]
4. 必须严格按照输出格式返回

【输出格式】
返回 JSON 对象，key 为 note_id，value 为标签数组：
{
  "note_id_1": ["标签1", "标签2"],
  "note_id_2": ["标签3"]
}`;

        const notesText = notes.map(n =>
            `---\nID: ${n.note_id}\n标题: ${n.title}\n内容: ${(n.content || '').substring(0, 200)}\n---`
        ).join('\n');

        const userPrompt = `请为以下 ${notes.length} 条笔记分类：\n\n${notesText}\n\n请严格按照 JSON 格式返回结果。`;

        try {
            Logger.info('ContentService', `Classifying ${notes.length} notes into topics...`);
            const result = await provider.generateJSON<Record<string, string[]>>([
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ]);
            return result;
        } catch (error: any) {
            Logger.error('ContentService', 'Topic classification failed', error);
            throw new Error(`Topic classification failed: ${error.message}`);
        }
    }
}
