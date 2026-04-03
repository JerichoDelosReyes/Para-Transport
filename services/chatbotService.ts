import datasetJson from '../data/chatbot-dataset.json';
import type { JeepneyRoute } from '../types/routes';
import { findRoutesForDestination, rankRoutes } from './routeSearch';
import { BADGES, type Badge } from '../constants/badges';

export type BotLanguage = 'en' | 'tl';
export type ChatbotMode = 'assistant' | 'companion';

export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type ChatbotConversationState = {
  awaitingOriginForDestinationId?: string;
  awaitingOriginIntent?: 'fare' | 'route';
  awaitingDestinationIntent?: 'fare' | 'route';
  destinationPromptCount?: number;
  pendingDestinationName?: string;
  pendingDestinationCoordinate?: Coordinate;
  pendingDestinationPlaceId?: string;
  lastTopic?: 'app-guide';
  lastAppGuideId?: string;
};

export type ChatbotHistoryMessage = {
  text: string;
  isUser: boolean;
};

export type ChatbotRequest = {
  message: string;
  mode?: ChatbotMode;
  state?: ChatbotConversationState;
  history?: ChatbotHistoryMessage[];
  routes?: JeepneyRoute[];
  currentLocation?: Coordinate | null;
  currentLocationLabel?: string | null;
};

export type ChatbotResponse = {
  text: string;
  language: BotLanguage;
  state: ChatbotConversationState;
  usedGroq: boolean;
};

type GuardrailCategory = 'safe' | 'out_of_scope' | 'unsafe';

type GuardrailDecision = {
  allow: boolean;
  category: GuardrailCategory;
  reason?: string;
  confidence?: number;
};

type DatasetPlace = {
  id: string;
  name: string;
  aliases: string[];
  coordinate: Coordinate;
};

type DatasetFarePair = {
  originId: string;
  destinationId: string;
  distanceKm: number;
  jeepneyRouteHint: string;
};

type DatasetTrivia = {
  id: string;
  en: string;
  tl: string;
};

type LocalizedVariants = {
  en: string[];
  tl: string[];
};

type DatasetAppGuide = {
  id: string;
  intents: string[];
  en: string[];
  tl: string[];
};

type DatasetIntentGroup = {
  id: string;
  intents: string[];
  threshold?: number;
};

type DatasetIntentSynonymGroups = {
  shared?: Record<string, string>;
  en?: Record<string, string>;
  tl?: Record<string, string>;
};

type DatasetIntentConfig = {
  collapseRepeatedChars?: boolean;
  intentSynonyms?: DatasetIntentSynonymGroups;
};

type DatasetMatchingConfig = {
  fuzzyMinWordLength?: number;
  fuzzyLongWordLength?: number;
  fuzzyMaxDistanceShort?: number;
  fuzzyMaxDistanceLong?: number;
  intentGroupThreshold?: number;
};

type DatasetShape = {
  farePolicy: {
    baseFarePhp: number;
    baseDistanceKm: number;
    additionalPerKmPhp: number;
    discountRate: number;
    roundToNearestQuarter: boolean;
  };
  topicKeywords: string[];
  intentConfig?: DatasetIntentConfig;
  matchingConfig?: DatasetMatchingConfig;
  intentGroups?: DatasetIntentGroup[];
  appGuideAliasMap?: Record<string, string>;
  places: DatasetPlace[];
  farePairs: DatasetFarePair[];
  trivia: DatasetTrivia[];
  triviaLeadIns: LocalizedVariants;
  socialResponses: {
    greetings: LocalizedVariants;
    thanks: LocalizedVariants;
    praise: LocalizedVariants;
    laughter: LocalizedVariants;
    powerWords: LocalizedVariants;
    profanity: LocalizedVariants;
    userAnger: LocalizedVariants;
    empathy: LocalizedVariants;
    success: LocalizedVariants;
    userApology: LocalizedVariants;
    acknowledgement: LocalizedVariants;
    goodbye: LocalizedVariants;
  };
  companionLexicon: {
    powerWords: string[];
    curseWords: string[];
    laughterWords: string[];
    tagalogHints?: string[];
    englishHints?: string[];
    angerWords?: string[];
    empathyWords?: string[];
    successWords?: string[];
  };
  fareNews: LocalizedVariants;
  routeResponses: {
    askDestination: LocalizedVariants;
    askOrigin: LocalizedVariants;
    noRouteFound: LocalizedVariants;
    pinAcknowledgement: LocalizedVariants;
    routeFoundIntro: LocalizedVariants;
    routeSummaryOutro: LocalizedVariants;
    landmarkListIntro: LocalizedVariants;
    landmarkRouteIntro: LocalizedVariants;
    landmarkNoData: LocalizedVariants;
    landmarkListOutro: LocalizedVariants;
  };
  appGuides: DatasetAppGuide[];
  builderAnswer: string;
  fallbackMessages: {
    outOfScope: LocalizedVariants;
    unknown: LocalizedVariants;
    missingDestination: LocalizedVariants;
    askOrigin: LocalizedVariants;
    unknownOrigin: LocalizedVariants;
  };
};

type PlaceMention = {
  place: DatasetPlace;
  index: number;
};

type EstimateResult = {
  distanceKm: number;
  normalFare: number;
  discountedFare: number;
  routeHint: string;
};

type RoutePlanResult = {
  routeNames: string[];
  distanceKm: number;
  estimatedMinutes: number;
  estimatedFare: number;
};

type DestinationPoint = {
  name: string;
  coordinate: Coordinate;
  placeId?: string;
};

type StopDestination = DestinationPoint;

type NormalizedIntentGroup = {
  id: string;
  intents: string[];
  threshold: number;
};

const dataset = datasetJson as DatasetShape;
const DEFAULT_INTENT_GROUP_THRESHOLD = 0.62;
const DEFAULT_MATCHING_CONFIG: Required<DatasetMatchingConfig> = {
  fuzzyMinWordLength: 4,
  fuzzyLongWordLength: 8,
  fuzzyMaxDistanceShort: 1,
  fuzzyMaxDistanceLong: 2,
  intentGroupThreshold: DEFAULT_INTENT_GROUP_THRESHOLD,
};
const matchingConfig: Required<DatasetMatchingConfig> = {
  ...DEFAULT_MATCHING_CONFIG,
  ...(dataset.matchingConfig ?? {}),
};
const intentSynonymMap = buildIntentSynonymMap(dataset.intentConfig?.intentSynonyms);
const intentGroups = buildIntentGroups(dataset.intentGroups ?? [], matchingConfig.intentGroupThreshold);
const intentGroupById = new Map<string, NormalizedIntentGroup>(
  intentGroups.map((group) => [group.id, group]),
);
const placeById = new Map<string, DatasetPlace>(dataset.places.map((place) => [place.id, place]));
const companionPowerWordTokens = uniqueHints(dataset.companionLexicon?.powerWords ?? []);
const companionCurseWordTokens = uniqueHints(dataset.companionLexicon?.curseWords ?? []);
const companionLaughterTokens = uniqueHints(dataset.companionLexicon?.laughterWords ?? []);
const companionAngerTokens = uniqueHints(dataset.companionLexicon?.angerWords ?? []);
const companionEmpathyTokens = uniqueHints(dataset.companionLexicon?.empathyWords ?? []);
const companionSuccessTokens = uniqueHints(dataset.companionLexicon?.successWords ?? []);

const aliasIndex: Array<{ alias: string; place: DatasetPlace }> = [];
for (const place of dataset.places) {
  aliasIndex.push({ alias: normalizeText(place.name), place });
  for (const alias of place.aliases) {
    aliasIndex.push({ alias: normalizeText(alias), place });
  }
}

const badgeAliasIndex: Array<{ alias: string; badge: Badge }> = [];
for (const badge of BADGES) {
  badgeAliasIndex.push({ alias: normalizeText(badge.name), badge });
  badgeAliasIndex.push({ alias: normalizeText(badge.id.replace(/_/g, ' ')), badge });
}

const DEFAULT_TAGALOG_HINTS = [
  'kumusta',
  'kamusta',
  'kumutsa',
  'kamutsa',
  'musta',
  'magkano',
  'pamasahe',
  'papunta',
  'saan',
  'nasaan',
  'galing',
  'mula',
  'sakay',
  'baba',
  'ruta',
  'sino',
  'gumawa',
  'pwede',
  'puwede',
  'po',
  'opo',
  'oo',
  'salamat',
  'maraming salamat',
  'pasensya',
  'pasensiya',
  'sige',
  'cge',
  'gege',
  'ano',
  'bakit',
  'paano',
  'ako',
  'nasa',
];

const DEFAULT_ENGLISH_HINTS = [
  'hi',
  'hello',
  'hey',
  'good morning',
  'good afternoon',
  'good evening',
  'how much',
  'fare',
  'route',
  'destination',
  'where',
  'who built',
  'who made',
  'student',
  'senior',
  'pwd',
  'app',
  'transport',
  'commute',
  'transit',
  'thanks',
  'thank you',
  'sorry',
  'please',
];

const TAGALOG_HINTS = uniqueLanguageHints([
  ...DEFAULT_TAGALOG_HINTS,
  ...(dataset.companionLexicon?.tagalogHints ?? []),
]);

const ENGLISH_HINTS = uniqueLanguageHints([
  ...DEFAULT_ENGLISH_HINTS,
  ...(dataset.companionLexicon?.englishHints ?? []),
]);

const TAGALOG_SOCIAL_CUES = /\b(kumusta|kamusta|kumutsa|kamutsa|musta|salamat|pasensya|pasensiya|sige|cge|gege|opo|magandang)\b/;

function buildIntentSynonymMap(groups?: DatasetIntentSynonymGroups): Record<string, string> {
  if (!groups) return {};

  const output: Record<string, string> = {};
  const buckets = [groups.shared, groups.en, groups.tl];

  for (const bucket of buckets) {
    if (!bucket) continue;

    for (const [rawKey, rawValue] of Object.entries(bucket)) {
      const key = normalizeText(rawKey);
      const value = normalizeText(rawValue);
      if (!key || !value || key === value) continue;
      output[key] = value;
    }
  }

  return output;
}

function buildIntentGroups(
  groups: DatasetIntentGroup[],
  defaultThreshold: number,
): NormalizedIntentGroup[] {
  return groups
    .map((group) => {
      const id = normalizeText(group.id);
      const intents = uniqueLanguageHints(group.intents || []).map((intent) => normalizeIntentText(intent));
      const threshold = typeof group.threshold === 'number'
        ? Math.max(0.4, Math.min(1, group.threshold))
        : defaultThreshold;

      return {
        id,
        intents,
        threshold,
      };
    })
    .filter((group) => Boolean(group.id) && group.intents.length > 0);
}

function applyIntentSynonyms(normalized: string): string {
  if (!normalized || Object.keys(intentSynonymMap).length === 0) return normalized;

  let output = ` ${normalized} `;

  for (const [from, to] of Object.entries(intentSynonymMap)) {
    output = output.replace(new RegExp(`\\b${escapeRegExp(from)}\\b`, 'g'), to);
  }

  return output.replace(/\s+/g, ' ').trim();
}

function scoreIntentGroupMatch(normalized: string, group: NormalizedIntentGroup): number {
  let best = 0;

  for (const token of group.intents) {
    if (hintMatches(normalized, token)) {
      best = Math.max(best, 1);
      continue;
    }

    if (fuzzyHintMatches(normalized, token)) {
      best = Math.max(best, 0.82);
      continue;
    }

    const tokenWords = tokenizeWords(token);
    if (tokenWords.length <= 1) continue;

    const partialHits = tokenWords.filter((word) => hintMatches(normalized, word)).length;
    if (partialHits === 0) continue;
    best = Math.max(best, partialHits / tokenWords.length);
  }

  return best;
}

function hasIntentGroup(normalized: string, groupId: string): boolean {
  const group = intentGroupById.get(normalizeText(groupId));
  if (!group) return false;

  const score = scoreIntentGroupMatch(normalized, group);
  return score >= group.threshold;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hintMatches(normalized: string, token: string): boolean {
  const normalizedToken = normalizeText(token);
  if (!normalizedToken) return false;

  if (normalizedToken.includes(' ')) {
    return normalized.includes(normalizedToken);
  }

  return new RegExp(`\\b${escapeRegExp(normalizedToken)}\\b`).test(normalized);
}

function normalizeIntentText(text: string): string {
  let normalized = normalizeText(text);

  if (dataset.intentConfig?.collapseRepeatedChars !== false) {
    normalized = normalized.replace(/(.)\1{2,}/g, '$1');
  }

  normalized = applyIntentSynonyms(normalized);
  return normalized.trim();
}

function tokenizeWords(normalized: string): string[] {
  return normalized.split(' ').filter(Boolean);
}

function hasAdjacentTransposition(a: string, b: string): boolean {
  if (a.length !== b.length || a.length < 2) return false;

  let firstMismatch = -1;
  let mismatchCount = 0;

  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === b[i]) continue;
    mismatchCount += 1;
    if (firstMismatch === -1) firstMismatch = i;
  }

  if (mismatchCount !== 2 || firstMismatch < 0 || firstMismatch >= a.length - 1) return false;

  return a[firstMismatch] === b[firstMismatch + 1]
    && a[firstMismatch + 1] === b[firstMismatch]
    && a.slice(firstMismatch + 2) === b.slice(firstMismatch + 2);
}

