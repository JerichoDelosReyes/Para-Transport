import datasetJson from '../data/chatbot-dataset.json';
import type { JeepneyRoute } from '../types/routes';
import { findRoutesForDestination, rankRoutes } from './routeSearch';
import { BADGES, type Badge } from '../constants/badges';

export type BotLanguage = 'en' | 'tl';

export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type ChatbotConversationState = {
  awaitingOriginForDestinationId?: string;
  awaitingOriginIntent?: 'fare' | 'route';
  awaitingDestinationIntent?: 'fare' | 'route';
  pendingDestinationName?: string;
  pendingDestinationCoordinate?: Coordinate;
  pendingDestinationPlaceId?: string;
};

export type ChatbotRequest = {
  message: string;
  state?: ChatbotConversationState;
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

type DatasetShape = {
  farePolicy: {
    baseFarePhp: number;
    baseDistanceKm: number;
    additionalPerKmPhp: number;
    discountRate: number;
    roundToNearestQuarter: boolean;
  };
  topicKeywords: string[];
  places: DatasetPlace[];
  farePairs: DatasetFarePair[];
  trivia: DatasetTrivia[];
  triviaLeadIns: LocalizedVariants;
  socialResponses: {
    greetings: LocalizedVariants;
    thanks: LocalizedVariants;
    praise: LocalizedVariants;
    userApology: LocalizedVariants;
    acknowledgement: LocalizedVariants;
    goodbye: LocalizedVariants;
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

const dataset = datasetJson as DatasetShape;
const placeById = new Map<string, DatasetPlace>(dataset.places.map((place) => [place.id, place]));

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

const TAGALOG_HINTS = [
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

const ENGLISH_HINTS = [
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

const TAGALOG_SOCIAL_CUES = /\b(kumusta|kamusta|kumutsa|kamutsa|musta|salamat|pasensya|pasensiya|sige|cge|gege|opo|magandang)\b/;

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
  const normalized = normalizeText(message);

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

function pickLocalized(variants: LocalizedVariants, language: BotLanguage): string {
  const options = language === 'tl' ? variants.tl : variants.en;
  return pickRandom(options);
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
    && body.length < 520
    && Math.random() < 0.45;
  const closing = shouldAddClosing
    ? formatForChatDisplay(pickLocalized(SUPPORT_CLOSERS, language))
    : '';

  const chunks = [body, closing].filter(Boolean);
  return chunks.join('\n\n');
}

function template(message: string, replacements: Record<string, string>): string {
  let output = message;
  for (const [key, value] of Object.entries(replacements)) {
    output = output.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return output;
}

function roundFare(value: number): number {
  if (!dataset.farePolicy.roundToNearestQuarter) return Number(value.toFixed(2));
  return Math.ceil(value * 4) / 4;
}

function calculateNormalFare(distanceKm: number): number {
  const { baseFarePhp, baseDistanceKm, additionalPerKmPhp } = dataset.farePolicy;
  if (distanceKm <= baseDistanceKm) return baseFarePhp;

  const extraKm = distanceKm - baseDistanceKm;
  const raw = baseFarePhp + extraKm * additionalPerKmPhp;
  return roundFare(raw);
}

function calculateDiscountedFare(normalFare: number): number {
  const discounted = normalFare * (1 - dataset.farePolicy.discountRate);
  return Number(discounted.toFixed(2));
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

  for (const route of routes) {
    for (const stop of route.stops || []) {
      const normalizedLabel = normalizeText(stop.label);
      if (!normalizedLabel) continue;
      if (!byLabel.has(normalizedLabel)) {
        byLabel.set(normalizedLabel, {
          name: stop.label,
          coordinate: {
            latitude: stop.coordinate.latitude,
            longitude: stop.coordinate.longitude,
          },
        });
      }
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
  return /(fare|pamasahe|magkano|bayad|how much|magkan[o0]|magkano po|how much fare|fare estimate|estimate fare|pamasahe papunta|pamasahe mula|how much should i pay)/.test(normalized);
}

function hasRouteIntent(normalized: string): boolean {
  return /(route|ruta|navigate|navigation|directions|papunta|paano pumunta|how to go|get there|go to|dalhin|sakay papunta|how do i get|pinpoint|pinned|drop pin|pin location)/.test(normalized);
}

function hasPinIntent(normalized: string): boolean {
  return /(pin|pinned|pinpoint|drop pin|pin location)/.test(normalized);
}

function hasLandmarkIntent(normalized: string): boolean {
  return /(landmark|landmarks|stops|stop list|terminal list|hintuan|palatandaan|anong stop|anong landmark|available stops)/.test(normalized);
}

function hasRouteListIntent(normalized: string): boolean {
  return /(route list|list of routes|list routes|available routes|what routes are available|which routes are available|mga ruta|anong mga ruta|ano mga ruta|lista ng ruta|available na ruta)/.test(normalized);
}

function hasFarePolicyIntent(normalized: string): boolean {
  return /(base fare|minimum fare|regular fare|discounted fare|discount fare|student fare|senior fare|pwd fare|fare policy|fare rules|what is the fare right now|fare right now|current fare|magkano base|magkano minimum|magkano student|magkano senior|magkano pwd|pamasahe ngayon|magkano pamasahe ngayon|base pamasahe|discount sa pamasahe)/.test(normalized);
}

function hasCapabilityIntent(normalized: string): boolean {
  return /(what can you do|what can jeepie do|how can you help|capabilities|features|functionality|help menu|anong kaya mo|ano kaya mo|anong pwede mong gawin|paano kita gamitin|pano kita gamitin|tulong mo|help options)/.test(normalized);
}

function hasAchievementIntent(normalized: string): boolean {
  return /(achievement|achievements|badge|badges|unlock|how to get|paano makuha|route rookie|path explorer|urban navigator|streak)/.test(normalized);
}

function hasTriviaIntent(normalized: string): boolean {
  return /(trivia|fun fact|did you know|alam mo ba|fact tungkol|fact about|random fact|kwento trivia|trivia naman)/.test(normalized);
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
  return /(why.*fare|bakit.*pamasahe|tumaas.*pamasahe|fare (increase|hike)|oil price|fuel price|giyera|gyera|war|bakit.*14|from 13 to 14|13 to 14)/.test(normalized);
}

function hasGreetingIntent(normalized: string): boolean {
  return /^(hi|hello|hey|yo|good morning|good afternoon|good evening|kumusta|kamusta|kumutsa|kamutsa|uy|musta|henlo)(\b|\s|!|\.)/.test(normalized)
    || /\b(hi jeepie|hello jeepie|kumusta jeepie|kamusta jeepie|kumutsa jeepie|kamutsa jeepie|good day jeepie)\b/.test(normalized);
}

function hasThanksIntent(normalized: string): boolean {
  return /\b(thanks|thank you|ty|salamat|maraming salamat|tenkyu)\b/.test(normalized);
}

function hasPraiseIntent(normalized: string): boolean {
  return /\b(good job|great job|nice one|wow nice|wow ang galing|ang galing|galing mo|idol|solid mo|amazing|awesome|ang husay|best ka|lupet mo|angas mo)\b/.test(normalized);
}

function hasGoodbyeIntent(normalized: string): boolean {
  return /\b(bye|goodbye|see you|see ya|ingat|paalam|aalis na ko|aalis na ako|hanggang sa muli|chat later|brb)\b/.test(normalized);
}

function hasUserApologyIntent(normalized: string): boolean {
  return /\b(sorry|pasensya|pasensiya|my bad|patawad)\b/.test(normalized);
}

function hasAcknowledgementIntent(normalized: string): boolean {
  return /\b(ok|okay|okie|noted|copy|gets|sige|cge|gege|ayt|ayos|opo|oo|noted po)\b/.test(normalized);
}

function hasCommuteTaskIntent(normalized: string): boolean {
  return /(fare|pamasahe|route|ruta|destination|papunta|where|saan|how to go|paano pumunta|terminal|stop|transit|jeepney|tricycle|from|mula|galing|to |going to|trivia|fun fact|did you know|alam mo ba|app|application|saved|achievements|profile|settings|pinpoint|pinned|drop pin|base fare|discounted fare|what can you do|anong kaya mo|mga ruta|route list|vermosa|how to get to|papuntang)/.test(normalized);
}

function findAppGuide(normalized: string): DatasetAppGuide | null {
  let bestGuide: DatasetAppGuide | null = null;
  let bestScore = 0;

  for (const guide of dataset.appGuides || []) {
    for (const rawIntent of guide.intents || []) {
      const intent = normalizeText(rawIntent);
      if (!intent) continue;
      if (!hintMatches(normalized, intent)) continue;

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

  if (mentionedRoute) {
    const routeStops = uniqueText((mentionedRoute.stops || []).map((stop) => stop.label));
    if (routeStops.length === 0) {
      return routeResponseText(language, 'landmarkNoData');
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
    routes.flatMap((route) => (route.stops || []).map((stop) => stop.label)),
  );
  const fallbackPlaces = uniqueText(dataset.places.map((place) => place.name));
  const allLandmarks = routeStops.length > 0 ? routeStops : fallbackPlaces;

  if (allLandmarks.length === 0) {
    return routeResponseText(language, 'landmarkNoData');
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
  const stopLabels = (route.stops || []).map((stop) => normalizeText(stop.label));
  if (stopLabels.length === 0) return false;

  const names = uniqueText([place.name, ...place.aliases])
    .map((value) => normalizeText(value))
    .filter((value) => value.length >= 4);

  if (names.length === 0) return false;

  return names.some((name) => stopLabels.some((label) => label.includes(name)));
}

function buildRouteListReply(language: BotLanguage, routes: JeepneyRoute[], destination?: DatasetPlace): string {
  if (routes.length === 0) {
    return language === 'tl'
      ? 'Wala pang loaded route data ngayon. Subukan ulit mamaya o magtanong gamit ang exact destination para makapagbigay ako ng best available guidance.'
      : 'There is no loaded route data right now. Please try again later, or ask using an exact destination so I can provide the best available guidance.';
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
  const baseFare = dataset.farePolicy.baseFarePhp;
  const baseDistance = dataset.farePolicy.baseDistanceKm;
  const additionalPerKm = dataset.farePolicy.additionalPerKmPhp;
  const discountRate = dataset.farePolicy.discountRate;
  const discountedBase = Number((baseFare * (1 - discountRate)).toFixed(2));
  const hasQuarterRounding = dataset.farePolicy.roundToNearestQuarter;

  if (language === 'tl') {
    return [
      'Narito ang current fare policy sa dataset ni Jeepie:',
      `1. Base fare: ${formatPhp(baseFare)} para sa unang ${baseDistance} km.`,
      `2. Additional fare: +${formatPhp(additionalPerKm)} kada dagdag na 1 km.`,
      `3. Discounted fare (student/senior/PWD): ${Math.round(discountRate * 100)}% off. Halimbawa, base discounted fare ay ${formatPhp(discountedBase)}.`,
      hasQuarterRounding
        ? '4. Ang regular fare estimate ay niroround up sa pinakamalapit na 0.25 para mas realistic ang fare simulation.'
        : '4. Ang fare estimate ay hindi gumagamit ng quarter-step rounding.',
    ].join('\n\n');
  }

  return [
    'Here is Jeepie\'s current fare policy from the dataset:',
    `1. Base fare: ${formatPhp(baseFare)} for the first ${baseDistance} km.`,
    `2. Additional fare: +${formatPhp(additionalPerKm)} for every extra 1 km.`,
    `3. Discounted fare (student/senior/PWD): ${Math.round(discountRate * 100)}% off. Example base discounted fare is ${formatPhp(discountedBase)}.`,
    hasQuarterRounding
      ? '4. Regular fare estimates are rounded up to the nearest 0.25 for a more realistic fare simulation.'
      : '4. Fare estimates are not using quarter-step rounding.',
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
): EstimateResult {
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
      const discountedFare = calculateDiscountedFare(normalFare);

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
        discountedFare: calculateDiscountedFare(normalFare),
        routeHint: pair.jeepneyRouteHint,
      };
    }
  }

  const estimatedDistanceKm = Math.max(1, haversineKm(origin, destination.coordinate) * 1.35);
  const normalFare = calculateNormalFare(estimatedDistanceKm);
  return {
    distanceKm: estimatedDistanceKm,
    normalFare,
    discountedFare: calculateDiscountedFare(normalFare),
    routeHint: 'nearest jeepney route near your current area',
  };
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

  const steps = language === 'tl'
    ? [
      `1. ${usedGpsOrigin ? `Mula sa current location mo (${originLabel}),` : `Magsimula sa ${originLabel} at`} pumunta sa pinakamalapit na sakayan para sa ${primaryRoute}.`,
      `2. Sumakay sa ${primaryRoute}.`,
      ...plan.routeNames.slice(1).map((routeName, index) => `${index + 3}. Pagkatapos, lumipat sa ${routeName}.`),
      `${plan.routeNames.length + 3}. Bumaba sa pinakamalapit na drop-off point papuntang ${destinationLabel}.`,
      `${plan.routeNames.length + 4}. Optional: Maikling lakad na lang papunta sa exact destination mo.`,
    ]
    : [
      `1. ${usedGpsOrigin ? `From your current location (${originLabel}),` : `Start at ${originLabel} and`} head to the nearest pickup point for ${primaryRoute}.`,
      `2. Ride ${primaryRoute}.`,
      ...plan.routeNames.slice(1).map((routeName, index) => `${index + 3}. Then transfer to ${routeName}.`),
      `${plan.routeNames.length + 3}. Drop off at the nearest point heading to ${destinationLabel}.`,
      `${plan.routeNames.length + 4}. Optional: Take a short walk to your exact destination.`,
    ];

  if (language === 'tl') {
    return [
      intro,
      `Roadmap mula ${originLabel} papuntang ${destinationLabel}:`,
      steps.join('\n'),
      `Tantyang biyahe: mga ${plan.estimatedMinutes} minuto | Tantyang layo: ${plan.distanceKm.toFixed(1)} km | Tantyang fare: ${formatPhp(plan.estimatedFare)} (regular)`,
      routeResponseText(language, 'routeSummaryOutro'),
    ].join('\n\n');
  }

  return [
    intro,
    `Roadmap from ${originLabel} to ${destinationLabel}:`,
    steps.join('\n'),
    `Estimated trip: around ${plan.estimatedMinutes} minutes | Estimated distance: ${plan.distanceKm.toFixed(1)} km | Estimated fare: ${formatPhp(plan.estimatedFare)} (regular)`,
    routeResponseText(language, 'routeSummaryOutro'),
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
    if (usedGpsLocation) {
      return `Sige, check natin. Nakikita ko na nasa ${originLabel} ka ngayon. Puwede kang sumakay ng jeepney sa pinakamalapit na rutang ${estimate.routeHint} papuntang ${destinationLabel}. Tantyang layo ay ${estimate.distanceKm.toFixed(1)} km. Tantyang pamasahe ay ${formatPhp(estimate.normalFare)} para sa regular fare at ${formatPhp(estimate.discountedFare)} kung student, senior citizen, o PWD. Ingat sa biyahe!`;
    }

    return `Sure, ito ang estimate ko. Mula ${originLabel} papuntang ${destinationLabel}, puwede kang sumakay sa rutang ${estimate.routeHint}. Tantyang layo ay ${estimate.distanceKm.toFixed(1)} km. Tantyang pamasahe ay ${formatPhp(estimate.normalFare)} para sa regular fare at ${formatPhp(estimate.discountedFare)} kung student, senior citizen, o PWD.`;
  }

  if (usedGpsLocation) {
    return `Sure thing! I'm seeing here that you are on ${originLabel} right now. You can ride a jeepney on the nearest route ${estimate.routeHint} going to ${destinationLabel}. Estimated distance is about ${estimate.distanceKm.toFixed(1)} km. Estimated fare is ${formatPhp(estimate.normalFare)} for normal fare and ${formatPhp(estimate.discountedFare)} if you are a student, senior citizen, or PWD. Travel safe out there.`;
  }

  return `Got you! From ${originLabel} to ${destinationLabel}, you can ride a jeepney on route ${estimate.routeHint}. Estimated distance is about ${estimate.distanceKm.toFixed(1)} km. Estimated fare is ${formatPhp(estimate.normalFare)} for normal fare and ${formatPhp(estimate.discountedFare)} if you are a student, senior citizen, or PWD.`;
}

function pickTrivia(language: BotLanguage): string {
  const entry = pickRandom(dataset.trivia);
  const leadIn = pickLocalized(dataset.triviaLeadIns, language);
  const fact = language === 'tl' ? entry.tl : entry.en;
  const ending = language === 'tl'
    ? pickRandom([
      'Gusto mo pa ng isa pang trivia sa susunod?',
      'Kung trip mo, may isa pa akong fun fact mamaya.',
      'Sabihan mo lang ako kung gusto mo pa ng another trivia.',
    ])
    : pickRandom([
      'Want another one after this?',
      'If you like, I can share another fun fact next.',
      'Just say the word if you want more trivia.',
    ]);

  const triviaBody = formatForChatDisplay(`${leadIn} ${fact}`);
  return `${triviaBody}\n\n${ending}`;
}

function pickSocialReply(language: BotLanguage, key: keyof DatasetShape['socialResponses']): string {
  return formatForChatDisplay(pickLocalized(dataset.socialResponses[key], language));
}

function pickFareNewsReply(language: BotLanguage): string {
  return formatForChatDisplay(pickLocalized(dataset.fareNews, language));
}

async function callGroqFallback(message: string, language: BotLanguage): Promise<string | null> {
  const rawKey = process.env.EXPO_PUBLIC_GROQ_API_KEY || process.env.GROQ_API_KEY;
  const apiKey = rawKey?.trim();
  if (!apiKey) return null;

  const outOfScopeMsg = pickLocalized(dataset.fallbackMessages.outOfScope, language);

  const requestedLanguage = language === 'tl' ? 'Tagalog' : 'English';

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
          content:
            `You are Jeepie, Para app's commute companion. Only answer about commuting, fares, jeepneys, tricycles, transit routes, destinations, and app usage. If question is outside this scope, respond exactly with: ${outOfScopeMsg}. Respond in ${requestedLanguage}. Keep responses friendly, practical, concise, and focused on practical next steps. Return only the response body in 1-2 short paragraphs with no greeting and no sign-off because the app wraps your output.`,
        },
        {
          role: 'user',
          content: message,
        },
      ],
    }),
  });

  if (!response.ok) return null;

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') return null;

  return text.trim();
}

function fallbackText(language: BotLanguage, key: keyof DatasetShape['fallbackMessages']): string {
  const entry = dataset.fallbackMessages[key];
  return pickLocalized(entry, language);
}

export async function getChatbotReply(request: ChatbotRequest): Promise<ChatbotResponse> {
  const message = request.message.trim();
  const language = detectLanguage(message);
  const normalized = normalizeText(message);
  const isTaskLikeMessage = hasCommuteTaskIntent(normalized);
  const hasPinReference = hasPinIntent(normalized);
  const currentState: ChatbotConversationState = request.state ?? {};
  const routes = request.routes ?? [];

  if (!message) {
    return {
      text: composeSupportReply(language, fallbackText(language, 'unknown')),
      language,
      state: currentState,
      usedGroq: false,
    };
  }

  if (hasBuilderOriginIntent(normalized)) {
    return {
      text: builderOriginReply(language),
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (hasBuilderIntent(normalized)) {
    return {
      text: dataset.builderAnswer,
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (hasFareNewsIntent(normalized)) {
    return {
      text: composeSupportReply(language, pickFareNewsReply(language)),
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (hasTriviaIntent(normalized)) {
    return {
      text: composeSupportReply(language, pickTrivia(language)),
      language,
      state: {},
      usedGroq: false,
    };
  }

  const mentions = findPlaceMentions(message);
  const parsed = parseFareEndpoints(normalized, mentions);
  const pendingDestination = statePendingDestination(currentState);

  const matchedGuide = findAppGuide(normalized);
  if (matchedGuide && !hasRouteIntent(normalized) && !hasFareIntent(normalized) && !hasRouteListIntent(normalized)) {
    return {
      text: composeSupportReply(language, pickAppGuideReply(matchedGuide, language), { includeClosing: true }),
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (hasCapabilityIntent(normalized)) {
    return {
      text: composeSupportReply(language, buildCapabilitiesReply(language), { includeClosing: true }),
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (hasFarePolicyIntent(normalized)) {
    return {
      text: composeSupportReply(language, buildFarePolicyReply(language), { includeClosing: true }),
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (hasRouteListIntent(normalized)) {
    return {
      text: composeSupportReply(
        language,
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
      text: composeSupportReply(language, buildAchievementReply(language, mentionedBadge), { includeClosing: true }),
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (hasLandmarkIntent(normalized)) {
    return {
      text: composeSupportReply(language, buildLandmarkReply(language, normalized, routes), { includeClosing: true }),
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
      text: composeSupportReply(language, buildDestinationClarifyingQuestion(language, destinationHint.name)),
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
      return {
        text: composeSupportReply(language, fallbackText(language, 'missingDestination')),
        language,
        state: { awaitingDestinationIntent: 'fare' },
        usedGroq: false,
      };
    }

    const originFromMessage = parsed.origin;
    const useGpsAsOrigin = !originFromMessage && Boolean(request.currentLocation);
    const originCoordinate = originFromMessage?.coordinate ?? request.currentLocation ?? null;
    const nearestFromGps = request.currentLocation ? findNearestKnownPlace(request.currentLocation) : null;

    if (!originCoordinate) {
      return {
        text: composeSupportReply(
          language,
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
        text: composeSupportReply(language, fallbackText(language, 'unknownOrigin')),
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
      text: composeSupportReply(
        language,
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
      return {
        text: composeSupportReply(language, routeResponseText(language, 'askDestination')),
        language,
        state: { awaitingDestinationIntent: 'route' },
        usedGroq: false,
      };
    }

    const originFromMessage = parsed.origin;
    const originCoordinate = originFromMessage?.coordinate ?? request.currentLocation ?? null;
    const nearestFromGps = request.currentLocation ? findNearestKnownPlace(request.currentLocation) : null;

    if (!originCoordinate) {
      return {
        text: composeSupportReply(
          language,
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
      text: composeSupportReply(
        language,
        withClarification,
        { includeClosing: true },
      ),
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (!isTaskLikeMessage && hasGreetingIntent(normalized)) {
    return {
      text: pickSocialReply(language, 'greetings'),
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (!isTaskLikeMessage && hasPraiseIntent(normalized)) {
    return {
      text: pickSocialReply(language, 'praise'),
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (!isTaskLikeMessage && hasThanksIntent(normalized)) {
    return {
      text: pickSocialReply(language, 'thanks'),
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (!isTaskLikeMessage && hasGoodbyeIntent(normalized)) {
    return {
      text: pickSocialReply(language, 'goodbye'),
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (!isTaskLikeMessage && hasUserApologyIntent(normalized)) {
    return {
      text: pickSocialReply(language, 'userApology'),
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (!isTaskLikeMessage && hasAcknowledgementIntent(normalized)) {
    return {
      text: pickSocialReply(language, 'acknowledgement'),
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (shouldAskGeneralClarification(normalized)) {
    return {
      text: composeSupportReply(language, buildGeneralClarifyingQuestion(language)),
      language,
      state: currentState,
      usedGroq: false,
    };
  }

  const inScope = isInScope(normalized);

  try {
    const groqReply = await callGroqFallback(message, language);
    if (groqReply) {
      return {
        text: composeSupportReply(language, formatForChatDisplay(groqReply), { includeClosing: true }),
        language,
        state: {},
        usedGroq: true,
      };
    }
  } catch {
    // ignore and fall through to local unknown fallback
  }

  if (!inScope) {
    return {
      text: composeSupportReply(language, fallbackText(language, 'outOfScope')),
      language,
      state: {},
      usedGroq: false,
    };
  }

  return {
    text: composeSupportReply(language, buildGeneralClarifyingQuestion(language)),
    language,
    state: currentState,
    usedGroq: false,
  };
}
