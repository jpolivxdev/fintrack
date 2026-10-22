import { Body, Controller, ForbiddenException, Get, HttpCode, HttpException, HttpStatus, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DEMO_EMAIL, DEMO_PARTNER_EMAIL } from '../seed/demo-accounts.js';
import { AiGateway, AiUnavailableError, type AiUnavailableReason } from './ai-gateway.service.js';
import { AiThrottlerGuard } from './ai-throttler.guard.js';
import { AskService } from './ask/ask.service.js';
import { CategorizeService } from './categorize/categorize.service.js';
import { AiSettingsDto, AiStatusDto, AskDto, AskResponseDto, CategorizeDto, CategorizeResponseDto } from './dto/ai.dto.js';

const isDemo = (email: string) => email === DEMO_EMAIL || email === DEMO_PARTNER_EMAIL;

/** Limits the user can wait out (429) versus the AI being off or broken (503). */
const RATE_REASONS = new Set<AiUnavailableReason>(['user_quota', 'global_quota', 'global_rate', 'rate_limited', 'daily_quota']);

@ApiTags('ai')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@Controller('ai')
export class AiController {
  constructor(
    private readonly categorizer: CategorizeService,
    private readonly asker: AskService,
    private readonly gateway: AiGateway,
    private readonly prisma: PrismaService,
  ) {}

  @Post('categorize')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AiThrottlerGuard)
  @ApiOperation({ summary: 'Sugere uma categoria para uma transação (regra, cache ou IA)' })
  @ApiOkResponse({ type: CategorizeResponseDto, description: 'Sem sugestão vem com origem "nenhuma": nunca falha por causa da IA' })
  @ApiTooManyRequestsResponse({ description: 'Limite por minuto do usuário' })
  categorize(@CurrentUser() user: AuthUser, @Body() dto: CategorizeDto): Promise<CategorizeResponseDto> {
    return this.categorizer.suggest(user.id, user.householdId, dto.tipo, dto.descricao, dto.valor);
  }

  @Post('ask')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AiThrottlerGuard)
  @ApiOperation({ summary: 'Pergunte ao FinTrack: responde sobre as finanças do lar com consultas somente leitura' })
  @ApiOkResponse({ type: AskResponseDto })
  @ApiForbiddenResponse({ description: 'IA não ativada pelo usuário' })
  @ApiTooManyRequestsResponse({ description: 'Limite por minuto ou cota diária' })
  @ApiServiceUnavailableResponse({ description: 'IA desligada ou indisponível no momento' })
  async ask(@CurrentUser() user: AuthUser, @Body() dto: AskDto): Promise<AskResponseDto> {
    try {
      return await this.asker.ask(user.id, user.householdId, dto.pergunta);
    } catch (error) {
      if (!(error instanceof AiUnavailableError)) throw error;
      if (error.reason === 'not_opted_in') {
        throw new ForbiddenException({ message: 'Ative a IA em Configurações para usar esta função', motivo: error.reason });
      }
      const status = RATE_REASONS.has(error.reason) ? HttpStatus.TOO_MANY_REQUESTS : HttpStatus.SERVICE_UNAVAILABLE;
      throw new HttpException({ statusCode: status, message: 'A IA não pode responder agora', motivo: error.reason }, status);
    }
  }

  @Get('status')
  @ApiOperation({ summary: 'Se a IA está disponível para este usuário, e quanto da cota diária já usou' })
  @ApiOkResponse({ type: AiStatusDto })
  async status(@CurrentUser() user: AuthUser): Promise<AiStatusDto> {
    const server = this.gateway.serverStatus();
    const [aiEnabled, usage] = await Promise.all([this.gateway.optedIn(user.id), this.gateway.usageToday(user.id)]);
    return {
      servidorDisponivel: server.available,
      motivo: server.reason,
      aiEnabled,
      demo: isDemo(user.email),
      provedor: this.gateway.providerName,
      modelo: this.gateway.model,
      cotaDiaria: usage.quota,
      usadasHoje: usage.used,
    };
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Liga ou desliga a IA para este usuário (opt-in)' })
  @ApiOkResponse({ type: AiSettingsDto })
  @ApiForbiddenResponse({ description: 'Conta de demonstração' })
  async settings(@CurrentUser() user: AuthUser, @Body() dto: AiSettingsDto): Promise<AiSettingsDto> {
    if (isDemo(user.email)) throw new ForbiddenException('The demo account cannot change AI settings');
    const updated = await this.prisma.user.update({ where: { id: user.id }, data: { aiEnabled: dto.aiEnabled }, select: { aiEnabled: true } });
    return { aiEnabled: updated.aiEnabled };
  }
}
