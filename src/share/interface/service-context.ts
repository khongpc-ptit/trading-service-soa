import { Handler } from "express";
import { UserRole } from "./index";

export interface MdlFactory {
  auth: Handler;
  allowRoles: (roles: UserRole[]) => Handler;
  serviceKey: (allowedKeys: string[]) => Handler;
}

export type ServiceContext = {
  mdlFactory: MdlFactory;
}
