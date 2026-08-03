/**
 * 文件功能：成长洞察服务，分析账号成长趋势并提供优化方向
 * 主要类/函数：GrowthInsightService
 * 作者：AI Assistant
 * 创建时间：2026-07-31
 */

import { AIFactory } from './AIFactory.js';
import { Logger } from '../LoggerService.js';
import { DemoService } from '../DemoService.js';
import db from '../../db.js';

/**
 * 垂类趋势分析结果
 */
export interface NicheTrend {
    topic: string;
    growth: string;
    opportunity: string;
}

/**
 * 写作能力改善分析结果
 */
export interface WritingImprovement {
    aspect: string;
    before_avg: number;
    after_avg: number;
    tip: string;
}

/**
 * 下一步行动建议
 */
export interface NextStep {
    action: string;
    reason: string;
    expected_impact: string;
}

/**
 * 技能成长分析结果
 */
export interface SkillProgress {
    skill: string;
    level: string;
    improvement: string;
}

/**
 * 成长洞察分析结果接口
 */
export interface GrowthInsight {
    niche_trends: NicheTrend[];
    writing_improvements: WritingImprovement[];
    next_steps: NextStep[];
    skill_progress: SkillProgress[];
}

export class GrowthInsightService {

    static async analyzeGrowth(): Promise<GrowthInsight> {
        const isDemo = await DemoService.isDemoMode();
        if (isDemo) {
            Logger.info('GrowthInsightService', 'Demo mode: returning mock growth insight');
            return this.getMockInsight();
        }

        Logger.info('GrowthInsightService', 'Analyzing growth insights...');

        // 1. 获取近 90 天的笔记数据
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const dateThreshold = ninetyDaysAgo.toISOString().split('T')[0];

        const notes = db.prepare(`
            SELECT title, views, likes, comments, collects, publish_date,
                   draft_tags, draft_content_type
            FROM note_stats
            WHERE publish_date >= ?
            ORDER BY publish_date ASC
        `).all(dateThreshold) as any[];

        // 2. 按月份计算指标
        const monthlyMetrics = this.calculateMonthlyMetrics(notes);

        // 3. 按标签统计
        const tagPerformance = this.analyzeTagPerformance(notes);

        // 4. 构建 AI 上下文
        const topNotes = notes
            .sort((a, b) => (b.likes + b.collects) - (a.likes + a.collects))
            .slice(0, 5)
            .map(n => ({ title: n.title, views: n.views, likes: n.likes, collects: n.collects }));

        // 5. 调用 AI
        const provider = AIFactory.getTextProvider();

        const systemPrompt = `你是一名专业的小红书创作者成长教练。

【分析维度】
1. niche_trends: 分析内容方向趋势，每个包含 topic/growth/opportunity
2. writing_improvements: 写作改善分析，每项含 aspect/before_avg/after_avg/tip
3. next_steps: 3-5个行动建议，每项含 action/reason/expected_impact
4. skill_progress: 技能成长评估，每项含 skill/level/improvement

【输出要求】
严格 JSON，格式：
{
  "niche_trends": [{ "topic": "话题", "growth": "趋势", "opportunity": "机会" }],
  "writing_improvements": [{ "aspect": "方面", "before_avg": 0, "after_avg": 0, "tip": "建议" }],
  "next_steps": [{ "action": "行动", "reason": "原因", "expected_impact": "效果" }],
  "skill_progress": [{ "skill": "技能", "level": "水平等级", "improvement": "描述" }]
}`;

        const monthlySummary = monthlyMetrics.map((m: any) =>
            `${m.month}: 笔记数${m.note_count}, 总阅读${m.total_views}, 总互动${m.total_interactions}`
        ).join('\n');

        const tagSummary = tagPerformance.map((t: any) =>
            `"${t.tag}": ${t.note_count}篇, 平均互动${t.avg_interaction}`
        ).join('\n');

        const userPrompt = `近90天数据（共${notes.length}篇笔记）：

【月度趋势】
${monthlySummary || '暂无'}

【标签表现】
${tagSummary || '暂无'}

【最佳笔记】
${topNotes.map((n, i) => `${i + 1}. "${n.title}" 阅读${n.views} 赞${n.likes} 藏${n.collects}`).join('\n') || '暂无'}`;

        try {
            const result = await provider.generateJSON<GrowthInsight>([
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ]);

            result.niche_trends = Array.isArray(result.niche_trends) ? result.niche_trends : [];
            result.writing_improvements = Array.isArray(result.writing_improvements) ? result.writing_improvements : [];
            result.next_steps = Array.isArray(result.next_steps) ? result.next_steps : [];
            result.skill_progress = Array.isArray(result.skill_progress) ? result.skill_progress : [];

            Logger.info('GrowthInsightService', 'Growth analysis completed');
            return result;
        } catch (error: any) {
            Logger.error('GrowthInsightService', 'Growth analysis failed', error);
            throw new Error(`成长分析失败: ${error.message}`);
        }
    }

