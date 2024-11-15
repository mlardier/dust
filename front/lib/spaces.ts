import { LockIcon, PlanetIcon, ServerIcon } from "@dust-tt/sparkle";
import type { PlanType, SpaceType, WorkspaceType } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import { groupBy } from "lodash";
import type React from "react";

const SPACE_SECTION_GROUP_ORDER = [
  "system",
  "shared",
  "restricted",
  "public",
] as const;

export type SpaceSectionGroupType = (typeof SPACE_SECTION_GROUP_ORDER)[number];

export function getSpaceIcon(
  space: SpaceType
): (props: React.SVGProps<SVGSVGElement>) => React.ReactElement {
  if (space.kind === "public") {
    return PlanetIcon;
  }

  if (space.isRestricted) {
    return LockIcon;
  }

  return ServerIcon;
}

export const getSpaceName = (space: SpaceType) => {
  return space.kind === "global" ? "Company Data" : space.name;
};

export const dustAppsListUrl = (
  owner: WorkspaceType,
  space: SpaceType
): string => {
  return `/w/${owner.sId}/spaces/${space.sId}/categories/apps`;
};

export const groupSpacesForDisplay = (spaces: SpaceType[]) => {
  // Conversations space should never be displayed
  const spacesWithoutConversations = spaces.filter(
    (space) => space.kind !== "conversations"
  );
  // Group by kind and sort.
  const groupedSpaces = groupBy(
    spacesWithoutConversations,
    (space): SpaceSectionGroupType => {
      // please ts
      if (space.kind === "conversations") {
        throw new Error("Conversations space should never be displayed");
      }

      switch (space.kind) {
        case "public":
        case "system":
          return space.kind;

        case "global":
        case "regular":
          return space.isRestricted ? "restricted" : "shared";

        default:
          assertNever(space.kind);
      }
    }
  );

  return SPACE_SECTION_GROUP_ORDER.map((section) => ({
    section,
    spaces: groupedSpaces[section] || [],
  }));
};

export const isPrivateSpacesLimitReached = (
  spaces: SpaceType[],
  plan: PlanType
) =>
  plan.limits.vaults.maxVaults !== -1 &&
  spaces.filter((s) => s.kind === "regular" || s.kind === "public").length >=
    plan.limits.vaults.maxVaults;
