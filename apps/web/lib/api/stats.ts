import { runApi } from "../api-client";

export const getStatsOverview = (query: { days?: number; timezone?: string }) =>
  runApi((client) => client.stats.getStatsOverview({ query }));
