import { PrismaClient } from "@prisma/client";
import { ICommandRepository, IQueryRepository, IRepository } from "@share/interface";
import { ModelStatus } from "@share/model/base-model";
import { PagingDTO } from "@share/model/paging";

/**
 * Composite Prisma Base Repository.
 * Same composition pattern as BaseRepositorySequelize.
 */
export abstract class BaseRepositoryPrisma<Entity, Cond, UpdateDTO>
  implements IRepository<Entity, Cond, UpdateDTO>
{
  constructor(
    readonly queryRepo: IQueryRepository<Entity, Cond>,
    readonly cmdRepo: ICommandRepository<Entity, UpdateDTO>,
  ) {}

  async get(id: string): Promise<Entity | null> {
    return await this.queryRepo.get(id);
  }

  async findByCond(cond: Cond): Promise<Entity | null> {
    return await this.queryRepo.findByCond(cond);
  }

  async list(cond: Cond, paging: PagingDTO): Promise<Array<Entity>> {
    return await this.queryRepo.list(cond, paging);
  }

  async insert(data: Entity): Promise<boolean> {
    return await this.cmdRepo.insert(data);
  }

  async update(id: string, data: UpdateDTO): Promise<boolean> {
    return await this.cmdRepo.update(id, data);
  }

  async delete(id: string, isHard: boolean): Promise<boolean> {
    return await this.cmdRepo.delete(id, isHard);
  }
}

/**
 * Prisma Query Repository base class.
 * Same responsibilities as BaseQueryRepositorySequelize, implemented with PrismaClient.
 */
export abstract class BaseQueryRepositoryPrisma<Entity, Cond>
  implements IQueryRepository<Entity, Cond>
{
  constructor(
    readonly prisma: PrismaClient,
    readonly modelName: string,
    readonly primaryKey: string = "id",
  ) {}

  protected get model(): any {
    const delegate =
      (this.prisma as any)[this.modelName] ??
      (this.prisma as any)[
        this.modelName.charAt(0).toLowerCase() + this.modelName.slice(1)
      ];

    if (!delegate) {
      throw new Error(`Prisma model delegate '${this.modelName}' not found`);
    }

    return delegate;
  }

  async get(id: string): Promise<Entity | null> {
    const data = await this.model.findUnique({
      where: { [this.primaryKey]: id },
    });

    if (!data) {
      return null;
    }

    return this.toEntity(data);
  }

  async findByCond(cond: Cond): Promise<Entity | null> {
    const data = await this.model.findFirst({
      where: cond as any,
    });

    if (!data) {
      return null;
    }

    return this.toEntity(data);
  }

  async list(cond: Cond, paging: PagingDTO): Promise<Array<Entity>> {
    const limit = paging.size ?? (paging as any).limit ?? 20;
    const page = paging.page ?? 0;
    const skip =
      (paging as any).limit && page >= 1 ? (page - 1) * limit : page * limit;

    const where: any = { ...(cond as any) };

    // Exclude soft-deleted rows if status condition is not explicitly provided
    if (where.status === undefined) {
      where.status = { not: ModelStatus.DELETED };
    }

    const [total, rows] = await Promise.all([
      this.model.count({ where }),
      this.model.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [this.primaryKey]: "desc" },
      }),
    ]);

    paging.totalElements = total;
    (paging as any).total = total;
    paging.totalPages = Math.ceil(total / limit);

    return rows.map((row: any) => this.toEntity(row));
  }

  protected toEntity(data: any): Entity {
    return data as Entity;
  }
}

/**
 * Prisma Command Repository base class.
 * Same responsibilities as BaseCommandRepositorySequelize, implemented with PrismaClient.
 */
export abstract class BaseCommandRepositoryPrisma<Entity, UpdateDTO>
  implements ICommandRepository<Entity, UpdateDTO>
{
  constructor(
    readonly prisma: PrismaClient,
    readonly modelName: string,
    readonly primaryKey: string = "id",
  ) {}

  protected get model(): any {
    const delegate =
      (this.prisma as any)[this.modelName] ??
      (this.prisma as any)[
        this.modelName.charAt(0).toLowerCase() + this.modelName.slice(1)
      ];

    if (!delegate) {
      throw new Error(`Prisma model delegate '${this.modelName}' not found`);
    }

    return delegate;
  }

  async insert(data: Entity): Promise<boolean> {
    await this.model.create({
      data: data as any,
    });
    return true;
  }

  async update(id: string, data: UpdateDTO): Promise<boolean> {
    await this.model.update({
      where: { [this.primaryKey]: id },
      data: data as any,
    });
    return true;
  }

  async delete(id: string, isHard: boolean = false): Promise<boolean> {
    if (!isHard) {
      await this.model.update({
        where: { [this.primaryKey]: id },
        data: { status: ModelStatus.DELETED } as any,
      });
    } else {
      await this.model.delete({
        where: { [this.primaryKey]: id },
      });
    }

    return true;
  }
}

