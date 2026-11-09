import axios from "axios";
import { AppError, ErrDependencyUnavailable } from "@share/app-error";
import { config } from "@share/component/config";
import { IFarmingRpc } from "@modules/listing/interface";
import { FarmingSnapshotDTO } from "@modules/listing/model";
import { ErrFarmingUnavailable } from "@modules/listing/model/error";

/**
 * RPC client for Farming Service.
 * BA-SOA §7: GET /api/v1/plots/{plotId}/summary?cropSeasonId={cropSeasonId}
 *
 * Trading calls Farming directly with service key (not through Gateway).
 * Timeout: ACCESS_STATE_TIMEOUT_MS (1s) — fail closed → 503 DEPENDENCY_UNAVAILABLE.
 */
export class FarmingRpcClient implements IFarmingRpc {
  private readonly baseUrl: string;
  private readonly serviceKey: string;
  private readonly timeoutMs: number;

  constructor() {
    this.baseUrl = config.services.farmingUrl;
    this.serviceKey = config.serviceKeys.tradingToFarming;
    this.timeoutMs = config.accessStateTimeoutMs;
  }

  async getPlotSummary(plotId: string, cropSeasonId: string): Promise<FarmingSnapshotDTO> {
    try {
      const { data } = await axios.get<FarmingSnapshotDTO>(
        `${this.baseUrl}/api/v1/plots/${plotId}/summary`,
        {
          params: { cropSeasonId },
          headers: {
            'X-Service-Key': this.serviceKey,
          },
          timeout: this.timeoutMs,
        },
      );

      return data;
    } catch (error: any) {
      // Specific HTTP errors from Farming
      if (error.response) {
        const status = error.response.status;
        if (status === 404) {
          throw AppError.from(new Error('Plot or crop season not found in Farming'), 404)
            .withCode('NOT_FOUND');
        }
        if (status === 409) {
          // SNAPSHOT_INCOMPLETE from Farming itself
          throw AppError.from(new Error('Crop snapshot is incomplete'), 409)
            .withCode('SNAPSHOT_INCOMPLETE');
        }
      }

      // Network / timeout / unknown errors → dependency unavailable
      throw AppError.from(ErrFarmingUnavailable, 503)
        .withCode('DEPENDENCY_UNAVAILABLE')
        .withLog(`Farming RPC failed: ${error.message}`);
    }
  }
}
