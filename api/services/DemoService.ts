/**
 * Demo 模式服务 — 当用户未配置 API Key 时返回 mock 数据。
 * 让用户不配置任何东西也能体验完整功能。
 */
import { SettingsService } from './SettingsService.js';

export class DemoService {
    static async isDemoMode(): Promise<boolean> {
        const aliyunKey = await SettingsService.get('aliyun_api_key');
        const deepseekKey = await SettingsService.get('deepseek_api_key');
        return !aliyunKey && !deepseekKey && !process.env.ALIYUN_API_KEY && !process.env.DEEPSEEK_API_KEY;
    }

    static getMockNote() {
        return {
            title: '碎花裙+针织开衫,温柔感拉满的春日约会穿搭',
            options: [
                {
                    type: 'dry_goods' as const,
                    label: '干货版',
                    content: '最近后台收到了好多姐妹的私信,都在问春天约会该怎么穿。今天就来分享3套我最近超爱的春日约会穿搭,每一套都经过男友认证！\n\nLOOK1:碎花连衣裙+米白色针织开衫\n碎花裙真的是春天的标配,搭配一件软糯的针织开衫,温柔感直接拉满。建议选择浅色系碎花,搭配米白/杏色开衫,整体色调统一又高级。\n\nLOOK2:粉色衬衫+白色半身裙\n粉色衬衫真的是约会神器,搭配白色A字半身裙,甜美又不失气质。记得把衬衫塞进裙子里,显高又显瘦。\n\nLOOK3:针织背心+阔腿牛仔裤\n想要休闲一点的可以试试这套,针织背心内搭白T,搭配阔腿牛仔裤,慵懒又时髦。配上一双小白鞋,舒适又好看。\n\n💡小贴士:约会穿搭的要点是"看起来毫不费力,但其实精心搭配"。选择质感好的单品,比花哨的设计更重要。'
                },
                {
                    type: 'experience' as const,
                    label: '经验版',
                    content: '谈了三年恋爱,总结了这几套约会穿搭,每一套都被夸！\n\n作为一个约会经验丰富的过来人,我深知穿搭的重要性。第一次约会穿搭决定了对方对你的第一印象,所以一定要重视起来。\n\n1. 碎花裙+针织开衫\n这是我最喜欢的一套,穿上就像韩剧女主。碎花裙选择雪纺材质的,走起路来飘逸又好看。\n\n2. 衬衫+半身裙\n约会必备单品,无论是去餐厅还是看电影都很合适。\n\n3. 针织背心+牛仔裤\n适合户外约会的穿搭,比如去公园散步或者逛展览。'
                }
            ],
            tags: ['春日穿搭', '约会穿搭', '碎花裙', '温柔风'],
            image_prompts: ['春日约会穿搭,碎花连衣裙搭配针织开衫,温柔风格,室外自然光线'],
            risk_warnings: { blocked: [], warnings: [], suggestions: [], score: 95 }
        };
    }

    static getMockAnalytics() {
        return {
            account_name: '穿搭博主(演示)',
            total_notes: 28,
            total_views: 15420,
            total_likes: 892,
            total_comments: 156,
            total_collects: 423
        };
    }

    static getMockHistory() {
        const data = [];
        for (let i = 30; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            data.push({
                record_date: date.toISOString(),
                views: Math.floor(Math.random() * 500) + 200,
                likes: Math.floor(Math.random() * 50) + 10,
                comments: Math.floor(Math.random() * 10) + 1,
                collects: Math.floor(Math.random() * 30) + 5
            });
        }
        return data;
    }

    static getMockTasks() {
        return {
            data: [
                { id: 'demo-1', type: 'PUBLISH', status: 'COMPLETED', payload: { title: '春日约会穿搭指南' }, created_at: new Date(Date.now() - 86400000).toISOString(), progress: 100, updated_at: new Date().toISOString() },
                { id: 'demo-2', type: 'GENERATE_CONTENT', status: 'COMPLETED', payload: { topic: '夏季防晒推荐' }, created_at: new Date(Date.now() - 172800000).toISOString(), progress: 100, updated_at: new Date().toISOString() },
                { id: 'demo-3', type: 'SCRAPE_TRENDS', status: 'COMPLETED', payload: {}, created_at: new Date(Date.now() - 259200000).toISOString(), progress: 100, updated_at: new Date().toISOString() },
            ],
            pagination: { total: 3, totalPages: 1 }
        };
    }
}