/**
 * Pre-extraction message filtering: noise detection, content stripping,
 * query sanitization, generic assistant detection, truncation.
 *
 * DEFENSIVE LOGIC - DO NOT REMOVE:
 * These filters are battle-tested from production. They prevent:
 * - Cron heartbeats from polluting memory
 * - Trivial one-word responses from being stored
 * - Circular memory re-extraction from injected memories
 * - System routing metadata from contaminating search queries
 */

// ============================================================================
// Noise Detection
// ============================================================================

/** Trivial responses with no extractable facts (includes CJK) */
const TRIVIAL_RESPONSES = new Set([
  "ok", "okay", "yes", "no", "sir", "sure", "thanks", "thank you",
  "done", "nope", "yep", "yup", "yeah", "nah", "alright", "right",
  "cool", "nice", "great", "fine", "got it", "noted", "ack",
  "好", "好的", "是", "不是", "謝謝", "了解", "收到", "嗯",
]);

/** System routing metadata patterns - gateway status, not user intent */
const SYSTEM_ROUTING_PATTERNS: RegExp[] = [
  /^NO_REPLY$/i,
  /^Pre-compaction memory flush/i,
  /^Current time:/,
  /^Slack message edited/i,
  /^Gateway restart/i,
  /^Exec (failed|completed)/i,
  /^Post-Compaction Audit/i,
  /HEARTBEAT/i,
  /heartbeat\.md/i,
];

/**
 * Check if a message is noise (no extractable facts).
 * Returns true if the message should be skipped.
 */
export function isNoiseMessage(content: string, role: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return true;

  // All roles: system routing metadata
  for (const pattern of SYSTEM_ROUTING_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }

  // User messages: trivial one-word responses
  if (role === "user") {
    const lower = trimmed.toLowerCase().replace(/[.!?,;:]+$/g, "");
    if (TRIVIAL_RESPONSES.has(lower)) return true;
  }

  // Short assistant messages: detect empty acknowledgments
  if (role === "assistant" && trimmed.length < 300) {
    if (isGenericAssistantResponse(trimmed)) return true;
  }

  return false;
}

// ============================================================================
// Generic Assistant Response Detection
// ============================================================================

/**
 * Patterns for empty assistant replies - polite but no factual content.
 * NOTE: Do NOT add /g flag to avoid RegExp.test() lastIndex state bugs.
 */
