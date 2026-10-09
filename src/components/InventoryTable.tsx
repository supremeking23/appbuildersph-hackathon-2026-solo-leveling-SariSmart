import type { InventoryItem } from "../types/inventory";

interface InventoryTableProps {
  items: InventoryItem[];
  searchQuery: string;
  restockQuantity: number;
  onRestock: (itemId: string) => void;
}

function InventoryTable({ items, searchQuery, restockQuantity, onRestock }: InventoryTableProps) {
  const filteredItems = items
    .filter((item) => `${item.name} ${item.category}`.toLowerCase().includes(searchQuery.trim().toLowerCase()));

  return (
    <div className="table-wrap">
      <table className="inventory-table">
        <thead>
          <tr>
            <th scope="col">PRODUCT</th>
            <th scope="col">CATEGORY</th>
            <th scope="col">IN STOCK</th>
            <th scope="col">PRICE</th>
            <th scope="col">STATUS</th>
            <th scope="col"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {filteredItems.map((item) => {
            const isLow = item.stock < item.minStockAlert;
            return (
              <tr key={item.id}>
                <td>
                  <div className="product-cell">
                    <span className={`product-avatar product-${item.category.toLowerCase().replace(/\W/g, "-")}`} aria-hidden="true">
                      {item.category === "Noodles" ? "🍜" : item.category === "Beverages" ? "🥤" : item.category === "Dairy" ? "🥛" : "🧺"}
                    </span>
                    <span className="product-copy"><strong>{item.name}</strong><small>SKU-{item.id.slice(-4).toUpperCase()}</small></span>
                  </div>
                </td>
                <td><span className="category-label">{item.category}</span></td>
                <td><strong className={`stock-number${isLow ? " low-stock-number" : ""}`}>{item.stock}</strong><span className="stock-unit"> units</span></td>
                <td className="price-cell">₱{item.price.toFixed(2)}</td>
                <td>
                  <span className={`stock-status${isLow ? " low" : ""}`}>
                    <span />{isLow ? "Low stock" : "In stock"}
                  </span>
                </td>
                <td className="row-action-cell">
                  <button className="restock-button" type="button" onClick={() => onRestock(item.id)} aria-label={`Add ${restockQuantity} ${item.name} to stock`}>
                    + Restock {restockQuantity}
                  </button>
                </td>
              </tr>
            );
          })}
          {filteredItems.length === 0 && (
            <tr><td className="empty-state" colSpan={6}>No products match “{searchQuery}”. Try another search.</td></tr>
          )}
        </tbody>
      </table>
      {searchQuery.trim() && (
        <p className="table-note">
          Showing {filteredItems.length} product{filteredItems.length === 1 ? "" : "s"} matching your search
        </p>
      )}
    </div>
  );
}

export default InventoryTable;