    private static calculateMonthlyMetrics(notes: any[]): any[] {
        const monthMap = new Map<string, any>();

        for (const note of notes) {
            if (!note.publish_date) continue;
            const month = note.publish_date.substring(0, 7);
            const existing = monthMap.get(month) || {
                month, note_count: 0, total_views: 0,
                total_likes: 0, total_comments: 0, total_collects: 0, total_interactions: 0
            };
            existing.note_count += 1;
            existing.total_views += note.views || 0;
            existing.total_likes += note.likes || 0;
            existing.total_comments += note.comments || 0;
            existing.total_collects += note.collects || 0;
            existing.total_interactions += (note.likes || 0) + (note.comments || 0) + (note.collects || 0);
            monthMap.set(month, existing);
        }

        return Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));
    }

    private static analyzeTagPerformance(notes: any[]): any[] {
        const tagMap = new Map<string, { note_count: number; total_interactions: number }>();

        for (const note of notes) {
            let tags: string[] = [];
            try {
                if (note.draft_tags) {
                    tags = typeof note.draft_tags === 'string'
                        ? JSON.parse(note.draft_tags) : note.draft_tags;
                }
            } catch {
                tags = (note.draft_tags || '').split(/[,，]/).filter(Boolean);
            }

            const interactions = (note.likes || 0) + (note.collects || 0) + (note.comments || 0);

            if (tags.length === 0) {
                const key = '未分类';
                const data = tagMap.get(key) || { note_count: 0, total_interactions: 0 };
                data.note_count += 1;
                data.total_interactions += interactions;
                tagMap.set(key, data);
            } else {
                for (const tag of tags) {
                    const key = tag.trim();
                    if (!key) continue;
                    const data = tagMap.get(key) || { note_count: 0, total_interactions: 0 };
                    data.note_count += 1;
                    data.total_interactions += interactions;
                    tagMap.set(key, data);
                }
            }
        }

        return Array.from(tagMap.entries())
            .map(([tag, data]) => ({
                tag,
                note_count: data.note_count,
                avg_interaction: Math.round(data.total_interactions / (data.note_count || 1))
            }))
            .sort((a, b) => b.avg_interaction - a.avg_interaction);
    }

    private static getMockInsight(): GrowthInsight {
        return {
            niche_trends: [
                {
                    topic: '春季穿搭',
                    growth: '近30天互动量较上月增长45%，换季需求推动穿搭内容进入流量高峰',
                    opportunity: '建议增加"一衣多穿""胶囊衣橱"等细分话题，抢占长尾搜索流量'
                },
                {
                    topic: '平价好物推荐',
                    growth: '收藏率高于平均值2.3倍，显示用户对高性价比内容的强需求',
                    opportunity: '结合"学生党""上班族"等人群标签，制作针对性推荐清单'
                },
                {
                    topic: '护肤流程分享',
                    growth: '评论互动率上升，用户对经验分享型内容有更强讨论意愿',
                    opportunity: '尝试"30天挑战"系列内容，提高粉丝粘性'
                }
            ],
            writing_improvements: [
                {
                    aspect: '标题吸引力',
                    before_avg: 235,
                    after_avg: 412,
                    tip: '引入数字和效果描述后点击率提升明显，继续强化"数字+结果"公式'
                },
                {
                    aspect: '正文结构',
                    before_avg: 180,
                    after_avg: 315,
                    tip: '采用"总-分-总"结构并加入分段后，收藏率翻倍'
                },
                {
                    aspect: '结尾引导',
                    before_avg: 150,
                    after_avg: 280,
                    tip: '增加互动话题引导后评论区活跃度显著提升'
                }
            ],
            next_steps: [
                {
                    action: '每周发布2-3篇视频笔记',
                    reason: '视频笔记平均互动量是图文的1.8倍',
                    expected_impact: '月总互动量预计提升30%-50%'
                },
                {
                    action: '建立个人选题库',
                    reason: '当前发布节奏不稳定，提前储备保证更新频率',
                    expected_impact: '稳定频率后可提升账号权重'
                },
                {
                    action: '参与平台话题挑战',
                    reason: '话题挑战自带流量加成',
                    expected_impact: '单篇曝光额外增加2000-5000次'
                },
                {
                    action: '开设系列专栏内容',
                    reason: '系列内容培养追更习惯，提升回访率',
                    expected_impact: '粉丝增长和收藏率同步提升'
                }
            ],
            skill_progress: [
                {
                    skill: '标题创作',
                    level: '熟练',
                    improvement: '从平铺直叙进步到熟练运用数字钩子、悬念等技巧，点击率提升约40%'
                },
                {
                    skill: '封面设计',
                    level: '进阶',
                    improvement: '开始注重封面统一性和品牌感，色彩搭配仍有优化空间'
                },
                {
                    skill: '内容结构',
                    level: '精通',
                    improvement: '正文结构清晰，善用分段增强可读性，节奏控制得当'
                },
                {
                    skill: '互动运营',
                    level: '进阶',
                    improvement: '开始有意识引导评论互动，回复率可进一步提升'
                },
                {
                    skill: '选题策划',
                    level: '初级',
                    improvement: '选题方向较分散，建议建立系统化选题框架'
                }
            ]
        };
    }
}
