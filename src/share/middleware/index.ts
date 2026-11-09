import { ITokenIntrospect } from "../interface";
import { MdlFactory } from "../interface/service-context";
import { authMiddleware } from "./auth";
import { allowRoles } from "./check-role";
import { serviceKeyMiddleware } from "./service-key";

/**
 * Middleware factory — follows sample's setupMiddlewares pattern.
 */
export const setupMiddlewares = (
  introspector: ITokenIntrospect,
): MdlFactory => {
  const auth = authMiddleware(introspector);

  return {
    auth,
    allowRoles,
    serviceKey: serviceKeyMiddleware,
  };
};
