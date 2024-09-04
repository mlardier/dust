import type { AppType, LightWorkspaceType, RunRunType } from "@dust-tt/types";
import { useMemo } from "react";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetAppsResponseBody } from "@app/pages/api/w/[wId]/apps";
import type { GetRunsResponseBody } from "@app/pages/api/w/[wId]/apps/[aId]/runs";
import type { GetRunBlockResponseBody } from "@app/pages/api/w/[wId]/apps/[aId]/runs/[runId]/blocks/[type]/[name]";
import type { GetRunStatusResponseBody } from "@app/pages/api/w/[wId]/apps/[aId]/runs/[runId]/status";
import type { GetDustAppSecretsResponseBody } from "@app/pages/api/w/[wId]/dust_app_secrets";
import type { GetKeysResponseBody } from "@app/pages/api/w/[wId]/keys";
import type { GetProvidersResponseBody } from "@app/pages/api/w/[wId]/providers";

export function useApp({
  workspaceId,
  appId,
}: {
  workspaceId: string;
  appId: string;
}) {
  const appFetcher: Fetcher<{ app: AppType }> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/apps/${appId}`,
    appFetcher
  );

  return {
    app: data ? data.app : null,
    isAppLoading: !error && !data,
    isAppError: error,
    mutateApp: mutate,
  };
}

export function useApps(owner: LightWorkspaceType) {
  const appsFetcher: Fetcher<GetAppsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/apps`,
    appsFetcher
  );

  return {
    apps: useMemo(() => (data ? data.apps : []), [data]),
    isAppsLoading: !error && !data,
    isAppsError: !!error,
    mutateApps: mutate,
  };
}

export function useSavedRunStatus(
  owner: LightWorkspaceType,
  app: AppType,
  refresh: (data: GetRunStatusResponseBody | undefined) => number
) {
  const runStatusFetcher: Fetcher<GetRunStatusResponseBody> = fetcher;
  const { data, error } = useSWRWithDefaults(
    `/api/w/${owner.sId}/apps/${app.sId}/runs/saved/status`,
    runStatusFetcher,
    {
      refreshInterval: refresh,
    }
  );

  return {
    run: data ? data.run : null,
    isRunLoading: !error && !data,
    isRunError: error,
  };
}

export function useRunBlock(
  owner: LightWorkspaceType,
  app: AppType,
  runId: string,
  type: string,
  name: string,
  refresh: (data: GetRunBlockResponseBody | undefined) => number
) {
  const runBlockFetcher: Fetcher<GetRunBlockResponseBody> = fetcher;
  const { data, error } = useSWRWithDefaults(
    `/api/w/${owner.sId}/apps/${app.sId}/runs/${runId}/blocks/${type}/${name}`,
    runBlockFetcher,
    {
      refreshInterval: refresh,
    }
  );

  return {
    run: data ? data.run : null,
    isRunLoading: !error && !data,
    isRunError: error,
  };
}

export function useDustAppSecrets(owner: LightWorkspaceType) {
  const keysFetcher: Fetcher<GetDustAppSecretsResponseBody> = fetcher;
  const { data, error } = useSWRWithDefaults(
    `/api/w/${owner.sId}/dust_app_secrets`,
    keysFetcher
  );

  return {
    secrets: useMemo(() => (data ? data.secrets : []), [data]),
    isSecretsLoading: !error && !data,
    isSecretsError: error,
  };
}

export function useRuns(
  owner: LightWorkspaceType,
  app: AppType,
  limit: number,
  offset: number,
  runType: RunRunType,
  wIdTarget: string | null
) {
  const runsFetcher: Fetcher<GetRunsResponseBody> = fetcher;
  let url = `/api/w/${owner.sId}/apps/${app.sId}/runs?limit=${limit}&offset=${offset}&runType=${runType}`;
  if (wIdTarget) {
    url += `&wIdTarget=${wIdTarget}`;
  }
  const { data, error } = useSWRWithDefaults(url, runsFetcher);

  return {
    runs: useMemo(() => (data ? data.runs : []), [data]),
    total: data ? data.total : 0,
    isRunsLoading: !error && !data,
    isRunsError: error,
  };
}

export function useProviders({
  owner,
  disabled = false,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const providersFetcher: Fetcher<GetProvidersResponseBody> = fetcher;

  const { data, error } = useSWRWithDefaults(
    disabled ? null : `/api/w/${owner.sId}/providers`,
    providersFetcher
  );

  return {
    providers: useMemo(() => (data ? data.providers : []), [data]),
    isProvidersLoading: !error && !data,
    isProvidersError: error,
  };
}
export function useKeys(owner: LightWorkspaceType) {
  const keysFetcher: Fetcher<GetKeysResponseBody> = fetcher;
  const { data, error } = useSWRWithDefaults(
    `/api/w/${owner.sId}/keys`,
    keysFetcher
  );

  return {
    keys: useMemo(() => (data ? data.keys : []), [data]),
    isKeysLoading: !error && !data,
    isKeysError: error,
  };
}