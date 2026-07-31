import OpenAI from 'openai';
import { AIProvider } from '../interfaces/AIProvider.js';
import { SettingsService } from '../../SettingsService.js';

export class DeepSeekProvider implements AIProvider {
    private client: OpenAI | null = null;

    private async getClient() {
        if (this.client) return this.client;

        // Try DB settings first
        const dbKey = await SettingsService.get('deepseek_api_key');
        const dbUrl = await SettingsService.get('deepseek_base_url');
        const _dbModel = await SettingsService.get('deepseek_model');

        const apiKey = dbKey || process.env.DEEPSEEK_API_KEY;
        const baseURL = dbUrl || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';

        if (!apiKey) throw new Error("Missing DeepSeek API Key");

        this.client = new OpenAI({
            baseURL,
            apiKey,
        });
        
        return this.client;
    }

    async generateText(messages: any[], options?: any): Promise<string> {
        const client = await this.getClient();
        const dbModel = await SettingsService.get('deepseek_model');
        
        const completion = await client.chat.completions.create({
            messages,
            model: options?.model || dbModel || 'deepseek-chat',
            temperature: options?.temperature || 1.3,
        });
        return completion.choices[0].message.content || '';
    }

    async generateJSON<T>(messages: any[], options?: any): Promise<T> {
        const client = await this.getClient();
        const dbModel = await SettingsService.get('deepseek_model');

        // DeepSeek 的 json_object 模式要求 prompt 中必须包含英文单词 "json"
        const jsonInstruction = "IMPORTANT: You must output strictly valid JSON only. Do not wrap in markdown code blocks.";
        const systemMsgIdx = messages.findIndex(m => m.role === 'system');
        if (systemMsgIdx > -1) {
            messages[systemMsgIdx].content += `\n${jsonInstruction}`;
        } else {
            messages.unshift({ role: 'system', content: jsonInstruction });
        }

        const completion = await client.chat.completions.create({
            messages,
            model: options?.model || dbModel || 'deepseek-chat',
            temperature: options?.temperature || 1.3,
            response_format: { type: "json_object" }
        });
        
        const content = completion.choices[0].message.content;
        if (!content) throw new Error("No content generated");
        
        // Clean markdown if present
        const cleanContent = content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        return JSON.parse(cleanContent) as T;
    }

    async generateImage(_prompt: string, _options?: any): Promise<string> {
        throw new Error("DeepSeek does not support image generation yet.");
    }
}
