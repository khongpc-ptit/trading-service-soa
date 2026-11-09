import { IAccessStateRPC, ITokenIntrospect, ITokenVerifier } from "../interface";
import { MdlFactory } from "../interface/service-context";
import { authMiddleware } from "./auth";
import { allowRoles } from "./check-role";
import { serviceKeyMiddleware } from "./service-key";

/**
 * Middleware factory — follows sample's setupMiddlewares pattern.
 */
export const setupMiddlewares = (
  source?: ITokenVerifier | ITokenIntrospect,
  accessStateRpc?: IAccessStateRPC,
): MdlFactory => {
  const auth = authMiddleware(source, accessStateRpc);

  return {
    auth,
    allowRoles,
    serviceKey: serviceKeyMiddleware,
  };
};
