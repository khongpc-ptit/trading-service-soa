import axios, { AxiosError } from "axios";
import { AppError, ErrAccessStateUnavailable } from "../app-error";
import { AccountAccessState, IAccessStateRPC } from "../interface";
import { config } from "../component/config";

/**
 * Access State RPC Client (BA-SOA §3).
 * Calls User Service internal endpoint to check account state in real-time.
 * Endpoint: GET /internal/v1/accounts/{accountId}/access-state
 * Headers: X-Service-Key, Cache-Control: no-store
 * Timeout: 1000ms
 */
export class AccessStateRPCClient implements IAccessStateRPC {
  constructor(
    private readonly baseUrl: string = config.services.userUrl,
    private readonly serviceKey: string = config.serviceKeys.tradingToUser,
    private readonly timeoutMs: number = config.accessStateTimeoutMs,
  ) {}

  async check(accountId: string): Promise<AccountAccessState> {
    const url = `${this.baseUrl}/internal/v1/accounts/${accountId}/access-state`;

    try {
      const response = await axios.get(url, {
        headers: {
          "x-service-key": this.serviceKey,
          "cache-control": "no-store",
        },
        timeout: this.timeoutMs,
      });

      const body = response.data;
      const data = body?.data ?? body;

      return {
        accountId: data.accountId || accountId,
        status: data.status || "ACTIVE",
        role: data.role,
        accessAllowed: Boolean(data.accessAllowed),
      };
    } catch (error: any) {
      if (error instanceof AxiosError) {
        // If timed out or connection refused (User Service unavailable)
        if (
          error.code === "ECONNABORTED" ||
          error.code === "ETIMEDOUT" ||
          !error.response ||
          error.response.status >= 500
        ) {
          throw AppError.from(ErrAccessStateUnavailable, 503)
            .withCode("ACCESS_STATE_UNAVAILABLE")
            .withLog(
              `User access-state RPC failed: ${error.message} (url: ${url})`,
            );
        }

        // If 404 (Account not found) or 403
        if (error.response.status === 404 || error.response.status === 403) {
          return {
            accountId,
            status: error.response.data?.status || "LOCKED",
            role: "",
            accessAllowed: false,
          };
        }
      }

      if (error instanceof AppError) throw error;

      throw AppError.from(ErrAccessStateUnavailable, 503)
        .withCode("ACCESS_STATE_UNAVAILABLE")
        .withLog(`Access-state check error: ${error?.message || error}`);
    }
  }
}

