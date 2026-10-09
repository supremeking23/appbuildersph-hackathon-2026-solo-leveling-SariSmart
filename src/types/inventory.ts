export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  stock: number;
  price: number;
  minStockAlert: number;
  updatedAt: string;
}

export interface ExtractedLogItem {
  itemName: string;
  action: "SALE" | "RESTOCK";
  quantity: number;
  pricePerUnit?: number;
}

export interface ActivityEntry extends ExtractedLogItem {
  id: string;
  amount: number;
  createdAt: string;
}

export interface ParsingResult {
  rawInput: string;
  extractedItems: ExtractedLogItem[];
  summaryMessage: string;
  parserSource: "ollama" | "mock";
}
