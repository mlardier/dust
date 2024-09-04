import {
  Button,
  DropdownMenu,
  Modal,
  PlusIcon,
  TextArea,
} from "@dust-tt/sparkle";
import type { DataSourceType, LightWorkspaceType } from "@dust-tt/types";
import { useContext, useEffect, useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import {
  getConnectorProviderLogoWithFallback,
  getDataSourceName,
} from "@app/lib/connector_providers";
import { isManaged } from "@app/lib/data_sources";
import { sendRequestDataSourceEmail } from "@app/lib/email";
import logger from "@app/logger/logger";

interface RequestDataSourceModal {
  dataSources: DataSourceType[];
  owner: LightWorkspaceType;
}

export function RequestDataSourceModal({
  dataSources,
  owner,
}: RequestDataSourceModal) {
  const [showRequestDataSourceModal, setShowRequestDataSourceModal] =
    useState(false);

  const [selectedDataSource, setSelectedDataSource] =
    useState<DataSourceType | null>(null);

  const [message, setMessage] = useState("");
  const sendNotification = useContext(SendNotificationsContext);

  useEffect(() => {
    if (dataSources.length === 1) {
      setSelectedDataSource(dataSources[0]);
    }
  }, [dataSources]);

  const onClose = () => {
    setShowRequestDataSourceModal(false);
    setMessage("");
    if (dataSources.length === 1) {
      setSelectedDataSource(dataSources[0]);
    }
  };

  return (
    <>
      <Button
        label="Request"
        icon={PlusIcon}
        onClick={() => setShowRequestDataSourceModal(true)}
      />

      <Modal
        isOpen={showRequestDataSourceModal}
        onClose={onClose}
        hasChanged={false}
        variant="side-md"
        title="Requesting Data sources"
      >
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-center gap-2">
            {dataSources.length === 0 && (
              <label className="block text-sm font-medium text-element-800">
                <p>
                  You have no connection set up. Ask an admin to set one up.
                </p>
              </label>
            )}
            {dataSources.length > 1 && (
              <>
                <label className="block text-sm font-medium text-element-800">
                  <p>Where are the requested Data hosted?</p>
                </label>
                <DropdownMenu>
                  <DropdownMenu.Button>
                    {selectedDataSource && isManaged(selectedDataSource) ? (
                      <Button
                        variant="tertiary"
                        label={getDataSourceName(selectedDataSource)}
                        icon={getConnectorProviderLogoWithFallback(
                          selectedDataSource.connectorProvider
                        )}
                      />
                    ) : (
                      <Button
                        label="Pick your platform"
                        variant="tertiary"
                        size="sm"
                        type="select"
                      />
                    )}
                  </DropdownMenu.Button>
                  <DropdownMenu.Items width={180}>
                    {dataSources.map(
                      (dataSource) =>
                        dataSource.connectorProvider && (
                          <DropdownMenu.Item
                            key={dataSource.name}
                            label={getDataSourceName(dataSource)}
                            onClick={() => setSelectedDataSource(dataSource)}
                            icon={getConnectorProviderLogoWithFallback(
                              dataSource.connectorProvider
                            )}
                          />
                        )
                    )}
                  </DropdownMenu.Items>
                </DropdownMenu>
              </>
            )}
          </div>

          {selectedDataSource && (
            <div>
              <p className="s-mb-2 s-text-sm s-text-element-700">
                The administrator for {getDataSourceName(selectedDataSource)} is{" "}
                {selectedDataSource.editedByUser?.fullName}. Send an email to{" "}
                {selectedDataSource.editedByUser?.fullName}, explaining your
                request.
              </p>
              <TextArea
                placeholder={`Hello ${selectedDataSource.editedByUser?.fullName},`}
                value={message}
                onChange={setMessage}
                className="s-mb-2"
              />
              <Button
                label="Send"
                variant="primary"
                size="sm"
                onClick={async () => {
                  const userToId = selectedDataSource?.editedByUser?.userId;
                  if (!userToId || !selectedDataSource) {
                    sendNotification({
                      type: "error",
                      title: "Error sending email",
                      description:
                        "An unexpected error occurred while sending email.",
                    });
                  } else {
                    try {
                      await sendRequestDataSourceEmail({
                        userTo: userToId,
                        emailMessage: message,
                        dataSourceName: selectedDataSource.name,
                        owner,
                      });
                      sendNotification({
                        type: "success",
                        title: "Email sent!",
                        description: `Your request was sent to ${selectedDataSource?.editedByUser?.fullName}.`,
                      });
                    } catch (e) {
                      sendNotification({
                        type: "error",
                        title: "Error sending email",
                        description:
                          "An unexpected error occurred while sending the request.",
                      });
                      logger.error(
                        {
                          userToId,
                          dataSourceName: selectedDataSource.name,
                          error: e,
                        },
                        "Error sending email"
                      );
                    }
                    onClose();
                  }
                }}
              />
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}