import { z } from "zod";

/**
 * Paging DTO — adapted for BA-SOA convention:
 *   page=0 (0-indexed), size=20 default, max 100
 *   Response envelope: { items, page, size, totalElements, totalPages }
 */
export const PagingDTOSchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  size: z.coerce.number().int().min(1).max(100).default(20),
});

export type PagingDTO = z.infer<typeof PagingDTOSchema> & {
  totalElements?: number;
  totalPages?: number;
};

export interface PagingResponse<T> {
  items: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}
