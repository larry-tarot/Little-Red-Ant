import OpenAI from 'openai';
import { AIProvider } from '../interfaces/AIProvider.js';
import { SettingsService } from '../../SettingsService.js';

export class CustomOpenAIProvider implements AIProvider {
    readonly name: string = 'CustomOpenAI';
    private client: OpenAI | null = null;
    private cachedKey: string | null = null;
    private cachedBaseUrl: string | null = null;

    async getConfig(): Promise<{ apiKey: string; baseURL: string; model: string }> {
        const dbKey = await SettingsService.get('custom_api_key');
        const dbUrl = await SettingsService.get('custom_base_url');
        const dbModel = await SettingsService.get('custom_model');

        const apiKey = dbKey || process.env.CUSTOM_API_KEY || '';
        const baseURL = (dbUrl || process.env.CUSTOM_BASE_URL || 'https://api.openai.com/v1').trim().replace(/\/+$/, '');
        const model = dbModel || process.env.CUSTOM_MODEL || 'gpt-4o';

        return { apiKey, baseURL, model };
    }

    private async getClient(): Promise<OpenAI> {
        const { apiKey, baseURL } = await this.getConfig();
        if (!apiKey) {
            throw new Error('未配置自定义 API Key (custom_api_key)');
        }

        // 如果配置改变则重建客户端
        if (!this.client || this.cachedKey !== apiKey || this.cachedBaseUrl !== baseURL) {
            this.client = new OpenAI({
                baseURL,
                apiKey,
            });
            this.cachedKey = apiKey;
            this.cachedBaseUrl = baseURL;
        }

        return this.client;
    }

    async generateText(messages: any[], options?: any): Promise<string> {
        const client = await this.getClient();
        const { model: defaultModel } = await this.getConfig();

        const completion = await client.chat.completions.create({
            messages,
            model: options?.model || defaultModel,
            temperature: options?.temperature ?? 0.7,
        });

        return completion.choices[0]?.message?.content || '';
    }

    async generateJSON<T>(messages: any[], options?: any): Promise<T> {
        const client = await this.getClient();
        const { model: defaultModel } = await this.getConfig();

        const jsonInstruction = 'IMPORTANT: You must output strictly valid JSON only. Do not wrap in any extra prose.';
        const clonedMessages = JSON.parse(JSON.stringify(messages));
        const systemMsgIdx = clonedMessages.findIndex((m: any) => m.role === 'system');
        if (systemMsgIdx > -1) {
            clonedMessages[systemMsgIdx].content += `\n${jsonInstruction}`;
        } else {
            clonedMessages.unshift({ role: 'system', content: jsonInstruction });
        }

        let completion;
        try {
            // 优先尝试标准 json_object response_format
            completion = await client.chat.completions.create({
                messages: clonedMessages,
                model: options?.model || defaultModel,
                temperature: options?.temperature ?? 0.5,
                response_format: { type: 'json_object' }
            });
        } catch (err: any) {
            // 某些自定义中转或兼容模型（如早期版本）可能不支持 response_format，自动降级为普通请求
            completion = await client.chat.completions.create({
                messages: clonedMessages,
                model: options?.model || defaultModel,
                temperature: options?.temperature ?? 0.5,
            });
        }

        const content = completion.choices[0]?.message?.content;
        if (!content) throw new Error('自定义模型未返回有效内容');

        // 清理可能附带的 markdown json 代码块包裹
        const cleanContent = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        return JSON.parse(cleanContent) as T;
    }

    async generateImage(prompt: string, options?: any): Promise<string> {
        const client = await this.getClient();
        const { model: defaultModel } = await this.getConfig();

        const response = await client.images.generate({
            prompt,
            model: options?.model || (defaultModel.includes('dall-e') ? defaultModel : 'dall-e-3'),
            n: 1,
            size: options?.size || '1024x1024',
        });

        const url = response.data?.[0]?.url;
        if (!url) throw new Error('自定义生图模型未返回图片 URL');
        return url;
    }
}
