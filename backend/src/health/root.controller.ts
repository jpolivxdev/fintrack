import { Controller, Get, Redirect } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';

/** Visiting the bare API URL lands on the interactive docs. */
@ApiExcludeController()
@Controller()
export class RootController {
  @Public()
  @Get()
  @Redirect('/api/docs', 302)
  root() {}
}
