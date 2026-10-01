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
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
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
  create(@CurrentUser('id') userId: string, @Body() dto: CreateCategoryDto) {
    return this.categories.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List categories (optionally filtered by type)' })
  @ApiOkResponse({ type: PaginatedCategoriesDto })
  findAll(@CurrentUser('id') userId: string, @Query() query: ListCategoriesQueryDto) {
    return this.categories.findAll(userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a category by id' })
  @ApiOkResponse({ type: CategoryResponseDto })
  @ApiNotFoundResponse({ description: 'Category not found' })
  findOne(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.categories.findOne(userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a category' })
  @ApiOkResponse({ type: CategoryResponseDto })
  @ApiNotFoundResponse({ description: 'Category not found' })
  @ApiConflictResponse({ description: 'Name clash, or type change on a category with transactions' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categories.update(userId, id, dto);
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
  remove(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.categories.remove(userId, id);
  }
}
