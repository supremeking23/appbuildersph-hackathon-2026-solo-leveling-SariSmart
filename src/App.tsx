import { useEffect, useMemo, useState } from "react";
import Header, { type DashboardSection } from "./components/Header";
import InventoryTable from "./components/InventoryTable";
import LogInput from "./components/LogInput";
import SummaryCards from "./components/SummaryCards";
import { APP_CONFIG } from "./config/appConfig";
import { INITIAL_INVENTORY } from "./data/mockInventory";
import { checkOllamaHealth, parseStoreLog } from "./services/ollama";
import type { ActivityEntry, InventoryItem, ParsingResult } from "./types/inventory";
import "./App.css";

const INVENTORY_KEY = "sarismart.inventory.v1";
const ACTIVITY_KEY = "sarismart.activity.v1";

function readStoredValue<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch (error) {
    console.warn(`Unable to load saved SariSmart data for "${key}".`, error);
    return fallback;
  }
}

function loadInventory(): InventoryItem[] {
  const savedInventory = readStoredValue<InventoryItem[]>(INVENTORY_KEY, []);
  if (!Array.isArray(savedInventory)) return INITIAL_INVENTORY;

  const inventory = [...savedInventory];
  for (const initialItem of INITIAL_INVENTORY) {
    const alreadyExists = inventory.some(
      (item) =>
        item.id === initialItem.id ||
        item.name.trim().toLowerCase() === initialItem.name.trim().toLowerCase(),
    );
    if (!alreadyExists) inventory.push(initialItem);
  }

  return inventory;
}

function getCategory(name: string): string {
  const normalized = name.toLowerCase();
  if (/canton|noodle|ramen/.test(normalized)) return "Noodles";
  if (/coke|cola|water|juice|drink|soda/.test(normalized)) return "Beverages";
  if (/milk|gatas|bear brand/.test(normalized)) return "Dairy";
  if (/sauce| suka|vinegar|soy/.test(normalized)) return "Condiments";
  return "Other";
}

