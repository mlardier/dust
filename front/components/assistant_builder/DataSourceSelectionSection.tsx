import {
  Button,
  CloudArrowDownIcon,
  Cog6ToothIcon,
  DropdownMenu,
  Icon,
  PlusIcon,
  TrashIcon,
} from "@dust-tt/sparkle";
import { Transition } from "@headlessui/react";
import { PropsOf } from "@headlessui/react/dist/types";
import { ComponentType } from "react";

import {
  CONNECTOR_PROVIDER_TO_RESOURCE_NAME,
  TIME_FRAME_MODE_TO_LABEL,
  TIME_FRAME_UNIT_TO_LABEL,
  TimeFrameMode,
} from "@app/components/assistant_builder/shared";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { classNames } from "@app/lib/utils";
import { TimeframeUnit } from "@app/types/assistant/actions/retrieval";
import { DataSourceType } from "@app/types/data_source";

export default function DataSourceSelectionSection({
  show,
  dataSourceConfigurations,
  openDataSourceModal,
  canAddDataSource,
  onManageDataSource,
  onDelete,
  timeFrameMode,
  setTimeFrameMode,
  timeFrame,
  setTimeFrame,
  timeFrameError,
}: {
  show: boolean;
  dataSourceConfigurations: Record<
    string,
    { dataSource: DataSourceType; selectedResources: Record<string, string> }
  >;
  openDataSourceModal: () => void;
  canAddDataSource: boolean;
  onManageDataSource: (name: string) => void;
  onDelete?: (name: string) => void;
  timeFrameMode: TimeFrameMode;
  setTimeFrameMode: (timeFrameMode: TimeFrameMode) => void;
  timeFrame: { value: number; unit: TimeframeUnit };
  setTimeFrame: (timeframe: { value: number; unit: TimeframeUnit }) => void;
  timeFrameError: string | null;
}) {
  return (
    <Transition
      show={show}
      enterFrom="opacity-0"
      enterTo="opacity-100"
      leave="transition-all duration-300"
      enter="transition-all duration-300"
      leaveFrom="opacity-100"
      leaveTo="opacity-0"
      className="overflow-hidden pt-6"
      afterEnter={() => {
        window.scrollBy({
          left: 0,
          top: 140,
          behavior: "smooth",
        });
      }}
    >
      <div>
        <div className="flex flex-row items-start">
          <div className="text-base font-semibold">Select the data sources</div>
          <div className="flex-grow" />
          {Object.keys(dataSourceConfigurations).length > 0 && (
            <Button
              labelVisible={true}
              label="Add a data source"
              variant="primary"
              size="sm"
              icon={PlusIcon}
              onClick={openDataSourceModal}
              disabled={!canAddDataSource}
            />
          )}
        </div>
        {!Object.keys(dataSourceConfigurations).length ? (
          <div
            className={classNames(
              "flex h-full min-h-48 items-center justify-center rounded-lg bg-structure-50"
            )}
          >
            <Button
              labelVisible={true}
              label="Add a data source"
              variant="primary"
              size="md"
              icon={PlusIcon}
              onClick={openDataSourceModal}
              disabled={!canAddDataSource}
            />
          </div>
        ) : (
          <ul className="mt-6">
            {Object.entries(dataSourceConfigurations).map(
              ([key, { dataSource, selectedResources }]) => {
                const selectedParentIds = Object.keys(selectedResources);
                return (
                  <li key={key} className="px-2 py-4">
                    <SelectedDataSourcesListItem
                      IconComponent={
                        dataSource.connectorProvider
                          ? CONNECTOR_CONFIGURATIONS[
                              dataSource.connectorProvider
                            ].logoComponent
                          : CloudArrowDownIcon
                      }
                      name={
                        dataSource.connectorProvider
                          ? CONNECTOR_CONFIGURATIONS[
                              dataSource.connectorProvider
                            ].name
                          : dataSource.name
                      }
                      description={
                        dataSource.connectorProvider
                          ? `Assistant has access to ${
                              selectedParentIds.length
                            } ${
                              selectedParentIds.length === 1
                                ? CONNECTOR_PROVIDER_TO_RESOURCE_NAME[
                                    dataSource.connectorProvider
                                  ].singular
                                : CONNECTOR_PROVIDER_TO_RESOURCE_NAME[
                                    dataSource.connectorProvider
                                  ].plural
                            }`
                          : "Assistant has access to all documents"
                      }
                      buttonProps={
                        dataSource.connectorProvider
                          ? {
                              variant: "secondary",
                              icon: Cog6ToothIcon,
                              label: "Manage",
                              onClick: () => {
                                onManageDataSource(key);
                              },
                            }
                          : {
                              variant: "secondaryWarning",
                              icon: TrashIcon,
                              label: "Remove",
                              onClick: () => onDelete?.(key),
                            }
                      }
                    />
                  </li>
                );
              }
            )}
          </ul>
        )}
      </div>
      <div className="pt-6 text-base font-semibold text-element-900">
        Timeframe for the data sources
      </div>
      <div className="text-sm font-normal text-element-900">
        Define a specific time frame if you want the Assistant to only focus on
        data from a specific time period.
        <br />
        <span className="font-bold">"Auto"</span> means the assistant will
        define itself, from the question, what the timeframe should be.
      </div>
      <div>
        <div className="flex flex-row items-center space-x-2 pt-2">
          <div className="text-sm font-semibold text-element-900">
            Timeframe:
          </div>
          <DropdownMenu>
            <DropdownMenu.Button>
              <Button
                type="select"
                labelVisible={true}
                label={TIME_FRAME_MODE_TO_LABEL[timeFrameMode]}
                variant="secondary"
                size="sm"
              />
            </DropdownMenu.Button>
            <DropdownMenu.Items origin="bottomRight">
              {Object.entries(TIME_FRAME_MODE_TO_LABEL).map(([key, value]) => (
                <DropdownMenu.Item
                  key={key}
                  label={value}
                  onClick={() => {
                    setTimeFrameMode(key as TimeFrameMode);
                  }}
                />
              ))}
            </DropdownMenu.Items>
          </DropdownMenu>
        </div>
        <div className="mt-4">
          <Transition
            show={timeFrameMode === "FORCED"}
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-all duration-300"
            enter="transition-all duration-300"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
            className=""
            afterEnter={() => {
              window.scrollBy({
                left: 0,
                top: 70,
                behavior: "smooth",
              });
            }}
          >
            <div className={"flex flex-row items-center gap-4"}>
              <div className="font-normal text-element-900">
                Focus on the last
              </div>
              <input
                type="text"
                className={classNames(
                  "text-smborder-gray-300 h-8 w-16 rounded-md text-center",
                  !timeFrameError
                    ? "focus:border-action-500 focus:ring-action-500"
                    : "border-red-500 focus:border-red-500 focus:ring-red-500",
                  "bg-structure-50 stroke-structure-50"
                )}
                value={timeFrame.value || ""}
                onChange={(e) => {
                  const value = parseInt(e.target.value, 10);
                  if (!isNaN(value) || !e.target.value) {
                    setTimeFrame({
                      value,
                      unit: timeFrame.unit,
                    });
                  }
                }}
              />
              <DropdownMenu>
                <DropdownMenu.Button tooltipPosition="above">
                  <Button
                    type="select"
                    labelVisible={true}
                    label={TIME_FRAME_UNIT_TO_LABEL[timeFrame.unit]}
                    variant="secondary"
                    size="sm"
                  />
                </DropdownMenu.Button>
                <DropdownMenu.Items origin="bottomLeft">
                  {Object.entries(TIME_FRAME_UNIT_TO_LABEL).map(
                    ([key, value]) => (
                      <DropdownMenu.Item
                        key={key}
                        label={value}
                        onClick={() => {
                          setTimeFrame({
                            value: timeFrame.value,
                            unit: key as TimeframeUnit,
                          });
                        }}
                      />
                    )
                  )}
                </DropdownMenu.Items>
              </DropdownMenu>
            </div>
          </Transition>
        </div>
      </div>
    </Transition>
  );
}

function SelectedDataSourcesListItem({
  IconComponent,
  name,
  description,
  buttonProps,
}: {
  IconComponent: ComponentType<{ className?: string }>;
  name: string;
  description: string;
  buttonProps: PropsOf<typeof Button>;
}) {
  return (
    <div className="flex items-start">
      <div className="min-w-5 flex">
        <div className="mr-2 flex h-5 w-5 flex-initial sm:mr-4">
          <Icon visual={IconComponent} className="text-slate-400" />
        </div>
        <div className="flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center">
            <span className={classNames("text-sm font-bold text-element-900")}>
              {name}
            </span>
          </div>
          <div className="mt-2 text-sm text-element-700">{description}</div>
        </div>
      </div>
      <div className="flex flex-1" />
      <div>
        <Button {...buttonProps} />
      </div>
    </div>
  );
}
