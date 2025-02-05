import type {
  GetConversationsResponseType,
  PostConversationsResponseType,
} from "@dust-tt/client";
import { PublicPostConversationsRequestBodySchema } from "@dust-tt/client";
import type {
  ContentFragmentType,
  UserMessageType,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import { ConversationError, isEmptyString } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  createConversation,
  getConversation,
  getUserConversations,
  normalizeContentFragmentType,
  postNewContentFragment,
} from "@app/lib/api/assistant/conversation";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { postUserMessageWithPubSub } from "@app/lib/api/assistant/pubsub";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import { maybeUpsertFileAttachment } from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/conversations:
 *   post:
 *     summary: Create a new conversation
 *     description: Create a new conversation in the workspace identified by {wId}.
 *     tags:
 *       - Conversations
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 $ref: '#/components/schemas/Message'
 *               contentFragments:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/ContentFragment'
 *                 description: The list of content fragments to attach to this conversation (optional)
 *               blocking:
 *                 type: boolean
 *                 description: Whether to wait for the agent to generate the initial message (if blocking = false, you will need to use streaming events to get the messages)
 *                 example: true
 *               title:
 *                 type: string
 *                 description: The title of the conversation
 *                 nullable: true
 *                 example: My conversation
 *               visibility:
 *                 type: string
 *                 description: The visibility of the conversation (The API only accepts `unlisted`)
 *                 enum:
 *                   - workspace
 *                   - unlisted
 *                 example: unlisted
 *     responses:
 *       200:
 *         description: Conversation created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Conversation'
 *       400:
 *         description: Bad Request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal Server Error
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      PostConversationsResponseType | GetConversationsResponseType
    >
  >,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "POST":
      const r = PublicPostConversationsRequestBodySchema.safeParse(req.body);

      if (r.error) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${r.error.message}`,
          },
        });
      }

      const {
        title,
        visibility,
        message,
        contentFragment,
        contentFragments,
        blocking,
      } = r.data;

      if (message) {
        if (isEmptyString(message.context.username)) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "The message.context.username must be a non-empty string.",
            },
          });
        }
      }

      const resolvedFragments = contentFragments ?? [];
      if (contentFragment) {
        resolvedFragments.push(contentFragment);
      }

      for (const fragment of resolvedFragments) {
        if (fragment.content) {
          if (
            fragment.content.length === 0 ||
            fragment.content.length > 128 * 1024
          ) {
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message:
                  "The content must be a non-empty string of less than 128kb.",
              },
            });
          }
        }
      }

      let conversation = await createConversation(auth, {
        title,
        visibility,
      });

      let newContentFragment: ContentFragmentType | null = null;
      let newMessage: UserMessageType | null = null;

      for (const resolvedFragment of resolvedFragments) {
        if (resolvedFragment.content) {
          resolvedFragment.contentType = normalizeContentFragmentType({
            contentType: resolvedFragment.contentType,
            url: req.url,
          });
        }

        await maybeUpsertFileAttachment(auth, {
          contentFragments: [resolvedFragment],
          conversation,
        });

        const { context, ...cf } = resolvedFragment;
        const cfRes = await postNewContentFragment(auth, conversation, cf, {
          username: context?.username || null,
          fullName: context?.fullName || null,
          email: context?.email || null,
          profilePictureUrl: context?.profilePictureUrl || null,
        });
        if (cfRes.isErr()) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: cfRes.error.message,
            },
          });
        }

        newContentFragment = cfRes.value;
        const updatedConversationRes = await getConversation(
          auth,
          conversation.sId
        );

        if (updatedConversationRes.isErr()) {
          // Preserving former code in which if the conversation was not found here, we do not error
          if (
            !(
              updatedConversationRes.error instanceof ConversationError &&
              updatedConversationRes.error.type === "conversation_not_found"
            )
          ) {
            return apiErrorForConversation(
              req,
              res,
              updatedConversationRes.error
            );
          }
        } else {
          conversation = updatedConversationRes.value;
        }
      }

      if (message) {
        // If a message was provided we do await for the message to be created
        // before returning the conversation along with the message.
        // PostUserMessageWithPubSub returns swiftly since it only waits for the
        // initial message creation event (or error)
        const messageRes = await postUserMessageWithPubSub(
          auth,
          {
            conversation,
            content: message.content,
            mentions: message.mentions,
            context: {
              timezone: message.context.timezone,
              username: message.context.username,
              fullName: message.context.fullName,
              email: message.context.email,
              profilePictureUrl: message.context.profilePictureUrl,
              origin: message.context.origin ?? "api",
            },
          },
          { resolveAfterFullGeneration: blocking === true }
        );

        if (messageRes.isErr()) {
          return apiError(req, res, messageRes.error);
        }

        newMessage = messageRes.value.userMessage;
      }

      if (newContentFragment || newMessage) {
        // If we created a user message or a content fragment (or both) we retrieve the
        // conversation. If a user message was posted, we know that the agent messages have been
        // created as well, so pulling the conversation again will allow to have an up to date view
        // of the conversation with agent messages included so that the user of the API can start
        // streaming events from these agent messages directly.
        const updatedRes = await getConversation(auth, conversation.sId);

        if (updatedRes.isErr()) {
          return apiErrorForConversation(req, res, updatedRes.error);
        }
        conversation = updatedRes.value;
      }

      res.status(200).json({
        conversation,
        message: newMessage ?? undefined,
        contentFragment: newContentFragment ?? undefined,
      });
      return;
    case "GET":
      const conversations = await getUserConversations(auth);
      res.status(200).json({ conversations });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, POST or GET is expected.",
        },
      });
  }
}

export default withPublicAPIAuthentication(handler, {
  requiredScopes: { GET: "read:conversation", POST: "create:conversation" },
});