const GENERIC_ASSISTANT_PATTERNS: RegExp[] = [
  // English
  /^I see you've shared/i,
  /^Got it\.?\s*(Let me|I'll)/i,
  /^How can I help/i,
  /^What would you like/i,
  /^Is there anything/i,
  /^Let me know if/i,
  /^Sure,?\s*(I can|let me|I'll)/i,
  /^I('d be| am) happy to help/i,
  /^No problem/i,
  /^You're welcome/i,
  /^I understand\.?\s*$/i,
  /^Understood\.?\s*$/i,
  /^Of course[.!]?\s*$/i,
  // Traditional Chinese
  /^好的，讓我/,
  /^沒問題[，。！]?\s*/,
  /^我可以幫你/,
  /^收到[，。！]?\s*$/,
  /^了解[，。！]?\s*$/,
  /^我來處理/,
  /^沒問題，我/,
  /^好的，我(來|會|幫)/,
  /^當然[，。！]?\s*$/,
  /^好[，。！]\s*$/,
];

function isGenericAssistantResponse(content: string): boolean {
  const trimmed = content.trim();
  for (const pattern of GENERIC_ASSISTANT_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  return false;
}

// ============================================================================
// Search Query Cleanup
// ============================================================================

/**
 * Clean OpenClaw-injected metadata from a search query, keeping only user content.
 * Used for autoRecall (search query) and autoCapture (user messages).
 */
export function cleanSearchQuery(raw: string): string {
  if (!raw || !raw.trim()) return "";

  let cleaned = raw;

  // 1. Remove [Thread starter ...] and subsequent metadata blocks
  cleaned = cleaned.replace(
    /\[Thread starter[^\]]*\][\s\S]*?(?:Sender \(untrusted metadata\):\s*```json[\s\S]*?```\s*)/g,
    "",
  );
  // Fallback: remove residual [Thread starter ...] lines
  cleaned = cleaned.replace(/^\[Thread starter[^\]]*\].*$/gm, "");

  // 2. Remove Conversation info / Sender metadata blocks
  cleaned = cleaned.replace(/Conversation info \(untrusted metadata\):\s*```json[\s\S]*?```\s*/g, "");
  cleaned = cleaned.replace(/Sender \(untrusted metadata\):\s*```json[\s\S]*?```\s*/g, "");

  // 3. Remove Current time lines
  cleaned = cleaned.replace(/^Current time:.*$/gm, "");

  // 4. Remove system instructions
  cleaned = cleaned.replace(/^Read HEARTBEAT\.md.*$/gm, "");
  cleaned = cleaned.replace(/^⚠️ 重要：.*$/gm, "");
  cleaned = cleaned.replace(/^When reading HEARTBEAT\.md.*$/gm, "");

  // 5. Remove <relevant-memories> block (avoid recall feedback loop)
  cleaned = cleaned.replace(/<relevant-memories>[\s\S]*?<\/relevant-memories>\s*/g, "");

  // 6. Collapse excessive whitespace
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();

  return cleaned;
}

// ============================================================================
// Message Truncation
// ============================================================================

/**
 * Truncate an oversized message, auto-closing unclosed code fences.
 */
export function truncateMessage(content: string, maxLen: number = 2000): string {
  if (content.length <= maxLen) return content;
  let truncated = content.slice(0, maxLen);
  // Close unclosed code fences (odd number of ```)
  const fenceCount = (truncated.match(/```/g) ?? []).length;
  if (fenceCount % 2 !== 0) {
    truncated += "\n```";
  }
  return truncated;
}

// ============================================================================
// Summary Pattern Extraction
// ============================================================================

/** Summary markers - paragraphs with high-density facts */
const SUMMARY_PATTERNS: RegExp[] = [
  /^#{1,3}\s*What I Accomplished/im,
  /^#{1,3}\s*Summary/im,
  /^#{1,3}\s*Quick summary/im,
  /^#{1,3}\s*Key (decisions|takeaways|changes|points)/im,
  /^#{1,3}\s*Changes made/im,
  /^#{1,3}\s*Today's progress/im,
  /^#{1,3}\s*Completed/im,
  /^#{1,3}\s*Done today/im,
  /^Quick summary:/im,
  /^Here'?s what (I|we) (did|accomplished|completed)/im,
  /^To summarize/im,
];

/**
 * Extract messages with summary patterns from the full conversation,
 * merging them with the recent window.
 * Returns at most maxTotal messages (recent + summaries), in chronological order.
 */
export function extractWithSummaries(
  messages: Array<{ role: string; content: string; [k: string]: unknown }>,
  recentCount: number = 20,
  maxTotal: number = 25,
  debugLog?: (msg: string) => void,
): Array<{ role: string; content: string; [k: string]: unknown }> {
  if (messages.length <= recentCount) return messages;

  const recentStart = messages.length - recentCount;
  const recent = messages.slice(recentStart);

  // Find summaries before the recent window
  const summarySlots = maxTotal - recentCount;
  const summaries: Array<{ idx: number; msg: (typeof messages)[0] }> = [];

  for (let i = 0; i < recentStart && summaries.length < summarySlots; i++) {
    const msg = messages[i];
    const text =
      typeof msg.content === "string"
        ? msg.content
        : Array.isArray(msg.content)
          ? (msg.content as any[])
              .filter((b) => b && typeof b === "object" && "text" in b)
              .map((b) => b.text)
              .join("\n")
          : "";
    for (const pattern of SUMMARY_PATTERNS) {
      if (pattern.test(text)) {
        debugLog?.(`openclaw-mem0: summary pattern matched at message index ${i}`);
        summaries.push({ idx: i, msg });
        break;
      }
    }
  }

  if (!summaries.length) return recent;

  // Merge: summaries first (in original order), then recent
  return [...summaries.map((s) => s.msg), ...recent];
}

// ============================================================================
// Full Extraction Pipeline
// ============================================================================

/**
 * Filter and clean messages for memory extraction.
 * Applies: noise filtering, role filtering, relevant-memories stripping,
 * metadata cleanup, truncation.
 */
export function filterMessagesForExtraction(
  messages: Array<{ role: string; content: string | unknown; [k: string]: unknown }>,
  debugLog?: (msg: string) => void,
): Array<{ role: string; content: string }> {
  const formatted: Array<{ role: string; content: string }> = [];
  let noiseSkipped = 0;

  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    const role = (msg.role as string) ?? "user";

    // Only capture user and assistant messages (skip system, tool, etc.)
    if (role !== "user" && role !== "assistant") continue;

    let content =
      typeof msg.content === "string"
        ? msg.content
        : Array.isArray(msg.content)
          ? (msg.content as any[])
              .filter((b) => b && typeof b === "object" && "text" in b)
              .map((b) => b.text)
              .join("\n")
          : "";

    // Strip injected memory context to avoid circular re-extraction
    if (content.includes("<relevant-memories>")) {
      content = content.replace(/<relevant-memories>[\s\S]*?<\/relevant-memories>\s*/g, "").trim();
    }

    // Clean user messages of metadata contamination
    if (role === "user") {
      content = cleanSearchQuery(content);
    }

    // Noise filtering: skip messages with no extractable facts
    if (isNoiseMessage(content, role)) {
      noiseSkipped++;
      continue;
    }

    // Truncate oversized messages (single message > 2000 chars)
    content = truncateMessage(content, 2000);
    if (content) formatted.push({ role, content });
  }

  if (noiseSkipped > 0) {
    debugLog?.(`openclaw-mem0: noise filter skipped ${noiseSkipped} message(s)`);
  }

  return formatted;
}
