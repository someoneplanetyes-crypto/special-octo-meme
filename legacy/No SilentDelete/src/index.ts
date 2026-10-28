import { findByProps } from "@vendetta/metro";
import { logger } from "@vendetta";

type MessageLike = {
  id?: string;
  channel_id?: string;
  channelId?: string;
  author?: { id?: string };
  nonce?: string | number | null;
  flags?: number;
  content?: string;
};

type Candidate = {
  channelId: string;
  originalId: string;
  authorId: string;
  replacementId: string;
  replacementDeleted: boolean;
};

const PREFIX = "[No SilentDelete]";
const Dispatcher = findByProps("dispatch", "subscribe");
const candidates = new Map<string, Candidate>();
const recentMessages = new Map<string, MessageLike>();
const MAX_CACHED_MESSAGES = 1500;

function key(channelId: string, messageId: string) {
  return `${channelId}:${messageId}`;
}

function getChannelId(payload: any, message?: MessageLike): string {
  return String(message?.channel_id ?? message?.channelId ?? payload?.channelId ?? payload?.channel_id ?? "");
}

function onMessageCreate(payload: any) {
  const message: MessageLike | undefined = payload?.message ?? payload;
  if (!message?.id) return;

  const channelId = getChannelId(payload, message);
  const messageId = String(message.id);
  const authorId = String(message.author?.id ?? "");
  if (channelId) {
    recentMessages.set(key(channelId, messageId), message);
    if (recentMessages.size > MAX_CACHED_MESSAGES) {
      const oldest = recentMessages.keys().next().value;
      if (oldest) recentMessages.delete(oldest);
    }
  }

  // The supplied plugin uses the original message ID as the replacement nonce.
  // It also optionally sets flags=4096 when suppressNotifications is enabled.
  const nonce = message.nonce == null ? "" : String(message.nonce);
  const flags = Number(message.flags ?? 0);
  if (!channelId || !nonce || !authorId || nonce === messageId) return;

  const original = recentMessages.get(key(channelId, nonce));
  const originalAuthorId = String(original?.author?.id ?? "");

  // Prefer the strongest local evidence: nonce points to a cached message by
  // the same author. If the original isn't cached, accept only the known flag
  // signature as a weaker candidate. Neither condition proves intent by itself.
  const sameAuthorOriginal = !!originalAuthorId && originalAuthorId === authorId;
  const hasSuppressNotificationsFlag = (flags & 4096) !== 0;
  if (!sameAuthorOriginal && !hasSuppressNotificationsFlag) return;
  if (originalAuthorId && originalAuthorId !== authorId) return;

  candidates.set(key(channelId, messageId), {
    channelId,
    originalId: nonce,
    authorId,
    replacementId: messageId,
    replacementDeleted: false,
  });

  logger.log(`${PREFIX} Candidate replacement observed (channel=${channelId}, replacement=${messageId}, nonce/original=${nonce}, flags=${flags}). Waiting for delete events; this is heuristic only.`);
}

function onMessageDelete(payload: any) {
  const channelId = String(payload?.channelId ?? payload?.channel_id ?? "");
  const messageId = String(payload?.id ?? payload?.messageId ?? payload?.message_id ?? "");
  if (!channelId || !messageId) return;

  const directKey = key(channelId, messageId);
  const candidate = candidates.get(directKey);
  if (candidate) {
    candidate.replacementDeleted = true;
    candidates.set(directKey, candidate);
    logger.log(`${PREFIX} Candidate replacement deleted (replacement=${messageId}); watching for original deletion ${candidate.originalId}.`);
    return;
  }

  for (const [candidateKey, item] of candidates) {
    if (item.channelId !== channelId || item.originalId !== messageId) continue;
    if (!item.replacementDeleted) continue;

    const original = recentMessages.get(key(channelId, messageId));
    if (original?.author?.id && String(original.author.id) !== item.authorId) {
      candidates.delete(candidateKey);
      continue;
    }

    logger.log(`${PREFIX} Possible Silent Delete sequence confirmed (channel=${channelId}, original=${messageId}, replacement=${item.replacementId}). Original content can only be preserved if it was captured in memory before deletion.`);
    candidates.delete(candidateKey);
  }

  recentMessages.delete(directKey);
}

function onDeleteBulk(payload: any) {
  const channelId = String(payload?.channelId ?? payload?.channel_id ?? "");
  const ids: unknown[] = payload?.ids ?? [];
  for (const id of ids) onMessageDelete({ channelId, id });
}

export default {
  onLoad() {
    if (!Dispatcher?.subscribe || !Dispatcher?.unsubscribe) {
      logger.error(`${PREFIX} FluxDispatcher subscribe/unsubscribe were not found; detector not started.`);
      return;
    }

    Dispatcher.subscribe("MESSAGE_CREATE", onMessageCreate);
    Dispatcher.subscribe("MESSAGE_DELETE", onMessageDelete);
    Dispatcher.subscribe("MESSAGE_DELETE_BULK", onDeleteBulk);
    logger.log(`${PREFIX} Detector loaded. It only logs candidate sequences; it does not alter messages or persist history.`);
  },

  onUnload() {
    Dispatcher?.unsubscribe?.("MESSAGE_CREATE", onMessageCreate);
    Dispatcher?.unsubscribe?.("MESSAGE_DELETE", onMessageDelete);
    Dispatcher?.unsubscribe?.("MESSAGE_DELETE_BULK", onDeleteBulk);
    candidates.clear();
    recentMessages.clear();
    logger.log(`${PREFIX} Detector unloaded; all in-memory history cleared.`);
  },
};
