import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiController } from './ai.controller.js';
import { AiGateway } from './ai-gateway.service.js';
import { AskService } from './ask/ask.service.js';
import { CategorizeService } from './categorize/categorize.service.js';
import { AI_PROVIDER } from './providers/ai-provider.js';
import { FakeAiProvider } from './providers/fake.provider.js';
import { GeminiProvider } from './providers/gemini.provider.js';

@Module({
  controllers: [AiController],
  providers: [
    {
      provide: AI_PROVIDER,
      inject: [ConfigService],
      // The key goes to the SDK only. Without a key AI must be off (env validation
      // refuses AI_ENABLED with gemini and no key), so the fake just fills the slot.
      useFactory: (config: ConfigService) => {
        const apiKey = config.get<string>('GEMINI_API_KEY');
        if (config.get<string>('AI_PROVIDER') !== 'gemini' || !apiKey) return new FakeAiProvider();
        return new GeminiProvider(apiKey, config.get<string>('GEMINI_MODEL', 'gemini-3.5-flash-lite'), config.get<number>('AI_TIMEOUT_MS', 10_000));
      },
    },
    AiGateway,
    CategorizeService,
    AskService,
  ],
})
export class AiModule {}
