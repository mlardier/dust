import { supportedPlainTextExtensions } from "@dust-tt/client";
import {
  Button,
  DocumentPlusIcon,
  EyeIcon,
  EyeSlashIcon,
  Input,
  Modal,
  Page,
  PlusIcon,
  Spinner,
  TextArea,
  TrashIcon,
  useSendNotification,
} from "@dust-tt/sparkle";
import type {
  CoreAPIDocument,
  CoreAPILightDocument,
  DataSourceViewType,
  LightContentNode,
  PlanType,
  WorkspaceType,
} from "@dust-tt/types";
import { Err } from "@dust-tt/types";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import {
  useCreateDataSourceViewDocument,
  useDataSourceViewDocument,
  useUpdateDataSourceViewDocument,
} from "@app/lib/swr/data_source_view_documents";
import { useFileProcessedContent } from "@app/lib/swr/file";

const MAX_NAME_CHARS = 32;

function isCoreAPIDocumentType(
  doc: CoreAPIDocument | CoreAPILightDocument
): doc is CoreAPIDocument {
  return (
    "data_source_id" in doc &&
    "document_id" in doc &&
    "timestamp" in doc &&
    "tags" in doc &&
    "chunks" in doc
  );
}

interface Document {
  name: string;
  text: string;
  tags: string[];
  sourceUrl: string;
}
export interface DocumentUploadOrEditModalProps {
  contentNode?: LightContentNode;
  dataSourceView: DataSourceViewType;
  isOpen: boolean;
  onClose: (save: boolean) => void;
  owner: WorkspaceType;
  plan: PlanType;
  totalNodesCount: number;
  initialId?: string;
}

