import type {
  ExtractedLogItem,
  InventoryItem,
  ParsingResult,
} from "../types/inventory";

// Local Ollama's generate endpoint; the browser must be allowed to connect to localhost.
const OLLAMA_BASE_URL = "http://localhost:11434";
const OLLAMA_ENDPOINT = `${OLLAMA_BASE_URL}/api/generate`;
const OLLAMA_TAGS_ENDPOINT = `${OLLAMA_BASE_URL}/api/tags`;
// This model must already be pulled into the local Ollama installation.
const MODEL_NAME = "qwen2.5:1.5b";

// An alias group ties informal user wording to one canonical catalog product.
interface KnownProduct {
  // Terms users commonly type or say for this product.
  aliases: string[];
  // Canonical name used in activity and when no matching inventory row exists.
  itemName: string;
  // Offline-only price when neither the catalog nor the LLM supplies one.
  pricePerUnit: number;
}

// Keep aliases here in sync with product naming in the mock inventory.
const KNOWN_PRODUCTS: KnownProduct[] = [
  {
    aliases: ["pancit canton", "canton", "lucky me"],
    itemName: "Lucky Me Pancit Canton (Chili Mansi)",
    pricePerUnit: 15,
  },
  {
    aliases: ["coca-cola", "coca cola", "cocacola", "coke", "coca"],
    itemName: "Coca-Cola 1.5L",
    pricePerUnit: 70,
  },
  {
    aliases: ["bear brand", "gatas", "milk"],
    itemName: "Bear Brand Powdered Milk 33g",
    pricePerUnit: 18,
  },
  {
    aliases: ["silver swan", "soy sauce", "soysauce", "toyo"],
    itemName: "Silver Swan Soy Sauce 200ml",
    pricePerUnit: 22,
  },
  {
    aliases: ["marlboro red pack", "marlboro red", "marlboro"],
    itemName: "Marlboro Red Pack",
    pricePerUnit: 150,
  },
  {
    aliases: ["red horse", "RH"],
    itemName: "Red Horse 1000ml",
    pricePerUnit: 165,
  },
  {
    aliases: ["ginebra", "gin bilog", "gin"],
    itemName: "Ginebra San Miguel Round 350ml (Gin Bilog)",
    pricePerUnit: 165,
  },
];

// Make matching case-insensitive and normalize punctuation/spacing while retaining letters and digits.
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// Escape alias text before embedding it into a regular expression.
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Find a whole phrase, allowing spaces or hyphens between words (e.g. "coca cola"/"coca-cola").
function findPhrase(text: string, phrase: string): RegExpMatchArray | null {
  // Normalize and escape each word so aliases are treated as literal text.
  const expression = normalize(phrase)
    .split(/\s+/)
    .map(escapeRegExp)
    .join("[\\s-]+");
  // Word boundaries avoid accidental matches inside unrelated longer words.
  return text.match(new RegExp(`\\b${expression}\\b`, "i"));
}

// Choose one action for the whole log; explicit sales beat generic "bili", which implies restocking.
function getAction(input: string): ExtractedLogItem["action"] {
  const text = normalize(input);
  // "Bili ng customer" is a customer purchase, not the store buying stock.
  const customerBuy = /\bbili ng customer\b/.test(text);
  // These verbs explicitly describe a sale.
  const explicitSale = /\b(nakabenta|benta|kuha)\b/.test(text) || customerBuy;
  // These terms explicitly describe adding stock.
  const explicitRestock = /\b(restock|dagdag|kargada|nagdagdag)\b/.test(text);
  // A bare "bili" means the shop bought/restocked goods unless it says customer.
  const genericBuy = /\bbili\b/.test(text) && !customerBuy;

  // Explicit restock is honored unless the same log also clearly indicates a sale.
  if (explicitRestock && !explicitSale) return "RESTOCK";
  // A customer sale (or other explicit sale wording) wins over a generic buy keyword.
  if (genericBuy && !explicitSale) return "RESTOCK";
  // Logs without an explicit restock default to a sale.
  return "SALE";
}

