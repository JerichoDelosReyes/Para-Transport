import datasetJson from '../data/chatbot-dataset.json';
import type { JeepneyRoute } from '../types/routes';
import { findRoutesForDestination, rankRoutes } from './routeSearch';

export type BotLanguage = 'en' | 'tl';

export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type ChatbotConversationState = {
  awaitingOriginForDestinationId?: string;
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
  };
  fareNews: LocalizedVariants;
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

const dataset = datasetJson as DatasetShape;
const placeById = new Map<string, DatasetPlace>(dataset.places.map((place) => [place.id, place]));

const aliasIndex: Array<{ alias: string; place: DatasetPlace }> = [];
for (const place of dataset.places) {
  aliasIndex.push({ alias: normalizeText(place.name), place });
  for (const alias of place.aliases) {
    aliasIndex.push({ alias: normalizeText(alias), place });
  }
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

function hasFareIntent(normalized: string): boolean {
  return /(fare|pamasahe|magkano|bayad|how much|magkan[o0]|magkano po|how much fare|fare estimate|estimate fare|pamasahe papunta|pamasahe mula|how much should i pay)/.test(normalized);
}

function hasTriviaIntent(normalized: string): boolean {
  return /(trivia|fun fact|did you know|alam mo ba|fact tungkol|fact about|random fact|kwento trivia|trivia naman)/.test(normalized);
}

function hasBuilderIntent(normalized: string): boolean {
  return /(who (built|made|created)|sino (gumawa|bumuo|nag build|nagbuo)|developer|builders?)/.test(normalized)
    && /(para|app|application)/.test(normalized);
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
  return /\b(good job|great job|nice one|ang galing|galing mo|idol|solid mo|amazing|awesome|ang husay|best ka)\b/.test(normalized);
}

function hasUserApologyIntent(normalized: string): boolean {
  return /\b(sorry|pasensya|pasensiya|my bad|patawad)\b/.test(normalized);
}

function hasAcknowledgementIntent(normalized: string): boolean {
  return /\b(ok|okay|okie|noted|copy|gets|sige|cge|gege|ayt|ayos|opo|oo|noted po)\b/.test(normalized);
}

function hasCommuteTaskIntent(normalized: string): boolean {
  return /(fare|pamasahe|route|ruta|destination|papunta|where|saan|how to go|paano pumunta|terminal|stop|transit|jeepney|tricycle|from|mula|galing|to |going to|trivia|fun fact|did you know|alam mo ba|app|application)/.test(normalized);
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
  destination: DatasetPlace,
  routes: JeepneyRoute[],
  originPlace?: DatasetPlace,
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
    const pair = getFarePair(originPlace.id, destination.id);
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

  return `${leadIn} ${fact} ${ending}`;
}

function pickSocialReply(language: BotLanguage, key: keyof DatasetShape['socialResponses']): string {
  return pickLocalized(dataset.socialResponses[key], language);
}

function pickFareNewsReply(language: BotLanguage): string {
  return pickLocalized(dataset.fareNews, language);
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
            `You are Para app's transport assistant. Only answer about commuting, fares, jeepneys, tricycles, transit routes, destinations, and app usage. If question is outside this scope, respond exactly with: ${outOfScopeMsg}. Respond in ${requestedLanguage}. Keep responses friendly, practical, and concise.`,
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
  const currentState: ChatbotConversationState = request.state ?? {};
  const routes = request.routes ?? [];

  if (!message) {
    return {
      text: fallbackText(language, 'unknown'),
      language,
      state: currentState,
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
      text: pickFareNewsReply(language),
      language,
      state: {},
      usedGroq: false,
    };
  }

  if (hasTriviaIntent(normalized)) {
    return {
      text: pickTrivia(language),
      language,
      state: {},
      usedGroq: false,
    };
  }

  const mentions = findPlaceMentions(message);
  const parsed = parseFareEndpoints(normalized, mentions);

  const fareIntentActive = hasFareIntent(normalized) || Boolean(currentState.awaitingOriginForDestinationId);
  if (fareIntentActive) {
    const destinationFromState = currentState.awaitingOriginForDestinationId
      ? placeById.get(currentState.awaitingOriginForDestinationId)
      : undefined;

    const destination = parsed.destination ?? destinationFromState;

    if (!destination) {
      return {
        text: fallbackText(language, 'missingDestination'),
        language,
        state: {},
        usedGroq: false,
      };
    }

    const originFromMessage = parsed.origin;
    const useGpsAsOrigin = !originFromMessage && Boolean(request.currentLocation);
    const originCoordinate = originFromMessage?.coordinate ?? request.currentLocation ?? null;
    const nearestFromGps = request.currentLocation ? findNearestKnownPlace(request.currentLocation) : null;

    if (!originCoordinate) {
      return {
        text: template(fallbackText(language, 'askOrigin'), { destination: destination.name }),
        language,
        state: { awaitingOriginForDestinationId: destination.id },
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
        text: fallbackText(language, 'unknownOrigin'),
        language,
        state: currentState,
        usedGroq: false,
      };
    }

    const estimate = estimateFare(originCoordinate, destination, routes, resolvedOriginPlace || undefined);

    return {
      text: buildFareReply({
        language,
        originLabel,
        destinationLabel: destination.name,
        estimate,
        usedGpsLocation: useGpsAsOrigin,
      }),
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

  const inScope = isInScope(normalized);

  try {
    const groqReply = await callGroqFallback(message, language);
    if (groqReply) {
      return {
        text: groqReply,
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
        text: fallbackText(language, 'outOfScope'),
        language,
        state: {},
        usedGroq: false,
      };
    }

  return {
    text: fallbackText(language, 'unknown'),
    language,
    state: {},
    usedGroq: false,
  };
}