function fuzzyWordMatch(word: string, target: string): boolean {
  if (!word || !target) return false;
  if (word === target) return true;
  if (word.length < matchingConfig.fuzzyMinWordLength || target.length < matchingConfig.fuzzyMinWordLength) return false;
  if (word[0] !== target[0]) return false;
  if (Math.abs(word.length - target.length) > 2) return false;
  if (hasAdjacentTransposition(word, target)) return true;

  const maxLen = Math.max(word.length, target.length);
  const maxDistance = maxLen >= matchingConfig.fuzzyLongWordLength
    ? matchingConfig.fuzzyMaxDistanceLong
    : matchingConfig.fuzzyMaxDistanceShort;
  return levenshteinDistance(word, target) <= maxDistance;
}

function fuzzyHintMatches(normalized: string, token: string): boolean {
  const normalizedToken = normalizeIntentText(token);
  if (!normalizedToken) return false;

  const sourceWords = tokenizeWords(normalized);
  const targetWords = tokenizeWords(normalizedToken);
  if (sourceWords.length === 0 || targetWords.length === 0) return false;

  if (targetWords.length === 1) {
    const target = targetWords[0];
    return sourceWords.some((source) => fuzzyWordMatch(source, target));
  }

  if (targetWords.length > sourceWords.length) return false;

  for (let i = 0; i <= sourceWords.length - targetWords.length; i += 1) {
    let matched = true;

    for (let j = 0; j < targetWords.length; j += 1) {
      const source = sourceWords[i + j];
      const target = targetWords[j];
      if (source === target) continue;
      if (!fuzzyWordMatch(source, target)) {
        matched = false;
        break;
      }
    }

    if (matched) return true;
  }

  return false;
}

function matchesIntentHint(normalized: string, token: string): boolean {
  return hintMatches(normalized, token) || fuzzyHintMatches(normalized, token);
}

function hasAnyIntentToken(normalized: string, tokens: string[]): boolean {
  return tokens.some((token) => matchesIntentHint(normalized, token));
}

function scoreHintMatches(normalized: string, hints: string[]): number {
  return hints.reduce((count, token) => (hintMatches(normalized, token) ? count + 1 : count), 0);
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectLanguage(message: string): BotLanguage {
  const normalized = normalizeIntentText(message);

  // Treat common kamusta/kumusta greetings as strong Tagalog intent.
  if (/\b(kamusta|kumusta|kamutsa|kumutsa|musta)\b/.test(normalized)) {
    return 'tl';
  }

  const tlScore = scoreHintMatches(normalized, TAGALOG_HINTS);
  const enScore = scoreHintMatches(normalized, ENGLISH_HINTS);

  if (TAGALOG_SOCIAL_CUES.test(normalized) && enScore <= tlScore + 1) {
    return 'tl';
  }

  if (tlScore === enScore && tlScore > 0) {
    return 'tl';
  }

  return tlScore > enScore ? 'tl' : 'en';
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function normalizeForRepeatCheck(text: string): string {
  return normalizeText(text).replace(/\s+/g, ' ').trim();
}

function lastAssistantReply(history?: ChatbotHistoryMessage[]): string | null {
  if (!history || history.length === 0) return null;

  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i];
    if (entry.isUser) continue;

    const value = entry.text?.trim();
    if (value) return value;
  }

  return null;
}

function pickRandomTextVariant(items: string[], avoidText?: string | null): string {
  if (items.length === 0) return '';
  if (!avoidText) return pickRandom(items);

  const avoidNormalized = normalizeForRepeatCheck(avoidText);
  if (!avoidNormalized) return pickRandom(items);

  const filtered = items.filter((item) => {
    const normalizedItem = normalizeForRepeatCheck(item);
    if (!normalizedItem) return false;
    return !avoidNormalized.includes(normalizedItem);
  });

  return pickRandom(filtered.length > 0 ? filtered : items);
}

function pickLocalized(
  variants: LocalizedVariants,
  language: BotLanguage,
  selection?: { avoidText?: string | null },
): string {
  const localizedOptions = language === 'tl' ? variants.tl : variants.en;
  return pickRandomTextVariant(localizedOptions, selection?.avoidText);
}

function formatForChatDisplay(text: string): string {
  const cleaned = text
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!cleaned) return '';
  if (cleaned.includes('\n\n')) return cleaned;
  if (cleaned.includes('\n')) return cleaned;

  const sentences = cleaned
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    ?.map((s) => s.trim())
    .filter(Boolean) || [];

  if (sentences.length < 2) return cleaned;

  const firstSentence = sentences[0];
  const firstWords = firstSentence.split(/\s+/).filter(Boolean).length;
  const startsWithShortGreeting = firstWords <= 2 && firstSentence.length <= 16;

  if (startsWithShortGreeting && sentences.length >= 3) {
    const greetingBlock = `${firstSentence} ${sentences[1]}`.trim();
    const remainingAfterGreeting = sentences.slice(2).join(' ').trim();
    if (remainingAfterGreeting) {
      return `${greetingBlock}\n\n${remainingAfterGreeting}`;
    }
  }

  const remaining = sentences.slice(1).join(' ').trim();
  if (!remaining) return cleaned;

  return `${firstSentence}\n\n${remaining}`;
}

const SUPPORT_ACK_OPENERS: LocalizedVariants = {
  en: [
    'Thanks for reaching out. I understand what you need.',
    'I hear you, and I am ready to help.',
    'Absolutely, I can assist you with that.',
  ],
  tl: [
    'Salamat sa pag-message. Naiintindihan ko ang concern mo.',
    'Gets kita, at handa akong tumulong.',
    'Sige, tutulungan kita dito.',
  ],
};

const SUPPORT_CLOSERS: LocalizedVariants = {
  en: [
    'If you want, I can also help with your next question.',
    'I am here if you need anything else for your commute.',
    'Feel free to ask another route or fare question anytime.',
  ],
  tl: [
    'Kung gusto mo, pwede pa kitang tulungan sa susunod mong tanong.',
    'Nandito lang ako kung may iba ka pang commuting concern.',
    'Chat ka lang ulit anytime para sa next route o fare question mo.',
  ],
};

function composeSupportReply(
  language: BotLanguage,
  content: string,
  options?: { includeClosing?: boolean },
): string {
  const body = formatForChatDisplay(content);
  const shouldAddClosing = Boolean(options?.includeClosing)
    && !isStrictPolicyReply(body)
    && body.length < 520
    && Math.random() < 0.45;
  const closing = shouldAddClosing
    ? formatForChatDisplay(pickLocalized(SUPPORT_CLOSERS, language))
    : '';

  const chunks = [body, closing].filter(Boolean);
  return chunks.join('\n\n');
}

const REPEAT_BREAKER_SHORT: LocalizedVariants = {
  en: [
    'Thanks for checking in again. Want a route, fare estimate, or app help next?',
    'Glad you followed up. Tell me your destination and I will tailor the next step.',
    'No problem, we can continue. Share your next commute question and I will adjust the guidance.',
  ],
  tl: [
    'Salamat sa follow-up. Route, fare estimate, o app help ba ang kailangan mo ngayon?',
    'Ayos, tuloy tayo. Sabihin mo ang destination mo para ma-personalize ko ang next step.',
    'Sige lang, game pa ako tumulong. I-send mo ang next commute question mo at iaangkop ko ang sagot.',
  ],
};

const REPEAT_BREAKER_LONG: LocalizedVariants = {
  en: [
    'Let me rephrase that so it sounds less repetitive and more tailored to your trip.',
    'I will put this in a fresher way so it feels more natural for your situation.',
    'Here is the same guidance with a different wording to keep it more personal.',
  ],
  tl: [
    'Ire-rephrase ko ito para hindi paulit-ulit at mas bagay sa trip mo.',
    'Babaguhin ko ang wording para mas natural at mas personalized sa sitwasyon mo.',
    'Pareho pa rin ang guidance, pero iibahin ko ang phrasing para mas personal ang dating.',
  ],
};

function splitSentences(text: string): string[] {
  return text
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    ?.map((part) => part.trim())
    .filter(Boolean) || [];
}

function dedupeConsecutiveSentences(text: string): string {
  const paragraphs = text.split('\n\n');
  const dedupedParagraphs: string[] = [];
  let previousKey = '';

  for (const rawParagraph of paragraphs) {
    const paragraph = rawParagraph.trim();
    if (!paragraph) continue;

    if (paragraph.includes('\n')) {
      const lines = paragraph
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      const keptLines: string[] = [];
      let previousLineKey = '';

      for (const line of lines) {
        const lineKey = normalizeForRepeatCheck(line);
        if (lineKey && lineKey === previousLineKey) continue;
        keptLines.push(line);
        previousLineKey = lineKey;
        previousKey = lineKey;
      }

      if (keptLines.length > 0) {
        dedupedParagraphs.push(keptLines.join('\n'));
      }
      continue;
    }

    const sentences = splitSentences(paragraph);
    if (sentences.length <= 1) {
      const key = normalizeForRepeatCheck(paragraph);
      if (!key || key !== previousKey) {
        dedupedParagraphs.push(paragraph);
        previousKey = key;
      }
      continue;
    }

    const keptSentences: string[] = [];
    for (const sentence of sentences) {
      const key = normalizeForRepeatCheck(sentence);
      if (!key || key === previousKey) continue;
      keptSentences.push(sentence);
      previousKey = key;
    }

    if (keptSentences.length > 0) {
      dedupedParagraphs.push(keptSentences.join(' '));
    }
  }

  return dedupedParagraphs.join('\n\n').trim();
}

function diversifyReplyText(
  language: BotLanguage,
  text: string,
  history: ChatbotHistoryMessage[],
): string {
  const formatted = formatForChatDisplay(text);
  if (!formatted || isStrictPolicyReply(formatted)) return formatted;

  const deduped = dedupeConsecutiveSentences(formatted);
  const output = deduped || formatted;
  if (isStrictPolicyReply(output)) return output;

  const lastAssistant = lastAssistantReply(history);
  if (!lastAssistant) return output;

  const currentKey = normalizeForRepeatCheck(output);
  const previousKey = normalizeForRepeatCheck(lastAssistant);
  if (!currentKey || !previousKey || currentKey !== previousKey) return output;

  const wordCount = output.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 14) {
    return formatForChatDisplay(
      pickLocalized(REPEAT_BREAKER_SHORT, language, { avoidText: lastAssistant }),
    );
  }

  const lead = formatForChatDisplay(
    pickLocalized(REPEAT_BREAKER_LONG, language, { avoidText: lastAssistant }),
  );
  if (!lead) return output;
  return `${lead}\n\n${output}`;
}

function diversifyIfImmediateRepeat(
  text: string,
  language: BotLanguage,
  history?: ChatbotHistoryMessage[],
): string {
  return diversifyReplyText(language, text, history ?? []);
}

function template(message: string, replacements: Record<string, string>): string {
  let output = message;
  for (const [key, value] of Object.entries(replacements)) {
    output = output.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return output;
}

const STRICT_OUT_OF_SCOPE_REPLY = 'I’m here to help with PARA, commuting, routes, fares, and app-related questions.';
const ROUTE_DATA_UNAVAILABLE_REPLY = 'I’m not seeing enough data for that route yet in PARA.';
const INFO_UNAVAILABLE_REPLY = 'That information is not available in my current data.';

function isStrictPolicyReply(text: string): boolean {
  const normalized = text.trim();
  return normalized === STRICT_OUT_OF_SCOPE_REPLY
    || normalized === ROUTE_DATA_UNAVAILABLE_REPLY
    || normalized === INFO_UNAVAILABLE_REPLY;
}

function strictOutOfScopeReply(): string {
  return STRICT_OUT_OF_SCOPE_REPLY;
}

function routeDataUnavailableReply(): string {
  return ROUTE_DATA_UNAVAILABLE_REPLY;
}

function infoUnavailableReply(): string {
  return INFO_UNAVAILABLE_REPLY;
}

const JEEPNEY_BASE_FARE_REGULAR = 13;
const JEEPNEY_BASE_FARE_DISCOUNTED = 11;
const JEEPNEY_BASE_DISTANCE_KM = 4;
const JEEPNEY_PER_KM_RATE = 1.8;

function calculateJeepneyFare(distanceKm: number, discounted = false): number {
  const billableKm = Math.max(1, Math.ceil(distanceKm));
  const baseFare = discounted ? JEEPNEY_BASE_FARE_DISCOUNTED : JEEPNEY_BASE_FARE_REGULAR;

  if (billableKm <= JEEPNEY_BASE_DISTANCE_KM) return baseFare;

  const extraKm = billableKm - JEEPNEY_BASE_DISTANCE_KM;
  return Math.round(baseFare + extraKm * JEEPNEY_PER_KM_RATE);
}

function calculateNormalFare(distanceKm: number): number {
  return calculateJeepneyFare(distanceKm, false);
}

function calculateDiscountedFare(distanceKm: number): number {
  return calculateJeepneyFare(distanceKm, true);
}

function formatPhp(value: number): string {
  return `P${value.toFixed(2)}`;
}

function haversineKm(a: Coordinate, b: Coordinate): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const c = 2 * Math.atan2(
    Math.sqrt(sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng),
    Math.sqrt(1 - (sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng)),
  );

  return R * c;
}

function findNearestKnownPlace(coord: Coordinate, maxDistanceKm = 2): DatasetPlace | null {
  let nearest: DatasetPlace | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const place of dataset.places) {
    const distance = haversineKm(coord, place.coordinate);
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = place;
    }
  }

  if (!nearest || bestDistance > maxDistanceKm) return null;
  return nearest;
}

