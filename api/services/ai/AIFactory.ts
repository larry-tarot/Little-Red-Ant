import { AIProvider } from './interfaces/AIProvider.js';
import { AudioProvider } from './interfaces/AudioProvider.js';
import { DeepSeekProvider } from './providers/DeepSeekProvider.js';
import { AliyunProvider } from './providers/AliyunProvider.js';
import { CompositeProvider } from './providers/CompositeProvider.js';

export class AIFactory {
    private static textProvider: AIProvider;
    private static imageProvider: AIProvider;
    private static audioProvider: AudioProvider;

    static getTextProvider(): AIProvider {
        if (!this.textProvider) {
            // Priority: DeepSeek -> Aliyun
            // This ensures if DeepSeek is down/out of credits, we fall back to Aliyun Qwen
            this.textProvider = new CompositeProvider('TextService', [
                new DeepSeekProvider(),
                new AliyunProvider()
            ]);
        }
        return this.textProvider;
    }

    static getImageProvider(): AIProvider {
        if (!this.imageProvider) {
            // Priority: Aliyun (Wanx/Qwen) -> DeepSeek (Currently no image support, but kept for future)
            this.imageProvider = new CompositeProvider('ImageService', [
                new AliyunProvider(),
                new DeepSeekProvider()
            ]);
        }
        return this.imageProvider;
    }

    static getAudioProvider(): AudioProvider {
        if (!this.audioProvider) {
            // Use Aliyun Paraformer directly as requested
            this.audioProvider = new AliyunProvider();
        }
        return this.audioProvider;
    }

    /**
     * 获取当前文本生成 Provider 组合的状态
     *
     * 返回说明：
     * - CompositeProvider.getStatus() 的返回值，包含当前主用 Provider、
     *   各子 Provider 的断路器状态与失败统计
     */
    static getProviderStatus(): ReturnType<CompositeProvider['getStatus']> | null {
        const textProvider = this.getTextProvider();
        if (textProvider instanceof CompositeProvider) {
            return textProvider.getStatus();
        }
        return null;
    }
}
