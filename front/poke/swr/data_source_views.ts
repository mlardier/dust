import type {
  ContentNodesViewType,
  DataSourceViewType,
  LightWorkspaceType,
} from "@dust-tt/types";
import { useMemo } from "react";
import type { Fetcher } from "swr";

import {
  appendPaginationParams,
  fetcher,
  postFetcher,
  useSWRInfiniteWithDefaults,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { PokeListDataSourceViews } from "@app/pages/api/poke/workspaces/[wId]/data_source_views";
import type { PokeGetDataSourceViewContentNodes } from "@app/pages/api/poke/workspaces/[wId]/vaults/[vId]/data_source_views/[dsvId]/content-nodes";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";

export function usePokeDataSourceViews({
  disabled,
  owner,
}: PokeConditionalFetchProps) {
  const dataSourceViewsFetcher: Fetcher<PokeListDataSourceViews> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/data_source_views`,
    dataSourceViewsFetcher,
    { disabled }
  );

  return {
    data: useMemo(() => (data ? data.data_source_views : []), [data]),
    isLoading: !error && !data,
    isError: error,
    mutateDocuments: mutate,
  };
}

interface DataSourceViewContentNodesWithInfiniteScrollProps {
  dataSourceView?: DataSourceViewType;
  internalIds?: string[];
  owner: LightWorkspaceType;
  pageSize?: number;
  parentId?: string;
  viewType?: ContentNodesViewType;
}

export function usePokeDataSourceViewContentNodesWithInfiniteScroll({
  owner,
  dataSourceView,
  internalIds,
  parentId,
  pageSize = 50,
  viewType,
}: DataSourceViewContentNodesWithInfiniteScrollProps): {
  isNodesError: boolean;
  isNodesLoading: boolean;
  isNodesValidating: boolean;
  nodes: PokeGetDataSourceViewContentNodes["nodes"];
  totalNodesCount: number;
  hasMore: boolean;
  nextPage: () => Promise<void>;
} {
  const url =
    dataSourceView && viewType
      ? `/api/poke/workspaces/${owner.sId}/vaults/${dataSourceView.vaultId}/data_source_views/${dataSourceView.sId}/content-nodes`
      : null;

  const body = {
    internalIds,
    parentId,
    viewType,
  };

  const fetcher: Fetcher<PokeGetDataSourceViewContentNodes, [string, object]> =
    postFetcher;

  const { data, error, setSize, size, isValidating } =
    useSWRInfiniteWithDefaults(
      (index) => {
        if (!url) {
          // No URL, return an empty array to skip the fetch
          return null;
        }

        // Append the pagination params to the URL
        const params = new URLSearchParams();
        appendPaginationParams(params, {
          pageIndex: index,
          pageSize,
        });

        return JSON.stringify([url + "?" + params.toString(), body]);
      },
      async (fetchKey) => {
        if (!fetchKey) {
          return undefined;
        }

        // Get the URL and body from the fetchKey
        const params = JSON.parse(fetchKey);

        return fetcher(params);
      },
      {
        revalidateFirstPage: false,
      }
    );

  return {
    isNodesError: !!error,
    isNodesLoading: !error && !data,
    isNodesValidating: isValidating,
    nodes: useMemo(
      () => (data ? data.flatMap((d) => (d ? d.nodes : [])) : []),
      [data]
    ),
    totalNodesCount: data?.[0] ? data[0].total : 0,
    hasMore: size * pageSize < (data?.[0] ? data[0].total : 0),
    nextPage: async () => {
      await setSize((size) => size + 1);
    },
  };
}