function findPlaceMentions(rawText: string): PlaceMention[] {
  const normalized = ` ${normalizeText(rawText)} `;
  const byPlace = new Map<string, PlaceMention>();

  for (const item of aliasIndex) {
    const needle = ` ${item.alias} `;
    const idx = normalized.indexOf(needle);
    if (idx === -1) continue;

    const existing = byPlace.get(item.place.id);
    if (!existing || idx < existing.index) {
      byPlace.set(item.place.id, { place: item.place, index: idx });
    }
  }

  return Array.from(byPlace.values()).sort((a, b) => a.index - b.index);
}

function parseFareEndpoints(
  normalized: string,
  mentions: PlaceMention[],
): { origin?: DatasetPlace; destination?: DatasetPlace } {
  if (mentions.length === 0) return {};

  const hasFromToken = /\b(from|mula|galing|coming from|aling)\b/.test(normalized);
  const hasToToken = /\b(to|papunta|going to|hanggang|toward|destination)\b/.test(normalized);

  if (mentions.length >= 2 && (hasFromToken || hasToToken)) {
    return {
      origin: mentions[0].place,
      destination: mentions[mentions.length - 1].place,
    };
  }

  if (mentions.length >= 2 && !hasFromToken && !hasToToken) {
    return {
      origin: mentions[0].place,
      destination: mentions[1].place,
    };
  }

  if (hasFromToken) {
    return { origin: mentions[0].place };
  }

  return { destination: mentions[0].place };
}

function squashRepeatedChars(value: string): string {
  return value.replace(/(.)\1{2,}/g, '$1');
}

function uniqueHints(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const raw of values) {
    const value = normalizeText(raw);
    if (!value || value.length < 3) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    output.push(value);
  }

  return output;
}

function uniqueLanguageHints(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const raw of values) {
    const value = normalizeText(raw);
    if (!value || value.length < 2) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    output.push(value);
  }

  return output;
}

function extractDestinationHints(normalized: string): string[] {
  const hints: string[] = [normalized];
  const patterns = [
    /\b(?:to|papunta|going to|destination|dest|sa)\s+([a-z0-9\s]{2,})$/,
    /\b(?:its|it is|it s|ay|is)\s+([a-z0-9\s]{2,})$/,
    /\b(?:want to go|gusto ko pumunta|gusto ko magpunta|dalhin mo ko|dalhin mo ako)\s+(?:to|sa)?\s*([a-z0-9\s]{2,})$/,
  ];

  for (const pattern of patterns) {
    const matched = normalized.match(pattern);
    if (matched?.[1]) {
      hints.push(matched[1]);
    }
  }

  return uniqueHints(hints.map((hint) => squashRepeatedChars(hint)));
}

function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[rows - 1][cols - 1];
}

function buildStopDestinations(routes: JeepneyRoute[]): StopDestination[] {
  const byLabel = new Map<string, StopDestination>();

  const addCandidate = (name: string | undefined, coordinate?: Coordinate) => {
    if (!name || !coordinate) return;
    const normalizedLabel = normalizeText(name);
    if (!normalizedLabel || normalizedLabel.length < 3) return;
    if (!byLabel.has(normalizedLabel)) {
      byLabel.set(normalizedLabel, {
        name: name.trim(),
        coordinate,
      });
    }
  };

  for (const route of routes) {
    const firstStop = route.stops?.[0];
    const lastStop = route.stops?.[route.stops.length - 1];
    const firstCoord: Coordinate | undefined = firstStop
      ? { latitude: firstStop.coordinate.latitude, longitude: firstStop.coordinate.longitude }
      : route.coordinates?.[0]
        ? { latitude: route.coordinates[0].latitude, longitude: route.coordinates[0].longitude }
        : undefined;
    const lastCoord: Coordinate | undefined = lastStop
      ? { latitude: lastStop.coordinate.latitude, longitude: lastStop.coordinate.longitude }
      : route.coordinates?.[route.coordinates.length - 1]
        ? {
          latitude: route.coordinates[route.coordinates.length - 1].latitude,
          longitude: route.coordinates[route.coordinates.length - 1].longitude,
        }
        : undefined;

    addCandidate(route.properties.fromLabel, firstCoord);
    addCandidate(route.properties.toLabel, lastCoord);

    const routeName = route.properties.name || '';
    const split = routeName.match(/^(.+?)\s*(?:->| to | - )\s*(.+)$/i);
    if (split) {
      addCandidate(split[1], firstCoord);
      addCandidate(split[2], lastCoord);
    }

    for (const stop of route.stops || []) {
      addCandidate(stop.label, {
        latitude: stop.coordinate.latitude,
        longitude: stop.coordinate.longitude,
      });
    }
  }

  return Array.from(byLabel.values());
}

function findStopDestinationByHints(normalized: string, routes: JeepneyRoute[]): StopDestination | null {
  const stops = buildStopDestinations(routes);
  if (stops.length === 0) return null;

  const hints = extractDestinationHints(normalized);
  let best: StopDestination | null = null;
  let bestScore = 0;

  for (const stop of stops) {
    const stopNormalized = normalizeText(stop.name);
    const stopSquashed = squashRepeatedChars(stopNormalized);

    for (const hint of hints) {
      let score = 0;

      if (hintMatches(` ${hint} `, stopNormalized) || stopNormalized.includes(hint) || hint.includes(stopNormalized)) {
        score = 110 + Math.min(stopNormalized.length, hint.length);
      } else {
        const oneWordHint = hint.split(' ').filter(Boolean).length === 1;
        const oneWordStop = stopSquashed.split(' ').filter(Boolean).length === 1;
        if (oneWordHint && oneWordStop && hint.length >= 5 && stopSquashed.length >= 5) {
          const dist = levenshteinDistance(hint, stopSquashed);
          const maxLen = Math.max(hint.length, stopSquashed.length);
          if (dist <= 2 || (maxLen >= 8 && dist <= 3)) {
            score = 80 - dist * 10;
          }
        }
      }

      if (score > bestScore) {
        bestScore = score;
        best = stop;
      }
    }
  }

  return bestScore >= 70 ? best : null;
}

function toDestinationPoint(place: DatasetPlace): DestinationPoint {
  return {
    name: place.name,
    coordinate: place.coordinate,
    placeId: place.id,
  };
}

function buildClarificationAck(language: BotLanguage): string {
  if (language === 'tl') {
    return pickRandom([
      'Ayun, gets ko na. Salamat sa paglilinaw mo.',
      'Sakto, malinaw na ngayon. Salamat sa correction.',
      'Nice, naintindihan ko na. Salamat sa pag-clarify.',
    ]);
  }

  return pickRandom([
    'Oh, got it now. Thanks for clarifying that.',
    'Nice, I understand it now. Thanks for the correction.',
    'Perfect, that makes it clearer. Thanks for clarifying.',
  ]);
}

function statePendingDestination(currentState: ChatbotConversationState): DestinationPoint | null {
  if (!currentState.pendingDestinationName || !currentState.pendingDestinationCoordinate) return null;

  return {
    name: currentState.pendingDestinationName,
    coordinate: currentState.pendingDestinationCoordinate,
    placeId: currentState.pendingDestinationPlaceId,
  };
}

function buildDestinationClarifyingQuestion(language: BotLanguage, destinationName: string): string {
  if (language === 'tl') {
    return [
      `Nakuha ko ang destination na ${destinationName}.`,
      'Quick clarify lang: gusto mo ba ng route roadmap o fare estimate?',
      'Kung hindi ka magbigay ng origin, current location mo ang gagamitin ko bilang simula.',
    ].join('\n\n');
  }

  return [
    `I got your destination as ${destinationName}.`,
    'Quick clarification: do you want a route roadmap or a fare estimate?',
    'If you do not provide an origin, I will use your current location as the default start point.',
  ].join('\n\n');
}

function buildGeneralClarifyingQuestion(language: BotLanguage): string {
  if (language === 'tl') {
    return [
      'Medyo kulang o putol ang details, kaya gusto ko munang mag-clarify.',
      'Pwede mong sabihin kung alin ang kailangan mo: route roadmap, fare estimate, o app guide.',
      'Tip: mas mabilis kung may destination ka, at optional ang origin dahil pwede kong gamitin ang current location mo.',
    ].join('\n\n');
  }

  return [
    'Your message looks a bit short or incomplete, so I want to clarify first.',
    'Please tell me what you need: a route roadmap, a fare estimate, or app guidance.',
    'Tip: sharing a destination helps a lot, and origin is optional because I can default to your current location.',
  ].join('\n\n');
}

function looksCutOffInput(normalized: string): boolean {
  return /(to|from|sa|papunta|papuntang|mula|galing|towards?|destination|origin)$/.test(normalized)
    || /(i want to go|gusto ko pumunta|gusto ko magpunta|help me|patulong|route to|paano pumunta)$/.test(normalized);
}

function shouldAskGeneralClarification(normalized: string): boolean {
  const words = normalized.split(' ').filter(Boolean);
  if (words.length === 0) return false;
  if (looksCutOffInput(normalized)) return true;

  const tooShortSingleWord = words.length === 1 && words[0].length <= 4;
  const tooShortTwoWords = words.length === 2 && normalized.length <= 10;
  return tooShortSingleWord || tooShortTwoWords;
}

function hasFareIntent(normalized: string): boolean {
  if (hasIntentGroup(normalized, 'fare')) return true;

  if (/(fare|pamasahe|magkano|bayad|how much|magkan[o0]|magkano po|how much fare|fare estimate|estimate fare|pamasahe papunta|pamasahe mula|how much should i pay)/.test(normalized)) {
    return true;
  }

  return hasAnyIntentToken(normalized, [
    'fare',
    'pamasahe',
    'magkano',
    'bayad',
    'how much fare',
    'fare estimate',
    'estimate fare',
  ]);
}

function hasRouteIntent(normalized: string): boolean {
  if (hasIntentGroup(normalized, 'route')) return true;

  if (/(route|ruta|navigate|navigation|directions|papunta|paano pumunta|how to go|get there|go to|dalhin|sakay papunta|how do i get|pinpoint|pinned|drop pin|pin location)/.test(normalized)) {
    return true;
  }

  return hasAnyIntentToken(normalized, [
    'route',
    'ruta',
    'navigate',
    'navigation',
    'directions',
    'papunta',
    'paano pumunta',
    'how to go',
    'get there',
    'how do i get',
    'drop pin',
    'pinpoint',
  ]);
}

function hasPinIntent(normalized: string): boolean {
  if (hasIntentGroup(normalized, 'pin')) return true;

  return /(pin|pinned|pinpoint|drop pin|pin location)/.test(normalized)
    || hasAnyIntentToken(normalized, ['pin', 'pinned', 'pinpoint', 'drop pin', 'pin location']);
}

function hasLandmarkIntent(normalized: string): boolean {
  if (hasIntentGroup(normalized, 'landmark')) return true;

  return /(landmark|landmarks|stops|stop list|terminal list|hintuan|palatandaan|anong stop|anong landmark|available stops)/.test(normalized);
}

function hasRouteListIntent(normalized: string): boolean {
  if (hasIntentGroup(normalized, 'route_list')) return true;

  return /(route list|list of routes|list routes|available routes|what routes are available|which routes are available|mga ruta|anong mga ruta|ano mga ruta|lista ng ruta|available na ruta)/.test(normalized);
}

function hasFarePolicyIntent(normalized: string): boolean {
  if (hasIntentGroup(normalized, 'fare_policy')) return true;

  return /(base fare|minimum fare|regular fare|discounted fare|discount fare|student fare|senior fare|pwd fare|fare policy|fare rules|what is the fare right now|fare right now|current fare|magkano base|magkano minimum|magkano student|magkano senior|magkano pwd|pamasahe ngayon|magkano pamasahe ngayon|base pamasahe|discount sa pamasahe)/.test(normalized);
}

function hasCapabilityIntent(normalized: string): boolean {
  if (hasIntentGroup(normalized, 'capability')) return true;

  if (/(what can you do|what can jeepie do|how can you help|capabilities|features|functionality|help menu|anong kaya mo|ano kaya mo|anong pwede mong gawin|paano kita gamitin|pano kita gamitin|tulong mo|help options)/.test(normalized)) {
    return true;
  }

  return hasAnyIntentToken(normalized, [
    'what can you do',
    'what can jeepie do',
    'how can you help',
    'capabilities',
    'features',
    'help options',
    'anong kaya mo',
    'ano kaya mo',
    'tulong mo',
  ]);
}

function hasAchievementIntent(normalized: string): boolean {
  if (hasIntentGroup(normalized, 'achievement')) return true;

  if (/(achievement|achievements|badge|badges|unlock|how to get|paano makuha|route rookie|path explorer|urban navigator|streak)/.test(normalized)) {
    return true;
  }

  return hasAnyIntentToken(normalized, [
    'achievement',
    'achievements',
    'achivement',
    'achivements',
    'badge',
    'badges',
    'unlock',
    'how to get',
    'paano makuha',
  ]);
}

function hasTriviaIntent(normalized: string): boolean {
  if (hasIntentGroup(normalized, 'trivia')) return true;

  if (/(trivia|fun fact|did you know|alam mo ba|fact tungkol|fact about|random fact|kwento trivia|trivia naman)/.test(normalized)) {
    return true;
  }

  return hasAnyIntentToken(normalized, [
    'trivia',
    'fun fact',
    'did you know',
    'alam mo ba',
    'random fact',
  ]);
}

function hasBuilderIntent(normalized: string): boolean {
  return /(who (built|made|created|developed)|sino (gumawa|bumuo|nag build|nagbuo|nag develop)|developer|builders?|creator|creators)/.test(normalized)
    && /(para|app|application)/.test(normalized);
}

