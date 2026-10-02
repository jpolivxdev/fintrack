import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator.js';
import { CategoriesService } from './categories.service.js';
import {
  CategoryResponseDto,
  CreateCategoryDto,
  ListCategoriesQueryDto,
  PaginatedCategoriesDto,
  UpdateCategoryDto,
} from './dto/category.dto.js';

@ApiTags('Categories')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a category' })
  @ApiCreatedResponse({ type: CategoryResponseDto })
  @ApiConflictResponse({ description: 'A category with this name and type already exists' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCategoryDto) {
    return this.categories.create(user.householdId, dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List categories (optionally filtered by type)' })
  @ApiOkResponse({ type: PaginatedCategoriesDto })
  findAll(@CurrentUser('householdId') householdId: string, @Query() query: ListCategoriesQueryDto) {
    return this.categories.findAll(householdId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a category by id' })
  @ApiOkResponse({ type: CategoryResponseDto })
  @ApiNotFoundResponse({ description: 'Category not found' })
  findOne(@CurrentUser('householdId') householdId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.categories.findOne(householdId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a category' })
  @ApiOkResponse({ type: CategoryResponseDto })
  @ApiNotFoundResponse({ description: 'Category not found' })
  @ApiConflictResponse({ description: 'Name clash, or type change on a category with transactions' })
  update(
    @CurrentUser('householdId') householdId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categories.update(householdId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a category',
    description: 'Only categories without transactions can be deleted. Its budgets are removed too.',
  })
  @ApiNoContentResponse({ description: 'Category deleted' })
  @ApiNotFoundResponse({ description: 'Category not found' })
  @ApiConflictResponse({ description: 'Category still has transactions' })
  remove(@CurrentUser('householdId') householdId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.categories.remove(householdId, id);
  }
}
