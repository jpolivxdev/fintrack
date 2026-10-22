import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { IsSafeText } from '../../common/validation/decorators.js';
import { TransactionType } from '../../generated/prisma/client.js';

export class CategorizeDto {
  @ApiProperty({ example: 'UBER *TRIP 4821', maxLength: 120 })
  @IsSafeText({ maxLength: 120 })
  descricao: string;

  @ApiProperty({ enum: TransactionType, example: TransactionType.EXPENSE })
  @IsEnum(TransactionType)
  tipo: TransactionType;

  @ApiPropertyOptional({ example: 23.9 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  valor?: number;
}

export class CategorizeResponseDto {
  @ApiProperty({ nullable: true, example: '3d8f1a2b-9c4e-4b7a-8f6d-1e2c3b4a5d6e' })
  categoriaId: string | null;

  @ApiProperty({ nullable: true, example: 'Transporte' })
  categoriaNome: string | null;

  @ApiProperty({ example: 0.9, description: '0 a 1' })
  confianca: number;

  @ApiProperty({ enum: ['regra', 'cache', 'ia', 'nenhuma'] })
  origem: string;

  @ApiProperty({ description: 'Se a IA poderia ter sido consultada para este usuário agora' })
  iaDisponivel: boolean;
}

export class AskDto {
  @ApiProperty({ example: 'Quanto gastei com alimentação este mês?', maxLength: 300 })
  @IsSafeText({ maxLength: 300 })
  pergunta: string;
}

export class AskResponseDto {
  @ApiProperty({ example: 'Você gastou R$ 812,40 com Alimentação este mês.' })
  resposta: string;

  @ApiProperty({ example: [{ nome: 'totalPorCategoria', argumentos: { categoria: 'Alimentação', inicio: '2026-10-01', fim: '2026-10-22' } }] })
  ferramentasUsadas: Array<{ nome: string; argumentos: unknown }>;

  @ApiProperty({ example: [{ ferramenta: 'totalPorCategoria', resultado: { total: '812.40' } }] })
  dadosUtilizados: Array<{ ferramenta: string; resultado: unknown }>;
}

export class AiSettingsDto {
  @ApiProperty({ description: 'Opt-in: permite enviar dados deste usuário ao provedor de IA' })
  @IsBoolean()
  aiEnabled: boolean;
}

export class AiStatusDto {
  @ApiProperty({ description: 'O servidor pode usar IA agora (kill switch, cota, disjuntor)' })
  servidorDisponivel: boolean;

  @ApiPropertyOptional({ example: 'disabled' })
  motivo?: string;

  @ApiProperty({ description: 'O usuário ativou a IA (opt-in)' })
  aiEnabled: boolean;

  @ApiProperty({ description: 'Conta de demonstração: IA sempre ligada, não pode ser alterada' })
  demo: boolean;

  @ApiProperty({ example: 'gemini' })
  provedor: string;

  @ApiProperty({ example: 'gemini-3.5-flash-lite' })
  modelo: string;

  @ApiProperty({ example: 30 })
  cotaDiaria: number;

  @ApiProperty({ example: 4 })
  usadasHoje: number;
}