function hasBuilderOriginIntent(normalized: string): boolean {
  const asksLocation = /\b(where|saan)\b/.test(normalized);
  const asksCreation = /(created|built|made|developed|prototype|started|origin|ginawa|binuo|sinimulan|nagsimula)/.test(normalized);
  const asksPara = /(para|app|application)/.test(normalized);
  return asksLocation && asksCreation && asksPara;
}

function builderOriginReply(language: BotLanguage): string {
  if (language === 'tl') {
    return "Ang unang prototype ng 'Para' ay ginawa sa Cavite State University - Imus.";
  }

  return "'Para' was first prototyped at Cavite State University - Imus.";
}

function hasFareNewsIntent(normalized: string): boolean {
  if (/(why.*fare|bakit.*pamasahe|tumaas.*pamasahe|fare (increase|hike)|oil price|fuel price|giyera|gyera|war|bakit.*14|from 13 to 14|13 to 14)/.test(normalized)) {
    return true;
  }

  return hasAnyIntentToken(normalized, [
    'fare increase',
    'fare hike',
    'oil price',
    'fuel price',
    'giyera',
    'gyera',
    'war',
  ]);
}

function hasGreetingIntent(normalized: string): boolean {
  if (/^(hi|hello|hey|yo|good morning|good afternoon|good evening|kumusta|kamusta|kumutsa|kamutsa|uy|musta|henlo)(\b|\s|!|\.)/.test(normalized)) {
    return true;
  }

  if (/\b(hi+|hello+|hey+|henlo+|kumusta+|kamusta+|musta+)\b/.test(normalized)) {
    return true;
  }

  if (/\b(hi jeepie|hello jeepie|kumusta jeepie|kamusta jeepie|kumutsa jeepie|kamutsa jeepie|good day jeepie)\b/.test(normalized)) {
    return true;
  }

  return hasAnyIntentToken(normalized, [
    'hi',
    'hello',
    'hey',
    'henlo',
    'kumusta',
    'kamusta',
    'musta',
    'good morning',
    'good afternoon',
    'good evening',
  ]);
}

function hasThanksIntent(normalized: string): boolean {
  return /\b(thanks|thank you|ty|salamat|maraming salamat|tenkyu)\b/.test(normalized)
    || hasAnyIntentToken(normalized, ['thanks', 'thank you', 'salamat', 'maraming salamat', 'tenkyu']);
}

function hasPraiseIntent(normalized: string): boolean {
  return /\b(good job|great job|nice one|wow nice|wow ang galing|ang galing|galing mo|idol|solid mo|amazing|awesome|ang husay|best ka|lupet mo|angas mo)\b/.test(normalized)
    || hasAnyIntentToken(normalized, ['good job', 'great job', 'nice one', 'ang galing', 'awesome', 'amazing', 'angas mo']);
}

function hasGoodbyeIntent(normalized: string): boolean {
  return /\b(bye|goodbye|see you|see ya|ingat|paalam|aalis na ko|aalis na ako|hanggang sa muli|chat later|brb)\b/.test(normalized)
    || hasAnyIntentToken(normalized, ['bye', 'goodbye', 'see you', 'ingat', 'paalam', 'chat later']);
}

function hasUserApologyIntent(normalized: string): boolean {
  return /\b(sorry|pasensya|pasensiya|my bad|patawad)\b/.test(normalized)
    || hasAnyIntentToken(normalized, ['sorry', 'pasensya', 'pasensiya', 'my bad', 'patawad']);
}

function hasAcknowledgementIntent(normalized: string): boolean {
  return /\b(ok|okay|okie|noted|copy|gets|sige|cge|gege|ayt|ayos|opo|oo|noted po|alright|all right|perfect|sounds good|looks good|gotcha|roger)\b/.test(normalized)
    || hasAnyIntentToken(normalized, ['okay', 'noted', 'copy', 'gets', 'sige', 'alright', 'perfect', 'sounds good', 'gotcha', 'roger']);
}

const PURE_SOCIAL_PATTERNS: RegExp[] = [
  /^(hi+|hello+|hey+|yo+|good morning|good afternoon|good evening|kumusta+|kamusta+|kumutsa+|kamutsa+|musta+|uy+|henlo+)( jeepie)?$/,
  /^(thanks+|thank you+|ty+|salamat+|maraming salamat|tenkyu+)( jeepie)?$/,
  /^(good job|great job|nice one|wow nice|wow ang galing|ang galing|galing mo|idol|solid mo|amazing|awesome|ang husay|best ka|lupet mo|angas mo)( jeepie)?$/,
  /^(lol|lmao|lmfao|rofl|haha+|hehe+|hihi+)( jeepie)?$/,
  /^(bye|goodbye|see you|see ya|ingat|paalam|hanggang sa muli|chat later|brb)( jeepie)?$/,
  /^(sorry|pasensya|pasensiya|my bad|patawad)( jeepie)?$/,
  /^(ok|okay|okie|noted|copy|gets|sige|cge|gege|ayt|ayos|opo|oo|noted po|alright|all right|perfect|sounds good|looks good|gotcha|roger|alright perfect|all right perfect|sige perfect)( jeepie)?$/,
];

function isPureSocialMessage(normalized: string): boolean {
  return PURE_SOCIAL_PATTERNS.some((pattern) => pattern.test(normalized));
}

function hasAngerIntent(normalized: string): boolean {
  if (companionAngerTokens.some((token) => hintMatches(normalized, token))) return true;
  return /\b(angry|mad|upset|annoyed|frustrated|irritated|inis|galit|badtrip|bwisit|bwiset|nakakainis|nakakagalit|nafrustrate|na frustrate|stressed out|pikon)\b/.test(normalized);
}

function hasEmpathyIntent(normalized: string): boolean {
  if (companionEmpathyTokens.some((token) => hintMatches(normalized, token))) return true;
  return /\b(sad|down|lonely|anxious|anxiety|stressed|stress|overwhelmed|pagod|lungkot|malungkot|naiiyak|nahihirapan|hirap na|nakakapagod|kabado|kinakabahan|burned out|burnout)\b/.test(normalized);
}

function hasSuccessIntent(normalized: string): boolean {
  if (companionSuccessTokens.some((token) => hintMatches(normalized, token))) return true;
  return /\b(i did it|we did it|naabot ko|nagawa ko|nakarating ako|nakapasa ako|success|succeeded|passed|done na|tapos na|na solve|naayos ko|achievement unlocked|na unlock|na-unlock|panalo|yay)\b/.test(normalized);
}

function hasPowerWordsIntent(normalized: string): boolean {
  return companionPowerWordTokens.some((token) => hintMatches(normalized, token));
}

function hasLaughterIntent(normalized: string): boolean {
  if (companionLaughterTokens.some((token) => hintMatches(normalized, token))) return true;

  return /\b(lol|lmao|lmfao|rofl)\b/.test(normalized)
    || /\b(ha){2,}[a-z]*\b/.test(normalized)
    || /\b(he){2,}[a-z]*\b/.test(normalized)
    || /\b(hi){2,}[a-z]*\b/.test(normalized);
}

function hasProfanityIntent(normalized: string): boolean {
  if (companionCurseWordTokens.some((token) => hintMatches(normalized, token))) return true;

  return /\b(fck|wtf|fuck|fucking|shit|bitch|asshole|dumb|dumbass|idiot|moron|stupid|putangina|putang ina|potangina|potang ina|tangina|taena|pota|pakyu|gago|tanga|ulol|bobo|punyeta|bwiset|bwisit|tarantado|kupal|inutil|demonyo|hayop|hayup|lintik)\b/.test(normalized);
}

type ProfanitySeverity = 'none' | 'mild' | 'heavy';

function countProfanityOccurrences(normalized: string): number {
  let total = 0;

  for (const token of companionCurseWordTokens) {
    const pattern = new RegExp(`\\b${escapeRegExp(token)}\\b`, 'g');
    const matches = normalized.match(pattern);
    if (matches) {
      total += matches.length;
    }
  }

  return total;
}

function lastUserMessageWasProfane(history: ChatbotHistoryMessage[]): boolean {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i];
    if (!entry.isUser) continue;

    const normalized = normalizeIntentText(entry.text || '');
    return Boolean(normalized) && hasProfanityIntent(normalized);
  }

  return false;
}

function classifyProfanitySeverity(normalized: string, history: ChatbotHistoryMessage[]): ProfanitySeverity {
  if (!hasProfanityIntent(normalized)) return 'none';

  const repeatedInCurrentMessage = countProfanityOccurrences(normalized) >= 2;
  const repeatedAcrossTurns = lastUserMessageWasProfane(history);

  if (repeatedInCurrentMessage || repeatedAcrossTurns) {
    return 'heavy';
  }

  return 'mild';
}

function hasCancelIntent(normalized: string): boolean {
  return /\b(cancel|cancel it|stop|stop it|never\s?mind|nvm|forget it|forget that|scratch that|ignore that|drop it|skip muna|pass muna|wag na|huwag na|ayoko na|hindi na|di na)\b/.test(normalized);
}

function hasPendingFollowUpState(state: ChatbotConversationState): boolean {
  return Boolean(
    state.awaitingDestinationIntent
    || state.awaitingOriginIntent
    || state.awaitingOriginForDestinationId
    || state.destinationPromptCount
    || state.pendingDestinationName
    || state.pendingDestinationCoordinate
    || state.pendingDestinationPlaceId,
  );
}

function buildCancelFollowUpReply(language: BotLanguage): string {
  if (language === 'tl') {
    return [
      'Sige, ititigil ko muna ang pending na route/fare follow-up.',
      'Pwede ka nang magtanong ng ibang bagay anytime, tulad ng trivia o app guide.',
    ].join('\n\n');
  }

  return [
    'Sure, I will stop the pending route/fare follow-up now.',
    'You can ask me something else anytime, like trivia or app guidance.',
  ].join('\n\n');
}

const MAX_DESTINATION_REPROMPTS = 1;

function nextDestinationRepromptState(
  currentState: ChatbotConversationState,
  intent: 'fare' | 'route',
): ChatbotConversationState | null {
  const nextCount = currentState.awaitingDestinationIntent === intent
    ? (currentState.destinationPromptCount ?? 0) + 1
    : 1;

  if (nextCount > MAX_DESTINATION_REPROMPTS) return null;

  return {
    awaitingDestinationIntent: intent,
    destinationPromptCount: nextCount,
  };
}

function buildDestinationRepromptLimitReply(language: BotLanguage): string {
  if (language === 'tl') {
    return [
      'Mukhang hindi ko pa makuha ang exact destination mo, kaya hihinto muna ako sa paulit-ulit na tanong.',
      'Pwede mong i-type ang buong place name (hal. Vermosa), o mag-switch tayo sa ibang topic tulad ng trivia.',
    ].join('\n\n');
  }

  return [
    'I still cannot get your exact destination, so I will stop repeating the same destination prompt.',
    'You can type the full place name (for example, Vermosa), or switch to another topic like trivia.',
  ].join('\n\n');
}

function hasCommuteTaskIntent(normalized: string): boolean {
  if (
    hasIntentGroup(normalized, 'fare')
    || hasIntentGroup(normalized, 'route')
    || hasIntentGroup(normalized, 'pin')
    || hasIntentGroup(normalized, 'landmark')
    || hasIntentGroup(normalized, 'route_list')
    || hasIntentGroup(normalized, 'fare_policy')
    || hasIntentGroup(normalized, 'capability')
    || hasIntentGroup(normalized, 'achievement')
    || hasIntentGroup(normalized, 'trivia')
  ) {
    return true;
  }

  return /(fare|pamasahe|route|ruta|destination|papunta|where|saan|how to go|paano pumunta|terminal|stop|transit|jeepney|tricycle|from|mula|galing|to |going to|trivia|fun fact|did you know|alam mo ba|app|application|saved|achievements|profile|settings|pinpoint|pinned|drop pin|base fare|discounted fare|what can you do|anong kaya mo|mga ruta|route list|vermosa|how to get to|papuntang)/.test(normalized);
}

function findRouteTypo(normalized: string): string | null {
  if (hasRouteIntent(normalized)) return null;

  const words = normalized.split(' ').filter(Boolean);
  for (const word of words) {
    if (word.length < 4 || word.length > 8) continue;
    if (!/^[a-z]+$/.test(word)) continue;

    const singular = word.endsWith('s') ? word.slice(0, -1) : word;
    if (singular === 'route') continue;
    if (!singular.startsWith('r')) continue;

    const distance = levenshteinDistance(singular, 'route');
    if (distance <= 2) {
      return word;
    }
  }

  return null;
}

function buildRouteTypoReply(language: BotLanguage): string {
  if (language === 'tl') {
    return [
      'May typo ata sa message mo.',
      'Do you mean route?',
      'Kung route help ito, sabihin mo lang ang destination mo at gagawan kita ng guide.',
    ].join('\n\n');
  }

  return [
    'I think there is a small typo in your message.',
    'Do you mean route?',
    'If you need route help, send your destination and I will guide you step by step.',
  ].join('\n\n');
}

const DEFAULT_APP_GUIDE_ALIAS_TO_ID: Record<string, string> = {
  saved: 'saved',
  'saved routes': 'saved',
  favorite: 'saved',
  favorites: 'saved',
  favourite: 'saved',
  favourites: 'saved',
  bookmark: 'saved',
  bookmarks: 'saved',
  achievement: 'achievements',
  achievements: 'achievements',
  achivement: 'achievements',
  achivements: 'achievements',
  acheivement: 'achievements',
  acheivements: 'achievements',
  badge: 'achievements',
  badges: 'achievements',
  profile: 'profile_settings',
  settings: 'profile_settings',
  account: 'profile_settings',
  'account settings': 'profile_settings',
  search: 'search_and_pin',
  pin: 'search_and_pin',
  'pin location': 'search_and_pin',
  'drop pin': 'search_and_pin',
  pinpoint: 'search_and_pin',
  chatbot: 'chatbot_help',
  jeepie: 'chatbot_help',
  capabilities: 'jeepie_capabilities',
  features: 'jeepie_capabilities',
};