export const DocumentUploadOrEditModal = ({
  dataSourceView,
  isOpen,
  onClose,
  owner,
  plan,
  initialId,
}: DocumentUploadOrEditModalProps) => {
  const sendNotification = useSendNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documentState, setDocumentState] = useState<Document>({
    name: "",
    text: "",
    tags: [],
    sourceUrl: "",
  });
  const fileUploaderService = useFileUploaderService({
    owner,
    useCase: "folder_document",
  });

  const [editionStatus, setEditionStatus] = useState({
    name: false,
    content: false,
  });

  const [isValidDocument, setIsValidDocument] = useState(false);
  const [developerOptionsVisible, setDeveloperOptionsVisible] = useState(false);

  const { document, isDocumentError, isDocumentLoading } =
    useDataSourceViewDocument({
      owner: owner,
      dataSourceView: dataSourceView,
      documentId: initialId ?? null,
      disabled: !initialId,
    });

  // Get the processed file content from the file API
  const [fileId, setFileId] = useState<string | null>(null);
  const { isContentLoading } = useFileProcessedContent(owner, fileId ?? null, {
    disabled: !fileId,
    onSuccess: async (response) => {
      const content = await response.text();
      setDocumentState((prev) => ({
        ...prev,
        text: content ?? "",
      }));
    },
    onError: (error) => {
      fileUploaderService.resetUpload();
      sendNotification({
        type: "error",
        title: "Error fetching document content",
        description: error instanceof Error ? error.message : String(error),
      });
    },
    shouldRetryOnError: false,
  });
  const [isUpsertingDocument, setIsUpsertingDocument] = useState(false);

  const doUpdate = useUpdateDataSourceViewDocument(
    owner,
    dataSourceView,
    initialId ?? ""
  );
  const doCreate = useCreateDataSourceViewDocument(owner, dataSourceView);

  const handleDocumentUpload = useCallback(
    async (document: Document) => {
      setIsUpsertingDocument(true);
      const body = {
        name: initialId ?? document.name,
        timestamp: null,
        parents: [initialId ?? document.name],
        section: { prefix: null, content: document.text, sections: [] },
        text: null,
        source_url: document.sourceUrl || undefined,
        tags: document.tags.filter(Boolean),
        light_document_output: true,
        upsert_context: null,
        async: false,
      };

      // These mutations do the fetch and mutate, all at once
      let upsertRes = null;
      if (initialId) {
        upsertRes = await doUpdate(body);
      } else {
        upsertRes = await doCreate(body);
      }

      // Upsert successful, close and reset the modal
      if (upsertRes) {
        onClose(true);
        setDocumentState({
          name: "",
          text: "",
          tags: [],
          sourceUrl: "",
        });
        setEditionStatus({
          content: false,
          name: false,
        });
      }

      // No matter the result, reset the file uploader
      setFileId(null);
      fileUploaderService.resetUpload();
      setIsUpsertingDocument(false);
    },

    [doUpdate, doCreate, initialId, fileUploaderService, onClose]
  );

  const handleUpload = useCallback(async () => {
    try {
      // Create Data Source Document
      await handleDocumentUpload(documentState);
      onClose(true);
    } catch (error) {
      console.error(error);
    }
  }, [handleDocumentUpload, documentState, onClose]);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      // Enforce single file upload
      const files = e.target.files;
      if (files && files.length > 1) {
        sendNotification({
          type: "error",
          title: "Multiple files",
          description: "Please upload only one file at a time.",
        });
        return;
      }

      try {
        // Create a file -> Allows to get processed text content via the file API.
        const selectedFile = files?.[0];
        if (!selectedFile) {
          return;
        }
        const fileBlobs = await fileUploaderService.handleFilesUpload([
          selectedFile,
        ]);
        if (!fileBlobs || fileBlobs.length == 0 || !fileBlobs[0].fileId) {
          fileUploaderService.resetUpload();
          return new Err(
            new Error(
              "Error uploading file. Please try again or contact support."
            )
          );
        }

        // triggers content extraction -> documentState.text update
        setFileId(fileBlobs[0].fileId);
        setDocumentState((prev) => ({
          ...prev,
          name: prev.name.length > 0 ? prev.name : selectedFile.name,
          sourceUrl:
            prev.sourceUrl.length > 0
              ? prev.sourceUrl
              : fileBlobs[0].publicUrl ?? "",
        }));
      } catch (error) {
        sendNotification({
          type: "error",
          title: "Error uploading file",
          description: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [fileUploaderService, sendNotification, setDocumentState]
  );

  // Effect: Set the document state when the document is loaded
  useEffect(() => {
    if (!initialId) {
      setDocumentState({
        name: "",
        text: "",
        tags: [],
        sourceUrl: "",
      });
    } else if (document && isCoreAPIDocumentType(document)) {
      setDocumentState((prev) => ({
        ...prev,
        name: initialId,
        text: document.text ?? "",
        tags: document.tags,
        sourceUrl: document.source_url ?? "",
      }));
    }
  }, [initialId, document]);

  // Effect: Validate the document state
  useEffect(() => {
    const isNameValid = !!documentState.name;
    const isContentValid = documentState.text.length > 0;
    setIsValidDocument(isNameValid && isContentValid);
  }, [documentState]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        fileUploaderService.resetUpload();
        onClose(false);
      }}
      hasChanged={
        !isDocumentError &&
        !isDocumentLoading &&
        !isContentLoading &&
        !fileUploaderService.isProcessingFiles &&
        isValidDocument
      }
      variant="side-md"
      title={`${initialId ? "Edit" : "Add"} document`}
      onSave={handleUpload}
      isSaving={isUpsertingDocument}
    >
      {isDocumentLoading ? (
        <div className="flex justify-center py-4">
          <Spinner variant="color" size="xs" />
        </div>
      ) : (
        <Page.Vertical align="stretch">
          {isDocumentError ? (
            <div className="space-y-4 p-4">Content cannot be loaded.</div>
          ) : (
            <div className="space-y-4 p-4">
              <div>
                <Page.SectionHeader title="Document name" />
                <Input
                  placeholder="Document title"
                  name="name"
                  maxLength={MAX_NAME_CHARS}
                  value={documentState.name}
                  disabled={!!initialId}
                  onChange={(e) => {
                    setEditionStatus((prev) => ({ ...prev, name: true }));
                    setDocumentState((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }));
                  }}
                  message={
                    !documentState.name && editionStatus.name
                      ? "You need to provide a name."
                      : null
                  }
                  messageStatus="error"
                />
              </div>

              <div>
                <Page.SectionHeader
                  title="Associated URL"
                  description="The URL of the associated document (if any). Will be used to link users to the original document in assistants citations."
                />
                <Input
                  placeholder="https://..."
                  name="sourceUrl"
                  value={documentState.sourceUrl}
                  onChange={(e) =>
                    setDocumentState((prev) => ({
                      ...prev,
                      sourceUrl: e.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <Page.SectionHeader
                  title="Text content"
                  description={`Copy paste content or upload a file (text or PDF). Up to ${
                    plan.limits.dataSources.documents.sizeMb === -1
                      ? "2"
                      : plan.limits.dataSources.documents.sizeMb
                  } MB of raw text.`}
                  action={{
                    label:
                      fileUploaderService.isProcessingFiles || isContentLoading
                        ? "Uploading..."
                        : "Upload file",
                    variant: "primary",
                    icon: DocumentPlusIcon,
                    onClick: () => fileInputRef.current?.click(),
                    isLoading:
                      fileUploaderService.isProcessingFiles || isContentLoading,
                  }}
                />
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  accept={supportedPlainTextExtensions.join(", ")}
                  onChange={handleFileChange}
                />
                <TextArea
                  minRows={10}
                  disabled={
                    isContentLoading || fileUploaderService.isProcessingFiles
                  }
                  placeholder="Your document content..."
                  value={documentState.text}
                  onChange={(e) => {
                    setEditionStatus((prev) => ({ ...prev, content: true }));
                    setDocumentState((prev) => ({
                      ...prev,
                      text: e.target.value,
                    }));
                  }}
                  error={
                    editionStatus.content && !documentState.text
                      ? "You need to upload a file or specify the content of the document."
                      : null
                  }
                  showErrorLabel
                />
              </div>

              <div>
                <Page.SectionHeader
                  title="Developer Options"
                  action={{
                    label: developerOptionsVisible ? "Hide" : "Show",
                    variant: "ghost",
                    icon: developerOptionsVisible ? EyeSlashIcon : EyeIcon,
                    onClick: () =>
                      setDeveloperOptionsVisible(!developerOptionsVisible),
                  }}
                />
                {developerOptionsVisible && (
                  <div className="pt-4">
                    <Page.SectionHeader
                      title=""
                      description="Tags can be set to filter Data Source retrieval or provide a user-friendly title for programmatically uploaded documents (`title:User-friendly Title`)."
                      action={{
                        label: "Add tag",
                        variant: "ghost",
                        icon: PlusIcon,
                        onClick: () =>
                          setDocumentState((prev) => ({
                            ...prev,
                            tags: [...prev.tags, ""],
                          })),
                      }}
                    />
                    {documentState.tags.map((tag, index) => (
                      <div key={index} className="flex flex-grow flex-row">
                        <div className="flex flex-1 flex-row gap-8">
                          <div className="flex flex-1 flex-col">
                            <Input
                              className="w-full"
                              placeholder="Tag"
                              name="tag"
                              value={tag}
                              onChange={(e) => {
                                const newTags = [...documentState.tags];
                                newTags[index] = e.target.value;
                                setDocumentState((prev) => ({
                                  ...prev,
                                  tags: newTags,
                                }));
                              }}
                            />
                          </div>
                          <div className="flex">
                            <Button
                              tooltip="Remove"
                              icon={TrashIcon}
                              variant="warning"
                              onClick={() => {
                                const newTags = [...documentState.tags];
                                newTags.splice(index, 1);
                                setDocumentState((prev) => ({
                                  ...prev,
                                  tags: newTags,
                                }));
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </Page.Vertical>
      )}
    </Modal>
  );
};