// Associate the closest-looking quantity with a detected product phrase.
function quantityNear(text: string, start: number, end: number): number {
  // Support "3 coke" and optional common units before the product.
  const before = text.slice(0, start);
  // Support "coke x3" and "coke 3".
  const after = text.slice(end);
  const precedingQuantity = before.match(
    /(\d+)\s*(?:(?:pcs?|pieces?|packs?|bottles?|units?)\s*)?$/i,
  );
  const followingQuantity = after.match(/^\s*(?:(?:x|×)\s*)?(\d+)\b/i);
  // If quantity is not adjacent to this product, use the first number in the log.
  const anyQuantity = text.match(/\b(\d+)\b/);
  const value = Number(
    precedingQuantity?.[1] ?? followingQuantity?.[1] ?? anyQuantity?.[1] ?? 1,
  );
  // Ignore zero, negative-like, or invalid quantities; a missing quantity defaults to one.
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

// Return the actual inventory row corresponding to one known alias group, if present.
function resolveKnownInventoryItem(
  product: KnownProduct,
  inventory: InventoryItem[],
): InventoryItem | undefined {
  return inventory.find((item) => {
    // Compare normalized names so punctuation and case differences do not block a catalog match.
    const name = normalize(item.name);
    return product.aliases.some((alias) => name.includes(normalize(alias)));
  });
}

// Non-catalog products can still be found by their full inventory name in the input.
function fallbackNameForInventory(
  item: InventoryItem,
  input: string,
): string | undefined {
  return findPhrase(input, item.name)?.[0];
}

// Offline rule-based extraction: detect aliases, resolve inventory prices, and construct log items.
function getMatchedItems(
  input: string,
  inventory: InventoryItem[],
): ExtractedLogItem[] {
  // Keep source positions so quantities can be associated with individual products.
  const matches: Array<{
    itemName: string;
    pricePerUnit: number;
    start: number;
    end: number;
  }> = [];

  // Try each known product's aliases, preferring its longest matching alias.
  for (const product of KNOWN_PRODUCTS) {
    const found = product.aliases
      .map((alias) => ({ alias, match: findPhrase(input, alias) }))
      .filter(
        (entry): entry is { alias: string; match: RegExpMatchArray } =>
          entry.match !== null,
      )
      .sort((left, right) => right.alias.length - left.alias.length)[0];

    // No usable alias match means this product is not in the current log.
    if (found?.match?.index === undefined) continue;
    // Prefer the user's actual catalog row and current price over the hard-coded defaults.
    const inventoryItem = resolveKnownInventoryItem(product, inventory);
    matches.push({
      itemName: inventoryItem?.name ?? product.itemName,
      pricePerUnit: inventoryItem?.price ?? product.pricePerUnit,
      start: found.match.index,
      end: found.match.index + found.match[0].length,
    });
  }

  // Check user-added inventory items that do not belong to the known alias groups.
  for (const item of inventory) {
    // These catalog rows were already considered above using their aliases.
    if (
      KNOWN_PRODUCTS.some((product) =>
        resolveKnownInventoryItem(product, [item]),
      )
    )
      continue;
    const found = fallbackNameForInventory(item, input);
    // Unmentioned products should not be included in the parsed transaction.
    if (found === undefined) continue;
    // Find the phrase's position to link a nearby quantity to this product.
    const start = input.toLowerCase().indexOf(found.toLowerCase());
    matches.push({
      itemName: item.name,
      pricePerUnit: item.price,
      start,
      end: start + found.length,
    });
  }

  // Sort mentions in the same order they appear and prefer longer overlaps.
  matches.sort(
    (left, right) => left.start - right.start || right.end - left.end,
  );
  // Collapse repeated aliases/names so one product is not counted twice in one log.
  const uniqueMatches = matches.filter(
    (match, index) =>
      matches.findIndex(
        (candidate) => candidate.itemName === match.itemName,
      ) === index,
  );
  // The current rule-based parser applies one inferred action to every matched product.
  const action = getAction(input);

  // Always return at least one valid item so offline parsing has a usable result.
  if (uniqueMatches.length === 0) {
    return [
      {
        itemName: "Generic Item Logged",
        action,
        quantity: quantityNear(input, input.length, input.length),
        pricePerUnit: 20,
      },
    ];
  }

  // Convert each unique product mention into the shape consumed by the dashboard.
  return uniqueMatches.map((match) => ({
    itemName: match.itemName,
    action,
    quantity: quantityNear(input, match.start, match.end),
    pricePerUnit: match.pricePerUnit,
  }));
}

// Public offline parser; inventory is optional for callers that only need alias defaults.
export function mockTagalogParser(
  inputText: string,
  inventory: InventoryItem[] = [],
): ParsingResult {
  return {
    // Preserve the original phrase for display/debugging.
    rawInput: inputText,
    // Use rule-based alias/quantity extraction without requiring a running Ollama service.
    extractedItems: getMatchedItems(inputText, inventory),
    // Lets the UI indicate which parsing path produced the result.
    summaryMessage: "Parsed via Offline Mock Engine (Ollama disconnected).",
    parserSource: "mock",
  };
}

export async function checkOllamaHealth(timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(OLLAMA_TAGS_ENDPOINT, {
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok) return false;

    const data: unknown = await response.json();
    if (typeof data !== "object" || data === null || !("models" in data)) {
      return false;
    }

    const models = data.models;
    if (!Array.isArray(models)) return false;
    return models.some(
      (model) =>
        typeof model === "object" &&
        model !== null &&
        "name" in model &&
        model.name === MODEL_NAME,
    );
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

// Treat model output as untrusted data and retain only items matching the app's domain shape.
function validateOllamaItems(
  value: unknown,
  inventory: InventoryItem[],
): ExtractedLogItem[] | null {
  // The model may return an array, one object, or wrap its array in an "items" property.
  const candidateItems = Array.isArray(value)
    ? value
    : typeof value === "object" &&
        value !== null &&
        "items" in value &&
        Array.isArray(value.items)
      ? value.items
      : [value];
  // Invalid entries are discarded instead of being allowed into inventory state.
  const validItems = candidateItems.flatMap((candidate): ExtractedLogItem[] => {
    // Nulls and primitives are not transaction objects.
    if (typeof candidate !== "object" || candidate === null) return [];
    // Narrow dynamic JSON fields to their expected runtime types below.
    const item = candidate as Record<string, unknown>;
    const itemName =
      typeof item.itemName === "string" ? item.itemName.trim() : "";
    const action =
      typeof item.action === "string" ? item.action.toUpperCase() : "";
    const quantity = Number(item.quantity);
    const price = Number(item.pricePerUnit);

    // Reject missing names, unsupported actions, and quantities that are not positive numbers.
    if (
      !itemName ||
      (action !== "SALE" && action !== "RESTOCK") ||
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      return [];
    }

    // Normalize the model's product name to resolve it against the current catalog.
    const normalizedName = normalize(itemName);
    const matchingInventory = inventory.find((entry) => {
      const normalizedInventoryName = normalize(entry.name);
      return (
        normalizedInventoryName === normalizedName ||
        normalizedInventoryName.includes(normalizedName) ||
        normalizedName.includes(normalizedInventoryName)
      );
    });
    // If there is no exact catalog row, aliases can still canonicalize a known product.
    const knownProduct = KNOWN_PRODUCTS.find((product) =>
      product.aliases.some((alias) =>
        normalizedName.includes(normalize(alias)),
      ),
    );

    return [
      {
        // Preserve the exact catalog name where possible so App.tsx can update that inventory row.
        itemName: matchingInventory?.name ?? knownProduct?.itemName ?? itemName,
        action,
        // Keep quantities integral and positive even if the model returns a decimal.
        quantity: Math.max(1, Math.floor(quantity)),
        // Trust catalog pricing first; otherwise accept a valid model price or known-product default.
        pricePerUnit:
          matchingInventory?.price ??
          (Number.isFinite(price) && price >= 0
            ? price
            : knownProduct?.pricePerUnit),
      },
    ];
  });

  // null signals the caller to use the local parser when the model produced no valid items.
  return validItems.length > 0 ? validItems : null;
}

// Parse using local Ollama when possible and transparently fall back to deterministic rules.
export async function parseStoreLog(
  inputText: string,
  inventory: InventoryItem[] = [],
): Promise<ParsingResult> {
  // Reuse the local parser for network, HTTP, and response-validation failures.
  const fallback = (reason: string) => {
    console.warn(`[SariSmart] ${reason} Using the rule-based parser.`);
    return mockTagalogParser(inputText, inventory);
  };
  // Request structured transaction data; the model response is checked again after parsing.
  const prompt = `You are SariSmart, an offline sari-sari store assistant.
Extract transaction details from this Tagalog/English log into JSON format.
Log: "${inputText}"

Return ONLY a JSON array of objects with keys: "itemName", "action" ('SALE' or 'RESTOCK'), "quantity" (number), "pricePerUnit" (number). Do not add explanation.`;

  try {
    // Fetch is local to the machine running the browser; connection failures are caught below.
    console.info(
      `[SariSmart] Checking local Ollama model "${MODEL_NAME}" for this log.`,
    );
    const response = await fetch(OLLAMA_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL_NAME,
        prompt,
        stream: false,
        format: "json",
      }),
    });

    // A non-2xx response (including Ollama/model errors) is a fallback condition, not a UI error.
    if (!response.ok) {
      const detail =
        response.status === 404
          ? `Ollama returned 404; check that "${MODEL_NAME}" is installed and the endpoint is correct.`
          : `Ollama returned HTTP ${response.status}.`;
      return fallback(detail);
    }

    // Parse the outer Ollama response defensively because network JSON can have an unexpected shape.
    const data: unknown = await response.json();
    if (typeof data !== "object" || data === null || !("response" in data)) {
      return fallback("Ollama returned an unexpected response shape.");
    }
    // Ollama's generate API places the model-generated JSON inside its "response" string.
    const responseText = data.response;
    if (typeof responseText !== "string") {
      return fallback("Ollama response did not contain generated text.");
    }

    // Parse the model's JSON, then validate names, action, quantity, and price.
    const parsed: unknown = JSON.parse(responseText);
    const extractedItems = validateOllamaItems(parsed, inventory);
    // Invalid/empty model output uses the offline parser rather than returning a broken result.
    if (!extractedItems) {
      return fallback("Ollama output did not contain valid transaction items.");
    }

    // Use deterministic transaction intent from the original text instead of trusting
    // a model action that may misread restock language such as "nagdagdag".
    const action = getAction(inputText);
    const itemsWithResolvedAction = extractedItems.map((item) => ({
      ...item,
      action,
    }));

    console.info(
      `[SariSmart] Log successfully analyzed by Ollama model "${MODEL_NAME}".`,
    );
    return {
      // Keep the original input attached to both online and fallback results.
      rawInput: inputText,
      extractedItems: itemsWithResolvedAction,
      summaryMessage: "Parsed successfully via Local Ollama Qwen 2.5!",
      parserSource: "ollama",
    };
  } catch {
    // Includes fetch rejection, JSON decoding errors, and model response parsing errors.
    return fallback(
      "Could not reach or parse a response from local Ollama; it may be offline or still loading.",
    );
  }
}