function buildAppGuideAliasMap(source?: Record<string, string>): Record<string, string> {
  const merged: Record<string, string> = { ...DEFAULT_APP_GUIDE_ALIAS_TO_ID };
  if (!source) return merged;

  for (const [rawAlias, rawGuideId] of Object.entries(source)) {
    const alias = normalizeText(rawAlias);
    const guideId = rawGuideId.trim();
    if (!alias || !guideId) continue;
    merged[alias] = guideId;
  }

  return merged;
}

const APP_GUIDE_ALIAS_TO_ID: Record<string, string> = buildAppGuideAliasMap(dataset.appGuideAliasMap);

function findAppGuideById(id?: string): DatasetAppGuide | null {
  if (!id) return null;
  return (dataset.appGuides || []).find((guide) => guide.id === id) || null;
}

function findAppGuideByAliases(normalized: string): DatasetAppGuide | null {
  let bestId: string | null = null;
  let bestScore = 0;

  for (const [alias, guideId] of Object.entries(APP_GUIDE_ALIAS_TO_ID)) {
    if (!matchesIntentHint(normalized, alias)) continue;
    const score = normalizeText(alias).length;
    if (score > bestScore) {
      bestScore = score;
      bestId = guideId;
    }
  }

  return bestId ? findAppGuideById(bestId) : null;
}

function isLikelyAppGuideFollowUp(normalized: string): boolean {
  const shortMessage = normalized.split(' ').filter(Boolean).length <= 5;
  return shortMessage
    || /\b(how about|what about|about|next|also|then|naman|paano naman|eh yung|eh yong|yung|yong)\b/.test(normalized);
}

function findAppGuideFromConversationContext(
  normalized: string,
  currentState: ChatbotConversationState,
): DatasetAppGuide | null {
  if (currentState.lastTopic !== 'app-guide') return null;
  if (!isLikelyAppGuideFollowUp(normalized)) return null;

  return findAppGuideByAliases(normalized)
    || findAppGuide(normalized)
    || findAppGuideById(currentState.lastAppGuideId);
}

function findAppGuide(normalized: string): DatasetAppGuide | null {
  let bestGuide: DatasetAppGuide | null = null;
  let bestScore = 0;

  for (const guide of dataset.appGuides || []) {
    for (const rawIntent of guide.intents || []) {
      const intent = normalizeText(rawIntent);
      if (!intent) continue;
      if (!matchesIntentHint(normalized, intent)) continue;

      const score = intent.length;
      if (score > bestScore) {
        bestScore = score;
        bestGuide = guide;
      }
    }
  }

  return bestGuide;
}

function pickAppGuideReply(guide: DatasetAppGuide, language: BotLanguage): string {
  const options = language === 'tl' ? guide.tl : guide.en;
  return formatForChatDisplay(pickRandom(options));
}

function routeResponseText(
  language: BotLanguage,
  key: keyof DatasetShape['routeResponses'],
): string {
  return formatForChatDisplay(pickLocalized(dataset.routeResponses[key], language));
}

function findBadgeMention(normalized: string): Badge | null {
  let bestBadge: Badge | null = null;
  let bestScore = 0;

  for (const item of badgeAliasIndex) {
    if (!item.alias) continue;
    if (!hintMatches(normalized, item.alias)) continue;

    const score = item.alias.length;
    if (score > bestScore) {
      bestScore = score;
      bestBadge = item.badge;
    }
  }

  return bestBadge;
}

function badgeRequirementTl(badge: Badge): string {
  const desc = badge.description.toLowerCase();
  let m: RegExpMatchArray | null;

  if (desc.includes('complete your first route trip')) return 'Kumpletuhin ang unang route trip mo.';
  m = desc.match(/^use (\d+) different routes/);
  if (m) return `Gumamit ng ${m[1]} na magkakaibang ruta.`;
  m = desc.match(/^complete (\d+) trips?/);
  if (m) return `Kumpletuhin ang ${m[1]} na trips.`;
  m = desc.match(/^travel across (\d+) different cities/);
  if (m) return `Makabiyahe sa ${m[1]} magkakaibang lungsod.`;
  m = desc.match(/^travel a total of (\d+) km/);
  if (m) return `Umabot sa kabuuang ${m[1]} km na biyahe.`;
  m = desc.match(/^save .*?(\d+)/);
  if (m) return `Makapag-ipon o makatipid ng total na ${m[1]}.`;
  m = desc.match(/^maintain a (\d+)-day streak/);
  if (m) return `Panatilihin ang ${m[1]}-day streak.`;
  if (desc.includes('consecutive days')) return 'Gamitin ang app nang sunod-sunod na araw ayon sa requirement.';
  if (desc.includes('fare calculator')) return 'Gamitin ang fare calculator ayon sa target count.';
  if (desc.includes('compare')) return 'Mag-compare ng routes sa iisang session ayon sa target count.';
  if (desc.includes('terminals')) return 'Bumisita sa required na bilang ng magkakaibang terminals.';
  if (desc.includes('stops')) return 'Bumisita sa required na bilang ng unique stops.';
  return `Sundin ang requirement na ito: ${badge.description}`;
}

function badgeTip(language: BotLanguage, badge: Badge): string {
  const d = badge.description.toLowerCase();

  if (language === 'tl') {
    if (d.includes('streak') || d.includes('consecutive days')) {
      return 'Tip: Mag-open at gumamit ng app araw-araw para tuloy-tuloy ang streak progress.';
    }
    if (d.includes('distance') || d.includes('km')) {
      return 'Tip: Pumili ng mas mahahabang ruta para mas mabilis umakyat ang distance progress.';
    }
    if (d.includes('fare') || d.includes('budget') || d.includes('save')) {
      return 'Tip: Gamitin ang fare tools at cheapest route options para ma-hit ang finance-related badges.';
    }
    if (d.includes('map')) {
      return 'Tip: Buksan ang map screen nang mas madalas habang nagpa-plano ng biyahe.';
    }
    if (d.includes('compare') || d.includes('details')) {
      return 'Tip: I-review muna ang route options/details bago pumili para ma-track ang badge na ito.';
    }
    return 'Tip: Sundin lang ang required activity sa bawat biyahe at regular na gamitin ang app.';
  }

  if (d.includes('streak') || d.includes('consecutive days')) {
    return 'Tip: Open and use the app daily to keep your streak progress active.';
  }
  if (d.includes('distance') || d.includes('km')) {
    return 'Tip: Pick longer routes to increase distance progress faster.';
  }
  if (d.includes('fare') || d.includes('budget') || d.includes('save')) {
    return 'Tip: Use fare tools and cheapest-route options to progress finance-related badges.';
  }
  if (d.includes('map')) {
    return 'Tip: Open the map screen more often while planning trips.';
  }
  if (d.includes('compare') || d.includes('details')) {
    return 'Tip: Review route options/details before selecting to progress this badge faster.';
  }
  return 'Tip: Keep completing the required activity consistently during your trips.';
}

function buildAchievementReply(language: BotLanguage, badge: Badge | null): string {
  if (!badge) {
    const sample = BADGES.slice(0, 8).map((b) => b.name).join(', ');
    if (language === 'tl') {
      return [
        'Pwede kitang tulungan sa badge achievements.',
        `Halimbawa ng pwede mong itanong: ${sample}.`,
        'Sabihin mo lang ang exact badge name (hal. Route Rookie) para ma-explain ko kung paano ito makuha.',
      ].join('\n\n');
    }

    return [
      'I can help explain badge achievements.',
      `Examples you can ask: ${sample}.`,
      'Just send the exact badge name (for example, Route Rookie), and I will explain how to unlock it.',
    ].join('\n\n');
  }

  if (language === 'tl') {
    return [
      `Para ma-unlock ang ${badge.name}, ito ang kailangan mong gawin:`,
      `Requirement: ${badgeRequirementTl(badge)}`,
      `Target: ${badge.goal}`,
      badgeTip(language, badge),
    ].join('\n\n');
  }

  return [
    `To unlock ${badge.name}, here is the requirement:`,
    `Requirement: ${badge.description}`,
    `Target: ${badge.goal}`,
    badgeTip(language, badge),
  ].join('\n\n');
}

function uniqueText(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    const key = normalizeText(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }

  return output;
}

function routeLabel(route: JeepneyRoute): string {
  const code = route.properties.code?.trim();
  const name = route.properties.name?.trim();
  if (code && name) return `${code} (${name})`;
  return code || name || 'Selected route';
}

function findMentionedRoute(normalized: string, routes: JeepneyRoute[]): JeepneyRoute | null {
  let best: JeepneyRoute | null = null;
  let bestScore = 0;

  for (const route of routes) {
    const candidates = [route.properties.code, route.properties.name]
      .filter((value): value is string => Boolean(value && value.trim()))
      .map((value) => normalizeText(value));

    for (const candidate of candidates) {
      if (!candidate) continue;
      if (!hintMatches(normalized, candidate)) continue;
      if (candidate.length > bestScore) {
        bestScore = candidate.length;
        best = route;
      }
    }
  }

  return best;
}

function buildLandmarkReply(language: BotLanguage, normalized: string, routes: JeepneyRoute[]): string {
  const mentionedRoute = findMentionedRoute(normalized, routes);

  const routeLandmarks = (route: JeepneyRoute): string[] => {
    const stopNames = (route.stops || []).map((stop) => stop.label);
    const endpoints = [route.properties.fromLabel, route.properties.toLabel].filter(
      (value): value is string => Boolean(value && value.trim()),
    );
    return uniqueText([...stopNames, ...endpoints]);
  };

  if (mentionedRoute) {
    const routeStops = routeLandmarks(mentionedRoute);
    if (routeStops.length === 0) {
      return routeDataUnavailableReply();
    }

    const intro = template(routeResponseText(language, 'landmarkRouteIntro'), {
      route: routeLabel(mentionedRoute),
    });
    const shown = routeStops.slice(0, 18);
    const rest = routeStops.length - shown.length;
    const numbered = shown.map((name, index) => `${index + 1}. ${name}`).join('\n');
    const more = rest > 0
      ? (language === 'tl' ? `\n... at ${rest} pang stops.` : `\n... and ${rest} more stops.`)
      : '';

    return [intro, `${numbered}${more}`, routeResponseText(language, 'landmarkListOutro')].join('\n\n');
  }

  const routeStops = uniqueText(
    routes.flatMap((route) => routeLandmarks(route)),
  );
  const fallbackPlaces = uniqueText(dataset.places.map((place) => place.name));
  const allLandmarks = routeStops.length > 0 ? routeStops : fallbackPlaces;

  if (allLandmarks.length === 0) {
    return infoUnavailableReply();
  }

  const shown = allLandmarks.slice(0, 20);
  const rest = allLandmarks.length - shown.length;
  const numbered = shown.map((name, index) => `${index + 1}. ${name}`).join('\n');
  const more = rest > 0
    ? (language === 'tl' ? `\n... at ${rest} pang landmarks/stops.` : `\n... and ${rest} more landmarks/stops.`)
    : '';

  return [
    routeResponseText(language, 'landmarkListIntro'),
    `${numbered}${more}`,
    routeResponseText(language, 'landmarkListOutro'),
  ].join('\n\n');
}

function routeContainsPlace(route: JeepneyRoute, place: DatasetPlace): boolean {
  const stopLabels = [
    ...(route.stops || []).map((stop) => normalizeText(stop.label)),
    normalizeText(route.properties.fromLabel || ''),
    normalizeText(route.properties.toLabel || ''),
  ].filter(Boolean);
  if (stopLabels.length === 0) return false;

  const names = uniqueText([place.name, ...place.aliases])
    .map((value) => normalizeText(value))
    .filter((value) => value.length >= 4);

  if (names.length === 0) return false;

  return names.some((name) => stopLabels.some((label) => label.includes(name)));
}

function buildRouteListReply(language: BotLanguage, routes: JeepneyRoute[], destination?: DatasetPlace): string {
  if (routes.length === 0) {
    return infoUnavailableReply();
  }

  const filtered = destination ? routes.filter((route) => routeContainsPlace(route, destination)) : routes;
  const candidates = filtered.length > 0 ? filtered : routes;
  const labels = uniqueText(candidates.map((route) => routeLabel(route)));

  const shown = labels.slice(0, 16);
  const rest = labels.length - shown.length;
  const numbered = shown.map((label, index) => `${index + 1}. ${label}`).join('\n');
  const more = rest > 0
    ? (language === 'tl' ? `\n... at ${rest} pang routes.` : `\n... and ${rest} more routes.`)
    : '';

  if (language === 'tl') {
    const intro = destination
      ? `Ito ang mga available routes na may stop/landmark na tumutugma sa ${destination.name}:`
      : 'Narito ang available routes na loaded ngayon:';

    const note = destination && filtered.length === 0
      ? `Wala akong eksaktong route-stop match para sa ${destination.name}, kaya nilista ko muna ang lahat ng available routes.`
      : 'Kung gusto mo, pwede kong i-filter pa ito batay sa origin at destination mo.';

    return [intro, `${numbered}${more}`, note].join('\n\n');
  }

  const intro = destination
    ? `Here are available routes with stop/landmark matches for ${destination.name}:`
    : 'Here are the available routes currently loaded:';

  const note = destination && filtered.length === 0
    ? `I could not find an exact route-stop match for ${destination.name}, so I listed all currently available routes first.`
    : 'If you want, I can filter this further based on your exact origin and destination.';

  return [intro, `${numbered}${more}`, note].join('\n\n');
}