function App() {
  const [inventory, setInventory] = useState<InventoryItem[]>(() =>
    loadInventory(),
  );
  const [activity, setActivity] = useState<ActivityEntry[]>(() =>
    readStoredValue(ACTIVITY_KEY, []),
  );
  const [activeSection, setActiveSection] = useState<DashboardSection>("Dashboard");
  const [searchQuery, setSearchQuery] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [ollamaAvailable, setOllamaAvailable] = useState(false);
  const [lastResult, setLastResult] = useState<ParsingResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!APP_CONFIG.ollama.healthCheckEnabled || ollamaAvailable) return;

    let cancelled = false;
    let timeoutId: number | undefined;

    async function checkAndRetry() {
      const available = await checkOllamaHealth(APP_CONFIG.ollama.healthCheckTimeoutMs);
      if (cancelled) return;

      if (available) {
        setOllamaAvailable(true);
        return;
      }

      timeoutId = window.setTimeout(
        () => void checkAndRetry(),
        APP_CONFIG.ollama.healthCheckIntervalMs,
      );
    }

    void checkAndRetry();
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [ollamaAvailable]);

  const todayActivity = useMemo(() => {
    const today = new Date().toDateString();
    return activity.filter((entry) => new Date(entry.createdAt).toDateString() === today);
  }, [activity]);
  const todaySales = todayActivity
    .filter((entry) => entry.action === "SALE")
    .reduce((total, entry) => total + entry.amount, 0);
  const lowStockCount = inventory.filter((item) => item.stock < item.minStockAlert).length;
  const inventoryValue = inventory.reduce((total, item) => total + item.stock * item.price, 0);

  function persistInventory(nextInventory: InventoryItem[]) {
    setInventory(nextInventory);
    try {
      localStorage.setItem(INVENTORY_KEY, JSON.stringify(nextInventory));
    } catch (error) {
      console.error("Unable to save inventory to this browser.", error);
      setErrorMessage("Your browser could not save this inventory update.");
    }
  }

  function persistActivity(nextActivity: ActivityEntry[]) {
    setActivity(nextActivity);
    try {
      localStorage.setItem(ACTIVITY_KEY, JSON.stringify(nextActivity));
    } catch (error) {
      console.error("Unable to save activity to this browser.", error);
      setErrorMessage("Your browser could not save this activity.");
    }
  }

  async function handleLogSubmit(rawInput: string): Promise<boolean> {
    setIsParsing(true);
    setErrorMessage("");
    try {
      const result = await parseStoreLog(rawInput, inventory);
      setOllamaAvailable(result.parserSource === "ollama");
      if (result.extractedItems.length === 0) {
        setErrorMessage("No items were found in that log. Try adding a product and quantity.");
        setLastResult(result);
        return false;
      }

      const now = new Date().toISOString();
      const updatedInventory = [...inventory];
      const newActivity: ActivityEntry[] = [];
      const updatedItems: typeof result.extractedItems = [];
      const validationErrors: string[] = [];

      for (const parsedItem of result.extractedItems) {
        const quantity = Math.max(1, Math.round(parsedItem.quantity || 1));
        const itemName = parsedItem.itemName.trim() || "Unrecognized item";
        const itemIndex = updatedInventory.findIndex(
          (item) => item.name.toLowerCase() === itemName.toLowerCase(),
        );
        const existing = itemIndex >= 0 ? updatedInventory[itemIndex] : undefined;
        const price = Math.max(0, parsedItem.pricePerUnit ?? existing?.price ?? 0);

        if (parsedItem.action === "SALE" && (!existing || existing.stock < quantity)) {
          const availableStock = existing?.stock ?? 0;
          validationErrors.push(
            `Cannot complete sale: Only ${availableStock} ${availableStock === 1 ? "unit" : "units"} left for ${itemName}.`,
          );
          continue;
        }

        if (existing) {
          updatedInventory[itemIndex] = {
            ...existing,
            stock:
              parsedItem.action === "RESTOCK"
                ? existing.stock + quantity
                : existing.stock - quantity,
            updatedAt: now,
          };
        } else {
          updatedInventory.unshift({
            id: `item-${Date.now()}-${newActivity.length}`,
            name: itemName,
            category: getCategory(itemName),
            stock: parsedItem.action === "RESTOCK" ? quantity : 0,
            price,
            minStockAlert: 5,
            updatedAt: now,
          });
        }

        updatedItems.push(parsedItem);
        newActivity.push({
          ...parsedItem,
          itemName,
          quantity,
          pricePerUnit: price,
          amount: quantity * price,
          id: `activity-${Date.now()}-${newActivity.length}`,
          createdAt: now,
        });
      }

      if (newActivity.length === 0) {
        setLastResult(null);
        setErrorMessage(validationErrors.join(" "));
        return false;
      }

      persistInventory(updatedInventory);
      persistActivity([...newActivity, ...activity].slice(0, 100));
      setLastResult({
        ...result,
        extractedItems: updatedItems,
        summaryMessage: `${updatedItems.length} item${updatedItems.length === 1 ? "" : "s"} updated successfully. ${result.summaryMessage}`,
      });
      setErrorMessage(validationErrors.join(" "));
      return true;
    } catch (error) {
      console.error("Unable to process store log.", error);
      setErrorMessage("We couldn't process that log. Please try again.");
      return false;
    } finally {
      setIsParsing(false);
    }
  }

  function handleRestock(itemId: string) {
    const item = inventory.find((entry) => entry.id === itemId);
    if (!item) return;
    persistInventory(
      inventory.map((entry) =>
        entry.id === itemId
          ? {
              ...entry,
              stock: entry.stock + APP_CONFIG.inventory.quickRestockQuantity,
              updatedAt: new Date().toISOString(),
            }
          : entry,
      ),
    );
  }

  const sectionTitle =
    activeSection === "Dashboard"
      ? "Good morning, Aling Maria"
      : activeSection === "Inventory"
        ? "Your inventory"
        : activeSection === "Transactions"
          ? "Recent activity"
          : "Store settings";
  const parserBadge = ollamaAvailable ? "ai" : "rule-based";

  return (
    <div className="app-shell">
      <Header activeSection={activeSection} onNavigate={setActiveSection} />
      <main className="dashboard-main">
        <div className="page-heading">
          <div>
            <div className="eyebrow"><span className="eyebrow-dot" /> YOUR STORE AT A GLANCE</div>
            <h1>{sectionTitle}</h1>
            <p>Here’s what’s happening at your tindahan today.</p>
          </div>
          <div className="date-chip">
            <span className="date-icon" aria-hidden="true">▦</span>
            {new Intl.DateTimeFormat("en-PH", {
              weekday: "short",
              month: "long",
              day: "numeric",
              year: "numeric",
            }).format(new Date())}
          </div>
        </div>

        <SummaryCards
          sales={todaySales}
          inventoryValue={inventoryValue}
          lowStockCount={lowStockCount}
          transactionCount={todayActivity.length}
        />

        <div className="dashboard-grid">
          <section className="panel log-panel" aria-labelledby="log-heading">
            <div className="panel-heading">
              <div>
                <div className="section-kicker">SMART LOG</div>
                <h2 id="log-heading">Tell us what happened</h2>
              </div>
              <span className={`ai-pill ai-pill-${parserBadge}`} role="status" aria-live="polite">
                <span />
                {parserBadge === "ai" ? "AI-powered" : "Rule-based parser"}
              </span>
            </div>
            <p className="panel-description">
              Type it like you’d tell a friend. Tagalog or English, we understand both.
            </p>
            <LogInput isLoading={isParsing} onSubmit={handleLogSubmit} />
            {errorMessage && <p className="error-message" role="alert">{errorMessage}</p>}
            {lastResult && (
              <div className="parse-result" aria-live="polite">
                <span className="result-check" aria-hidden="true">✓</span>
                <div>
                  <strong>{lastResult.extractedItems.length} item{lastResult.extractedItems.length === 1 ? "" : "s"} updated</strong>
                  <span>{lastResult.summaryMessage}</span>
                </div>
              </div>
            )}
            <div className="example-logs">
              <span>TRY SAYING</span>
              <button type="button" onClick={() => void handleLogSubmit("Nakabenta ako ng 3 pancit canton")}>
                “Nakabenta ako ng 3 pancit canton”
              </button>
              <button type="button" onClick={() => void handleLogSubmit("Restock 10 Bear Brand")}>
                “Restock 10 Bear Brand”
              </button>
            </div>
          </section>

          <section className="panel inventory-panel" aria-labelledby="inventory-heading">
            <div className="inventory-heading">
              <div>
                <div className="section-kicker">ON YOUR SHELVES</div>
                <h2 id="inventory-heading">Inventory overview</h2>
              </div>
              <div className="inventory-tools">
                <label className="search-box">
                  <span aria-hidden="true">⌕</span>
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search products"
                    aria-label="Search inventory"
                  />
                </label>
                <button className="view-all-button" type="button" onClick={() => setActiveSection("Inventory")}>
                  View all <span aria-hidden="true">→</span>
                </button>
              </div>
            </div>
            <InventoryTable
              items={inventory}
              searchQuery={searchQuery}
              onRestock={handleRestock}
              restockQuantity={APP_CONFIG.inventory.quickRestockQuantity}
            />
          </section>
        </div>

        <footer className="app-footer">
          <span className="footer-brand"><span className="brand-mark small">S</span> SariSmart</span>
          <span>Made for the heart of every neighborhood <span aria-hidden="true">♥</span></span>
          <span className="footer-version">v0.1 · Your data stays on this device</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
