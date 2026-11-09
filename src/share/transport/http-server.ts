import { Request, Response } from "express";
import { PagingDTOSchema, PagingResponse } from "../model/paging";

/**
 * Base HTTP transport helper — adapted from sample's BaseHttpService.
 * Simplified: Trading modules define their own route methods,
 * but reuse this for common patterns (paging parse, response formatting).
 */
export function parsePaging(req: Request) {
  return PagingDTOSchema.safeParse(req.query);
}

export function sendPagingResponse<T>(res: Response, data: PagingResponse<T>) {
  res.status(200).json(data);
}

export function sendCreated<T>(res: Response, data: T) {
  res.status(201).json(data);
}

export function sendOk<T>(res: Response, data: T) {
  res.status(200).json({ data });
}

export function sendNoContent(res: Response) {
  res.status(204).send();
}