function buildFarePolicyReply(language: BotLanguage): string {
  const baseFare = JEEPNEY_BASE_FARE_REGULAR;
  const discountedBase = JEEPNEY_BASE_FARE_DISCOUNTED;
  const baseDistance = JEEPNEY_BASE_DISTANCE_KM;
  const additionalPerKm = JEEPNEY_PER_KM_RATE;

  if (language === 'tl') {
    return [
      'Narito ang current jeepney fare policy ni Jeepie:',
      `1. Regular base fare: ${formatPhp(baseFare)} para sa unang ${baseDistance} km.`,
      `2. Discounted base fare (student/senior/PWD): ${formatPhp(discountedBase)} para sa unang ${baseDistance} km.`,
      `3. Kapag lampas ${baseDistance} km, may dagdag na +${formatPhp(additionalPerKm)} kada susunod na billable km.`,
    ].join('\n\n');
  }

  return [
    'Here is Jeepie\'s current jeepney fare policy:',
    `1. Regular base fare: ${formatPhp(baseFare)} for the first ${baseDistance} km.`,
    `2. Discounted base fare (student/senior/PWD): ${formatPhp(discountedBase)} for the first ${baseDistance} km.`,
    `3. Once beyond ${baseDistance} km, an additional +${formatPhp(additionalPerKm)} is added per next billable km.`,
  ].join('\n\n');
}

function buildCapabilitiesReply(language: BotLanguage): string {
  if (language === 'tl') {
    return [
      'Ito ang mga kaya kong gawin ngayon bilang Jeepie:',
      '1. Mag-estimate ng regular at discounted fare (student/senior/PWD).',
      '2. Mag-suggest ng route flow gamit ang origin, destination, at GPS/pinned location kung available.',
      '3. Maglista ng available routes, landmarks, at stops mula sa loaded route data.',
      '4. Magpaliwanag kung paano i-unlock ang specific achievement badges (hal. Route Rookie).',
      '5. Mag-guide sa app usage: Saved, Profile, Settings, Search/Pin, at Achievements.',
      '6. Magbigay ng jeepney/tricycle trivia at fare-news context kapag tinanong.',
      'Subukan mo: "Magkano from Imus Crossing to PITX", "Anong routes available", o "Paano makuha ang Route Rookie".',
    ].join('\n\n');
  }

  return [
    'Here is what I can do right now as Jeepie:',
    '1. Estimate regular and discounted fares (student/senior/PWD).',
    '2. Suggest route flow using origin, destination, and GPS/pinned location when available.',
    '3. List available routes, landmarks, and stops from loaded route data.',
    '4. Explain how to unlock specific achievement badges (for example, Route Rookie).',
    '5. Guide app usage: Saved, Profile, Settings, Search/Pin, and Achievements.',
    '6. Share jeepney/tricycle trivia and fare-news context when asked.',
    'Try asking: "How much from Imus Crossing to PITX", "What routes are available", or "How to unlock Route Rookie".',
  ].join('\n\n');
}

function isInScope(normalized: string): boolean {
  return dataset.topicKeywords.some((keyword) => normalized.includes(normalizeText(keyword)));
}

function getFarePair(originId: string, destinationId: string): DatasetFarePair | null {
  for (const pair of dataset.farePairs) {
    const directMatch = pair.originId === originId && pair.destinationId === destinationId;
    const reverseMatch = pair.originId === destinationId && pair.destinationId === originId;
    if (directMatch || reverseMatch) return pair;
  }
  return null;
}

function estimateFare(
  origin: Coordinate,
  destination: DestinationPoint,
  routes: JeepneyRoute[],
  originPlace?: DatasetPlace,
  destinationPlace?: DatasetPlace,
): EstimateResult | null {
  if (routes.length > 0) {
    const matched = rankRoutes(
      findRoutesForDestination(origin, destination.coordinate, routes),
      'easiest',
    );

    const best = matched[0];
    if (best && best.legs.length > 0) {
      const distanceKm = best.legs.reduce((sum, leg) => sum + leg.distanceKm, 0);
      const normalFare = best.legs.reduce((sum, leg) => {
        return sum + calculateNormalFare(Math.max(leg.distanceKm, 0.05));
      }, 0);
      const discountedFare = best.legs.reduce((sum, leg) => {
        return sum + calculateDiscountedFare(Math.max(leg.distanceKm, 0.05));
      }, 0);

      const routeHint = best.legs
        .map((leg) => leg.route.properties.code || leg.route.properties.name || 'Jeepney Route')
        .join(' -> ');

      return {
        distanceKm,
        normalFare: Number(normalFare.toFixed(2)),
        discountedFare,
        routeHint,
      };
    }
  }

  if (originPlace) {
    const pair = destinationPlace ? getFarePair(originPlace.id, destinationPlace.id) : null;
    if (pair) {
      const normalFare = calculateNormalFare(pair.distanceKm);
      return {
        distanceKm: pair.distanceKm,
        normalFare,
        discountedFare: calculateDiscountedFare(pair.distanceKm),
        routeHint: pair.jeepneyRouteHint,
      };
    }
  }

  return null;
}

function findRoutePlan(
  origin: Coordinate,
  destination: DestinationPoint,
  routes: JeepneyRoute[],
  originPlace?: DatasetPlace,
  destinationPlace?: DatasetPlace,
): RoutePlanResult | null {
  if (routes.length > 0) {
    const matched = rankRoutes(
      findRoutesForDestination(origin, destination.coordinate, routes),
      'easiest',
    );

    const best = matched[0];
    if (best && best.legs.length > 0) {
      const routeNames = best.legs.map((leg) => leg.route.properties.code || leg.route.properties.name || 'Jeepney route');
      const distanceKm = best.legs.reduce((sum, leg) => sum + leg.distanceKm, 0);
      const estimatedFare = Number(
        best.legs
          .reduce((sum, leg) => sum + calculateNormalFare(Math.max(leg.distanceKm, 0.05)), 0)
          .toFixed(2),
      );

      return {
        routeNames,
        distanceKm,
        estimatedMinutes: Math.max(1, Math.round(best.estimatedMinutes)),
        estimatedFare,
      };
    }
  }

  if (originPlace) {
    const pair = destinationPlace ? getFarePair(originPlace.id, destinationPlace.id) : null;
    if (pair) {
      return {
        routeNames: [pair.jeepneyRouteHint],
        distanceKm: pair.distanceKm,
        estimatedMinutes: Math.max(5, Math.round((pair.distanceKm / 15) * 60)),
        estimatedFare: calculateNormalFare(pair.distanceKm),
      };
    }
  }

  return null;
}

function buildRouteReply(params: {
  language: BotLanguage;
  originLabel: string;
  destinationLabel: string;
  plan: RoutePlanResult;
  hasPinReference: boolean;
  usedGpsOrigin: boolean;
}): string {
  const { language, originLabel, destinationLabel, plan, hasPinReference, usedGpsOrigin } = params;

  const intro = hasPinReference
    ? `${routeResponseText(language, 'pinAcknowledgement')}\n\n${routeResponseText(language, 'routeFoundIntro')}`
    : routeResponseText(language, 'routeFoundIntro');

  const primaryRoute = plan.routeNames[0] || (language === 'tl' ? 'unang available na ruta' : 'the first available route');

  if (language === 'tl') {
    const steps = [
      usedGpsOrigin
        ? `Mula sa current location mo (${originLabel}), pumunta sa pinakamalapit na sakayan para sa ${primaryRoute}.`
        : `Magsimula sa ${originLabel} at pumunta sa pinakamalapit na sakayan para sa ${primaryRoute}.`,
      `Sumakay sa ${primaryRoute}.`,
      ...plan.routeNames.slice(1).map((routeName) => `Pagkatapos, lumipat sa ${routeName}.`),
      `Bumaba sa pinakamalapit na drop-off point papuntang ${destinationLabel}.`,
    ];

    const routeSteps = steps.map((step, index) => `Step ${index + 1}: ${step}`).join('\n');

    return [
      intro,
      'Ruta:',
      routeSteps,
      'Pamasahe:',
      `Tantyang Pamasahe (Regular): ${formatPhp(plan.estimatedFare)}`,
      'Note: Fare may vary depending on local rates.',
      'Tip:',
      `Tantyang biyahe: mga ${plan.estimatedMinutes} minuto, at tantyang layo: ${plan.distanceKm.toFixed(1)} km. Maghanda ng eksaktong pamasahe kapag kaya.`,
    ].join('\n\n');
  }

  const steps = [
    usedGpsOrigin
      ? `From your current location (${originLabel}), head to the nearest pickup point for ${primaryRoute}.`
      : `Start at ${originLabel} and head to the nearest pickup point for ${primaryRoute}.`,
    `Ride ${primaryRoute}.`,
    ...plan.routeNames.slice(1).map((routeName) => `Then transfer to ${routeName}.`),
    `Drop off at the nearest point heading to ${destinationLabel}.`,
  ];

  const routeSteps = steps.map((step, index) => `Step ${index + 1}: ${step}`).join('\n');

  return [
    intro,
    'Route:',
    routeSteps,
    'Fare:',
    `Estimated Fare (Regular): ${formatPhp(plan.estimatedFare)}`,
    'Note: Fare may vary depending on local rates.',
    'Tip:',
    `Estimated trip: around ${plan.estimatedMinutes} minutes, and estimated distance: ${plan.distanceKm.toFixed(1)} km. Prepare exact fare when possible.`,
  ].join('\n\n');
}

function buildFareReply(params: {
  language: BotLanguage;
  originLabel: string;
  destinationLabel: string;
  estimate: EstimateResult;
  usedGpsLocation: boolean;
}): string {
  const { language, originLabel, destinationLabel, estimate, usedGpsLocation } = params;

  if (language === 'tl') {
    const stepOne = usedGpsLocation
      ? `Mula sa current location mo (${originLabel}), pumunta sa pinakamalapit na sakayan para sa rutang ${estimate.routeHint}.`
      : `Mula ${originLabel}, pumunta sa pinakamalapit na sakayan para sa rutang ${estimate.routeHint}.`;

    return [
      'Ruta:',
      `Step 1: ${stepOne}`,
      `Step 2: Sumakay papuntang ${destinationLabel}.`,
      'Pamasahe:',
      `Tantyang Pamasahe (Regular): ${formatPhp(estimate.normalFare)}`,
      `Tantyang Pamasahe (Student/Senior/PWD): ${formatPhp(estimate.discountedFare)}`,
      'Note: Fare may vary depending on local rates.',
      'Tip:',
      `Tantyang layo: ${estimate.distanceKm.toFixed(1)} km. Maghanda ng eksaktong pamasahe kapag kaya.`,
    ].join('\n\n');
  }

  const stepOne = usedGpsLocation
    ? `From your current location (${originLabel}), head to the nearest pickup point for route ${estimate.routeHint}.`
    : `From ${originLabel}, head to the nearest pickup point for route ${estimate.routeHint}.`;

  return [
    'Route:',
    `Step 1: ${stepOne}`,
    `Step 2: Ride toward ${destinationLabel}.`,
    'Fare:',
    `Estimated Fare (Regular): ${formatPhp(estimate.normalFare)}`,
    `Estimated Fare (Student/Senior/PWD): ${formatPhp(estimate.discountedFare)}`,
    'Note: Fare may vary depending on local rates.',
    'Tip:',
    `Estimated distance: ${estimate.distanceKm.toFixed(1)} km. Prepare exact fare when possible.`,
  ].join('\n\n');
}

function pickTrivia(language: BotLanguage, history?: ChatbotHistoryMessage[]): string {
  const previous = lastAssistantReply(history);
  const previousNormalized = previous ? normalizeForRepeatCheck(previous) : '';

  const triviaPool = previousNormalized
    ? dataset.trivia.filter((item) => {
      const fact = language === 'tl' ? item.tl : item.en;
      const normalizedFact = normalizeForRepeatCheck(fact);
      return !normalizedFact || !previousNormalized.includes(normalizedFact);
    })
    : dataset.trivia;

  const entry = pickRandom(triviaPool.length > 0 ? triviaPool : dataset.trivia);
  const leadIn = pickLocalized(dataset.triviaLeadIns, language, { avoidText: previous });
  const fact = language === 'tl' ? entry.tl : entry.en;
  const endingOptions = language === 'tl'
    ? [
      'Gusto mo pa ng isa pang trivia sa susunod?',
      'Kung trip mo, may isa pa akong fun fact mamaya.',
      'Sabihan mo lang ako kung gusto mo pa ng another trivia.',
    ]
    : [
      'Want another one after this?',
      'If you like, I can share another fun fact next.',
      'Just say the word if you want more trivia.',
    ];
  const ending = pickRandomTextVariant(endingOptions, previous);

  const triviaBody = formatForChatDisplay(`${leadIn} ${fact}`);
  return diversifyIfImmediateRepeat(`${triviaBody}\n\n${ending}`, language, history);
}

function pickSocialReply(
  language: BotLanguage,
  key: keyof DatasetShape['socialResponses'],
  history?: ChatbotHistoryMessage[],
): string {
  const previous = lastAssistantReply(history);
  return formatForChatDisplay(
    pickLocalized(dataset.socialResponses[key], language, { avoidText: previous }),
  );
}

