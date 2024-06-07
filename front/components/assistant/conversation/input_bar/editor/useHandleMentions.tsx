import type { AgentMention, LightAgentConfigurationType } from "@dust-tt/types";
import { useEffect, useRef } from "react";

import type {
  EditorMention,
  EditorService,
} from "@app/components/assistant/conversation/input_bar/editor/useCustomEditor";

const useHandleMentions = (
  editorService: EditorService,
  agentConfigurations: LightAgentConfigurationType[],
  stickyMentions: AgentMention[] | undefined,
  selectedAssistant: AgentMention | null,
  disableAutoFocus: boolean
) => {
  const stickyMentionsTextContent = useRef<string | null>(null);

  useEffect(() => {
    if (!stickyMentions || stickyMentions.length === 0) {
      return;
    }

    const editorIsEmpty = editorService.isEmpty();
    const onlyContainsPreviousStickyMention =
      !editorIsEmpty &&
      editorService.getTrimmedText() === stickyMentionsTextContent.current;

    // Insert sticky mentions under two conditions:
    // 1. The editor is currently empty.
    // 2. The editor contains only the sticky mention from a previously selected assistant.
    // This ensures that sticky mentions are maintained but not duplicated.
    if (editorIsEmpty || onlyContainsPreviousStickyMention) {
      const mentionsToInsert: EditorMention[] = [];

      for (const configurationId of stickyMentions.map(
        (mention) => mention.configurationId
      )) {
        const agentConfiguration = agentConfigurations.find(
          (agent) => agent.sId === configurationId
        );
        if (agentConfiguration) {
          mentionsToInsert.push({
            id: agentConfiguration.sId,
            label: agentConfiguration.name,
          });
        }
      }

      if (mentionsToInsert.length !== 0) {
        editorService.resetWithMentions(mentionsToInsert, disableAutoFocus);
        stickyMentionsTextContent.current =
          editorService.getTrimmedText() ?? null;
      }
    }
  }, [agentConfigurations, editorService, stickyMentions, disableAutoFocus]);

  useEffect(() => {
    if (selectedAssistant) {
      const agentConfiguration = agentConfigurations.find(
        (agent) => agent.sId === selectedAssistant.configurationId
      );

      if (!agentConfiguration) {
        return;
      }

      const { mentions: currentMentions } = editorService.getTextAndMentions();
      const hasMention = currentMentions.some(
        (mention) => mention.id === agentConfiguration.sId
      );

      if (hasMention) {
        return;
      }

      editorService.insertMention({
        id: agentConfiguration.sId,
        label: agentConfiguration.name,
      });
    }
  }, [selectedAssistant, editorService, disableAutoFocus, agentConfigurations]);
};

export default useHandleMentions;
