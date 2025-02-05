import { Button, cn, RainbowEffect, StopIcon } from "@dust-tt/sparkle";
import type { AgentMention, MentionType, Result } from "@dust-tt/types";
import type { UploadedContentFragment } from "@dust-tt/types";
import type {
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import { compareAgentsForSort } from "@dust-tt/types";
import { useContext, useEffect, useMemo, useRef, useState } from "react";

import { useFileDrop } from "@app/components/assistant/conversation/FileUploaderContext";
import { GenerationContext } from "@app/components/assistant/conversation/GenerationContextProvider";
import { InputBarCitations } from "@app/components/assistant/conversation/input_bar/InputBarCitations";
import type { InputBarContainerProps } from "@app/components/assistant/conversation/input_bar/InputBarContainer";
import InputBarContainer, {
  INPUT_BAR_ACTIONS,
} from "@app/components/assistant/conversation/input_bar/InputBarContainer";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import type { DustError } from "@app/lib/error";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { useConversation } from "@app/lib/swr/conversations";
import { classNames } from "@app/lib/utils";

const DEFAULT_INPUT_BAR_ACTIONS = [...INPUT_BAR_ACTIONS];

/**
 *
 * @param additionalAgentConfiguration when trying an assistant in a modal or drawer we
 * need to pass the agent configuration to the input bar (it may not be in the
 * user's list of assistants)
 */
export function AssistantInputBar({
  owner,
  onSubmit,
  conversationId,
  stickyMentions,
  additionalAgentConfiguration,
  actions = DEFAULT_INPUT_BAR_ACTIONS,
  disableAutoFocus = false,
  isFloating = true,
}: {
  owner: WorkspaceType;
  onSubmit: (
    input: string,
    mentions: MentionType[],
    contentFragments: UploadedContentFragment[]
  ) => Promise<Result<undefined, DustError>>;
  conversationId: string | null;
  stickyMentions?: AgentMention[];
  additionalAgentConfiguration?: LightAgentConfigurationType;
  actions?: InputBarContainerProps["actions"];
  disableAutoFocus: boolean;
  isFloating?: boolean;
  isFloatingWithoutMargin?: boolean;
}) {
  const [disableSendButton, setDisableSendButton] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const rainbowEffectRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = rainbowEffectRef.current;
    if (!container) {
      return;
    }

    const onFocusIn = () => setIsFocused(true);
    const onFocusOut = () => setIsFocused(false);

    container.addEventListener("focusin", onFocusIn);
    container.addEventListener("focusout", onFocusOut);

    return () => {
      container.removeEventListener("focusin", onFocusIn);
      container.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  const { mutateConversation } = useConversation({
    conversationId,
    workspaceId: owner.sId,
    options: { disabled: true }, // We just want to get the mutation function
  });

  const { agentConfigurations: baseAgentConfigurations } =
    useAgentConfigurations({
      workspaceId: owner.sId,
      agentsGetView: "list",
    });

  // Files upload.

  const fileUploaderService = useFileUploaderService({
    owner,
    useCase: "conversation",
    useCaseMetadata: conversationId ? { conversationId } : undefined,
  });

  const { droppedFiles, setDroppedFiles } = useFileDrop();

  useEffect(() => {
    if (droppedFiles.length > 0) {
      // Handle the dropped files.
      void fileUploaderService.handleFilesUpload(droppedFiles);

      // Clear the dropped files after handling them.
      setDroppedFiles([]);
    }
  }, [droppedFiles, setDroppedFiles, fileUploaderService]);

  const agentConfigurations = useMemo(() => {
    if (
      baseAgentConfigurations.find(
        (a) => a.sId === additionalAgentConfiguration?.sId
      ) ||
      !additionalAgentConfiguration
    ) {
      return baseAgentConfigurations;
    }
    return [...baseAgentConfigurations, additionalAgentConfiguration];
  }, [baseAgentConfigurations, additionalAgentConfiguration]);

  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const { animate, selectedAssistant } = useContext(InputBarContext);
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (animate && !isAnimating) {
      setIsAnimating(true);

      // Clear any existing timeout to ensure animations do not overlap.
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }

      // Set timeout to set setIsAnimating to false after the duration.
      animationTimeoutRef.current = setTimeout(() => {
        setIsAnimating(false);
        // Reset the ref after the timeout clears.
        animationTimeoutRef.current = null;
      }, 700);
    }
  }, [animate, isAnimating]);

  // Cleanup timeout on component unmount.
  useEffect(() => {
    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
    };
  }, []);

  const activeAgents = agentConfigurations.filter((a) => a.status === "active");
  activeAgents.sort(compareAgentsForSort);

  const handleSubmit: InputBarContainerProps["onEnterKeyDown"] = async (
    isEmpty,
    textAndMentions,
    resetEditorText,
    setLoading
  ) => {
    if (isEmpty || fileUploaderService.isProcessingFiles) {
      return;
    }

    const { mentions: rawMentions, text } = textAndMentions;
    const mentions: MentionType[] = [
      ...new Set(rawMentions.map((mention) => mention.id)),
    ].map((id) => ({ configurationId: id }));

    // When we are creating a new conversation, we will disable the input bar, show a loading spinner and in case of error, re-enable the input bar
    if (!conversationId) {
      setLoading(true);
      setDisableSendButton(true);

      const r = await onSubmit(
        text,
        mentions,
        fileUploaderService.getFileBlobs().map((cf) => {
          return {
            title: cf.filename,
            fileId: cf.fileId,
          };
        })
      );

      setLoading(false);
      setDisableSendButton(false);
      if (r.isOk()) {
        resetEditorText();
        fileUploaderService.resetUpload();
      }
    } else {
      void onSubmit(
        text,
        mentions,
        fileUploaderService.getFileBlobs().map((cf) => {
          return {
            title: cf.filename,
            fileId: cf.fileId,
          };
        })
      );

      resetEditorText();
      fileUploaderService.resetUpload();
    }
  };

  const [isStopping, setIsStopping] = useState<boolean>(false);

  // GenerationContext: to know if we are generating or not
  const generationContext = useContext(GenerationContext);
  if (!generationContext) {
    throw new Error(
      "FixedAssistantInputBar must be used within a GenerationContextProvider"
    );
  }

  const handleStopGeneration = async () => {
    if (!conversationId) {
      return;
    }
    setIsStopping(true); // we don't set it back to false immediately cause it takes a bit of time to cancel
    await fetch(
      `/api/w/${owner.sId}/assistant/conversations/${conversationId}/cancel`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "cancel",
          messageIds: generationContext.generatingMessages
            .filter((m) => m.conversationId === conversationId)
            .map((m) => m.messageId),
        }),
      }
    );
    await mutateConversation();
  };

  useEffect(() => {
    if (
      isStopping &&
      !generationContext.generatingMessages.some(
        (m) => m.conversationId === conversationId
      )
    ) {
      setIsStopping(false);
    }
  }, [isStopping, generationContext.generatingMessages, conversationId]);

  return (
    <div className={cn("flex w-full flex-col", isFloating && "sm:px-3")}>
      {generationContext.generatingMessages.some(
        (m) => m.conversationId === conversationId
      ) && (
        <div className="flex justify-center px-4 pb-4">
          <Button
            className="mt-4"
            variant="outline"
            label={isStopping ? "Stopping generation..." : "Stop generation"}
            icon={StopIcon}
            onClick={handleStopGeneration}
            disabled={isStopping}
          />
        </div>
      )}

      <div ref={rainbowEffectRef} className="flex w-full flex-col">
        <RainbowEffect
          className="w-full"
          containerClassName="w-full"
          size={isFocused ? "large" : "medium"}
          disabled={!isFloating}
        >
          <div
            className={classNames(
              "relative flex w-full flex-1 flex-col items-stretch gap-0 self-stretch pl-2 sm:flex-row sm:pl-5",
              "bg-primary-50",
              "transition-all",
              isFloating
                ? "rounded-3xl border border-border-dark focus-within:ring-1 focus-within:ring-highlight-300 sm:border-border-dark/50 sm:focus-within:border-border-dark sm:focus-within:ring-2 sm:focus-within:ring-offset-2"
                : "border-t",
              isAnimating ? "duration-600 animate-shake" : "duration-300"
            )}
          >
            <div className="relative flex w-full flex-1 flex-col">
              <InputBarCitations fileUploaderService={fileUploaderService} />
              <InputBarContainer
                actions={actions}
                disableAutoFocus={disableAutoFocus}
                allAssistants={activeAgents}
                agentConfigurations={agentConfigurations}
                owner={owner}
                selectedAssistant={selectedAssistant}
                onEnterKeyDown={handleSubmit}
                stickyMentions={stickyMentions}
                fileUploaderService={fileUploaderService}
                disableSendButton={
                  disableSendButton || fileUploaderService.isProcessingFiles
                }
              />
            </div>
          </div>
        </RainbowEffect>
      </div>
    </div>
  );
}

export function FixedAssistantInputBar({
  owner,
  onSubmit,
  stickyMentions,
  conversationId,
  additionalAgentConfiguration,
  actions = DEFAULT_INPUT_BAR_ACTIONS,
  disableAutoFocus = false,
}: {
  owner: WorkspaceType;
  onSubmit: (
    input: string,
    mentions: MentionType[],
    contentFragments: UploadedContentFragment[]
  ) => Promise<Result<undefined, DustError>>;
  stickyMentions?: AgentMention[];
  conversationId: string | null;
  additionalAgentConfiguration?: LightAgentConfigurationType;
  actions?: InputBarContainerProps["actions"];
  disableAutoFocus?: boolean;
}) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-20 flex max-h-screen w-full",
        "pb-2",
        "sm:w-full sm:max-w-4xl sm:pb-8"
      )}
    >
      <AssistantInputBar
        owner={owner}
        onSubmit={onSubmit}
        conversationId={conversationId}
        stickyMentions={stickyMentions}
        additionalAgentConfiguration={additionalAgentConfiguration}
        actions={actions}
        disableAutoFocus={disableAutoFocus}
      />
    </div>
  );
}