function pickCompanionLead(
  language: BotLanguage,
  normalized: string,
  history?: ChatbotHistoryMessage[],
): string | null {
  if (hasAngerIntent(normalized)) return pickSocialReply(language, 'userAnger', history);
  if (hasEmpathyIntent(normalized)) return pickSocialReply(language, 'empathy', history);
  if (hasSuccessIntent(normalized)) return pickSocialReply(language, 'success', history);
  return null;
}

function pickFareNewsReply(language: BotLanguage, history?: ChatbotHistoryMessage[]): string {
  const previous = lastAssistantReply(history);
  const content = formatForChatDisplay(
    pickLocalized(dataset.fareNews, language, { avoidText: previous }),
  );
  return diversifyIfImmediateRepeat(content, language, history);
}

function buildMildProfanityReply(language: BotLanguage, history?: ChatbotHistoryMessage[]): string {
  const previous = lastAssistantReply(history);
  const empathyLead = pickRandom([
    pickSocialReply(language, 'userAnger', history),
    pickSocialReply(language, 'empathy', history),
  ]);

  const helpRedirectOptions = language === 'tl'
    ? [
      'Gets ko na mabigat ang pakiramdam mo. Kung ready ka, sabihin mo lang ang route o pamasahe concern mo at tutulungan kita agad.',
      'Nandito pa rin ako para tumulong. I-type mo lang ang destination mo o tanong sa pamasahe, tapos aasikasuhin natin.',
    ]
    : [
      'I get that you are frustrated. When you are ready, tell me your route or fare concern and I will help right away.',
      'I am still here to help. Send your destination or fare question, and we will sort it out step by step.',
    ];
  const helpRedirect = pickRandomTextVariant(helpRedirectOptions, previous);

  return diversifyIfImmediateRepeat(
    [empathyLead, helpRedirect].filter(Boolean).join('\n\n'),
    language,
    history,
  );
}

function buildHeavyProfanityBoundaryReply(language: BotLanguage, history?: ChatbotHistoryMessage[]): string {
  const previous = lastAssistantReply(history);

  const options = language === 'tl'
    ? [
      [
        'Gusto kitang tulungan, pero hindi ako magpapatuloy habang sunod-sunod ang mura.',
        'Quick cooldown muna: mag-send ng isang mahinahong route o pamasahe question, tapos tutulong ako agad.',
      ].join('\n\n'),
      [
        'Tutulong ako, pero hihinto muna tayo kapag tuloy-tuloy ang abusive na wording.',
        'Cooldown muna sandali: isang calm na route o fare question lang, then sasagot ako agad.',
      ].join('\n\n'),
    ]
    : [
      [
        'I want to help, but I will not continue while the messages stay abusive.',
        'Quick cooldown: send one calm route or fare question, and I will help right away.',
      ].join('\n\n'),
      [
        'I can still help, but I need the conversation to stay respectful first.',
        'Take a short cooldown, then send one calm route or fare question and I will jump in immediately.',
      ].join('\n\n'),
    ];

  return diversifyIfImmediateRepeat(
    pickRandomTextVariant(options, previous),
    language,
    history,
  );
}

function stripAutoTranslationParenthetical(text: string, language: BotLanguage): string {
  if (!text.includes('(') || !text.includes(')')) return text;

  const englishMarker = /\b(i|im|i am|you|your|the|is|are|was|were|thanks|thank|good|hello|route|fare|app|how|what|where|why|can|please|sorry)\b/i;
  const tagalogMarker = /\b(ako|ikaw|ka|ko|po|opo|salamat|kamusta|mabuti|paano|saan|gusto|pwede|puwede|naman|rin|din|lang|kita|mo)\b/i;

  const cleaned = text.replace(/\(([^)]+)\)/g, (full, inside: string) => {
    const value = normalizeIntentText(inside);
    if (!value) return '';

    const words = value.split(' ').filter(Boolean);
    if (words.length < 2) return full;

    const looksEnglish = englishMarker.test(value);
    const looksTagalog = tagalogMarker.test(value);

    if (language === 'tl' && looksEnglish && !looksTagalog) return '';
    if (language === 'en' && looksTagalog && !looksEnglish) return '';
    return full;
  });

  return cleaned
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim();
}

function recentGroqHistory(history?: ChatbotHistoryMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!history || history.length === 0) return [];

  return history
    .map((entry) => ({
      role: entry.isUser ? 'user' as const : 'assistant' as const,
      content: entry.text.trim(),
    }))
    .filter((entry) => entry.content.length > 0)
    .slice(-10);
}

function parseGuardrailDecision(raw: string): GuardrailDecision | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const jsonCandidate = trimmed.match(/\{[\s\S]*\}/)?.[0] ?? trimmed;

  try {
    const parsed = JSON.parse(jsonCandidate) as {
      allow?: unknown;
      category?: unknown;
      reason?: unknown;
      confidence?: unknown;
    };

    const allow = parsed.allow === true || parsed.allow === 'true';
    const categoryRaw = typeof parsed.category === 'string' ? normalizeText(parsed.category) : 'safe';
    const category: GuardrailCategory = categoryRaw === 'unsafe' || categoryRaw === 'out of scope' || categoryRaw === 'out_of_scope'
      ? (categoryRaw === 'unsafe' ? 'unsafe' : 'out_of_scope')
      : 'safe';
    const reason = typeof parsed.reason === 'string' ? parsed.reason.trim() : undefined;
    const confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : undefined;

    return {
      allow,
      category,
      reason,
      confidence,
    };
  } catch {
    return null;
  }
}

async function callGroqGuardrail(
  message: string,
  language: BotLanguage,
): Promise<GuardrailDecision> {
  const rawKey = process.env.EXPO_PUBLIC_GROQ_GUARDRAIL_API_KEY
    || process.env.GROQ_GUARDRAIL_API_KEY
    || process.env.EXPO_PUBLIC_GROQ_API_KEY
    || process.env.GROQ_API_KEY;
  const apiKey = rawKey?.trim();

  // Fail-open policy: if key is unavailable, allow fallback path to continue.
  if (!apiKey) {
    return {
      allow: true,
      category: 'safe',
    };
  }

  const requestedLanguage = language === 'tl' ? 'Tagalog' : 'English';
  const guardrailPrompt = [
    'You are a strict safety guardrail classifier for Jeepie, PARA app assistant.',
    'Decide whether the user message can be sent to the main assistant model.',
    'Allow if message is about PARA app, commuting, routes, fares, directions, transport, or harmless social chat.',
    'Block unsafe requests or prompts that are clearly outside scope.',
    'Return JSON only with this exact schema:',
    '{"allow":true|false,"category":"safe|out_of_scope|unsafe","reason":"short reason","confidence":0.0}',
    `Write reason in ${requestedLanguage}.`,
    'Do not add markdown or extra text.',
  ].join('\n');

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        temperature: 0,
        max_tokens: 90,
        messages: [
          {
            role: 'system',
            content: guardrailPrompt,
          },
          {
            role: 'user',
            content: message,
          },
        ],
      }),
    });

    if (!response.ok) {
      return {
        allow: true,
        category: 'safe',
      };
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') {
      return {
        allow: true,
        category: 'safe',
      };
    }

    const decision = parseGuardrailDecision(text);
    if (!decision) {
      return {
        allow: true,
        category: 'safe',
      };
    }

    return decision;
  } catch {
    return {
      allow: true,
      category: 'safe',
    };
  }
}

async function callGroqFallback(
  message: string,
  language: BotLanguage,
  history?: ChatbotHistoryMessage[],
): Promise<string | null> {
  const rawKey = process.env.EXPO_PUBLIC_GROQ_API_KEY || process.env.GROQ_API_KEY;
  const apiKey = rawKey?.trim();
  if (!apiKey) return null;

  const requestedLanguage = language === 'tl' ? 'Tagalog' : 'English';
  const strictPrompt = [
    'You are Jeepie, the built-in assistant of the PARA mobile application.',
    'You are not a general-purpose AI.',
    'Only answer transportation and PARA app topics: public transport, routes, directions, fares, commute tips, and app features.',
    'For casual/friendly conversation, respond warmly and keep it related to commuting or the PARA app when possible.',
    'Respond using one language only for each reply.',
    'Do not add direct translations in parentheses.',
    'Do not restate the same sentence in another language.',
    'Do not invent or guess routes, fares, schedules, availability, traffic, or announcements.',
    `If route data is missing, reply exactly with: ${ROUTE_DATA_UNAVAILABLE_REPLY}`,
    `If data is unavailable, reply exactly with: ${INFO_UNAVAILABLE_REPLY}`,
    `If the user asks strict academic/technical tasks outside PARA commuting (for example math equations or coding problems), reply exactly with: ${STRICT_OUT_OF_SCOPE_REPLY}`,
    'Keep responses practical, concise, and commuter-friendly.',
    'If giving fare, label it as estimated and include: Note: Fare may vary depending on local rates.',
    'Do not mention internal system logic or model limitations.',
    `Respond in ${requestedLanguage}.`,
  ].join('\n');

  const historyTurns = recentGroqHistory(history);
  const currentNormalized = normalizeIntentText(message);
  const historyAlreadyHasCurrentMessage = historyTurns.length > 0
    && historyTurns[historyTurns.length - 1].role === 'user'
    && normalizeIntentText(historyTurns[historyTurns.length - 1].content) === currentNormalized;

  const userTurns = historyAlreadyHasCurrentMessage
    ? historyTurns
    : [...historyTurns, { role: 'user' as const, content: message }];

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      temperature: 0.2,
      max_tokens: 220,
      messages: [
        {
          role: 'system',
          content: strictPrompt,
        },
        ...userTurns,
      ],
    }),
  });

  if (!response.ok) return null;

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') return null;

  return stripAutoTranslationParenthetical(text.trim(), language);
}

function fallbackText(language: BotLanguage, key: keyof DatasetShape['fallbackMessages']): string {
  const entry = dataset.fallbackMessages[key];
  return pickLocalized(entry, language);
}

function buildGuardrailBlockedReply(
  language: BotLanguage,
  category: GuardrailCategory,
  reason?: string,
): string {
  const safeReason = reason ? formatForChatDisplay(reason) : '';

  if (language === 'tl') {
    if (category === 'unsafe') {
      return [
        safeReason || 'Hindi ko ma-assist ang request na iyan.',
        'Pwede kitang tulungan sa routes, fares, at PARA app features.',
      ].join('\n\n');
    }

    return [
      safeReason || 'Mukhang wala ito sa sakop ko ngayon.',
      'Nandito ako para sa commuting help: route guidance, fare estimate, at PARA app usage.',
    ].join('\n\n');
  }

  if (category === 'unsafe') {
    return [
      safeReason || 'I cannot assist with that request.',
      'I can still help with routes, fares, commuting guidance, and PARA app features.',
    ].join('\n\n');
  }

  return [
    safeReason || 'That request looks outside my scope right now.',
    'I can help with commuting topics such as route guidance, fare estimates, and PARA app usage.',
  ].join('\n\n');
}

function hasStrictAcademicIntent(normalized: string): boolean {
  return /\b(solve|equation|algebra|geometry|trigonometry|calculus|derivative|integral|matrix|statistics|probability|physics|chemistry|biology|programming|coding|algorithm|python|java|javascript|typescript|c\+\+|homework|assignment|thesis|research paper)\b/.test(normalized)
    || /\b\d+\s*[+\-*/^]\s*\d+\b/.test(normalized);
}

