import test, { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  BaseCommandRepositoryPrisma,
  BaseQueryRepositoryPrisma,
  BaseRepositoryPrisma,
} from './repo-prisma';
import { ModelStatus } from '@share/model/base-model';
import { PagingDTO } from '@share/model/paging';

interface SampleEntity {
  id: string;
  name: string;
  status: string;
}

interface SampleCond {
  name?: string;
  status?: string;
}

interface SampleUpdateDTO {
  name?: string;
}

// Mock PrismaClient delegate
class MockModelDelegate {
  public data: SampleEntity[] = [];

  async findUnique({ where }: { where: Record<string, any> }) {
    const key = Object.keys(where)[0];
    return this.data.find((item: any) => item[key] === where[key]) || null;
  }

  async findFirst({ where }: { where: Record<string, any> }) {
    return (
      this.data.find((item: any) => {
        return Object.entries(where).every(([k, v]) => {
          if (typeof v === 'object' && v !== null && 'not' in v) {
            return item[k] !== v.not;
          }
          return item[k] === v;
        });
      }) || null
    );
  }

  async findMany({ where, skip = 0, take = 20 }: any) {
    const filtered = this.data.filter((item: any) => {
      return Object.entries(where || {}).every(([k, v]) => {
        if (typeof v === 'object' && v !== null && 'not' in v) {
          return item[k] !== v.not;
        }
        return item[k] === v;
      });
    });
    return filtered.slice(skip, skip + take);
  }

  async count({ where }: any) {
    const filtered = this.data.filter((item: any) => {
      return Object.entries(where || {}).every(([k, v]) => {
        if (typeof v === 'object' && v !== null && 'not' in v) {
          return item[k] !== v.not;
        }
        return item[k] === v;
      });
    });
    return filtered.length;
  }

  async create({ data }: { data: SampleEntity }) {
    this.data.push({ ...data });
    return data;
  }

  async update({ where, data }: { where: Record<string, any>; data: any }) {
    const key = Object.keys(where)[0];
    const index = this.data.findIndex((item: any) => item[key] === where[key]);
    if (index !== -1) {
      this.data[index] = { ...this.data[index], ...data };
      return this.data[index];
    }
    throw new Error('Record not found');
  }

  async delete({ where }: { where: Record<string, any> }) {
    const key = Object.keys(where)[0];
    const index = this.data.findIndex((item: any) => item[key] === where[key]);
    if (index !== -1) {
      const removed = this.data.splice(index, 1);
      return removed[0];
    }
    throw new Error('Record not found');
  }
}

class TestQueryRepo extends BaseQueryRepositoryPrisma<SampleEntity, SampleCond> {
  constructor(prisma: any) {
    super(prisma, 'sampleModel', 'id');
  }
}

class TestCommandRepo extends BaseCommandRepositoryPrisma<
  SampleEntity,
  SampleUpdateDTO
> {
  constructor(prisma: any) {
    super(prisma, 'sampleModel', 'id');
  }
}

class TestRepo extends BaseRepositoryPrisma<
  SampleEntity,
  SampleCond,
  SampleUpdateDTO
> {
  constructor(prisma: any) {
    super(new TestQueryRepo(prisma), new TestCommandRepo(prisma));
  }
}

describe('BaseRepositoryPrisma', () => {
  it('performs CRUD operations correctly with Prisma logic', async () => {
    const mockDelegate = new MockModelDelegate();
    const mockPrisma = { sampleModel: mockDelegate } as any;

    const repo = new TestRepo(mockPrisma);

    // 1. insert
    const insertSuccess = await repo.insert({
      id: '1',
      name: 'Item 1',
      status: ModelStatus.ACTIVE,
    });
    assert.strictEqual(insertSuccess, true);
    assert.strictEqual(mockDelegate.data.length, 1);

    // 2. get
    const item = await repo.get('1');
    assert.deepStrictEqual(item, {
      id: '1',
      name: 'Item 1',
      status: ModelStatus.ACTIVE,
    });

    // 3. findByCond
    const found = await repo.findByCond({ name: 'Item 1' });
    assert.deepStrictEqual(found, {
      id: '1',
      name: 'Item 1',
      status: ModelStatus.ACTIVE,
    });

    // 4. update
    const updateSuccess = await repo.update('1', { name: 'Updated Item 1' });
    assert.strictEqual(updateSuccess, true);
    const updated = await repo.get('1');
    assert.strictEqual(updated?.name, 'Updated Item 1');

    // 5. list with paging and soft-delete exclusion
    await repo.insert({
      id: '2',
      name: 'Item 2',
      status: ModelStatus.ACTIVE,
    });
    await repo.insert({
      id: '3',
      name: 'Item 3',
      status: ModelStatus.DELETED,
    });

    const paging: PagingDTO = { page: 0, size: 10 };
    const list = await repo.list({}, paging);

    // Should return Item 1 & Item 2, but NOT Item 3 (deleted)
    assert.strictEqual(list.length, 2);
    assert.strictEqual(paging.totalElements, 2);
    assert.strictEqual(paging.totalPages, 1);

    // 6. soft delete
    const softDeleteSuccess = await repo.delete('1', false);
    assert.strictEqual(softDeleteSuccess, true);
    const softDeletedItem = mockDelegate.data.find((i) => i.id === '1');
    assert.strictEqual(softDeletedItem?.status, ModelStatus.DELETED);

    // 7. hard delete
    const hardDeleteSuccess = await repo.delete('2', true);
    assert.strictEqual(hardDeleteSuccess, true);
    assert.strictEqual(mockDelegate.data.find((i) => i.id === '2'), undefined);
  });
});

