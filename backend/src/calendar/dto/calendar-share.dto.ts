import { ApiProperty } from '@nestjs/swagger';

export class CalendarPartnerDto {
  @ApiProperty()
  userId: string;

  @ApiProperty({ example: 'Bia' })
  name: string;

  @ApiProperty({ example: 'bia@example.com', description: 'Visible only to people you share your calendar with' })
  email: string;

  @ApiProperty()
  since: Date;
}

export class CalendarSharesDto {
  @ApiProperty({ type: [CalendarPartnerDto] })
  partners: CalendarPartnerDto[];

  @ApiProperty({ description: 'False on the public demo account' })
  invitesEnabled: boolean;
}