export async function getChatbotReply(request: ChatbotRequest): Promise<ChatbotResponse> {
  const message = request.message.trim();
  const language = detectLanguage(message);
  const normalized = normalizeIntentText(message);
  const history = request.history ?? [];
  const mode = request.mode ?? 'assistant';
  const companionMode = mode === 'companion';
  const isTaskLikeMessage = hasCommuteTaskIntent(normalized);
  const hasPinReference = hasPinIntent(normalized);
  const currentState: ChatbotConversationState = request.state ?? {};
  const hasPendingFollowUp = hasPendingFollowUpState(currentState);
  const routes = request.routes ?? [];
  const ensureVariedReply = (text: string): string => diversifyIfImmediateRepeat(text, language, history);
  const companionLead = companionMode && isTaskLikeMessage
    ? pickCompanionLead(language, normalized, history)
    : null;

  const withCompanionLead = (content: string): string => {
    if (!companionLead) return content;
    const body = formatForChatDisplay(content);
    if (!body) return companionLead;
    return `${companionLead}\n\n${body}`;
  };

  const supportReply = (
    content: string,
    options?: { includeClosing?: boolean },
  ): string => ensureVariedReply(composeSupportReply(language, withCompanionLead(content), options));

  if (!message) {
    return {
      text: supportReply(fallbackText(language, 'unknown')),
      language,
      state: currentState,
      usedGroq: false,
    };
  }

  if (hasPendingFollowUp && hasCancelIntent(normalized)) {
    return {
      text: supportReply(buildCancelFollowUpReply(language)),
      language,
      state: {},
      usedGroq: false,
    };
  }

  const routeTypo = findRouteTypo(normalized);
  const likelyRouteHelpMessage = /\b(help|assist|tulong|guide|need|kailangan|with|sa|to|from|papunta|paano|how)\b/.test(normalized)
    || normalized.split(' ').filter(Boolean).length <= 4;
  if (routeTypo && likelyRouteHelpMessage) {
    return {
      text: supportReply(buildRouteTypoReply(language)),
      language,
      state: currentState,
      usedGroq: false,
    };
  }

  const profanitySeverity = classifyProfanitySeverity(normalized, history);
  if (profanitySeverity !== 'none') {
    const profanityReply = profanitySeverity === 'heavy'
      ? ensureVariedReply(composeSupportReply(language, buildHeavyProfanityBoundaryReply(language, history)))
      : supportReply(buildMildProfanityReply(language, history));

    return {
      text: profanityReply,
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (hasBuilderOriginIntent(normalized)) {
    return {
      text: ensureVariedReply(builderOriginReply(language)),
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (hasBuilderIntent(normalized)) {
    return {
      text: ensureVariedReply(dataset.builderAnswer),
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (hasFareNewsIntent(normalized)) {
    return {
      text: supportReply(pickFareNewsReply(language, history)),
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (hasTriviaIntent(normalized)) {
    return {
      text: supportReply(pickTrivia(language, history)),
      language,
      state: {},
      usedGroq: false,
    };
  }

  const mentions = findPlaceMentions(message);
  const parsed = parseFareEndpoints(normalized, mentions);
  const pendingDestination = statePendingDestination(currentState);

  const aliasGuide = findAppGuideByAliases(normalized);
  const matchedGuide = aliasGuide ?? findAppGuide(normalized);
  const contextGuide = !matchedGuide
    ? findAppGuideFromConversationContext(normalized, currentState)
    : null;
  const resolvedGuide = matchedGuide ?? contextGuide;

  if (
    resolvedGuide
    && !hasFareIntent(normalized)
    && !hasRouteListIntent(normalized)
    && mentions.length === 0
    && !parsed.destination
  ) {
    return {
      text: supportReply(pickAppGuideReply(resolvedGuide, language), { includeClosing: true }),
      language,
      state: {
        lastTopic: 'app-guide',
        lastAppGuideId: resolvedGuide.id,
      },
      usedGroq: false,
    };
  }

  if (hasCapabilityIntent(normalized)) {
    return {
      text: supportReply(buildCapabilitiesReply(language), { includeClosing: true }),
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (hasFarePolicyIntent(normalized)) {
    return {
      text: supportReply(buildFarePolicyReply(language), { includeClosing: true }),
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (hasRouteListIntent(normalized)) {
    return {
      text: supportReply(
        buildRouteListReply(language, routes, parsed.destination),
        { includeClosing: true },
      ),
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (hasAchievementIntent(normalized)) {
    const mentionedBadge = findBadgeMention(normalized);
    return {
      text: supportReply(buildAchievementReply(language, mentionedBadge), { includeClosing: true }),
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (hasLandmarkIntent(normalized)) {
    return {
      text: supportReply(buildLandmarkReply(language, normalized, routes), { includeClosing: true }),
      language,
      state: {},
      usedGroq: false,
    };
  }

  const destinationHint = parsed.destination
    ? toDestinationPoint(parsed.destination)
    : findStopDestinationByHints(normalized, routes);

  if (
    destinationHint
    && !hasRouteIntent(normalized)
    && !hasFareIntent(normalized)
    && !currentState.awaitingDestinationIntent
    && !currentState.awaitingOriginIntent
  ) {
    return {
      text: supportReply(buildDestinationClarifyingQuestion(language, destinationHint.name)),
      language,
      state: {
        pendingDestinationName: destinationHint.name,
        pendingDestinationCoordinate: destinationHint.coordinate,
        pendingDestinationPlaceId: destinationHint.placeId,
      },
      usedGroq: false,
    };
  }

  const fareIntentActive = hasFareIntent(normalized)
    || (currentState.awaitingOriginIntent === 'fare' && Boolean(currentState.awaitingOriginForDestinationId))
    || currentState.awaitingDestinationIntent === 'fare';
  if (fareIntentActive) {
    const clarifyingFareDestination = currentState.awaitingDestinationIntent === 'fare';
    const destinationFromState = currentState.awaitingOriginIntent === 'fare' && currentState.awaitingOriginForDestinationId
      ? placeById.get(currentState.awaitingOriginForDestinationId)
      : undefined;

    const pendingDestinationPlace = pendingDestination?.placeId
      ? placeById.get(pendingDestination.placeId)
      : undefined;

    const destinationPlace = parsed.destination ?? destinationFromState ?? pendingDestinationPlace;
    const destinationPoint = destinationPlace
      ? toDestinationPoint(destinationPlace)
      : pendingDestination ?? findStopDestinationByHints(normalized, routes);

    if (!destinationPoint) {
      const nextState = nextDestinationRepromptState(currentState, 'fare');
      if (!nextState) {
        return {
          text: supportReply(buildDestinationRepromptLimitReply(language)),
          language,
          state: {},
          usedGroq: false,
        };
      }

      return {
        text: supportReply(fallbackText(language, 'missingDestination')),
        language,
        state: nextState,
        usedGroq: false,
      };
    }

    const originFromMessage = parsed.origin;
    const useGpsAsOrigin = !originFromMessage && Boolean(request.currentLocation);
    const originCoordinate = originFromMessage?.coordinate ?? request.currentLocation ?? null;
    const nearestFromGps = request.currentLocation ? findNearestKnownPlace(request.currentLocation) : null;

    if (!originCoordinate) {
      return {
        text: supportReply(
          template(fallbackText(language, 'askOrigin'), { destination: destinationPoint.name }),
        ),
        language,
        state: {
          awaitingOriginForDestinationId: destinationPlace?.id,
          awaitingOriginIntent: 'fare',
          pendingDestinationName: destinationPoint.name,
          pendingDestinationCoordinate: destinationPoint.coordinate,
          pendingDestinationPlaceId: destinationPoint.placeId,
        },
        usedGroq: false,
      };
    }

    const originLabel = originFromMessage?.name
      || request.currentLocationLabel
      || nearestFromGps?.name
      || (language === 'tl' ? 'kasalukuyang lokasyon mo' : 'your current location');

    const resolvedOriginPlace = originFromMessage || nearestFromGps || null;

    if (!originFromMessage && currentState.awaitingOriginForDestinationId && !request.currentLocation) {
      return {
        text: supportReply(fallbackText(language, 'unknownOrigin')),
        language,
        state: currentState,
        usedGroq: false,
      };
    }

    const estimate = estimateFare(
      originCoordinate,
      destinationPoint,
      routes,
      resolvedOriginPlace || undefined,
      destinationPlace || undefined,
    );

    if (!estimate) {
      return {
        text: routeDataUnavailableReply(),
        language,
        state: {},
        usedGroq: false,
      };
    }

    const fareBody = buildFareReply({
      language,
      originLabel,
      destinationLabel: destinationPoint.name,
      estimate,
      usedGpsLocation: useGpsAsOrigin,
    });

    const withClarification = clarifyingFareDestination
      ? `${buildClarificationAck(language)}\n\n${fareBody}`
      : fareBody;

    return {
      text: supportReply(
        withClarification,
        { includeClosing: true },
      ),
      language,
      state: {},
      usedGroq: false,
    };
  }

  const routeIntentActive = hasRouteIntent(normalized)
    || (currentState.awaitingOriginIntent === 'route' && Boolean(currentState.awaitingOriginForDestinationId))
    || currentState.awaitingDestinationIntent === 'route';
  if (routeIntentActive) {
    const clarifyingRouteDestination = currentState.awaitingDestinationIntent === 'route';
    const destinationFromState = currentState.awaitingOriginIntent === 'route' && currentState.awaitingOriginForDestinationId
      ? placeById.get(currentState.awaitingOriginForDestinationId)
      : undefined;

    const pendingDestinationPlace = pendingDestination?.placeId
      ? placeById.get(pendingDestination.placeId)
      : undefined;

    const destinationPlace = parsed.destination ?? destinationFromState ?? pendingDestinationPlace;
    const destinationPoint = destinationPlace
      ? toDestinationPoint(destinationPlace)
      : pendingDestination ?? findStopDestinationByHints(normalized, routes);

    if (!destinationPoint) {
      const nextState = nextDestinationRepromptState(currentState, 'route');
      if (!nextState) {
        return {
          text: supportReply(buildDestinationRepromptLimitReply(language)),
          language,
          state: {},
          usedGroq: false,
        };
      }

      return {
        text: supportReply(routeResponseText(language, 'askDestination')),
        language,
        state: nextState,
        usedGroq: false,
      };
    }

    const originFromMessage = parsed.origin;
    const originCoordinate = originFromMessage?.coordinate ?? request.currentLocation ?? null;
    const nearestFromGps = request.currentLocation ? findNearestKnownPlace(request.currentLocation) : null;

    if (!originCoordinate) {
      return {
        text: supportReply(
          template(routeResponseText(language, 'askOrigin'), { destination: destinationPoint.name }),
        ),
        language,
        state: {
          awaitingOriginForDestinationId: destinationPlace?.id,
          awaitingOriginIntent: 'route',
          pendingDestinationName: destinationPoint.name,
          pendingDestinationCoordinate: destinationPoint.coordinate,
          pendingDestinationPlaceId: destinationPoint.placeId,
        },
        usedGroq: false,
      };
    }

    const originLabel = originFromMessage?.name
      || request.currentLocationLabel
      || nearestFromGps?.name
      || (language === 'tl' ? 'kasalukuyang lokasyon mo' : 'your current location');

    const resolvedOriginPlace = originFromMessage || nearestFromGps || null;
    const routePlan = findRoutePlan(
      originCoordinate,
      destinationPoint,
      routes,
      resolvedOriginPlace || undefined,
      destinationPlace || undefined,
    );

    if (!routePlan) {
      return {
        text: composeSupportReply(language, routeResponseText(language, 'noRouteFound')),
        language,
        state: {},
        usedGroq: false,
      };
    }

    const routeBody = buildRouteReply({
      language,
      originLabel,
      destinationLabel: destinationPoint.name,
      plan: routePlan,
      hasPinReference,
      usedGpsOrigin: !originFromMessage,
    });

    const withClarification = clarifyingRouteDestination
      ? `${buildClarificationAck(language)}\n\n${routeBody}`
      : routeBody;

    return {
      text: supportReply(
        withClarification,
        { includeClosing: true },
      ),
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (companionMode && !isTaskLikeMessage && hasAngerIntent(normalized)) {
    return {
      text: ensureVariedReply(pickSocialReply(language, 'userAnger', history)),
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (companionMode && !isTaskLikeMessage && hasEmpathyIntent(normalized)) {
    return {
      text: ensureVariedReply(pickSocialReply(language, 'empathy', history)),
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (companionMode && !isTaskLikeMessage && hasSuccessIntent(normalized)) {
    return {
      text: ensureVariedReply(pickSocialReply(language, 'success', history)),
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (!isTaskLikeMessage && hasLaughterIntent(normalized)) {
    return {
      text: ensureVariedReply(pickSocialReply(language, 'laughter', history)),
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (!isTaskLikeMessage && hasPowerWordsIntent(normalized)) {
    return {
      text: ensureVariedReply(pickSocialReply(language, 'powerWords', history)),
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (!isTaskLikeMessage && isPureSocialMessage(normalized) && hasGreetingIntent(normalized)) {
    return {
      text: ensureVariedReply(pickSocialReply(language, 'greetings', history)),
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (!isTaskLikeMessage && isPureSocialMessage(normalized) && hasPraiseIntent(normalized)) {
    return {
      text: ensureVariedReply(pickSocialReply(language, 'praise', history)),
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (!isTaskLikeMessage && isPureSocialMessage(normalized) && hasThanksIntent(normalized)) {
    return {
      text: ensureVariedReply(pickSocialReply(language, 'thanks', history)),
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (!isTaskLikeMessage && isPureSocialMessage(normalized) && hasGoodbyeIntent(normalized)) {
    return {
      text: ensureVariedReply(pickSocialReply(language, 'goodbye', history)),
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (!isTaskLikeMessage && isPureSocialMessage(normalized) && hasUserApologyIntent(normalized)) {
    return {
      text: ensureVariedReply(pickSocialReply(language, 'userApology', history)),
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (!isTaskLikeMessage && isPureSocialMessage(normalized) && hasAcknowledgementIntent(normalized)) {
    return {
      text: ensureVariedReply(pickSocialReply(language, 'acknowledgement', history)),
      language,
      state: {},
      usedGroq: false,
    };
  }

  const inScope = isInScope(normalized);
  const strictAcademic = hasStrictAcademicIntent(normalized);

  if (!strictAcademic) {
    const guardrailDecision = await callGroqGuardrail(message, language);
    if (!guardrailDecision.allow) {
      return {
        text: ensureVariedReply(composeSupportReply(
          language,
          buildGuardrailBlockedReply(language, guardrailDecision.category, guardrailDecision.reason),
          { includeClosing: true },
        )),
        language,
        state: {},
        usedGroq: false,
      };
    }

    try {
      const groqReply = await callGroqFallback(message, language, history);
      if (groqReply) {
        return {
          text: supportReply(formatForChatDisplay(groqReply), { includeClosing: true }),
          language,
          state: {},
          usedGroq: true,
        };
      }
    } catch {
      // ignore and fall through to deterministic fallback
    }
  }

  if (shouldAskGeneralClarification(normalized)) {
    return {
      text: supportReply(buildGeneralClarifyingQuestion(language)),
      language,
      state: currentState,
      usedGroq: false,
    };
  }

  if (!inScope) {
    return {
      text: ensureVariedReply(strictOutOfScopeReply()),
      language,
      state: {},
      usedGroq: false,
    };
  }

  return {
    text: supportReply(buildGeneralClarifyingQuestion(language)),
    language,
    state: currentState,
    usedGroq: false,
  };
}
